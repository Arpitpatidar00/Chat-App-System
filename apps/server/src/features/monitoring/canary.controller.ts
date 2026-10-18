import type { FastifyRequest, FastifyReply } from 'fastify';
import { canaryMonitor } from './canary-monitor.js';
import { securityAuditScanner } from './security-audit-scanner.js';
import { drFailoverService } from './dr-failover.service.js';

export class CanaryController {
  public async getHealth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const summary = canaryMonitor.getHealthSummary();
    const httpStatus = summary.status === 'DOWN' ? 503 : 200;
    reply.status(httpStatus).send({
      status: 'success',
      data: summary,
    });
  }

  public async runProbe(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const probe = await canaryMonitor.runProbe();
    reply.status(200).send({
      status: 'success',
      data: probe,
    });
  }

  public async runSecurityAudit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as { conversationId?: string };
    const scan = await securityAuditScanner.scanDatastores(query.conversationId);
    reply.status(200).send({
      status: 'success',
      data: scan,
    });
  }

  public async runDrAudit(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = req.body as {
      conversationId: string;
      acknowledgedClientMsgIds: string[];
      deletedMessageIds: string[];
    };

    if (!body?.conversationId || !Array.isArray(body?.acknowledgedClientMsgIds)) {
      reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid DR drill payload. conversationId and acknowledgedClientMsgIds array are required.',
        },
      });
      return;
    }

    const audit = await drFailoverService.executeFailoverAudit(
      body.conversationId,
      body.acknowledgedClientMsgIds,
      body.deletedMessageIds || []
    );

    reply.status(200).send({
      status: 'success',
      data: audit,
    });
  }
}

export const canaryController = new CanaryController();
