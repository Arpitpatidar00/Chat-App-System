import type { FastifyPluginAsync } from 'fastify';
import { reportsController } from './reports.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // Public moderation key retrieval
  fastify.get('/keys/moderation-key', (req, rep) => reportsController.getModerationKey(req, rep));

  // Protected report submission
  fastify.post('/reports', { preHandler: [authenticateAndCheckEligibility] }, (req, rep) =>
    reportsController.create(req as any, rep)
  );

  // Protected moderator review endpoint
  fastify.get('/admin/reports/:id', { preHandler: [authenticateAndCheckEligibility] }, (req, rep) =>
    reportsController.review(req as any, rep)
  );
};
