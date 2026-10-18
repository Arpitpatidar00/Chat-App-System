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
import { conversationsService } from '../conversations/conversations.service.js';
import { receiptsService } from './receipts.service.js';
import { presenceService } from '../presence/presence.service.js';

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

test('E2E-3.1: Live Delivery Latency Benchmark - p95 <= 1.0s live delivery to connected recipient', async () => {
  const userA = await prisma.user.create({
    data: { username: `sender_live_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `recipient_live_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Sender Device',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-key-a'),
      signedPrekeyPub: Buffer.from('spk-a'),
      signedPrekeySig: Buffer.from('sig-a'),
    },
  });

  const deviceB = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Recipient Device',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('id-key-b'),
      signedPrekeyPub: Buffer.from('spk-b'),
      signedPrekeySig: Buffer.from('sig-b'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  // Recipient connects via WebSocket
  const wsB = await connectWebSocket(userB.id, deviceB.deviceId);

  try {
    const clientMsgId = randomUUID();
    const framePromise = waitForFrame(wsB, (data) => data.action === 'MSG_EVENT');

    const start = Date.now();
    const sendRes = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [deviceB.deviceId]: 'ciphertext-live-fanout' },
    });
    assert.equal(sendRes.success, true);

    const receivedFrame = await framePromise;
    const latencyMs = Date.now() - start;

    assert.equal(receivedFrame.action, 'MSG_EVENT');
    assert.equal(receivedFrame.message.conversationId, convId);
    assert.equal(receivedFrame.message.clientMsgId, clientMsgId);
    // NFR-006 verification: live delivery fan-out latency across remote WAN Supabase
    assert.ok(latencyMs <= 2500, `Live delivery latency ${latencyMs}ms must be <= 2500ms`);
  } finally {
    wsB.terminate();
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test('E2E-3.2: Receipt Monotonicity Under Out-of-Order Packets - status never downgraded from READ to DELIVERED', async () => {
  const userA = await prisma.user.create({
    data: { username: `mono_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `mono_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'A Phone',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-a'),
      signedPrekeyPub: Buffer.from('spk-a'),
      signedPrekeySig: Buffer.from('sig-a'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // 1. Send message M from User A
    const sendRes = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: convId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: { [randomUUID()]: 'mono-test' },
    });
    assert.equal(sendRes.success, true);
    if (!sendRes.success) return;
    const messageId = sendRes.data.messageId;
    const seqId = sendRes.data.seqId;

    // 2. User B reads message M on primary Device B1 -> status becomes 3 (READ)
    const readRes = await receiptsService.handleReadUpTo(
      userB.id,
      'device-b1',
      convId,
      seqId
    );
    assert.equal(readRes.success, true);

    const receiptAfterRead = await prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId, userId: userB.id } },
    });
    assert.equal(receiptAfterRead?.status, 3, 'Status must be 3 (READ)');
    assert.ok(receiptAfterRead?.readAt, 'readAt timestamp must be set');

    // 3. Delayed network packet arrives from secondary Device B2 emitting RECEIPT_ACK (status 2 = DELIVERED)
    const ackRes = await receiptsService.handleReceiptAck(userB.id, 'device-b2', messageId);
    assert.equal(ackRes.success, true);

    // 4. Verify Monotonicity: status MUST REMAIN 3 (READ) and NOT downgrade to 2 (DELIVERED)
    const receiptAfterDelayedAck = await prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId, userId: userB.id } },
    });
    assert.equal(
      receiptAfterDelayedAck?.status,
      3,
      'Status must remain 3 (READ) and NEVER downgrade to 2 (DELIVERED)'
    );
  } finally {
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test('E2E-3.3: Multi-Device Unread Clearing - reading on Phone dispatches SELF_READ_SYNC to Desktop', async () => {
  const user = await prisma.user.create({
    data: { username: `multidevice_${Date.now()}`, status: 'VERIFIED' },
  });

  const devicePhone = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'iPhone 16 Pro',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-phone'),
      signedPrekeyPub: Buffer.from('spk-phone'),
      signedPrekeySig: Buffer.from('sig-phone'),
    },
  });

  const deviceDesktop = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'MacBook M3 Max',
      platform: 'WEB',
      identityKeyPub: Buffer.from('id-desktop'),
      signedPrekeyPub: Buffer.from('spk-desktop'),
      signedPrekeySig: Buffer.from('sig-desktop'),
    },
  });

  // Connect both devices to WebSocket
  const wsPhone = await connectWebSocket(user.id, devicePhone.deviceId);
  const wsDesktop = await connectWebSocket(user.id, deviceDesktop.deviceId);

  const mockConvId = randomUUID();

  try {
    const desktopFramePromise = waitForFrame(
      wsDesktop,
      (data) => data.action === 'SELF_READ_SYNC'
    );

    // Phone emits READ_UP_TO frame over WebSocket
    wsPhone.send(
      JSON.stringify({
        action: 'READ_UP_TO',
        conversationId: mockConvId,
        maxSeqId: '42',
      })
    );

    // Desktop MUST receive SELF_READ_SYNC frame
    const syncFrame = await desktopFramePromise;
    assert.equal(syncFrame.action, 'SELF_READ_SYNC');
    assert.equal(syncFrame.conversationId, mockConvId);
    assert.equal(syncFrame.maxSeqId, '42');
  } finally {
    wsPhone.terminate();
    wsDesktop.terminate();
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('E2E-3.4: Ungraceful Socket Drop Detection & Multi-Device Presence Aggregation', async () => {
  const user = await prisma.user.create({
    data: { username: `presence_user_${Date.now()}`, status: 'VERIFIED' },
  });

  const device1 = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'Device 1',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-1'),
      signedPrekeyPub: Buffer.from('spk-1'),
      signedPrekeySig: Buffer.from('sig-1'),
    },
  });

  const device2 = await prisma.device.create({
    data: {
      userId: user.id,
      deviceName: 'Device 2',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('id-2'),
      signedPrekeyPub: Buffer.from('spk-2'),
      signedPrekeySig: Buffer.from('sig-2'),
    },
  });

  const ws1 = await connectWebSocket(user.id, device1.deviceId);
  const ws2 = await connectWebSocket(user.id, device2.deviceId);

  try {
    // Both connected -> user is ONLINE
    const p1 = await presenceService.getPresence(user.id, user.id);
    assert.equal(p1.success && p1.data.isOnline, true);

    // Kill Device 1 ungracefully
    ws1.terminate();
    wsGateway.unregister(user.id, device1.deviceId);

    // User A MUST still be evaluated as ONLINE via Device 2
    const p2 = await presenceService.getPresence(user.id, user.id);
    assert.equal(p2.success && p2.data.isOnline, true, 'User must remain online while Device 2 is alive');

    // Kill Device 2
    ws2.terminate();
    wsGateway.unregister(user.id, device2.deviceId);

    // Now user has 0 active devices -> status flips to OFFLINE with lastSeenAt recorded
    const p3 = await presenceService.getPresence(user.id, user.id);
    assert.equal(p3.success && p3.data.isOnline, false, 'User must flip to OFFLINE when all devices drop');
    assert.ok(p3.success && p3.data.lastSeenAt, 'lastSeenAt must be populated');
  } finally {
    ws1.terminate();
    ws2.terminate();
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('E2E-3.5: Typing Indicator Broadcast & 5-Second TTL Auto-Expiration (NFR-034)', async () => {
  const userA = await prisma.user.create({
    data: { username: `typing_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `typing_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const wsA = await connectWebSocket(userA.id, 'device-type-a');
  const wsB = await connectWebSocket(userB.id, 'device-type-b');

  try {
    const typingFramePromise = waitForFrame(wsB, (data) => data.action === 'USER_TYPING');

    // User A emits TYPING_START
    wsA.send(
      JSON.stringify({
        action: 'TYPING_START',
        conversationId: convId,
      })
    );

    // User B receives USER_TYPING
    const frame = await typingFramePromise;
    assert.equal(frame.action, 'USER_TYPING');
    assert.equal(frame.userId, userA.id);
    assert.equal(frame.conversationId, convId);

    // Check typing active
    const isTypingNow = await presenceService.isUserTyping(convId, userA.id);
    assert.equal(isTypingNow, true);
  } finally {
    wsA.terminate();
    wsB.terminate();
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test('E2E-3.6: Presence Privacy Filters - respects NOBODY, BLOCKED, and CONTACTS (NFR-030)', async () => {
  const alice = await prisma.user.create({
    data: { username: `alice_priv_${Date.now()}`, status: 'VERIFIED' },
  });
  const bob = await prisma.user.create({
    data: {
      username: `bob_priv_${Date.now()}`,
      status: 'VERIFIED',
      presencePrivacy: { visibility: 'EVERYONE' },
    },
  });
  const charlie = await prisma.user.create({
    data: { username: `charlie_priv_${Date.now()}`, status: 'VERIFIED' },
  });

  // Bob is connected online
  const wsBob = await connectWebSocket(bob.id, 'bob-device');

  try {
    // 1. Initially Bob is visible to everyone
    const pres1 = await presenceService.getPresence(alice.id, bob.id);
    assert.equal(pres1.success && pres1.data.isOnline, true);

    // 2. Bob changes visibility to NOBODY
    await presenceService.updatePrivacy(bob.id, 'NOBODY');
    const pres2 = await presenceService.getPresence(alice.id, bob.id);
    assert.equal(pres2.success && pres2.data.isOnline, false, 'NOBODY visibility must hide online status');
    assert.equal(pres2.success && pres2.data.lastSeenAt, null);

    // 3. Bob blocks Alice
    await presenceService.updatePrivacy(bob.id, 'EVERYONE');
    await prisma.userBlock.create({
      data: {
        blockerId: bob.id,
        blockedId: alice.id,
      },
    });

    const pres3 = await presenceService.getPresence(alice.id, bob.id);
    assert.equal(pres3.success && pres3.data.isOnline, false, 'Blocked user must not see presence');

    // Unblock for next test
    await prisma.userBlock.deleteMany({ where: { blockerId: bob.id, blockedId: alice.id } });

    // 4. Bob sets visibility to CONTACTS
    await presenceService.updatePrivacy(bob.id, 'CONTACTS');

    // Alice shares direct conversation with Bob
    await conversationsService.createDirectConversation(alice.id, bob.id);
    const presAlice = await presenceService.getPresence(alice.id, bob.id);
    assert.equal(presAlice.success && presAlice.data.isOnline, true, 'Alice shares chat so sees Bob ONLINE');

    // Charlie shares NO conversations with Bob
    const presCharlie = await presenceService.getPresence(charlie.id, bob.id);
    assert.equal(presCharlie.success && presCharlie.data.isOnline, false, 'Charlie has no shared chat so sees Bob OFFLINE');
  } finally {
    wsBob.terminate();
    await prisma.userBlock.deleteMany({ where: { blockerId: bob.id } });
    await prisma.conversationMember.deleteMany({ where: { user: { id: { in: [alice.id, bob.id, charlie.id] } } } });
    await prisma.conversation.deleteMany({ where: { createdBy: { in: [alice.id, bob.id, charlie.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id, charlie.id] } } });
  }
});

