import { prisma } from '@chat/database';

export interface ScrubbingResult {
  scrubbedMessages: number;
  scrubbedAttachments: number;
}

/**
 * P8-T07 & Flow 8D: Post-Restore Tombstone Scrubbing Hook (NFR-040).
 * Reconciles the database with deleted_entities_registry to ensure that previously
 * deleted or tombstoned messages/attachments are permanently scrubbed and never
 * resurrected from older backup snapshots.
 */
export class TombstoneScrubber {
  /**
   * Records a deleted entity into the persistent registry.
   */
  public async registerDeletion(entityType: 'MESSAGE' | 'ATTACHMENT', entityId: string): Promise<void> {
    await prisma.deletedEntityRegistry.upsert({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
      create: {
        entityType,
        entityId,
      },
      update: {},
    });
  }

  /**
   * Executes post-restore scrubbing query across messages and attachments.
   */
  public async scrubRestoredEntities(): Promise<ScrubbingResult> {
    // 1. Fetch all registered tombstoned message IDs
    const deletedMessages = await prisma.deletedEntityRegistry.findMany({
      where: { entityType: 'MESSAGE' },
      select: { entityId: true },
    });
    const messageIds = deletedMessages.map((d) => d.entityId);

    let scrubbedMessages = 0;
    if (messageIds.length > 0) {
      const res = await prisma.message.deleteMany({
        where: { id: { in: messageIds } },
      });
      scrubbedMessages = res.count;
    }

    // 2. Fetch all registered tombstoned attachment IDs
    const deletedAttachments = await prisma.deletedEntityRegistry.findMany({
      where: { entityType: 'ATTACHMENT' },
      select: { entityId: true },
    });
    const attachmentIds = deletedAttachments.map((d) => d.entityId);

    let scrubbedAttachments = 0;
    if (attachmentIds.length > 0) {
      const res = await prisma.attachment.deleteMany({
        where: { id: { in: attachmentIds } },
      });
      scrubbedAttachments = res.count;
    }

    return {
      scrubbedMessages,
      scrubbedAttachments,
    };
  }
}

export const tombstoneScrubber = new TombstoneScrubber();
