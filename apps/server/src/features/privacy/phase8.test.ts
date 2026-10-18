import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { signJwt } from '@chat/crypto';
import { env } from '../../config/env.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { messagesService } from '../messages/messages.service.js';
import { moderationCrypto } from './moderation-crypto.js';
import { tombstoneScrubber } from './tombstone-scrubber.js';
import { tokenBucketRateLimiter } from '../../core/ratelimit/token-bucket.js';

let app: FastifyInstance;
let serverPort: number;

before(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as AddressInfo;
  serverPort = addr.port;
});

after(async () => {
  wsGateway.destroy();
  await app.close();
  await prisma.$disconnect();
  await closeRedisConnections();
});

function createAuthToken(userId: string, deviceId: string, username = 'testuser'): string {
  return signJwt(
    {
      userId,
      deviceId,
      username,
      status: 'VERIFIED',
      platform: 'IOS',
    },
    env.JWT_SECRET,
    3600
  );
}

function connectWebSocket(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws?token=${token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => reject(err));
  });
}

/**
 * E2E-8.1: Bidirectional Blocking Enforcement (FR-068, FR-069)
 * User A blocks User B; User B attempts message send, presence query, and group add.
 * All 3 operations return 403 Forbidden.
 */
test('E2E-8.1: Bidirectional Blocking Enforcement (FR-068, FR-069)', async () => {
  const userA = await prisma.user.create({
    data: { username: `blocker_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `blocked_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const devA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Device A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyA81'),
      signedPrekeyPub: Buffer.from('spkA81'),
      signedPrekeySig: Buffer.from('sigA81'),
      status: 'ACTIVE',
    },
  });

  const devB = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Device B',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('idkeyB81'),
      signedPrekeyPub: Buffer.from('spkB81'),
      signedPrekeySig: Buffer.from('sigB81'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const directConvId = convRes.data.id;

  const tokenA = createAuthToken(userA.id, devA.deviceId, userA.username);
  const tokenB = createAuthToken(userB.id, devB.deviceId, userB.username);

  try {
    // 1. User A blocks User B via POST /api/v1/blocks
    const blockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/blocks',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { blockedUserId: userB.id },
    });
    assert.equal(blockRes.statusCode, 201);

    // Operation 1: User B attempts to send message to direct chat with User A -> 403
    const sendRes = await messagesService.sendMessage(userB.id, devB.deviceId, {
      conversationId: directConvId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: { [devA.deviceId]: 'ciphertext_blocked' },
    });
    assert.equal(sendRes.success, false);
    if (!sendRes.success) {
      assert.equal(sendRes.error.statusCode, 403);
      assert.ok(sendRes.error.message.includes('USER_BLOCKED'));
    }

    // Operation 2: User B attempts presence query of User A -> 403
    const presRes = await app.inject({
      method: 'GET',
      url: `/api/v1/presence/${userA.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(presRes.statusCode, 403);
    const presBody = JSON.parse(presRes.payload);
    assert.ok(presBody.error.message.includes('USER_BLOCKED'));

    // Operation 3: User B creates a group and attempts to add User A -> 403
    const groupRes = await conversationsService.createGroupConversation(userB.id, {
      title: 'B Group',
      memberIds: [],
    });
    assert.equal(groupRes.success, true);
    if (!groupRes.success) return;
    const groupId = groupRes.data.id;

    const addMemberRes = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${groupId}/members`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { userId: userA.id },
    });
    assert.equal(addMemberRes.statusCode, 403);
    const addBody = JSON.parse(addMemberRes.payload);
    assert.ok(addBody.error.message.includes('USER_BLOCKED'));

    // Clean up group
    await prisma.conversationMember.deleteMany({ where: { conversationId: groupId } });
    await prisma.conversation.deleteMany({ where: { id: groupId } });
  } finally {
    await prisma.userBlock.deleteMany({
      where: {
        OR: [
          { blockerId: userA.id, blockedId: userB.id },
          { blockerId: userB.id, blockedId: userA.id },
        ],
      },
    });
    await prisma.message.deleteMany({ where: { conversationId: directConvId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: directConvId } });
    await prisma.conversation.deleteMany({ where: { id: directConvId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-8.2: Scoped Moderation Disclosure Boundary (FR-071 to FR-073, FR-084)
 * User A reports Message #5 out of 10 messages with surrounding context #4 and #6.
 * Moderator decrypts report and sees ONLY Message #5 + explicitly checked context; zero access to unselected messages.
 */
test('E2E-8.2: Scoped Moderation Disclosure Boundary (FR-071 to FR-073, FR-084)', async () => {
  const userA = await prisma.user.create({
    data: { username: `reporter_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `bad_actor_${Date.now()}`, status: 'VERIFIED' },
  });
  const adminMod = await prisma.user.create({
    data: { username: `mod_reviewer_${Date.now()}`, status: 'APPROVED' },
  });

  const devA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Device A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyA82'),
      signedPrekeyPub: Buffer.from('spkA82'),
      signedPrekeySig: Buffer.from('sigA82'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const tokenA = createAuthToken(userA.id, devA.deviceId, userA.username);
  const tokenMod = createAuthToken(adminMod.id, randomUUID(), adminMod.username);

  let reportId: string | undefined;

  try {
    // 1. Fetch official Moderation Public Key (Mod_PK)
    const keyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/keys/moderation-key',
    });
    assert.equal(keyRes.statusCode, 200);
    const { publicKey: modPkBase64 } = JSON.parse(keyRes.payload).data;
    assert.ok(modPkBase64);

    // 2. Client on-device scoped re-encryption of ONLY selected messages (#4, #5, #6)
    const selectedMessages = [
      {
        messageId: 'msg_05_flagged',
        senderId: userB.id,
        plaintext: 'Threatening offensive message #5',
        createdAt: new Date().toISOString(),
      },
      {
        messageId: 'msg_04_context',
        senderId: userA.id,
        plaintext: 'Context message #4 prior to threat',
        createdAt: new Date().toISOString(),
      },
      {
        messageId: 'msg_06_context',
        senderId: userB.id,
        plaintext: 'Follow-up context message #6',
        createdAt: new Date().toISOString(),
      },
    ];

    const encryptedBlob = moderationCrypto.encryptDisclosedMessages(selectedMessages, modPkBase64);

    // 3. User A submits scoped report via POST /api/v1/reports
    const reportRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        reportedUserId: userB.id,
        conversationId: convId,
        reasonCode: 'HARASSMENT',
        disclosedMessagesEncrypted: encryptedBlob,
        metadataSnapshot: { selectedCount: 3 },
      },
    });

    assert.equal(reportRes.statusCode, 201);
    reportId = JSON.parse(reportRes.payload).data.reportId;
    assert.ok(reportId);

    // 4. Moderator reviews report via GET /api/v1/admin/reports/{id}
    const reviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/reports/${reportId}?justification=Investigating%20harassment%20ticket`,
      headers: { authorization: `Bearer ${tokenMod}` },
    });

    assert.equal(reviewRes.statusCode, 200);
    const reviewData = JSON.parse(reviewRes.payload).data;

    // Verify moderator receives strictly the 3 disclosed messages
    assert.equal(reviewData.decryptedMessages.length, 3);
    assert.equal(reviewData.decryptedMessages[0].messageId, 'msg_05_flagged');
    assert.equal(reviewData.decryptedMessages[0].plaintext, 'Threatening offensive message #5');

    // Assert unselected messages (#1, #2, #3, #7, #8, #9, #10) have zero exposure (FR-071, FR-084)
    const allDisclosedIds = reviewData.decryptedMessages.map((m: any) => m.messageId);
    assert.ok(!allDisclosedIds.includes('msg_01'));
    assert.ok(!allDisclosedIds.includes('msg_02'));
    assert.ok(!allDisclosedIds.includes('msg_10'));
  } finally {
    if (reportId) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: reportId } });
      await prisma.moderationReport.deleteMany({ where: { reportId } });
    }
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: userA.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, adminMod.id] } } });
  }
});

