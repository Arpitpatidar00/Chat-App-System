import type { FastifyPluginAsync } from 'fastify';
import { presenceController } from './presence.controller.js';

export const presenceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:userId', (req, rep) => presenceController.getPresence(req as any, rep));
};
