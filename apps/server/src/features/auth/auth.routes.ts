import type { FastifyPluginAsync } from 'fastify';
import { authController } from './auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me', (req, rep) => authController.getMe(req as any, rep));
};
