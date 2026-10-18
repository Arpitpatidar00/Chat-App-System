import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';

import { env } from './config/env.js';
import { prisma } from '@chat/database';
import { getRedisClient } from './core/redis/redis-client.js';
import { wsGateway } from './core/websocket/gateway.js';

import { authRoutes } from './features/auth/auth.routes.js';
import { conversationsRoutes } from './features/conversations/conversations.routes.js';
import { messagesRoutes } from './features/messages/messages.routes.js';
import { receiptsRoutes } from './features/receipts/receipts.routes.js';
import { presenceRoutes } from './features/presence/presence.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : true,
  });

  // Security headers & CORS
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });

  // Rate Limiting (DEC-01 / NFR: 100 req/min baseline)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // WebSocket support
  await app.register(fastifyWebsocket);

  // Health check endpoint
  app.get('/health', async (_req, reply) => {
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `unhealthy: ${err.message}`;
    }

    try {
      const redis = getRedisClient();
      await redis.ping();
    } catch (err: any) {
      redisStatus = `degraded: ${err.message}`;
    }

    const isHealthy = dbStatus === 'healthy';
    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      connectedDevices: wsGateway.getConnectedDevicesCount(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });

  // WebSocket Gateway route: /ws?userId=...&deviceId=...
  app.get('/ws', { websocket: true }, (socket, req) => {
    const query = req.query as { userId?: string; deviceId?: string };
    const userId = query.userId || 'anonymous-user';
    const deviceId = query.deviceId || 'anonymous-device';

    wsGateway.register(userId, deviceId, socket);
    req.log.info({ userId, deviceId }, 'WebSocket client connected');

    socket.on('message', (data: any) => {
      try {
        const payload = JSON.parse(data.toString());
        // Echo or dispatch message
        req.log.debug({ userId, deviceId, eventType: payload.eventType }, 'WS payload received');
      } catch {
        socket.send(JSON.stringify({ error: 'INVALID_JSON_FRAME' }));
      }
    });
  });

  // Feature REST API Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(conversationsRoutes, { prefix: '/api/v1/conversations' });
  await app.register(messagesRoutes, { prefix: '/api/v1/messages' });
  await app.register(receiptsRoutes, { prefix: '/api/v1/receipts' });
  await app.register(presenceRoutes, { prefix: '/api/v1/presence' });

  return app;
}
