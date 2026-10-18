import type { FastifyPluginAsync } from 'fastify';
import { privacyController } from './privacy.controller.js';

export const privacyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metadata-manifest', (req, rep) => privacyController.getMetadataManifest(req, rep));
};
