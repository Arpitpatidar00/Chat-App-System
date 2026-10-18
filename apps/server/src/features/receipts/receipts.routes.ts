import type { FastifyPluginAsync } from 'fastify';
import { receiptsController } from './receipts.controller.js';

export const receiptsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', (req, rep) => receiptsController.update(req as any, rep));
};
