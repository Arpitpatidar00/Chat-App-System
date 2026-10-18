import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { conversationsService } from '../conversations/conversations.service.js';
import { attachmentsService } from './attachments.service.js';
import { storageProvider } from './storage-provider.js';
import { encryptAttachmentBlob, decryptAttachmentBlob } from '@chat/crypto';

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
  storageProvider.clear();
  await app.close();
  await prisma.$disconnect();
  await closeRedisConnections();
});

/**
 * E2E-6.1: Oversized Attachment Rejection (FR-046, NFR-004)
 * Attempt upload of 11.0 MB file. Rejected with 400 ATTACHMENT_TOO_LARGE.
 */
test('E2E-6.1: Oversized Attachment Rejection (FR-046, NFR-004)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p6_1a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p6_1b_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // Attempt 11 MB upload (11 * 1024 * 1024 = 11,534,336 bytes > 10.5 MB ceiling)
    const oversizedBytes = 11 * 1024 * 1024;
    const failRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: oversizedBytes,
      declaredMime: 'application/pdf',
      sha256Ciphertext: 'dummy-sha256-oversized',
      filename: 'huge_document.pdf',
    });

    assert.equal(failRes.success, false);
    if (!failRes.success) {
      assert.equal(failRes.error.statusCode, 400);
      assert.equal(failRes.error.errorCode, 'ATTACHMENT_TOO_LARGE');
    }

    // Verify datastore contains 0 attachment rows
    const count = await prisma.attachment.count({ where: { conversationId: convId } });
    assert.equal(count, 0);
  } finally {
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-6.2: Disallowed File Type & Executable Block (FR-052)
 * Disguised .exe or .sh scripts are rejected with 400 UNSUPPORTED_FILE_TYPE.
 */
test('E2E-6.2: Disallowed File Type & Executable Block (FR-052)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p6_2a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p6_2b_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // 1. Direct executable upload
    const exeRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: 50_000,
      declaredMime: 'application/x-msdownload',
      sha256Ciphertext: 'sha256-exe',
      filename: 'trojan.exe',
    });
    assert.equal(exeRes.success, false);
    if (!exeRes.success) {
      assert.equal(exeRes.error.statusCode, 400);
      assert.equal(exeRes.error.errorCode, 'UNSUPPORTED_FILE_TYPE');
    }

    // 2. Disguised shell script with image MIME
    const disguisedRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: 25_000,
      declaredMime: 'image/png',
      sha256Ciphertext: 'sha256-script',
      filename: 'backdoor.sh',
    });
    assert.equal(disguisedRes.success, false);
    if (!disguisedRes.success) {
      assert.equal(disguisedRes.error.statusCode, 400);
      assert.equal(disguisedRes.error.errorCode, 'UNSUPPORTED_FILE_TYPE');
    }

    // 3. Valid image upload passes
    const validRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: 150_000,
      declaredMime: 'image/jpeg',
      sha256Ciphertext: 'sha256-valid-jpg',
      filename: 'family_photo.jpg',
    });
    assert.equal(validRes.success, true);
    if (validRes.success) {
      assert.ok(validRes.data.uploadUrl);
      assert.ok(validRes.data.attachmentId);
    }
  } finally {
    await prisma.attachment.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

/**
 * E2E-6.3: Non-Member Download Rejection (FR-049, NFR-027)
 * User C (non-member) calling /v1/attachments/{id}/download-url receives 403 Forbidden.
 */
test('E2E-6.3: Non-Member Download Rejection (FR-049, NFR-027)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p6_3a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p6_3b_${Date.now()}`, status: 'VERIFIED' },
  });
  const userC = await prisma.user.create({
    data: { username: `user_p6_3c_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    // User A initializes valid attachment
    const initRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: 200_000,
      declaredMime: 'application/pdf',
      sha256Ciphertext: 'sha256-confidential-pdf',
      filename: 'contract.pdf',
    });
    assert.equal(initRes.success, true);
    if (!initRes.success) return;
    const attachmentId = initRes.data.attachmentId;

    // User C (unauthorized outsider) attempts download URL request
    const unauthorizedRes = await attachmentsService.getDownloadUrl(userC.id, attachmentId);
    assert.equal(unauthorizedRes.success, false);
    if (!unauthorizedRes.success) {
      assert.equal(unauthorizedRes.error.statusCode, 403);
      assert.equal(unauthorizedRes.error.errorCode, 'FORBIDDEN');
    }

    // Authorized peer User B requests download URL
    const authorizedRes = await attachmentsService.getDownloadUrl(userB.id, attachmentId);
    assert.equal(authorizedRes.success, true);
    if (authorizedRes.success) {
      assert.ok(authorizedRes.data.downloadUrl);
      assert.equal(authorizedRes.data.sha256Ciphertext, 'sha256-confidential-pdf');
    }
  } finally {
    await prisma.attachment.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userC.id] } } });
  }
});

/**
 * E2E-6.4: Tampered Ciphertext Integrity Guard (FR-048)
 * Altering 1 byte of S3 CiphertextBlob triggers SHA-256 mismatch rejection on client.
 */
test('E2E-6.4: Tampered Ciphertext Integrity Guard (FR-048)', async () => {
  const originalPlaintext = Buffer.from('Sensitive medical lab diagnostic findings: ALL CLEAR');

  // Client encrypts file locally into packed ciphertext blob
  const { ciphertextBlob, fileKey, sha256Ciphertext } = encryptAttachmentBlob(originalPlaintext);

  // Normal untampered verification & decryption succeeds
  const decrypted = decryptAttachmentBlob(ciphertextBlob, fileKey, sha256Ciphertext);
  assert.deepEqual(decrypted, originalPlaintext);

  // Attacker/corrupted network tampers with 1 byte of ciphertext blob
  const tamperedBlob = Buffer.from(ciphertextBlob);
  const targetIdx = tamperedBlob.length - 5;
  tamperedBlob[targetIdx] = (tamperedBlob[targetIdx] ?? 0) ^ 0xaa; // flip bits

  // Recipient verifies integrity before decrypting: Must throw SHA-256 mismatch error
  assert.throws(
    () => {
      decryptAttachmentBlob(tamperedBlob, fileKey, sha256Ciphertext);
    },
    /Tampered ciphertext detected: SHA-256 mismatch/,
    'Must abort on checksum mismatch'
  );
});

/**
 * E2E-6.5: Tombstone S3 Cleanup Verification (NFR-035)
 * Purging attachment permanently removes S3 object; subsequent downloads return 410 GONE.
 */
test('E2E-6.5: Tombstone S3 Cleanup Verification (NFR-035)', async () => {
  const userA = await prisma.user.create({
    data: { username: `user_p6_5a_${Date.now()}`, status: 'VERIFIED' },
  });
  const userB = await prisma.user.create({
    data: { username: `user_p6_5b_${Date.now()}`, status: 'VERIFIED' },
  });

  const convRes = await conversationsService.createDirectConversation(userA.id, userB.id);
  assert.equal(convRes.success, true);
  if (!convRes.success) return;
  const convId = convRes.data.id;

  try {
    const initRes = await attachmentsService.initUpload(userA.id, {
      conversationId: convId,
      ciphertextSizeBytes: 80_000,
      declaredMime: 'application/pdf',
      sha256Ciphertext: 'sha256-purge-test',
      filename: 'sensitive.pdf',
    });
    assert.equal(initRes.success, true);
    if (!initRes.success) return;
    const attachmentId = initRes.data.attachmentId;
    const objectKey = initRes.data.objectKey;

    // Simulate S3 upload
    await storageProvider.putObject(objectKey, Buffer.from('encrypted-content'), 'application/pdf');
    assert.equal(storageProvider.hasObject(objectKey), true);

    // Commit attachment
    await attachmentsService.commitUpload(userA.id, attachmentId);

    // Purge attachment (e.g. via message tombstone or direct purge)
    const purgeRes = await attachmentsService.purgeAttachment(userA.id, attachmentId);
    assert.equal(purgeRes.success, true);

    // S3 object must be permanently purged (NFR-035)
    assert.equal(storageProvider.hasObject(objectKey), false);

    // Subsequent download requests return 410 GONE (AttachmentDeletedError)
    const downloadRes = await attachmentsService.getDownloadUrl(userB.id, attachmentId);
    assert.equal(downloadRes.success, false);
    if (!downloadRes.success) {
      assert.equal(downloadRes.error.statusCode, 410);
      assert.equal(downloadRes.error.errorCode, 'ATTACHMENT_DELETED');
    }
  } finally {
    await prisma.attachment.deleteMany({ where: { conversationId: convId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId } });
    await prisma.conversation.deleteMany({ where: { id: convId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});
