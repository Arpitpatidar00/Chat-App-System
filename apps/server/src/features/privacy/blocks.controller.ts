import type { FastifyRequest, FastifyReply } from 'fastify';
import { blocksService, type BlocksService } from './blocks.service.js';
import type { BlockUserRequestDTO } from '@chat/types';

export class BlocksController {
  constructor(private readonly service: BlocksService = blocksService) {}

  public async block(
    request: FastifyRequest<{ Body: BlockUserRequestDTO }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { blockedUserId } = request.body || {};
    if (!blockedUserId) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'blockedUserId is required' },
      });
    }

    const result = await this.service.blockUser(userId, blockedUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async unblock(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { userId: targetUserId } = request.params;
    const result = await this.service.unblockUser(userId, targetUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.listBlockedUsers(userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const blocksController = new BlocksController();
