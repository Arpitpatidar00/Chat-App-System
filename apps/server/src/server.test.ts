import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from './core/redis/redis-client.js';

after(async () => {
  await prisma.$disconnect();
  await closeRedisConnections();
});

test('Fastify Server: /health endpoint responds and checks datastore', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.status, 'healthy');
  assert.equal(payload.checks.database, 'healthy');

  await app.close();
});

test('Fastify Server: /api/v1/conversations rejects unauthenticated requests', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
  });

  assert.equal(response.statusCode, 401);
  const payload = JSON.parse(response.body);
  assert.equal(payload.error.code, 'UNAUTHORIZED');

  await app.close();
});
