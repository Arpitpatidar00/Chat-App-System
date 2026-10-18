import type { FastifyPluginAsync } from 'fastify';
import { receiptsController } from './receipts.controller.js';
import { requireAuth } from '../../core/middleware/auth-guard.js';

export const receiptsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/ack',
    { preHandler: [requireAuth] },
    receiptsController.ackReceipt.bind(receiptsController)
  );

  app.post(
    '/read-up-to',
    { preHandler: [requireAuth] },
    receiptsController.readUpTo.bind(receiptsController)
  );

  app.get(
    '/:messageId',
    { preHandler: [requireAuth] },
    receiptsController.getReceipts.bind(receiptsController)
  );
};
