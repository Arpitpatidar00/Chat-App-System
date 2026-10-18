import { prisma, type AdminAction, type AdminAuditLog } from '@chat/database';

export interface CreateAuditLogParams {
  actorAdminId: string;
  actionType: AdminAction;
  targetId: string;
  ipAddress: string;
  justification: string;
}

/**
 * P8-T04: Write-Ahead Admin Audit Logger (FR-075, NFR-029).
 * Records immutable, append-only entries before any administrative decryption or action occurs.
 */
export class AuditLogsRepository {
  public async logAction(params: CreateAuditLogParams): Promise<AdminAuditLog> {
    return prisma.adminAuditLog.create({
      data: {
        actorAdminId: params.actorAdminId,
        actionType: params.actionType,
        targetId: params.targetId,
        ipAddress: params.ipAddress,
        justification: params.justification,
      },
    });
  }

  public async getLogsForTarget(targetId: string): Promise<AdminAuditLog[]> {
    return prisma.adminAuditLog.findMany({
      where: { targetId },
      orderBy: { logId: 'desc' },
    });
  }

  public async getLogsByActor(actorAdminId: string): Promise<AdminAuditLog[]> {
    return prisma.adminAuditLog.findMany({
      where: { actorAdminId },
      orderBy: { logId: 'desc' },
    });
  }
}

export const auditLogsRepository = new AuditLogsRepository();
