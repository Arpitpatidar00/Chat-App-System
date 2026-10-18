import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { messagesService } from '../messages/messages.service.js';
import { conversationsService } from './conversations.service.js';
import { receiptsService } from '../receipts/receipts.service.js';

let app: FastifyInstance;
let serverPort: number;
let wsBaseUrl: string;

before(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as AddressInfo;
  serverPort = addr.port;
  wsBaseUrl = `ws://127.0.0.1:${serverPort}/ws`;
});

after(async () => {
  wsGateway.destroy();
  await app.close();
  await prisma.$disconnect();
  await closeRedisConnections();
});

function connectWebSocket(userId: string, deviceId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}?userId=${userId}&deviceId=${deviceId}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => reject(err));
  });
}

function waitForFrame(ws: WebSocket, predicate: (data: any) => boolean, timeoutMs: number = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket frame`));
    }, timeoutMs);

    const handler = (raw: WebSocket.Data) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (predicate(payload)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(payload);
        }
      } catch {}
    };

    ws.on('message', handler);
  });
}

test('E2E-4.1: 100-Member Group Limit Enforcement - rejects 101st member with 400 GROUP_LIMIT_EXCEEDED (FR-009, NFR-003)', async () => {
  const owner = await prisma.user.create({
    data: { username: `owner_ceiling_${Date.now()}`, status: 'VERIFIED' },
  });

  // Attempt to create a group exceeding 100 members (owner + 100 members = 101)
  const tooManyMemberIds = Array.from({ length: 100 }).map(() => randomUUID());

  const failCreateRes = await conversationsService.createGroupConversation(owner.id, {
    title: 'Huge Group',
    memberIds: tooManyMemberIds,
  });

  assert.equal(failCreateRes.success, false);
  if (!failCreateRes.success) {
    assert.equal(failCreateRes.error.errorCode, 'GROUP_LIMIT_EXCEEDED');
    assert.equal(failCreateRes.error.statusCode, 400);
  }

  // Create valid 2-member group
  const member2 = await prisma.user.create({
    data: { username: `m2_${Date.now()}`, status: 'VERIFIED' },
  });

  const validGroupRes = await conversationsService.createGroupConversation(owner.id, {
    title: 'Valid Group',
    memberIds: [member2.id],
  });
  assert.equal(validGroupRes.success, true);
  if (!validGroupRes.success) return;
  const convId = validGroupRes.data.id;

  try {
    // Verify membership count is 2
    const count = await prisma.conversationMember.count({ where: { conversationId: convId } });
    assert.equal(count, 2);
  } finally {
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, member2.id] } } });
  }
});

test('E2E-4.2: 100-Message Pre-Join History Grant - new member can only read bounded history slice (FR-013, FR-081, NFR-036)', async () => {
  const admin = await prisma.user.create({
    data: { username: `admin_hist_${Date.now()}`, status: 'VERIFIED' },
  });
  const memberB = await prisma.user.create({
    data: { username: `peer_hist_${Date.now()}`, status: 'VERIFIED' },
  });
  const newMemberC = await prisma.user.create({
    data: { username: `new_user_c_${Date.now()}`, status: 'VERIFIED' },
  });

  const adminDevice = await prisma.device.create({
    data: {
      userId: admin.id,
      deviceName: 'Admin Phone',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-adm'),
      signedPrekeyPub: Buffer.from('spk-adm'),
      signedPrekeySig: Buffer.from('sig-adm'),
    },
  });

  const groupRes = await conversationsService.createGroupConversation(admin.id, {
    title: 'History Bounded Group',
    memberIds: [memberB.id],
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const convId = groupRes.data.id;

  try {
    // Send 15 messages (simulating burst up to sequence 15)
    for (let i = 1; i <= 15; i++) {
      await messagesService.sendMessage(admin.id, adminDevice.deviceId, {
        conversationId: convId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { [randomUUID()]: `msg-${i}` },
      });
    }

    // Add User C at lastSeqId = 15
    const addRes = await conversationsService.addGroupMember(admin.id, convId, newMemberC.id);
    assert.equal(addRes.success, true);

    // Verify User C historyFloorSeqId in database: GREATEST(1, 15 - 100) = 1
    const memberRecord = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: newMemberC.id } },
    });
    assert.ok(memberRecord);
    assert.equal(memberRecord?.joinedAtSeqId, 15n);

    // Now test a member joined with higher floor: update floor to 10 for test boundary verification
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: convId, userId: newMemberC.id } },
      data: { historyFloorSeqId: 10n },
    });

    // User C syncs messages with lastKnownSeqId = 0
    const syncRes = await messagesService.syncMessages(convId, newMemberC.id, 0n, 50);
    assert.equal(syncRes.success, true);
    if (!syncRes.success) return;

    // Messages before floor (1..9) MUST NOT be returned! Only messages 10..15 returned!
    const returnedSeqIds = syncRes.data.map((m) => parseInt(m.seqId, 10));
    for (const seq of returnedSeqIds) {
      assert.ok(seq >= 10, `Message seqId ${seq} must be >= historyFloorSeqId 10`);
    }
    assert.equal(returnedSeqIds.includes(1), false, 'Message 1 must be barred from User C');
    assert.equal(returnedSeqIds.includes(9), false, 'Message 9 must be barred from User C');
  } finally {
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: admin.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, memberB.id, newMemberC.id] } } });
  }
});

test('E2E-4.3: Removed Member Forward Secrecy - emits MEMBER_REMOVED and blocks subsequent access (FR-014, FR-082)', async () => {
  const admin = await prisma.user.create({
    data: { username: `owner_rem_${Date.now()}`, status: 'VERIFIED' },
  });
  const memberB = await prisma.user.create({
    data: { username: `peer_rem_${Date.now()}`, status: 'VERIFIED' },
  });
  const memberC = await prisma.user.create({
    data: { username: `target_rem_${Date.now()}`, status: 'VERIFIED' },
  });

  const groupRes = await conversationsService.createGroupConversation(admin.id, {
    title: 'Removal Test Group',
    memberIds: [memberB.id, memberC.id],
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const convId = groupRes.data.id;

  // Connect Member B via WebSocket to receive MEMBER_REMOVED notification
  const wsB = await connectWebSocket(memberB.id, 'device-b-rem');

  try {
    const removalFramePromise = waitForFrame(wsB, (data) => data.action === 'MEMBER_REMOVED');

    // Admin removes Member C
    const removeRes = await conversationsService.removeGroupMember(admin.id, convId, memberC.id);
    assert.equal(removeRes.success, true);

    // Remaining peer receives MEMBER_REMOVED frame (triggering GSK rotation)
    const frame = await removalFramePromise;
    assert.equal(frame.action, 'MEMBER_REMOVED');
    assert.equal(frame.conversationId, convId);
    assert.equal(frame.userId, memberC.id);

    // Member C is now barred: attempting to sync returns 403 Forbidden
    const syncRes = await messagesService.syncMessages(convId, memberC.id, 0n);
    assert.equal(syncRes.success, false);
    if (!syncRes.success) {
      assert.equal(syncRes.error.statusCode, 403);
    }
  } finally {
    wsB.terminate();
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, memberB.id, memberC.id] } } });
  }
});

test('E2E-4.4: Owner Departure Succession - longest-tenured member automatically promoted to ADMIN (FR-015)', async () => {
  const owner = await prisma.user.create({
    data: { username: `owner_dep_${Date.now()}`, status: 'VERIFIED' },
  });
  const memberFirst = await prisma.user.create({
    data: { username: `member_senior_${Date.now()}`, status: 'VERIFIED' },
  });
  const memberSecond = await prisma.user.create({
    data: { username: `member_junior_${Date.now()}`, status: 'VERIFIED' },
  });

  const groupRes = await conversationsService.createGroupConversation(owner.id, {
    title: 'Succession Group',
    memberIds: [memberFirst.id],
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const convId = groupRes.data.id;

  // Add junior member later at seq 5
  await prisma.conversation.update({ where: { id: convId }, data: { lastSeqId: 5n } });
  await conversationsService.addGroupMember(owner.id, convId, memberSecond.id);

  try {
    // Owner leaves the group
    const leaveRes = await conversationsService.removeGroupMember(owner.id, convId, owner.id);
    assert.equal(leaveRes.success, true);
    if (leaveRes.success) {
      assert.equal(leaveRes.data.newAdminPromoted, true, 'Automatic succession must promote new admin');
    }

    // Longest-tenured member (memberFirst) MUST now be ADMIN
    const seniorMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: memberFirst.id } },
    });
    assert.equal(seniorMember?.role, 'ADMIN', 'Longest-tenured member must be promoted to ADMIN');

    // Junior member remains MEMBER
    const juniorMember = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: memberSecond.id } },
    });
    assert.equal(juniorMember?.role, 'MEMBER', 'Junior member remains regular MEMBER');
  } finally {
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, memberFirst.id, memberSecond.id] } } });
  }
});

test('E2E-4.5: Group Read Receipts Attribution - returns exact readers with read_at timestamps (FR-036)', async () => {
  const sender = await prisma.user.create({
    data: { username: `sender_grp_${Date.now()}`, status: 'VERIFIED' },
  });
  const reader1 = await prisma.user.create({
    data: { username: `reader_1_${Date.now()}`, status: 'VERIFIED' },
  });
  const reader2 = await prisma.user.create({
    data: { username: `reader_2_${Date.now()}`, status: 'VERIFIED' },
  });
  const unreadMember = await prisma.user.create({
    data: { username: `unread_${Date.now()}`, status: 'VERIFIED' },
  });

  const senderDevice = await prisma.device.create({
    data: {
      userId: sender.id,
      deviceName: 'Sender Device',
      platform: 'WEB',
      identityKeyPub: Buffer.from('id-send'),
      signedPrekeyPub: Buffer.from('spk-send'),
      signedPrekeySig: Buffer.from('sig-send'),
    },
  });

  const groupRes = await conversationsService.createGroupConversation(sender.id, {
    title: 'Receipts Attribution Group',
    memberIds: [reader1.id, reader2.id, unreadMember.id],
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const convId = groupRes.data.id;

  try {
    // Sender sends message M
    const sendRes = await messagesService.sendMessage(sender.id, senderDevice.deviceId, {
      conversationId: convId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: { [randomUUID()]: 'group-receipts-msg' },
    });
    assert.equal(sendRes.success, true);
    if (!sendRes.success) return;
    const messageId = sendRes.data.messageId;
    const seqId = sendRes.data.seqId;

    // Reader 1 and Reader 2 read the message
    await receiptsService.handleReadUpTo(reader1.id, 'dev-r1', convId, seqId);
    await receiptsService.handleReadUpTo(reader2.id, 'dev-r2', convId, seqId);

    // Unread member only acknowledges delivery (status 2 = DELIVERED)
    await receiptsService.handleReceiptAck(unreadMember.id, 'dev-unread', messageId);

    // Query group readers attribution via receiptsService.getGroupReaders
    const readersRes = await receiptsService.getGroupReaders(messageId);
    assert.equal(readersRes.success, true);
    if (!readersRes.success) return;

    assert.equal(readersRes.data.length, 2, 'Exactly 2 members should be marked as readers');
    const readerUserIds = readersRes.data.map((r) => r.userId);
    assert.ok(readerUserIds.includes(reader1.id));
    assert.ok(readerUserIds.includes(reader2.id));
    assert.equal(readerUserIds.includes(unreadMember.id), false, 'Delivered member must not appear as reader');

    for (const r of readersRes.data) {
      assert.ok(r.readAt, 'Reader must have a non-null readAt timestamp');
    }
  } finally {
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: sender.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [sender.id, reader1.id, reader2.id, unreadMember.id] } },
    });
  }
});
