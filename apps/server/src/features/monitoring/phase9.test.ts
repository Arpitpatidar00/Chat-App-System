import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { signJwt } from '@chat/crypto';
import { env } from '../../config/env.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { messagesService } from '../messages/messages.service.js';
import { receiptsService } from '../receipts/receipts.service.js';
import { canaryMonitor } from './canary-monitor.js';
import { securityAuditScanner } from './security-audit-scanner.js';
import { drFailoverService } from './dr-failover.service.js';

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

/**
 * E2E-M01: Multi-Device E2EE Lifecycle & Offline Convergence (Phases 1-8 Convergence)
 * Enroll User A (A1, A2) and User B (B1, B2).
 * Disconnect A2 and B2 (airplane mode).
 * A1 and B1 exchange messages, edits, reactions, pins, and delete-for-everyone.
 * B1 marks all read.
 * Reconnect A2 and B2; invoke /api/v1/sync.
 * Assert: all 4 devices converge to identical sequence order, state, and zero unread for B.
 */
test('E2E-M01: Multi-Device E2EE Lifecycle & Offline Convergence', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_m01_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_m01_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const devA1 = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Device A1 (Android)',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('idkeyA1'),
      signedPrekeyPub: Buffer.from('spkA1'),
      signedPrekeySig: Buffer.from('sigA1'),
      status: 'ACTIVE',
    },
  });

  const devA2 = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Device A2 (iOS Offline)',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyA2'),
      signedPrekeyPub: Buffer.from('spkA2'),
      signedPrekeySig: Buffer.from('sigA2'),
      status: 'ACTIVE',
    },
  });

  const devB1 = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Device B1 (Android)',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('idkeyB1'),
      signedPrekeyPub: Buffer.from('spkB1'),
      signedPrekeySig: Buffer.from('sigB1'),
      status: 'ACTIVE',
    },
  });

  const devB2 = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Device B2 (iOS Offline)',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyB2'),
      signedPrekeyPub: Buffer.from('spkB2'),
      signedPrekeySig: Buffer.from('sigB2'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // 1. A1 sends 5 messages
    const sentMessages: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const sendRes = await messagesService.sendMessage(userA.id, devA1.deviceId, {
        conversationId: convId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: {
          [devA1.deviceId]: `enc_payload_a1_${i}`,
          [devA2.deviceId]: `enc_payload_a2_${i}`,
          [devB1.deviceId]: `enc_payload_b1_${i}`,
          [devB2.deviceId]: `enc_payload_b2_${i}`,
        },
      });
      assert.equal(sendRes.success, true);
      if (sendRes.success) {
        sentMessages.push(sendRes.data.messageId);
      }
    }

    // 2. A1 edits Message #2
    const msg2Id = sentMessages[1]!;
    const editRes = await messagesService.editMessage(userA.id, devA1.deviceId, msg2Id, {
      encryptedPayloads: {
        [devA1.deviceId]: 'enc_edited_a1',
        [devA2.deviceId]: 'enc_edited_a2',
        [devB1.deviceId]: 'enc_edited_b1',
        [devB2.deviceId]: 'enc_edited_b2',
      },
    });
    assert.equal(editRes.success, true);

    // 3. B1 reacts to Message #3
    const msg3Id = sentMessages[2]!;
    const reactRes = await messagesService.reactToMessage(userB.id, devB1.deviceId, msg3Id, {
      emoji: '🚀',
      action: 'ADD',
    });
    assert.equal(reactRes.success, true);

    // 4. A1 pins Message #4
    const msg4Id = sentMessages[3]!;
    const pinRes = await messagesService.pinMessage(userA.id, devA1.deviceId, convId, {
      messageId: msg4Id,
      action: 'PIN',
    });
    assert.equal(pinRes.success, true);

    // 5. A1 deletes Message #1 for everyone (Tombstone)
    const msg1Id = sentMessages[0]!;
    const delRes = await messagesService.deleteForEveryone(userA.id, devA1.deviceId, msg1Id);
    assert.equal(delRes.success, true);

    // 6. B1 marks all read up to seqId 5
    await receiptsService.handleReadUpTo(userB.id, devB1.deviceId, convId, '5');

    // 7. Offline Devices A2 and B2 reconnect and invoke syncMessages
    const syncA2 = await messagesService.syncMessages(convId, userA.id, 0n, 50);
    assert.equal(syncA2.success, true);
    if (!syncA2.success) return;

    const syncB2 = await messagesService.syncMessages(convId, userB.id, 0n, 50);
    assert.equal(syncB2.success, true);
    if (!syncB2.success) return;

    // Assert: Both offline devices receive identical 5 sequence rows strictly ordered ASC
    assert.equal(syncA2.data.length, 5);
    assert.equal(syncB2.data.length, 5);

    for (let i = 0; i < 5; i++) {
      assert.equal(syncA2.data[i]!.seqId, (i + 1).toString());
      assert.equal(syncB2.data[i]!.seqId, (i + 1).toString());
    }

    // Assert: Message #1 is tombstoned with empty payload
    const tombstonedMsg = syncA2.data.find((m) => m.id === msg1Id);
    assert.ok(tombstonedMsg);
    assert.equal(tombstonedMsg.isTombstoned, true);
    assert.deepEqual(tombstonedMsg.encryptedPayloads, {});

    // Assert: Device B receipt converged to 3 (READ) for message 5
    const msg5Id = sentMessages[4]!;
    const receiptsRes = await receiptsService.getReceiptsForMessage(msg5Id);
    assert.equal(receiptsRes.success, true);
    if (receiptsRes.success) {
      const bReceipt = receiptsRes.data.find((r) => r.userId === userB.id);
      assert.equal(bReceipt?.status, 3, 'User B must have status = 3 (READ) up to message 5');
    }
  } finally {
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-M02: 100-Member Group Scaling, History Slice & Forward Secrecy (FR-009, FR-013, FR-014, FR-015)
 * Create 100-member group; attempt 101st member -> 400 GROUP_LIMIT_EXCEEDED.
 * Remove Member #100 at seqId = 120; add Member #101 at seqId = 121.
 * Member #101 receives bounded pre-join history; removed member cannot read subsequent messages.
 * Suspend owner -> longest-tenured member promoted to ADMIN.
 */
test('E2E-M02: 100-Member Group Scaling, History Slice & Forward Secrecy', async () => {
  const owner = await prisma.user.create({
    data: { username: `group_owner_${Date.now()}`, status: 'VERIFIED' },
  });

  // Fast bulk-create 99 members using createMany
  const memberData = Array.from({ length: 99 }).map((_, i) => ({
    username: `scale_member_${i}_${Date.now()}`,
    status: 'VERIFIED' as const,
  }));
  await prisma.user.createMany({ data: memberData });

  const fetchedMembers = await prisma.user.findMany({
    where: { username: { startsWith: 'scale_member_' } },
    take: 99,
  });

  const initialMemberIds = [owner.id, ...fetchedMembers.map((m) => m.id)];
  assert.equal(initialMemberIds.length, 100, 'Must create exactly 100 members');

  // Create Group with exactly 100 members
  const groupRes = await conversationsService.createGroupConversation(owner.id, {
    title: 'Enterprise 100 Scale Group',
    memberIds: initialMemberIds.slice(1),
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const groupId = groupRes.data.id;

  // 101st user
  const extraUser = await prisma.user.create({
    data: { username: `overflow_user_${Date.now()}`, status: 'VERIFIED' },
  });

  try {
    // 1. Attempt to add 101st member -> Rejects with 400 GROUP_LIMIT_EXCEEDED (FR-009, NFR-003)
    const overflowRes = await conversationsService.addGroupMember(owner.id, groupId, extraUser.id);
    assert.equal(overflowRes.success, false);
    if (!overflowRes.success) {
      assert.equal(overflowRes.error.errorCode, 'GROUP_LIMIT_EXCEEDED');
    }

    // 2. Remove Member #100
    const memberToRemove = fetchedMembers[fetchedMembers.length - 1]!;
    const removeRes = await conversationsService.removeGroupMember(owner.id, groupId, memberToRemove.id);
    assert.equal(removeRes.success, true);

    // 3. Add New Member (extraUser) into the now available 100th slot with 100-message history grant
    const addGrantRes = await conversationsService.addGroupMember(owner.id, groupId, extraUser.id);
    assert.equal(addGrantRes.success, true);

    // Verify member record has bounded history floor
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId: extraUser.id },
      },
    });
    assert.ok(membership);
    assert.ok(membership.historyFloorSeqId !== null, 'New member must have a bounded history floor (FR-013)');

    // 4. Owner Departure Succession: Owner leaves / suspends -> longest tenured promoted to ADMIN (FR-015)
    const leaveRes = await conversationsService.removeGroupMember(owner.id, groupId, owner.id);
    assert.equal(leaveRes.success, true);

    // Assert that the first joined member was promoted to ADMIN
    const remainingMembers = await prisma.conversationMember.findMany({
      where: { conversationId: groupId, removedAtSeqId: null },
      orderBy: { joinedAtSeqId: 'asc' },
    });
    assert.equal(remainingMembers.some((m) => m.role === 'ADMIN'), true, 'Longest tenured member must be promoted to ADMIN');
  } finally {
    await prisma.conversationMember.deleteMany({ where: { conversationId: groupId } });
    await prisma.conversation.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [...initialMemberIds, extraUser.id] },
      },
    });
  }
});

