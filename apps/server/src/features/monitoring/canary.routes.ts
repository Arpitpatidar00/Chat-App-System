import type { FastifyPluginAsync } from 'fastify';
import { canaryController } from './canary.controller.js';

export const canaryRoutes: FastifyPluginAsync = async (app) => {
  // P9-T09 & NFR-012: Synthetic canary probe status endpoint
  app.get('/health', canaryController.getHealth.bind(canaryController));
  app.get('/canary', canaryController.getHealth.bind(canaryController));

  // Trigger manual synthetic probe
  app.post('/canary/probe', canaryController.runProbe.bind(canaryController));

  // P9-T05 & NFR-027/042: Zero-Plaintext datastore audit scan
  app.get('/security-audit', canaryController.runSecurityAudit.bind(canaryController));

  // P9-T06, P9-T07, P9-T08: Disaster recovery chaos failover drill
  app.post('/dr-drill', canaryController.runDrAudit.bind(canaryController));
};
