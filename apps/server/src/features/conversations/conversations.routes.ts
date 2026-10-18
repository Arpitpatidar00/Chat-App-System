import type { FastifyPluginAsync } from 'fastify';
import { conversationsController } from './conversations.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const conversationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Protect all conversation routes with eligibility & authentication guard
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.get('/', (req, rep) => conversationsController.list(req, rep));
  fastify.post('/direct', (req, rep) => conversationsController.createDirect(req as any, rep));
  fastify.get('/:id', (req, rep) => conversationsController.getOne(req as any, rep));
};
