import { prisma, type Conversation, type ConversationMember } from '@chat/database';

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
}

export const conversationsRepository = new ConversationsRepository();
