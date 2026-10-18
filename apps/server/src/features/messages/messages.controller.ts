import type { FastifyRequest, FastifyReply } from 'fastify';
import { messagesService, type MessagesService } from './messages.service.js';
import type { SendMessageRequestDTO } from '@chat/types';

export class MessagesController {
  constructor(private readonly service: MessagesService = messagesService) {}

  public async send(
    request: FastifyRequest<{
      Body: SendMessageRequestDTO;
    }>,
    reply: FastifyReply
  ) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.sendMessage(user.userId, user.deviceId, request.body);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async sync(
    request: FastifyRequest<{
      Querystring: { conversationId: string; lastKnownSeqId?: string; limit?: string };
    }>,
    reply: FastifyReply
  ) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { conversationId, lastKnownSeqId, limit } = request.query;
    if (!conversationId) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_FAILED', message: 'conversationId is required' },
      });
    }

    const fromSeq = lastKnownSeqId ? BigInt(lastKnownSeqId) : BigInt(0);
    const takeLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50;

    const result = await this.service.syncMessages(conversationId, user.userId, fromSeq, takeLimit);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const messagesController = new MessagesController();
