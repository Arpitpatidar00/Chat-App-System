import { prisma, type ModerationReport, type ReportStatus } from '@chat/database';

export interface CreateReportParams {
  reporterId: string;
  reportedUserId: string;
  conversationId: string;
  reasonCode: string;
  disclosedMessagesEncrypted: Buffer;
  metadataSnapshot: Record<string, any>;
}

export class ReportsRepository {
  public async createReport(params: CreateReportParams): Promise<ModerationReport> {
    return prisma.moderationReport.create({
      data: {
        reporterId: params.reporterId,
        reportedUserId: params.reportedUserId,
        conversationId: params.conversationId,
        reasonCode: params.reasonCode,
        disclosedMessagesEncrypted: params.disclosedMessagesEncrypted as any,
        metadataSnapshot: params.metadataSnapshot,
        status: 'OPEN',
      },
    });
  }

  public async findById(reportId: string): Promise<ModerationReport | null> {
    return prisma.moderationReport.findUnique({
      where: { reportId },
    });
  }

  public async updateStatus(
    reportId: string,
    status: ReportStatus,
    assignedReviewerId?: string
  ): Promise<ModerationReport> {
    return prisma.moderationReport.update({
      where: { reportId },
      data: {
        status,
        ...(assignedReviewerId ? { assignedReviewerId } : {}),
      },
    });
  }

  public async listReports(status?: ReportStatus): Promise<ModerationReport[]> {
    return prisma.moderationReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const reportsRepository = new ReportsRepository();