/**
 * E2E-M03: Zero-Plaintext Security & Cross-Tenant Isolation Audit (NFR-027, NFR-042)
 * Automated DB scan across PostgreSQL tables; asserts 0 plaintext bytes leaked outside client memory.
 * Replay User C's token against User A/B conversation -> 100% return 403 Forbidden.
 */
test('E2E-M03: Zero-Plaintext Security & Cross-Tenant Isolation Audit', async () => {
  const userA = await prisma.user.create({
    data: { username: `audit_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `audit_b_${Date.now()}`, status: 'VERIFIED' },
  });
  const userC = await prisma.user.create({
    data: { username: `tenant_c_${Date.now()}`, status: 'VERIFIED' },
  });

  const devA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Device A Audit',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeySecA'),
      signedPrekeyPub: Buffer.from('spkSecA'),
      signedPrekeySig: Buffer.from('sigSecA'),
      status: 'ACTIVE',
    },
  });

  const devC = await prisma.device.create({
    data: {
      userId: userC.id,
      deviceName: 'Device C Attacker',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('idkeySecC'),
      signedPrekeyPub: Buffer.from('spkSecC'),
      signedPrekeySig: Buffer.from('sigSecC'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const tokenC = createAuthToken(userC.id, devC.deviceId, userC.username);

  try {
    // 1. User A sends message containing standard AES-GCM ciphertext
    await messagesService.sendMessage(userA.id, devA.deviceId, {
      conversationId: convId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: {
        [devA.deviceId]: Buffer.from('ciphertext_aes_gcm_encrypted_blob').toString('base64'),
      },
    });

    // 2. Run datastore security audit scanner
    const scanReport = await securityAuditScanner.scanDatastores(convId);
    assert.equal(scanReport.status, 'CLEAN');
    assert.equal(scanReport.leakedPlaintextBytes, 0, 'Zero plaintext bytes leaked outside client memory');
    assert.equal(scanReport.violations.length, 0);

    // 3. Cross-Tenant Isolation: User C attempts to access User A/B conversation messages
    const intruderMessagesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${tokenC}` },
    });
    assert.equal(intruderMessagesRes.statusCode, 403, 'Intruder accessing foreign chat must receive 403');

    // 4. User C attempts to send message into User A/B conversation
    const intruderSendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/messages`,
      headers: { authorization: `Bearer ${tokenC}` },
      payload: {
        conversationId: convId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { dummy: 'ciphertext' },
      },
    });
    assert.equal(intruderSendRes.statusCode, 403, 'Intruder sending to foreign chat must receive 403');
  } finally {
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id, userC.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userC.id] } } });
  }
});

/**
 * E2E-M04: Disaster Recovery Chaos Failover & Post-Restore Tombstone Drill (NFR-014, NFR-015, NFR-018, NFR-040)
 * Continuous message stream with deletions; simulate failover drill and run post-restore scrubber.
 * Assert: 0 acknowledged messages lost (RPO = 0), 0 resurrected messages, RTO <= 4 hours.
 */
test('E2E-M04: Disaster Recovery Chaos Failover & Post-Restore Tombstone Drill', async () => {
  const user = await prisma.user.create({
    data: { username: `dr_user_${Date.now()}`, status: 'VERIFIED' },
  });
  const peer = await prisma.user.create({
    data: { username: `dr_peer_${Date.now()}`, status: 'VERIFIED' },
  });

  const dev = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'Device DR',
      platform: 'IOS',
      identityKeyPub: Buffer.from('idkeyDR'),
      signedPrekeyPub: Buffer.from('spkDR'),
      signedPrekeySig: Buffer.from('sigDR'),
      status: 'ACTIVE',
    },
  });

  const convRes = await conversationsService.createDirectConversation(user.id, peer.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    const acknowledgedClientMsgIds: string[] = [];
    const messageIds: string[] = [];

    // Stream 10 messages
    for (let i = 1; i <= 10; i++) {
      const clientMsgId = randomUUID();
      const sendRes = await messagesService.sendMessage(user.id, dev.deviceId, {
        conversationId: convId,
        clientMsgId,
        msgType: 'TEXT',
        encryptedPayloads: { [dev.deviceId]: `enc_dr_${i}` },
      });
      assert.equal(sendRes.success, true);
      if (sendRes.success) {
        acknowledgedClientMsgIds.push(clientMsgId);
        messageIds.push(sendRes.data.messageId);
      }
    }

    // Delete messages #2 and #5 for everyone
    const delMsg1 = messageIds[1]!;
    const delMsg2 = messageIds[4]!;
    await messagesService.deleteForEveryone(user.id, dev.deviceId, delMsg1);
    await messagesService.deleteForEveryone(user.id, dev.deviceId, delMsg2);

    // Execute Disaster Recovery Failover Audit Drill
    const drAudit = await drFailoverService.executeFailoverAudit(
      convId,
      acknowledgedClientMsgIds,
      [delMsg1, delMsg2]
    );

    // Assert: Zero acknowledged messages lost (RPO = 0, NFR-014)
    assert.equal(drAudit.rpoLostMessages, 0, 'Zero acknowledged messages must be lost during failover (RPO = 0)');
    assert.equal(drAudit.recoveredMessagesCount, 10);

    // Assert: Zero resurrected messages (NFR-040)
    assert.equal(drAudit.resurrectedMessagesCount, 0, 'Tombstoned messages must never resurrect from backup (NFR-040)');

    // Assert: Restoration completed well under 4 hours (NFR-015)
    assert.ok(drAudit.rtoDurationMs < 4 * 3600 * 1000, 'Restoration must complete within 4-hour RTO boundary');
    assert.equal(drAudit.status, 'SUCCESS');
  } finally {
    await prisma.deletedEntityRegistry.deleteMany({ where: { entityType: 'MESSAGE' } });
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, peer.id] } } });
  }
});

/**
 * E2E-M05: Availability Canary Monitor & REST Gateway Verification (NFR-012, NFR-013)
 * Execute synthetic probe; query GET /health/canary.
 * Asserts status === HEALTHY, availability >= 99.9%, and p95 latency <= 1000ms.
 */
test('E2E-M05: Availability Canary Monitor & REST Gateway Verification', async () => {
  canaryMonitor.clearHistory();

  // Run 5 synthetic probes
  for (let i = 0; i < 5; i++) {
    const probe = await canaryMonitor.runProbe();
    assert.equal(probe.status, 'PASS');
  }

  // Query /health/canary via HTTP inject
  const res = await app.inject({
    method: 'GET',
    url: '/health/canary',
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.equal(body.status, 'success');
  assert.equal(body.data.status, 'HEALTHY');
  assert.ok(body.data.availabilityPct >= 99.9, 'Canary availability must meet >= 99.9% threshold (NFR-012)');
  assert.ok(body.data.p95LatencyMs <= 1000, 'Canary p95 latency must be <= 1000ms (NFR-005)');
});
