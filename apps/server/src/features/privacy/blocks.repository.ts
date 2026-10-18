import { prisma, type UserBlock } from '@chat/database';

export class BlocksRepository {
  public async blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
    return prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
      create: {
        blockerId,
        blockedId,
      },
      update: {},
    });
  }

  public async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      await prisma.userBlock.delete({
        where: {
          blockerId_blockedId: {
            blockerId,
            blockedId,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * P8-T01 & Flow 8A: Bidirectional block check.
   * Returns true if userA blocked userB OR userB blocked userA.
   */
  public async isBidirectionallyBlocked(userAId: string, userBId: string): Promise<boolean> {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
    });
    return !!block;
  }

  public async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId },
      select: { blockedId: true },
    });
    return blocks.map((b) => b.blockedId);
  }
}

export const blocksRepository = new BlocksRepository();
