import type { FastifyPluginAsync } from 'fastify';
import { messagesController } from './messages.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateAndCheckEligibility);

  fastify.post('/', (req, rep) => messagesController.send(req as any, rep));
  fastify.get('/sync', (req, rep) => messagesController.sync(req as any, rep));
  fastify.get('/events', (req, rep) => messagesController.syncEvents(req as any, rep));
  fastify.get('/:id/receipts', (req, rep) => messagesController.getReceipts(req as any, rep));
  fastify.post('/:id/delete-everyone', (req, rep) => messagesController.deleteEveryone(req as any, rep));
  fastify.delete('/:id/delete-everyone', (req, rep) => messagesController.deleteEveryone(req as any, rep));
  fastify.post('/:id/delete-self', (req, rep) => messagesController.deleteSelf(req as any, rep));
  fastify.delete('/:id/delete-self', (req, rep) => messagesController.deleteSelf(req as any, rep));
  fastify.post('/:id/edit', (req, rep) => messagesController.edit(req as any, rep));
  fastify.post('/:id/reactions', (req, rep) => messagesController.react(req as any, rep));
};

