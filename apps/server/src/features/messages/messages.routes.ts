import type { FastifyPluginAsync } from 'fastify';
import { messagesController } from './messages.controller.js';

export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', (req, rep) => messagesController.send(req as any, rep));
};
