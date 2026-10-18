import type { FastifyRequest, FastifyReply } from 'fastify';
import { presenceService, type PresenceService } from './presence.service.js';

export class PresenceController {
  constructor(private readonly service: PresenceService = presenceService) {}

  public async getPresence(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    const result = await this.service.getUserPresence(request.params.userId);
    if (!result.success) {
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve presence' } });
    }
    return reply.status(200).send({ data: result.data });
  }
}

export const presenceController = new PresenceController();
