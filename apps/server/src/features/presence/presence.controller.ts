import type { FastifyRequest, FastifyReply } from 'fastify';
import { presenceService, type PresenceService } from './presence.service.js';

export class PresenceController {
  constructor(private readonly service: PresenceService = presenceService) {}

  public async getPresence(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const requester = req.user!;
    const { userId } = req.params as { userId: string };

    const result = await this.service.getPresence(requester.userId, userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send(result.data);
  }

  public async updatePrivacy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = req.user!;
    const { visibility } = req.body as { visibility: 'EVERYONE' | 'CONTACTS' | 'NOBODY' };

    if (!['EVERYONE', 'CONTACTS', 'NOBODY'].includes(visibility)) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'visibility must be EVERYONE, CONTACTS, or NOBODY',
        },
      });
    }

    const result = await this.service.updatePrivacy(user.userId, visibility);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send(result.data);
  }
}

export const presenceController = new PresenceController();
