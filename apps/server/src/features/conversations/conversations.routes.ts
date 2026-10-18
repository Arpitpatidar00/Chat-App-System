import type { FastifyPluginAsync } from 'fastify';
import { conversationsController } from './conversations.controller.js';

export const conversationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', (req, rep) => conversationsController.list(req as any, rep));
  fastify.get('/:id', (req, rep) => conversationsController.getOne(req as any, rep));
};
