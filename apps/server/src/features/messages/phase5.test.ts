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
import { messagesService } from './messages.service.js';
import { conversationsService } from '../conversations/conversations.service.js';

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

function waitForFrame(ws: WebSocket, predicate: (data: any) => boolean, timeoutMs: number = 4000): Promise<any> {
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

/**
 * E2E-5.1: Delete-for-Everyone Server & Client Purge (FR-027, NFR-035)
 * User A sends message M to User B. User A deletes message M for everyone.
 * Server encrypted_payloads becomes empty; recipient receives MSG_TOMBSTONED frame.
 */
test('E2E-5.1: Delete-for-Everyone Server & Client Purge (FR-027, NFR-035)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p5_1a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p5_1b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Phone-A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-5-1a'),
      signedPrekeyPub: Buffer.from('spk-5-1a'),
      signedPrekeySig: Buffer.from('sig-5-1a'),
    },
  });
  const deviceB = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Phone-B',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('id-5-1b'),
      signedPrekeyPub: Buffer.from('spk-5-1b'),
      signedPrekeySig: Buffer.from('sig-5-1b'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const wsB = await connectWebSocket(userB.id, deviceB.deviceId);

  try {
    const clientMsgId = randomUUID();
    const sendRes = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [deviceB.deviceId]: 'secret-to-be-deleted' },
    });
    assert.equal(sendRes.success, true);
    if (!sendRes.success) return;
    const msgId = sendRes.data.messageId;

    const tombstonePromise = waitForFrame(wsB, (d) => d.action === 'MSG_TOMBSTONED' && d.messageId === msgId);

    // User A executes delete for everyone
    const deleteRes = await messagesService.deleteForEveryone(userA.id, deviceA.deviceId, msgId);
    assert.equal(deleteRes.success, true);

    const frame = await tombstonePromise;
    assert.equal(frame.action, 'MSG_TOMBSTONED');
    assert.equal(frame.messageId, msgId);

    // Verify datastore: encrypted_payloads is purged and is_tombstoned = true (NFR-035)
    const storedMsg = await prisma.message.findUnique({ where: { id: msgId } });
    assert.ok(storedMsg);
    assert.equal(storedMsg.isTombstoned, true);
    assert.deepEqual(storedMsg.encryptedPayloads, {});

    // Verify event log recorded DELETE_EVERYONE
    const event = await prisma.messageEvent.findFirst({
      where: { targetMessageId: msgId, eventType: 'DELETE_EVERYONE' },
    });
    assert.ok(event);
  } finally {
    wsB.terminate();
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { deviceId: { in: [deviceA.deviceId, deviceB.deviceId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-5.2: Delete-for-Self Multi-Device Sync (FR-027, FR-031)
 * User A triggers delete-for-self on Phone (A1).
 * Message M is removed from A1 and Desktop (A2); User B's devices continue displaying message M.
 */
test('E2E-5.2: Delete-for-Self Multi-Device Sync (FR-027, FR-031)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p5_2a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p5_2b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA1 = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Phone-A1',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-5-2a1'),
      signedPrekeyPub: Buffer.from('spk-5-2a1'),
      signedPrekeySig: Buffer.from('sig-5-2a1'),
    },
  });
  const deviceA2 = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Desktop-A2',
      platform: 'WEB',
      identityKeyPub: Buffer.from('id-5-2a2'),
      signedPrekeyPub: Buffer.from('spk-5-2a2'),
      signedPrekeySig: Buffer.from('sig-5-2a2'),
    },
  });
  const deviceB = await prisma.device.create({
    data: {
      userId: userB.id,
      deviceName: 'Phone-B',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('id-5-2b'),
      signedPrekeyPub: Buffer.from('spk-5-2b'),
      signedPrekeySig: Buffer.from('sig-5-2b'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const wsA2 = await connectWebSocket(userA.id, deviceA2.deviceId);

  try {
    const clientMsgId = randomUUID();
    const sendRes = await messagesService.sendMessage(userA.id, deviceA1.deviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: {
        [deviceB.deviceId]: 'ciphertext-b',
        [deviceA2.deviceId]: 'ciphertext-a2',
      },
    });
    assert.equal(sendRes.success, true);
    if (!sendRes.success) return;
    const msgId = sendRes.data.messageId;

    const hideSelfPromise = waitForFrame(wsA2, (d) => d.action === 'MSG_HIDDEN_SELF' && d.messageId === msgId);

    // User A executes delete-for-self on device A1
    const hideRes = await messagesService.deleteForSelf(userA.id, msgId);
    assert.equal(hideRes.success, true);

    // Device A2 receives MSG_HIDDEN_SELF
    const frame = await hideSelfPromise;
    assert.equal(frame.action, 'MSG_HIDDEN_SELF');
    assert.equal(frame.messageId, msgId);

    // User A syncing messages does NOT receive msgId
    const syncResA = await messagesService.syncMessages(convId, userA.id, 0n);
    assert.equal(syncResA.success, true);
    if (syncResA.success) {
      const foundA = syncResA.data.some((m) => m.id === msgId);
      assert.equal(foundA, false, 'Message must be hidden from User A');
    }

    // User B syncing messages DOES receive msgId
    const syncResB = await messagesService.syncMessages(convId, userB.id, 0n);
    assert.equal(syncResB.success, true);
    if (syncResB.success) {
      const foundB = syncResB.data.some((m) => m.id === msgId);
      assert.equal(foundB, true, 'Message must remain visible to User B');
    }
  } finally {
    wsA2.terminate();
    await prisma.userHiddenMessage.deleteMany({ where: { userId: userA.id } });
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { deviceId: { in: [deviceA1.deviceId, deviceA2.deviceId, deviceB.deviceId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-5.3: Expired Edit Window Rejection (FR-026, DEC-12)
 * Sender attempts POST /v1/messages/{id}/edit 49 hours after message timestamp.
 * Server rejects edit with 400 EDIT_WINDOW_EXPIRED.
 */
test('E2E-5.3: Expired Edit Window Rejection (FR-026, DEC-12)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p5_3a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p5_3b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Phone-A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-5-3a'),
      signedPrekeyPub: Buffer.from('spk-5-3a'),
      signedPrekeySig: Buffer.from('sig-5-3a'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // Create message with createdAt set to 49 hours ago
    const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const expiredMsg = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: convId,
        seqId: 1n,
        senderId: userA.id,
        senderDeviceId: deviceA.deviceId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { someDevice: 'initial-ciphertext' },
        createdAt: fortyNineHoursAgo,
      },
    });

    // Attempt edit on 49-hour-old message
    const editRes = await messagesService.editMessage(userA.id, deviceA.deviceId, expiredMsg.id, {
      encryptedPayloads: { someDevice: 'new-edited-ciphertext' },
    });

    assert.equal(editRes.success, false);
    if (!editRes.success) {
      assert.equal(editRes.error.statusCode, 400);
      assert.equal(editRes.error.errorCode, 'EDIT_WINDOW_EXPIRED');
    }

    // Within window edit: Create fresh message (now) and edit it
    const freshMsg = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: convId,
        seqId: 2n,
        senderId: userA.id,
        senderDeviceId: deviceA.deviceId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { someDevice: 'original' },
      },
    });

    const validEditRes = await messagesService.editMessage(userA.id, deviceA.deviceId, freshMsg.id, {
      encryptedPayloads: { someDevice: 'successfully-edited' },
    });
    assert.equal(validEditRes.success, true);
    if (validEditRes.success) {
      assert.equal(validEditRes.data.isEdited, true);
    }
  } finally {
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { deviceId: deviceA.deviceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-5.4: Forwarding Cryptographic Isolation (FR-029, FR-083)
 * Forward message M from Direct Chat AB to Group G.
 * Group G members can decrypt M; server never sees plaintext; origin chat metadata is not leaked.
 */
test('E2E-5.4: Forwarding Cryptographic Isolation (FR-029, FR-083)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p5_4a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p5_4b_${Date.now()}`, status: 'VERIFIED' },
  });
  const userC = await prisma.user.create({
    data: { username: `user_p5_4c_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Phone-A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-5-4a'),
      signedPrekeyPub: Buffer.from('spk-5-4a'),
      signedPrekeySig: Buffer.from('sig-5-4a'),
    },
  });
  const deviceC = await prisma.device.create({
    data: {
      userId: userC.id,
      deviceName: 'Phone-C',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('id-5-4c'),
      signedPrekeyPub: Buffer.from('spk-5-4c'),
      signedPrekeySig: Buffer.from('sig-5-4c'),
    },
  });

  // 1. Direct chat between A and B
  const directRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(directRes.success, true);
  if (!directRes.success) return;
  const directConvId = directRes.data.id;

  // 2. Group G with A and C
  const groupRes = await conversationsService.createGroupConversation(userA.id, {
    title: 'Forward Target Group',
    memberIds: [userC.id],
  });
  assert.equal(groupRes.success, true);
  if (!groupRes.success) return;
  const groupConvId = groupRes.data.id;

  try {
    // User A receives/has message in direct chat AB
    const directMsgId = randomUUID();
    const sendDirectRes = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: directConvId,
      clientMsgId: directMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { peerDeviceB: 'original-secret-direct' },
    });
    assert.equal(sendDirectRes.success, true);

    // Client locally decrypts 'original-secret-direct' -> "Confidential Announcement"
    // Client re-encrypts under Group G's destination session keys (FR-083)
    const reEncryptedGroupCiphertext = 're-encrypted-for-group-g';
    const forwardClientMsgId = randomUUID();

    const forwardRes = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: groupConvId,
      clientMsgId: forwardClientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [deviceC.deviceId]: reEncryptedGroupCiphertext },
    });

    assert.equal(forwardRes.success, true);
    if (!forwardRes.success) return;

    // Verify stored forward message has no reference to directConvId
    const storedGroupMsg = await prisma.message.findUnique({
      where: { id: forwardRes.data.messageId },
    });
    assert.ok(storedGroupMsg);
    assert.equal(storedGroupMsg.conversationId, groupConvId);
    assert.deepEqual(storedGroupMsg.encryptedPayloads, {
      [deviceC.deviceId]: reEncryptedGroupCiphertext,
    });
  } finally {
    await prisma.messageReceipt.deleteMany({
      where: { conversationId: { in: [directConvId, groupConvId] } },
    });
    await prisma.message.deleteMany({
      where: { conversationId: { in: [directConvId, groupConvId] } },
    });
    await prisma.conversationMember.deleteMany({
      where: { conversationId: { in: [directConvId, groupConvId] } },
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: [directConvId, groupConvId] } },
    });
    await prisma.device.deleteMany({
      where: { deviceId: { in: [deviceA.deviceId, deviceC.deviceId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id] } },
    });
  }
});

/**
 * E2E-5.5: Offline Reconnect Event Replay (FR-056)
 * User B disconnects; User A edits M1 and reacts to M2; User B reconnects and calls /v1/sync/events.
 * User B's retrieved event list shows the EDIT on M1 and the REACTION_ADD on M2.
 */
test('E2E-5.5: Offline Reconnect Event Replay (FR-056)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p5_5a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p5_5b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Phone-A',
      platform: 'IOS',
      identityKeyPub: Buffer.from('id-5-5a'),
      signedPrekeyPub: Buffer.from('spk-5-5a'),
      signedPrekeySig: Buffer.from('sig-5-5a'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // 1. User A sends M1 and M2
    const m1Res = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: convId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: { target: 'msg-1' },
    });
    assert.equal(m1Res.success, true);
    if (!m1Res.success) return;
    const m1Id = m1Res.data.messageId;

    const m2Res = await messagesService.sendMessage(userA.id, deviceA.deviceId, {
      conversationId: convId,
      clientMsgId: randomUUID(),
      msgType: 'TEXT',
      encryptedPayloads: { target: 'msg-2' },
    });
    assert.equal(m2Res.success, true);
    if (!m2Res.success) return;
    const m2Id = m2Res.data.messageId;

    // 2. User A edits M1 while User B is offline
    const editRes = await messagesService.editMessage(userA.id, deviceA.deviceId, m1Id, {
      encryptedPayloads: { target: 'msg-1-edited' },
    });
    assert.equal(editRes.success, true);

    // 3. User A reacts to M2 with heart emoji
    const reactRes = await messagesService.reactToMessage(userA.id, deviceA.deviceId, m2Id, {
      emoji: '❤️',
      action: 'ADD',
    });
    assert.equal(reactRes.success, true);

    // 4. User B reconnects and synchronizes delta mutation events
    const syncRes = await messagesService.syncEvents(convId, userB.id, 0n);
    assert.equal(syncRes.success, true);
    if (syncRes.success) {
      const events = syncRes.data.events;
      assert.ok(events.length >= 2, 'Should receive at least 2 mutation events');

      const editEvent = events.find((e) => e.targetMessageId === m1Id && e.eventType === 'EDIT');
      assert.ok(editEvent, 'Must find EDIT event on M1');

      const reactionEvent = events.find((e) => e.targetMessageId === m2Id && e.eventType === 'REACTION_ADD');
      assert.ok(reactionEvent, 'Must find REACTION_ADD event on M2');
      assert.equal(reactionEvent.encryptedPatch, '❤️');
    }
  } finally {
    await prisma.messageEvent.deleteMany({ where: { conversationId: convId } });
    await prisma.messageReceipt.deleteMany({ where: { conversationId: convId } });
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { deviceId: deviceA.deviceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});
