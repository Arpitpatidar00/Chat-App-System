import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { signJwt, encryptKeyVault, decryptKeyVault } from '@chat/crypto';
import { env } from '../../config/env.js';
import { devicesService } from '../devices/devices.service.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { messagesService } from './messages.service.js';
import { randomUUID, randomBytes } from 'node:crypto';

after(async () => {
  await prisma.$disconnect();
  await closeRedisConnections();
});

test('E2E-2.1: X3DH Prekey Atomic Consumption - concurrent fetches receive distinct OPKs without reuse', async () => {
  // 1. Seed user and enroll device with 5 OPKs
  const user = await prisma.user.create({
    data: { username: `x3dh_user_${Date.now()}`, status: 'VERIFIED' },
  });

  const enrollRes = await devicesService.enrollDevice(user.id, {
    deviceName: 'iPhone 15 Pro',
    platform: 'IOS',
    identityKeyPub: randomBytes(32).toString('base64'),
    signedPrekeyPub: randomBytes(32).toString('base64'),
    signedPrekeySig: randomBytes(64).toString('base64'),
    oneTimePrekeys: [
      { keyId: 1, publicKey: randomBytes(32).toString('base64') },
      { keyId: 2, publicKey: randomBytes(32).toString('base64') },
      { keyId: 3, publicKey: randomBytes(32).toString('base64') },
      { keyId: 4, publicKey: randomBytes(32).toString('base64') },
      { keyId: 5, publicKey: randomBytes(32).toString('base64') },
    ],
  });

  assert.equal(enrollRes.success, true);

  try {
    // 2. Fetch prekey bundles concurrently from two separate callers
    const [bundle1Res, bundle2Res] = await Promise.all([
      devicesService.getPrekeyBundles(user.id),
      devicesService.getPrekeyBundles(user.id),
    ]);

    assert.equal(bundle1Res.success, true);
    assert.equal(bundle2Res.success, true);

    if (bundle1Res.success && bundle2Res.success) {
      const b1 = bundle1Res.data[0];
      const b2 = bundle2Res.data[0];

      assert.ok(b1?.oneTimePrekey, 'Bundle 1 should have an OPK');
      assert.ok(b2?.oneTimePrekey, 'Bundle 2 should have an OPK');
      // Each client MUST receive a distinct OPK
      assert.notEqual(
        b1?.oneTimePrekey?.keyId,
        b2?.oneTimePrekey?.keyId,
        'OPKs must be distinct across concurrent fetches'
      );
    }
  } finally {
    await prisma.oneTimePrekey.deleteMany({
      where: { device: { userId: user.id } },
    });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('E2E-2.3: Idempotent Retry Under Network Cut - repeating send returns original seqId without duplicate rows', async () => {
  const userA = await prisma.user.create({
    data: { username: `sender_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `peer_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Alice Phone',
      platform: 'IOS',
      identityKeyPub: Buffer.from('test-identity-key-pub'),
      signedPrekeyPub: Buffer.from('test-signed-prekey-pub'),
      signedPrekeySig: Buffer.from('test-signed-prekey-sig'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  const senderDeviceId = deviceA.deviceId;
  const clientMsgId = randomUUID();

  try {
    // Attempt 1
    const res1 = await messagesService.sendMessage(userA.id, senderDeviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [randomUUID()]: 'ciphertext-attempt-1' },
    });

    assert.equal(res1.success, true);
    if (!res1.success) return;
    const initialSeqId = res1.data.seqId;

    // Retry 1 (simulating socket cut before ACK)
    const res2 = await messagesService.sendMessage(userA.id, senderDeviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [randomUUID()]: 'ciphertext-attempt-2' },
    });

    // Retry 2
    const res3 = await messagesService.sendMessage(userA.id, senderDeviceId, {
      conversationId: convId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads: { [randomUUID()]: 'ciphertext-attempt-3' },
    });

    assert.equal(res2.success, true);
    assert.equal(res3.success, true);

    if (res2.success && res3.success) {
      assert.equal(res2.data.seqId, initialSeqId, 'Retry 1 must return original seqId');
      assert.equal(res3.data.seqId, initialSeqId, 'Retry 2 must return original seqId');
    }

    // Verify DB contains exactly 1 message row for this (senderDeviceId, clientMsgId)
    const messagesCount = await prisma.message.count({
      where: { senderDeviceId, clientMsgId },
    });
    assert.equal(messagesCount, 1, 'Exactly 1 message record must exist in DB');
  } finally {
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test('E2E-2.4: Strict Monotonic Ordering Under Burst - 30 concurrent sends receive continuous seq_ids with 0 duplicates', async () => {
  const userA = await prisma.user.create({
    data: { username: `burst_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `burst_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Alice Burst Device',
      platform: 'ANDROID',
      identityKeyPub: Buffer.from('test-identity-key-pub-burst'),
      signedPrekeyPub: Buffer.from('test-signed-prekey-pub-burst'),
      signedPrekeySig: Buffer.from('test-signed-prekey-sig-burst'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // Emit 30 concurrent sends into the conversation
    const sendPromises = Array.from({ length: 30 }).map((_, i) => {
      return messagesService.sendMessage(userA.id, deviceA.deviceId, {
        conversationId: convId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { [randomUUID()]: `ciphertext-burst-${i}` },
      });
    });

    const results = await Promise.all(sendPromises);

    const seqIds: number[] = [];
    for (const res of results) {
      assert.equal(res.success, true);
      if (res.success) {
        seqIds.push(parseInt(res.data.seqId, 10));
      }
    }

    assert.equal(seqIds.length, 30);

    // Verify all sequence IDs are strictly unique
    const uniqueSeqIds = new Set(seqIds);
    assert.equal(uniqueSeqIds.size, 30, 'All allocated sequence IDs must be strictly unique');

    // Verify continuous monotonic sequence from min to max (0 gaps)
    seqIds.sort((a, b) => a - b);
    const minSeq = seqIds[0]!;
    for (let i = 0; i < seqIds.length; i++) {
      assert.equal(seqIds[i], minSeq + i, 'Sequence IDs must be continuous with 0 gaps');
    }
  } finally {
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test('E2E-2.5: Zero-RPO Key Recovery - Encrypt local keys, store vault, fetch and restore (DEC-02)', async () => {
  const user = await prisma.user.create({
    data: { username: `vault_user_${Date.now()}`, status: 'VERIFIED' },
  });

  const passphrase = 'SuperSecretUserPassphrase!2026';
  const localRatchetState = {
    identityKeyPem: 'ed25519-private-key-material',
    signedPrekeyPem: 'x25519-private-key-material',
    ratchetSessions: [
      { peerId: 'peer-1', rootKey: 'hex-root-key', sendChainKey: 'hex-send-ck' },
    ],
  };

  try {
    // 1. Client derives key and encrypts vault locally
    const encryptedVault = await encryptKeyVault(localRatchetState, passphrase);

    // 2. Store encrypted vault on server via PUT /api/v1/keys/vault
    const updateRes = await devicesService.updateKeyVault(user.id, {
      encryptedVaultBlob: encryptedVault.encryptedVaultBlob,
      kdfSalt: encryptedVault.salt,
      kdfParams: { memory_cost: 65536, time_cost: 3, parallelism: 4 },
      version: encryptedVault.version,
    });
    assert.equal(updateRes.success, true);

    // 3. Simulate new device restore: fetch encrypted vault from server
    const getRes = await devicesService.getKeyVault(user.id);
    assert.equal(getRes.success, true);
    if (!getRes.success) return;

    // 4. Client restores ratchet state using passphrase
    const restored = await decryptKeyVault(
      {
        version: getRes.data.version,
        salt: getRes.data.kdfSalt,
        encryptedVaultBlob: getRes.data.encryptedVaultBlob,
      },
      passphrase
    );

    assert.deepEqual(restored, localRatchetState);
  } finally {
    await prisma.keyBackupVault.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('E2E-2.6: Durable Offline Sync - returns messages ordered strictly by seqId ASC', async () => {
  const userA = await prisma.user.create({
    data: { username: `sync_user_a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `sync_user_b_${Date.now()}`, status: 'VERIFIED' },
  });

  const deviceA = await prisma.device.create({
    data: {
      userId: userA.id,
      deviceName: 'Alice Sync Device',
      platform: 'WEB',
      identityKeyPub: Buffer.from('test-identity-key-pub-sync'),
      signedPrekeyPub: Buffer.from('test-signed-prekey-pub-sync'),
      signedPrekeySig: Buffer.from('test-signed-prekey-sig-sync'),
    },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // Send 5 messages sequentially
    for (let i = 1; i <= 5; i++) {
      await messagesService.sendMessage(userA.id, deviceA.deviceId, {
        conversationId: convId,
        clientMsgId: randomUUID(),
        msgType: 'TEXT',
        encryptedPayloads: { [randomUUID()]: `sync-msg-${i}` },
      });
    }

    // User B was offline and reconnects; requests sync after seqId 2
    const syncRes = await messagesService.syncMessages(convId, userB.id, BigInt(2), 10);
    assert.equal(syncRes.success, true);
    if (!syncRes.success) return;

    assert.equal(syncRes.data.length, 3, 'Should return messages 3, 4, and 5');
    assert.equal(syncRes.data[0]?.seqId, '3');
    assert.equal(syncRes.data[1]?.seqId, '4');
    assert.equal(syncRes.data[2]?.seqId, '5');
  } finally {
    await prisma.message.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.device.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

