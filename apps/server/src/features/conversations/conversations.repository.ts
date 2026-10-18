import { prisma, type Conversation, type ConversationMember, type GroupHistoryPackage } from '@chat/database';
import { uow, type TransactionClient } from '../../core/database/unit-of-work.js';
import { createHash } from 'node:crypto';

export function computeDirectPairHash(userIdA: string, userIdB: string): string {
  const [first, second] = [userIdA, userIdB].sort();
  return createHash('sha256').update(`${first}:${second}`).digest('hex');
}

export class ConversationsRepository {
  public async findById(id: string): Promise<(Conversation & { members: ConversationMember[] }) | null> {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        members: true,
      },
    });
  }

  public async getUserConversations(userId: string) {
    return prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId,
            removedAtSeqId: null,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * P1-T03: Idempotent 1:1 Direct Conversation Upsert with Canonical Pair Hash.
   * Guarantees zero duplicate conversations under high concurrency.
   */
  public async getOrCreateDirectConversation(
    initiatorUserId: string,
    peerUserId: string
  ): Promise<Conversation & { members: ConversationMember[] }> {
    const pairHash = computeDirectPairHash(initiatorUserId, peerUserId);

    // 1. Check if already exists
    const existing = await prisma.conversation.findUnique({
      where: { directPairHash: pairHash },
      include: { members: true },
    });
    if (existing) {
      return existing;
    }

    // 2. Atomically create conversation and memberships
    try {
      return await uow.runInTransaction(async (tx: TransactionClient) => {
        const created = await tx.conversation.create({
          data: {
            type: 'DIRECT',
            directPairHash: pairHash,
            createdBy: initiatorUserId,
            members: {
              create: [
                { userId: initiatorUserId, role: 'MEMBER' },
                { userId: peerUserId, role: 'MEMBER' },
              ],
            },
          },
          include: {
            members: true,
          },
        });
        return created;
      });
    } catch (err: any) {
      // If concurrent request won the race (P2002 Unique constraint failed)
      if (err.code === 'P2002') {
        const raceWinner = await prisma.conversation.findUnique({
          where: { directPairHash: pairHash },
          include: { members: true },
        });
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  /**
   * P4-T01: Creates a new group conversation with designated creator as OWNER.
   */
  public async createGroupConversation(
    creatorUserId: string,
    title: string,
    memberUserIds: string[]
  ): Promise<Conversation & { members: ConversationMember[] }> {
    const uniqueMembers = Array.from(new Set(memberUserIds.filter((id) => id !== creatorUserId)));

    return uow.runInTransaction(async (tx: TransactionClient) => {
      const created = await tx.conversation.create({
        data: {
          type: 'GROUP',
          title,
          createdBy: creatorUserId,
          lastSeqId: 0,
          members: {
            create: [
              { userId: creatorUserId, role: 'OWNER', joinedAtSeqId: 0, historyFloorSeqId: 1 },
              ...uniqueMembers.map((uid) => ({
                userId: uid,
                role: 'MEMBER' as const,
                joinedAtSeqId: 0,
                historyFloorSeqId: 1,
              })),
            ],
          },
        },
        include: {
          members: true,
        },
      });

      return created;
    });
  }

  public async getActiveMemberCount(conversationId: string): Promise<number> {
    return prisma.conversationMember.count({
      where: {
        conversationId,
        removedAtSeqId: null,
      },
    });
  }

  public async getMember(
    conversationId: string,
    userId: string
  ): Promise<ConversationMember | null> {
    return prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
  }

  public async addMember(
    conversationId: string,
    userId: string,
    joinedAtSeqId: bigint,
    historyFloorSeqId: bigint
  ): Promise<ConversationMember> {
    return prisma.conversationMember.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      create: {
        conversationId,
        userId,
        role: 'MEMBER',
        joinedAtSeqId,
        historyFloorSeqId,
        removedAtSeqId: null,
      },
      update: {
        role: 'MEMBER',
        joinedAtSeqId,
        historyFloorSeqId,
        removedAtSeqId: null,
      },
    });
  }

  public async removeMember(
    conversationId: string,
    userId: string,
    removedAtSeqId: bigint
  ): Promise<ConversationMember> {
    return prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        role: 'REMOVED',
        removedAtSeqId,
      },
    });
  }

  public async hasActiveAdminOrOwner(conversationId: string): Promise<boolean> {
    const count = await prisma.conversationMember.count({
      where: {
        conversationId,
        role: { in: ['OWNER', 'ADMIN'] },
        removedAtSeqId: null,
      },
    });
    return count > 0;
  }

  /**
   * P4-T06: Automatic Admin Succession Trigger (FR-015).
   * Promotes the longest-tenured active member to ADMIN when no admins remain.
   */
  public async promoteLongestTenuredMember(
    conversationId: string
  ): Promise<ConversationMember | null> {
    const longestTenured = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        role: 'MEMBER',
        removedAtSeqId: null,
      },
      orderBy: {
        joinedAtSeqId: 'asc',
      },
    });

    if (!longestTenured) return null;

    return prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: longestTenured.userId,
        },
      },
      data: {
        role: 'ADMIN',
      },
    });
  }

  public async saveHistoryPackage(data: {
    conversationId: string;
    recipientUserId: string;
    fromSeqId: bigint;
    toSeqId: bigint;
    encryptedHistoryKeyBundle: Buffer;
  }): Promise<GroupHistoryPackage> {
    return prisma.groupHistoryPackage.create({
      data: {
        conversationId: data.conversationId,
        recipientUserId: data.recipientUserId,
        fromSeqId: data.fromSeqId,
        toSeqId: data.toSeqId,
        encryptedHistoryKeyBundle: data.encryptedHistoryKeyBundle as any,
      },
    });
  }

  public async getHistoryPackage(
    conversationId: string,
    recipientUserId: string
  ): Promise<GroupHistoryPackage | null> {
    return prisma.groupHistoryPackage.findFirst({
      where: {
        conversationId,
        recipientUserId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}

export const conversationsRepository = new ConversationsRepository();

