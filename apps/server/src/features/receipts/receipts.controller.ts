import type { FastifyRequest, FastifyReply } from 'fastify';
import { receiptsService, type ReceiptsService } from './receipts.service.js';
import type { ReceiptAckDTO } from '@chat/types';

export class ReceiptsController {
  constructor(private readonly service: ReceiptsService = receiptsService) {}

  public async update(
    request: FastifyRequest<{
      Body: ReceiptAckDTO;
      Headers: { 'x-user-id'?: string };
    }>,
    reply: FastifyReply
  ) {
    const userId = request.headers['x-user-id'];

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.updateReceipt(userId, request.body);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const receiptsController = new ReceiptsController();
