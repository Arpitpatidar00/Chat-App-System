import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { signJwt } from '@chat/crypto';
import { env } from '../../config/env.js';
import { computeDirectPairHash } from '../conversations/conversations.repository.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { randomUUID } from 'node:crypto';

after(async () => {
  await prisma.$disconnect();
  await closeRedisConnections();
});

test('E2E-1.1: Eligibility Gate Rejection - rejects PENDING status with 403', async () => {
  const app = await buildApp();

  const pendingToken = signJwt(
    {
      userId: randomUUID(),
      deviceId: randomUUID(),
      username: 'pending_user',
      status: 'PENDING',
      platform: 'IOS',
    },
    env.JWT_SECRET,
    3600
  );

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
    headers: {
      authorization: `Bearer ${pendingToken}`,
    },
  });

  assert.equal(response.statusCode, 403);
  const payload = JSON.parse(response.body);
  assert.equal(payload.error.code, 'ELIGIBILITY_REQUIRED');

  await app.close();
});

test('E2E-1.1b: Eligibility Gate Approval - accepts VERIFIED status', async () => {
  const app = await buildApp();

  const verifiedToken = signJwt(
    {
      userId: randomUUID(),
      deviceId: randomUUID(),
      username: 'verified_user',
      status: 'VERIFIED',
      platform: 'ANDROID',
    },
    env.JWT_SECRET,
    3600
  );

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
    headers: {
      authorization: `Bearer ${verifiedToken}`,
    },
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.ok(Array.isArray(payload.data));

  await app.close();
});

test('E2E-1.2: Direct Chat Race-Condition Idempotency - 20 concurrent calls create exactly 1 conversation', async () => {
  // 1. Seed two test users in Supabase PostgreSQL
  const usernameA = `test_user_a_${Date.now()}`;
  const usernameB = `test_user_b_${Date.now()}`;

  const userA = await prisma.user.create({
    data: { username: usernameA, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: usernameB, status: 'VERIFIED' },
  });

  try {
    // 2. Fire 20 parallel requests concurrently
    const promises = Array.from({ length: 20 }).map((_, i) => {
      // Alternate initiator between userA and userB to test bidirectional race
      const initiator = i % 2 === 0 ? userA.id : userB.id;
      const peer = i % 2 === 0 ? userB.id : userA.id;
      return conversationsService.createDirectConversation(initiator, peer);
    });

    const results = await Promise.all(promises);

    const firstResult = results[0];
    assert.ok(firstResult && firstResult.success, 'First call must succeed');
    const firstConvId = firstResult.data.id;

    for (const res of results) {
      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.data.id, firstConvId);
      }
    }

    // 4. Verify exactly 1 conversation exists in database with this pair hash
    const pairHash = computeDirectPairHash(userA.id, userB.id);
    const dbConversations = await prisma.conversation.findMany({
      where: { directPairHash: pairHash },
    });
    assert.equal(dbConversations.length, 1, 'Exactly 1 conversation must be created in PostgreSQL');
  } finally {
    // Cleanup seeded test records
    await prisma.conversationMember.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.conversation.deleteMany({
      where: { directPairHash: computeDirectPairHash(userA.id, userB.id) },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  }
});

test('E2E-1.3: Unauthorized Conversation Probing - User C blocked from User A/B chat with 403', async () => {
  const app = await buildApp();

  const userA = await prisma.user.create({
    data: { username: `user_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_b_${Date.now()}`, status: 'VERIFIED' },
  });
  const userC = await prisma.user.create({
    data: { username: `user_c_${Date.now()}`, status: 'VERIFIED' },
  });

  try {
    const convResult = await conversationsService.createDirectConversation(userA.id, userB.id);
    assert.equal(convResult.success, true);
    const convId = convResult.data.id;

    // User C crafts valid JWT but is not a member of conversation AB
    const tokenC = signJwt(
      {
        userId: userC.id,
        deviceId: randomUUID(),
        username: userC.username,
        status: 'VERIFIED',
        platform: 'IOS',
      },
      env.JWT_SECRET,
      3600
    );

    const probeResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}`,
      headers: {
        authorization: `Bearer ${tokenC}`,
      },
    });

    assert.equal(probeResponse.statusCode, 403);
    const payload = JSON.parse(probeResponse.body);
    assert.equal(payload.error.code, 'FORBIDDEN');
  } finally {
    await prisma.conversationMember.deleteMany({
      where: { userId: { in: [userA.id, userB.id, userC.id] } },
    });
    await prisma.conversation.deleteMany({
      where: { directPairHash: computeDirectPairHash(userA.id, userB.id) },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id] } },
    });
    await app.close();
  }
});

test('E2E-1.4: Instant Suspension Kill-Switch - suspended user rejected with 403', async () => {
  const app = await buildApp();

  const user = await prisma.user.create({
    data: { username: `susp_user_${Date.now()}`, status: 'VERIFIED' },
  });

  try {
    // Suspend user via admin API
    const suspendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/suspend/${user.id}`,
    });
    assert.equal(suspendRes.statusCode, 200);

    // Verify token with claims is now blocked
    const token = signJwt(
      {
        userId: user.id,
        deviceId: randomUUID(),
        username: user.username,
        status: 'VERIFIED',
        platform: 'ANDROID',
      },
      env.JWT_SECRET,
      3600
    );

    const callAfterSuspension = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(callAfterSuspension.statusCode, 403);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await app.close();
  }
});

test('E2E-1.5: Canonical Direct Pair Hash is symmetrical and deterministic', () => {
  const u1 = 'a3bb189e-8bf9-3888-9912-ace4e6543002';
  const u2 = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  const hash1 = computeDirectPairHash(u1, u2);
  const hash2 = computeDirectPairHash(u2, u1);

  assert.equal(hash1, hash2, 'Hash must be identical regardless of argument order');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
});
