import type { FastifyPluginAsync } from 'fastify';
import { conversationsController } from './conversations.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const conversationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Protect all conversation routes with eligibility & authentication guard
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.get('/', (req, rep) => conversationsController.list(req, rep));
  fastify.post('/direct', (req, rep) => conversationsController.createDirect(req as any, rep));
  fastify.post('/groups', (req, rep) => conversationsController.createGroup(req as any, rep));
  fastify.get('/:id', (req, rep) => conversationsController.getOne(req as any, rep));
  fastify.post('/:id/members', (req, rep) => conversationsController.addMember(req as any, rep));
  fastify.delete('/:id/members/:userId', (req, rep) => conversationsController.removeMember(req as any, rep));
  fastify.post('/:id/history-package', (req, rep) => conversationsController.uploadHistoryPackage(req as any, rep));
  fastify.get('/:id/history-package', (req, rep) => conversationsController.getHistoryPackage(req as any, rep));
  fastify.patch('/:id/mute', (req, rep) => conversationsController.mute(req as any, rep));
  fastify.post('/:id/pin', (req, rep) => conversationsController.pin(req as any, rep));
};

