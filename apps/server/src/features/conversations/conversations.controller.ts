import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  conversationsService,
  type ConversationsService,
} from './conversations.service.js';

export class ConversationsController {
  constructor(private readonly service: ConversationsService = conversationsService) {}

  public async list(request: FastifyRequest<{ Headers: { 'x-user-id'?: string } }>, reply: FastifyReply) {
    const userId = request.headers['x-user-id'];
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
    request: FastifyRequest<{ Params: { id: string }; Headers: { 'x-user-id'?: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.headers['x-user-id'];
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
}

export const conversationsController = new ConversationsController();
