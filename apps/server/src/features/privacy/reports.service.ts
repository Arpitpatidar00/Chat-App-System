import { reportsRepository, type ReportsRepository } from './reports.repository.js';
import { auditLogsRepository, type AuditLogsRepository } from './audit-logs.repository.js';
import { moderationCrypto } from './moderation-crypto.js';
import { prisma } from '@chat/database';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type {
  CreateReportRequestDTO,
  ModerationReportDTO,
  DisclosedMessageItem,
} from '@chat/types';

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository = reportsRepository,
    private readonly auditRepo: AuditLogsRepository = auditLogsRepository
  ) {}

  public getModerationPublicKey(): string {
    return moderationCrypto.getPublicKeyBase64();
  }

  /**
   * P8-T02 & FR-070 to FR-073: Ingests on-device scoped re-encrypted report.
   */
  public async submitReport(
    reporterId: string,
    dto: CreateReportRequestDTO
  ): Promise<Result<{ reportId: string; status: string }, DomainError>> {
    if (reporterId === dto.reportedUserId) {
      return err(new ValidationError('Cannot report yourself'));
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { members: true },
    });
    if (!conv) {
      return err(new NotFoundError(`Conversation ${dto.conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === reporterId);
    if (!isMember) {
      return err(new ForbiddenError('You are not a member of this conversation'));
    }

    const encryptedBuffer = Buffer.from(dto.disclosedMessagesEncrypted, 'base64');

    const report = await this.repo.createReport({
      reporterId,
      reportedUserId: dto.reportedUserId,
      conversationId: dto.conversationId,
      reasonCode: dto.reasonCode,
      disclosedMessagesEncrypted: encryptedBuffer,
      metadataSnapshot: dto.metadataSnapshot || {},
    });

    return ok({
      reportId: report.reportId,
      status: report.status,
    });
  }

  /**
   * P8-T03, P8-T04, P8-T08: Scoped Moderator Review API with Write-Ahead Audit Logging.
   * Guarantees:
   * - FR-075 & NFR-029: Immutable write-ahead audit entry created BEFORE decryption
   * - P8-T08: Routine administrators without reviewer authorization cannot decrypt messages
   */
  public async reviewReport(
    actorAdminId: string,
    reportId: string,
    justification: string,
    ipAddress: string,
    reviewerRole: 'MOD_REVIEWER' | 'ROUTINE_ADMIN' = 'MOD_REVIEWER'
  ): Promise<Result<ModerationReportDTO, DomainError>> {
    // 1. Validate audit justification
    if (!justification || justification.trim().length === 0) {
      return err(new ValidationError('Audit justification is strictly required to review moderation reports'));
    }

    // 2. Locate report
    const report = await this.repo.findById(reportId);
    if (!report) {
      return err(new NotFoundError(`Report ${reportId} not found`));
    }

    // 3. Write-Ahead Immutable Audit Log (FR-075, NFR-029)
    await this.auditRepo.logAction({
      actorAdminId,
      actionType: 'VIEW_REPORT',
      targetId: reportId,
      ipAddress,
      justification,
    });

    // 4. P8-T08: Routine Admin Metadata-Only Audit Protection
    if (reviewerRole === 'ROUTINE_ADMIN') {
      // Routine admins can only see metadata; message decryption is forbidden
      return ok({
        reportId: report.reportId,
        reporterId: report.reporterId,
        reportedUserId: report.reportedUserId,
        conversationId: report.conversationId,
        reasonCode: report.reasonCode,
        status: report.status as any,
        assignedReviewerId: report.assignedReviewerId,
        createdAt: report.createdAt.toISOString(),
        metadataSnapshot: report.metadataSnapshot as Record<string, any>,
        decryptedMessages: undefined,
      });
    }

    // 5. Authorized MOD_REVIEWER: Decrypt disclosed messages using Mod_SK
    let decryptedMessages: DisclosedMessageItem[] = [];
    try {
      const base64Ciphertext = Buffer.from(report.disclosedMessagesEncrypted).toString('base64');
      decryptedMessages = moderationCrypto.decryptDisclosedMessages(base64Ciphertext);
    } catch (err: any) {
      return err(new ValidationError(`Failed to decrypt disclosed messages: ${err.message}`));
    }

    // Update status to IN_REVIEW if OPEN
    if (report.status === 'OPEN') {
      await this.repo.updateStatus(reportId, 'IN_REVIEW', actorAdminId);
    }

    return ok({
      reportId: report.reportId,
      reporterId: report.reporterId,
      reportedUserId: report.reportedUserId,
      conversationId: report.conversationId,
      reasonCode: report.reasonCode,
      status: 'IN_REVIEW',
      assignedReviewerId: actorAdminId,
      createdAt: report.createdAt.toISOString(),
      metadataSnapshot: report.metadataSnapshot as Record<string, any>,
      decryptedMessages,
    });
  }
}

export const reportsService = new ReportsService();
