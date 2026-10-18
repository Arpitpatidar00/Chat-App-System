import type { FastifyRequest, FastifyReply } from 'fastify';
import { reportsService, type ReportsService } from './reports.service.js';
import type { CreateReportRequestDTO } from '@chat/types';

export class ReportsController {
  constructor(private readonly service: ReportsService = reportsService) {}

  public async getModerationKey(_request: FastifyRequest, reply: FastifyReply) {
    const publicKey = this.service.getModerationPublicKey();
    return reply.status(200).send({ data: { publicKey } });
  }

  public async create(
    request: FastifyRequest<{ Body: CreateReportRequestDTO }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.submitReport(userId, request.body);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async review(
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: { justification?: string; role?: 'MOD_REVIEWER' | 'ROUTINE_ADMIN' };
    }>,
    reply: FastifyReply
  ) {
    const adminId = request.user?.userId;
    if (!adminId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing admin context' } });
    }

    const { id: reportId } = request.params;
    const { justification, role } = request.query;

    if (!justification) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Audit justification is strictly required to review reports',
        },
      });
    }

    const ipAddress = request.ip || '127.0.0.1';
    const result = await this.service.reviewReport(
      adminId,
      reportId,
      justification,
      ipAddress,
      role ?? 'MOD_REVIEWER'
    );

    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const reportsController = new ReportsController();
