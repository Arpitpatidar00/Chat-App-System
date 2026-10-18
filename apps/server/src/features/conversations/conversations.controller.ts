import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  conversationsService,
  type ConversationsService,
} from './conversations.service.js';
import type { CreateDirectConversationDTO } from '@chat/types';

export class ConversationsController {
  constructor(private readonly service: ConversationsService = conversationsService) {}

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.listUserConversations(userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async getOne(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.getConversation(request.params.id, userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async createDirect(
    request: FastifyRequest<{ Body: CreateDirectConversationDTO }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { peerUserId } = request.body;
    if (!peerUserId) {
      return reply.status(422).send({ error: { code: 'VALIDATION_FAILED', message: 'peerUserId is required' } });
    }

    const result = await this.service.createDirectConversation(userId, peerUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }
}

export const conversationsController = new ConversationsController();
