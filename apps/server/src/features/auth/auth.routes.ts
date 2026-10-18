import type { FastifyPluginAsync } from 'fastify';
import { authController } from './auth.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Session verification endpoint (protected by eligibility middleware)
  fastify.get('/me', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    authController.getMe(req, rep)
  );

  fastify.post('/verify-session', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    authController.verifySession(req, rep)
  );

  // Administrative suspension kill-switch
  fastify.post('/suspend/:userId', (req, rep) =>
    authController.suspendUser(req as any, rep)
  );
};
