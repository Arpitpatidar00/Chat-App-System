import type { FastifyPluginAsync } from 'fastify';
import { devicesController } from './devices.controller.js';
import { authenticateAndCheckEligibility } from '../../core/middleware/auth-guard.js';

export const devicesRoutes: FastifyPluginAsync = async (fastify) => {
  // Device enrollment (requires authentication)
  fastify.post('/devices/enroll', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    devicesController.enroll(req as any, rep)
  );

  // Pre-key bundle retrieval for establishing E2EE sessions
  fastify.get('/keys/bundle/:userId', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    devicesController.getPrekeyBundles(req as any, rep)
  );

  // Key Backup Vault endpoints (DEC-02, Zero-RPO key recovery)
  fastify.put('/keys/vault', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    devicesController.updateVault(req as any, rep)
  );

  fastify.get('/keys/vault', { preHandler: authenticateAndCheckEligibility }, (req, rep) =>
    devicesController.getVault(req, rep)
  );
};