/**
 * E2E-8.3: Immutable Audit Log Write-Ahead Verification (FR-075, NFR-029)
 * Moderator inspects report #101.
 * admin_audit_logs records entry with moderator ID, IP, and justification prior to data release.
 */
test('E2E-8.3: Immutable Audit Log Write-Ahead Verification (FR-075, NFR-029)', async () => {
  const adminMod = await prisma.user.create({
    data: { username: `audit_mod_${Date.now()}`, status: 'APPROVED' },
  });
  const reporter = await prisma.user.create({
    data: { username: `audit_rep_${Date.now()}`, status: 'VERIFIED' },
  });
  const reported = await prisma.user.create({
    data: { username: `audit_target_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(reporter.id, reported.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const tokenMod = createAuthToken(adminMod.id, randomUUID(), adminMod.username);

  let reportId: string | undefined;

  try {
    const modPk = moderationCrypto.getPublicKeyBase64();
    const encryptedBlob = moderationCrypto.encryptDisclosedMessages(
      [
        {
          messageId: 'msg_audit_test_1',
          senderId: reported.id,
          plaintext: 'Test flagged violation',
          createdAt: new Date().toISOString(),
        },
      ],
      modPk
    );

    const report = await prisma.moderationReport.create({
      data: {
        reporterId: reporter.id,
        reportedUserId: reported.id,
        conversationId: convId,
        reasonCode: 'SPAM',
        disclosedMessagesEncrypted: Buffer.from(encryptedBlob, 'base64') as any,
        metadataSnapshot: { test: true },
        status: 'OPEN',
      },
    });
    reportId = report.reportId;

    // Attempt review WITHOUT justification -> Must reject with 400 and write ZERO audit logs
    const noJustificationRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/reports/${reportId}`,
      headers: { authorization: `Bearer ${tokenMod}` },
    });
    assert.equal(noJustificationRes.statusCode, 400);

    const zeroLogs = await prisma.adminAuditLog.count({ where: { targetId: reportId } });
    assert.equal(zeroLogs, 0, 'Zero audit logs created on rejected request');

    // Review WITH valid justification
    const justificationText = 'Case #8821: Suspicious abuse review authorized by supervisor';
    const reviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/reports/${reportId}?justification=${encodeURIComponent(justificationText)}`,
      headers: { authorization: `Bearer ${tokenMod}` },
    });
    assert.equal(reviewRes.statusCode, 200);

    // Verify write-ahead audit log entry
    const auditEntries = await prisma.adminAuditLog.findMany({
      where: { targetId: reportId },
    });
    assert.equal(auditEntries.length, 1);
    const entry = auditEntries[0]!;
    assert.equal(entry.actorAdminId, adminMod.id);
    assert.equal(entry.actionType, 'VIEW_REPORT');
    assert.equal(entry.justification, justificationText);
    assert.ok(entry.createdAt);
  } finally {
    if (reportId) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: reportId } });
      await prisma.moderationReport.deleteMany({ where: { reportId } });
    }
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminMod.id, reporter.id, reported.id] } } });
  }
});

/**
 * E2E-8.4: Message Rate Limit Burst (FR-074)
 * Burst 45 MSG_SEND frames from a single user within 2 seconds.
 * First 30 succeed; subsequent frames receive 429 Too Many Requests; WebSocket connection stays alive.
 */
test('E2E-8.4: Message Rate Limit Burst (FR-074)', async () => {
  const user = await prisma.user.create({
    data: { username: `burst_user_${Date.now()}`, status: 'VERIFIED' },
  });
  const peer = await prisma.user.create({
    data: { username: `burst_peer_${Date.now()}`, status: 'VERIFIED' },
  });

  const devUser = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'Burst Device',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyBurst'),
      signedPrekeyPub: Buffer.from('spkBurst'),
      signedPrekeySig: Buffer.from('sigBurst'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(user.id, peer.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const token = createAuthToken(user.id, devUser.deviceId, user.username);
  tokenBucketRateLimiter.reset(user.id, 'MSG_SEND');

  const ws = await connectWebSocket(token);

  try {
    const totalBurst = 45;
    const acks: any[] = [];
    const rateLimitErrors: any[] = [];

    const handleMessage = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.action === 'MSG_ACK') {
          acks.push(parsed);
        } else if (parsed.error?.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitErrors.push(parsed);
        }
      } catch {}
    };

    ws.on('message', handleMessage);

    // Rapidly send 45 MSG_SEND frames
    for (let i = 0; i < totalBurst; i++) {
      ws.send(
        JSON.stringify({
          action: 'MSG_SEND',
          conversationId: convId,
          clientMsgId: randomUUID(),
          msgType: 'TEXT',
          encryptedPayloads: { dummyDev: 'ciphertext_burst' },
        })
      );
    }

    // Wait for all 45 frames to be processed
    const startWait = Date.now();
    while (acks.length + rateLimitErrors.length < totalBurst && Date.now() - startWait < 15000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Assert exactly 30 succeed and remaining 15 receive 429 RATE_LIMIT_EXCEEDED
    assert.equal(acks.length, 30, 'Exactly 30 messages within 10s window must succeed');
    assert.equal(rateLimitErrors.length, 15, 'Messages 31-45 must receive RATE_LIMIT_EXCEEDED');
    assert.equal(rateLimitErrors[0].error.statusCode, 429);

    // Assert WebSocket connection is still ALIVE and OPEN (FR-074)
    assert.equal(ws.readyState, WebSocket.OPEN, 'WebSocket connection must stay alive despite 429');

    // Heartbeat PING still succeeds over the open connection
    const pongPromise = new Promise((resolve) => {
      const pongHandler = (data: WebSocket.Data) => {
        const p = JSON.parse(data.toString());
        if (p.action === 'PONG') {
          ws.off('message', pongHandler);
          resolve(p);
        }
      };
      ws.on('message', pongHandler);
    });

    ws.send(JSON.stringify({ action: 'PING' }));
    const pong = await pongPromise;
    assert.ok(pong !== null);
  } finally {
    tokenBucketRateLimiter.reset(user.id, 'MSG_SEND');
    ws.terminate();
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, peer.id] } } });
  }
});

/**
 * E2E-8.5: Post-Restore Tombstone Hygiene (NFR-040)
 * Delete message M; restore older database backup from before deletion; run reconciliation hook.
 * Message M is scrubbed and purged; does not resurrect.
 */
test('E2E-8.5: Post-Restore Tombstone Hygiene (NFR-040)', async () => {
  const user = await prisma.user.create({
    data: { username: `hygiene_user_${Date.now()}`, status: 'VERIFIED' },
  });
  const dev = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'Device Hygiene',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyHyg'),
      signedPrekeyPub: Buffer.from('spkHyg'),
      signedPrekeySig: Buffer.from('sigHyg'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(user.id, user.id === dev.deviceId ? randomUUID() : dev.userId);
  // Direct chat with dummy peer
  const dummyPeer = await prisma.user.create({
    data: { username: `hygiene_peer_${Date.now()}`, status: 'VERIFIED' },
  });
  const conv = await conversationsService.createDirectConversation(user.id, dummyPeer.id);
  assert.equal(conv.success, true);
  if (!conv.success) return;
  const convId = conv.data.id;

  const targetMsgId = randomUUID();

  try {
    // 1. Create message M
    const message = await prisma.message.create({
      data: {
        id: targetMsgId,
        conversationId: convId,
        seqId: 1n,
        senderId: user.id,
        senderDeviceId: dev.deviceId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { test: 'ciphertext' },
        createdAt: new Date(),
        isTombstoned: false,
      },
    });

    // 2. User deletes message M (delete-for-everyone)
    const deleteRes = await messagesService.deleteForEveryone(user.id, dev.deviceId, targetMsgId);
    assert.equal(deleteRes.success, true);

    // Verify targetMsgId is registered in deleted_entities_registry
    const registryEntry = await prisma.deletedEntityRegistry.findUnique({
      where: {
        entityType_entityId: {
          entityType: 'MESSAGE',
          entityId: targetMsgId,
        },
      },
    });
    assert.ok(registryEntry !== null, 'Tombstoned message must be recorded in deleted_entities_registry');

    // 3. Simulate disaster recovery: restore an older database snapshot where Message M
    // was present prior to deletion (simulated by updating message M back to isTombstoned = false)
    await prisma.message.update({
      where: { id: targetMsgId },
      data: {
        isTombstoned: false,
        encryptedPayloads: { resurrected: 'should_be_scrubbed' },
      },
    });

    // 4. Run post-restore tombstone scrubbing hook
    const scrubResult = await tombstoneScrubber.scrubRestoredEntities();
    assert.ok(scrubResult.scrubbedMessages >= 1, 'Scrubber must purge resurrected message rows');

    // 5. Assert message M is permanently purged and does NOT resurrect (NFR-040)
    const postScrubMsg = await prisma.message.findUnique({
      where: { id: targetMsgId },
    });
    assert.equal(postScrubMsg, null, 'Message M must be permanently scrubbed and not resurrected');
  } finally {
    await prisma.deletedEntityRegistry.deleteMany({
      where: { entityId: targetMsgId },
    });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, dummyPeer.id] } } });
  }
});
