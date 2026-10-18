import { prisma, type Conversation, type ConversationMember } from '@chat/database';
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
}

export const conversationsRepository = new ConversationsRepository();
