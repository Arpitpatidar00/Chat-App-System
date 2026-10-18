import type { FastifyPluginAsync } from 'fastify';
import { messagesController } from './messages.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.post('/', (req, rep) => messagesController.send(req as any, rep));
  fastify.get('/sync', (req, rep) => messagesController.sync(req as any, rep));
};
