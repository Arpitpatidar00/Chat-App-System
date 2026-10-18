import { randomUUID } from 'node:crypto';
import { prisma } from '@chat/database';
import { attachmentsRepository, type AttachmentsRepository } from './attachments.repository.js';
import { conversationsRepository } from '../conversations/conversations.repository.js';
import { storageProvider, type StorageProvider } from './storage-provider.js';
import { validateAttachmentUpload } from './attachments.validator.js';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ForbiddenError,
  AttachmentDeletedError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type {
  InitAttachmentUploadDTO,
  InitAttachmentResponseDTO,
  AttachmentDownloadResponseDTO,
  AttachmentDTO,
} from '@chat/types';

export class AttachmentsService {
  constructor(
    private readonly repo: AttachmentsRepository = attachmentsRepository,
    private readonly convRepo = conversationsRepository,
    private readonly storage: StorageProvider = storageProvider
  ) {}

  /**
   * P6-T01: Attachment Initialization Endpoint (FR-046, FR-052, NFR-004).
   * Validates size ceiling (<= 10.5 MB), MIME whitelist, blocks executables,
   * checks conversation membership, and returns a pre-signed S3 upload URL.
   */
  public async initUpload(
    uploaderId: string,
    dto: InitAttachmentUploadDTO
  ): Promise<Result<InitAttachmentResponseDTO, DomainError>> {
    // 1. Validation: 10 MB ceiling & executable/MIME gate
    try {
      validateAttachmentUpload({
        ciphertextSizeBytes: dto.ciphertextSizeBytes,
        declaredMime: dto.declaredMime,
        filename: dto.filename,
      });
    } catch (e: any) {
      return err(e);
    }

    // 2. Verify conversation membership
    const conv = await this.convRepo.findById(dto.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${dto.conversationId} not found`));
    }

    const isMember = conv.members.some(
      (m) => m.userId === uploaderId && m.removedAtSeqId === null
    );
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    // 3. Generate pre-signed S3 PUT URL
    const attachmentId = randomUUID();
    const objectKey = `attachments/${dto.conversationId}/${attachmentId}`;
    const presigned = await this.storage.generateUploadUrl(objectKey, dto.declaredMime, 900);

    // 4. Persist attachment record in UPLOADING state
    await this.repo.createAttachment({
      id: attachmentId,
      conversationId: dto.conversationId,
      uploaderId,
      objectKey,
      ciphertextSizeBytes: dto.ciphertextSizeBytes,
      declaredMime: dto.declaredMime,
      sha256Ciphertext: dto.sha256Ciphertext,
    });

    return ok({
      attachmentId,
      uploadUrl: presigned.url,
      objectKey,
      expiresAt: presigned.expiresAt.toISOString(),
    });
  }

  /**
   * P6-T01: Commit uploaded attachment after successful S3 PUT.
   */
  public async commitUpload(
    uploaderId: string,
    attachmentId: string
  ): Promise<Result<AttachmentDTO, DomainError>> {
    const attachment = await this.repo.findById(attachmentId);
    if (!attachment) {
      return err(new NotFoundError(`Attachment ${attachmentId} not found`));
    }

    if (attachment.uploaderId !== uploaderId) {
      return err(new ForbiddenError('Only the uploader can commit this attachment'));
    }

    const updated = await this.repo.updateStatus(attachmentId, 'COMMITTED');

    return ok({
      id: updated.id,
      conversationId: updated.conversationId,
      uploaderId: updated.uploaderId,
      objectKey: updated.objectKey,
      ciphertextSizeBytes: updated.ciphertextSizeBytes,
      declaredMime: updated.declaredMime,
      sha256Ciphertext: updated.sha256Ciphertext,
      status: updated.status as any,
      createdAt: updated.createdAt.toISOString(),
    });
  }

  /**
   * P6-T04: Authorized Download Pre-Signed URL Generator (FR-049, NFR-027).
   * Verifies membership and active status, returning 5-minute pre-signed GET URL.
   */
  public async getDownloadUrl(
    userId: string,
    attachmentId: string
  ): Promise<Result<AttachmentDownloadResponseDTO, DomainError>> {
    const attachment = await this.repo.findById(attachmentId);
    if (!attachment) {
      return err(new NotFoundError(`Attachment ${attachmentId} not found`));
    }

    if (attachment.status === 'DELETED') {
      return err(new AttachmentDeletedError('Attachment has been permanently deleted (NFR-035)'));
    }

    // Verify caller is an active member of conversation
    const conv = await this.convRepo.findById(attachment.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${attachment.conversationId} not found`));
    }

    const isMember = conv.members.some(
      (m) => m.userId === userId && m.removedAtSeqId === null
    );
    if (!isMember) {
      return err(
        new ForbiddenError('You are not authorized to download attachments from this conversation')
      );
    }

    const presigned = await this.storage.generateDownloadUrl(attachment.objectKey, 300);

    return ok({
      attachmentId: attachment.id,
      downloadUrl: presigned.url,
      sha256Ciphertext: attachment.sha256Ciphertext,
      expiresAt: presigned.expiresAt.toISOString(),
    });
  }

  /**
   * P6-T07: Tombstone Attachment Purge Worker (NFR-035).
   * Deletes object from S3 and marks attachment record as DELETED.
   */
  public async purgeAttachment(
    actorId: string,
    attachmentId: string
  ): Promise<Result<{ success: boolean; attachmentId: string }, DomainError>> {
    const attachment = await this.repo.findById(attachmentId);
    if (!attachment) {
      return err(new NotFoundError(`Attachment ${attachmentId} not found`));
    }

    const conv = await this.convRepo.findById(attachment.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${attachment.conversationId} not found`));
    }

    const member = conv.members.find((m) => m.userId === actorId && m.removedAtSeqId === null);
    if (!member) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    const isUploader = attachment.uploaderId === actorId;
    const isOwnerOrAdmin = member.role === 'OWNER' || member.role === 'ADMIN';
    if (!isUploader && !isOwnerOrAdmin) {
      return err(new ForbiddenError('Only the uploader or an admin can delete this attachment'));
    }

    // Mark as DELETED in database
    await this.repo.deleteAttachment(attachmentId);

    // P8-T07 & NFR-040: Persistent deletion registry for backup resurrection prevention
    await prisma.deletedEntityRegistry.upsert({
      where: {
        entityType_entityId: {
          entityType: 'ATTACHMENT',
          entityId: attachmentId,
        },
      },
      create: {
        entityType: 'ATTACHMENT',
        entityId: attachmentId,
      },
      update: {},
    });

    // Purge binary object from S3 storage
    await this.storage.deleteObject(attachment.objectKey);

    return ok({ success: true, attachmentId });
  }
}

export const attachmentsService = new AttachmentsService();
