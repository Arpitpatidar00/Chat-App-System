import type { FastifyRequest, FastifyReply } from 'fastify';
import { receiptsService, type ReceiptsService } from './receipts.service.js';

export class ReceiptsController {
  constructor(private readonly service: ReceiptsService = receiptsService) {}

  public async ackReceipt(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = req.user!;
    const { messageId } = req.body as { messageId: string };

    if (!messageId) {
      return reply.status(400).send({
        error: { code: 'INVALID_ARGUMENT', message: 'messageId is required' },
      });
    }

    const result = await this.service.handleReceiptAck(user.userId, user.deviceId, messageId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send(result.data);
  }

  public async readUpTo(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = req.user!;
    const { conversationId, maxSeqId } = req.body as {
      conversationId: string;
      maxSeqId: string;
    };

    if (!conversationId || maxSeqId === undefined) {
      return reply.status(400).send({
        error: { code: 'INVALID_ARGUMENT', message: 'conversationId and maxSeqId are required' },
      });
    }

    const result = await this.service.handleReadUpTo(
      user.userId,
      user.deviceId,
      conversationId,
      maxSeqId
    );
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send(result.data);
  }

  public async getReceipts(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { messageId } = req.params as { messageId: string };
    const result = await this.service.getReceiptsForMessage(messageId);

    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send(result.data);
  }
}

export const receiptsController = new ReceiptsController();
