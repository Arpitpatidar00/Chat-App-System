import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';

import { env } from './config/env.js';
import { prisma } from '@chat/database';
import { getRedisClient } from './core/redis/redis-client.js';
import { wsGateway } from './core/websocket/gateway.js';
import { verifyJwt } from '@chat/crypto';

import { authRoutes } from './features/auth/auth.routes.js';
import { conversationsRoutes } from './features/conversations/conversations.routes.js';
import { messagesRoutes } from './features/messages/messages.routes.js';
import { syncRoutes } from './features/messages/sync.routes.js';
import { receiptsRoutes } from './features/receipts/receipts.routes.js';
import { presenceRoutes } from './features/presence/presence.routes.js';
import { devicesRoutes } from './features/devices/devices.routes.js';
import { attachmentsRoutes } from './features/attachments/attachments.routes.js';
import { messagesService } from './features/messages/messages.service.js';
import { receiptsService } from './features/receipts/receipts.service.js';
import { presenceService } from './features/presence/presence.service.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : {
      // P1-T07: Structured Log Redaction (NFR-026)
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.key',
        '*.encryptedPayloads',
      ],
    },
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

  // WebSocket Gateway route with P1-T01/P1-T02 authentication & eligibility check
  app.get('/ws', { websocket: true }, (socket, req) => {
    const query = req.query as { token?: string; userId?: string; deviceId?: string };
    const authHeader = req.headers.authorization;
    const token = query.token || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

    let userId = query.userId || 'anonymous-user';
    let deviceId = query.deviceId || 'anonymous-device';

    // Verify token if provided
    if (token) {
      const claims = verifyJwt(token, env.JWT_SECRET);
      if (!claims) {
        socket.close(4401, 'Unauthorized: Invalid token');
        return;
      }
      if (claims.status !== 'VERIFIED' && claims.status !== 'APPROVED') {
        socket.close(4403, 'Forbidden: ELIGIBILITY_REQUIRED');
        return;
      }
      userId = claims.userId;
      deviceId = claims.deviceId;
    }

    wsGateway.register(userId, deviceId, socket);
    presenceService.recordHeartbeat(userId, deviceId).catch(() => {});
    req.log.info({ userId, deviceId }, 'WebSocket client connected');

    socket.on('message', async (data: any) => {
      try {
        const payload = JSON.parse(data.toString());
        presenceService.recordHeartbeat(userId, deviceId).catch(() => {});

        // P3-T04: Heartbeat PING -> PONG
        if (payload.action === 'PING') {
          socket.send(JSON.stringify({ action: 'PONG' }));
          return;
        }

        // P2-T03: Inbound WebSocket MSG_SEND ingestion & immediate MSG_ACK
        if (payload.action === 'MSG_SEND') {
          const ackResult = await messagesService.sendMessage(userId, deviceId, payload);
          if (ackResult.success) {
            socket.send(JSON.stringify(ackResult.data));
          } else {
            socket.send(
              JSON.stringify({
                error: {
                  code: ackResult.error.errorCode,
                  message: ackResult.error.message,
                },
              })
            );
          }
          return;
        }

        // P3-T02: Inbound RECEIPT_ACK (status 2 = DELIVERED)
        if (payload.action === 'RECEIPT_ACK') {
          await receiptsService.handleReceiptAck(userId, deviceId, payload.messageId);
          return;
        }

        // P3-T02 & P3-T03: Inbound READ_UP_TO (status 3 = READ + SELF_READ_SYNC)
        if (payload.action === 'READ_UP_TO') {
          await receiptsService.handleReadUpTo(
            userId,
            deviceId,
            payload.conversationId,
            payload.maxSeqId
          );
          return;
        }

        // P3-T06: Inbound TYPING_START & TYPING_STOP
        if (payload.action === 'TYPING_START') {
          await presenceService.handleTyping(userId, deviceId, payload.conversationId, true);
          return;
        }

        if (payload.action === 'TYPING_STOP') {
          await presenceService.handleTyping(userId, deviceId, payload.conversationId, false);
          return;
        }

        req.log.debug({ userId, deviceId, action: payload.action }, 'WS frame received');
      } catch {
        socket.send(JSON.stringify({ error: 'INVALID_JSON_FRAME' }));
      }
    });
  });

  // Feature REST API Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(devicesRoutes, { prefix: '/api/v1' });
  await app.register(conversationsRoutes, { prefix: '/api/v1/conversations' });
  await app.register(messagesRoutes, { prefix: '/api/v1/messages' });
  await app.register(syncRoutes, { prefix: '/api/v1/sync' });
  await app.register(receiptsRoutes, { prefix: '/api/v1/receipts' });
  await app.register(presenceRoutes, { prefix: '/api/v1/presence' });
  await app.register(attachmentsRoutes, { prefix: '/api/v1/attachments' });

  return app;
}
