import type { FastifyRequest, FastifyReply } from 'fastify';
import { messagesService, type MessagesService } from './messages.service.js';
import type { SendMessageRequestDTO } from '@chat/types';

export class MessagesController {
  constructor(private readonly service: MessagesService = messagesService) {}

  public async send(
    request: FastifyRequest<{
      Body: SendMessageRequestDTO;
      Headers: { 'x-user-id'?: string; 'x-device-id'?: string };
    }>,
    reply: FastifyReply
  ) {
    const userId = request.headers['x-user-id'];
    const deviceId = request.headers['x-device-id'] ?? 'primary-device';

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.sendMessage(userId, deviceId, request.body);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }
}

export const messagesController = new MessagesController();
