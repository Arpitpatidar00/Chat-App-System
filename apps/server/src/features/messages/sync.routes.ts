import type { FastifyPluginAsync } from 'fastify';
import { messagesController } from './messages.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.get('/events', (req, rep) => messagesController.syncEvents(req as any, rep));
  fastify.get('/messages', (req, rep) => messagesController.sync(req as any, rep));
};
