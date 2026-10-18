import type { FastifyPluginAsync } from 'fastify';
import { attachmentsController } from './attachments.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const attachmentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.post('/init', (req, rep) => attachmentsController.init(req as any, rep));
  fastify.post('/:id/commit', (req, rep) => attachmentsController.commit(req as any, rep));
  fastify.get('/:id/download-url', (req, rep) => attachmentsController.getDownloadUrl(req as any, rep));
  fastify.delete('/:id', (req, rep) => attachmentsController.purge(req as any, rep));
};
