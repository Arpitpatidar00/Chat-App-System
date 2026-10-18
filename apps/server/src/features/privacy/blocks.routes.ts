import type { FastifyPluginAsync } from 'fastify';
import { blocksController } from './blocks.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const blocksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.post('/', (req, rep) => blocksController.block(req as any, rep));
  fastify.delete('/:userId', (req, rep) => blocksController.unblock(req as any, rep));
  fastify.get('/', (req, rep) => blocksController.list(req as any, rep));
};
