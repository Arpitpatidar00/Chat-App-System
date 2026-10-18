import type { FastifyPluginAsync } from 'fastify';
import { presenceController } from './presence.controller.js';
import { requireAuth } from '../../core/middleware/auth-guard.js';

export const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/:userId',
    { preHandler: [requireAuth] },
    presenceController.getPresence.bind(presenceController)
  );

  app.put(
    '/privacy',
    { preHandler: [requireAuth] },
    presenceController.updatePrivacy.bind(presenceController)
  );
};
