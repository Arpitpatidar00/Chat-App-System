import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import {
  encryptAesGcm,
  decryptAesGcm,
  packEncryptedBuffer,
  unpackEncryptedBuffer,
} from './aes-gcm.js';
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  computeSharedSecret,
  signEd25519,
  verifyEd25519,
} from './keypair.js';
import { deriveHkdf, deriveKeyScrypt } from './kdf.js';
import { encryptKeyVault, decryptKeyVault } from './vault.js';
import {
  encryptForModeration,
  decryptModerationReport,
  type ModerationReportPayload,
} from './moderation.js';
import { signJwt, verifyJwt } from './jwt.js';

test('AES-256-GCM: encrypts and decrypts with authentication tag verification', () => {
  const key = randomBytes(32);
  const message = 'Hello, Signal Protocol / E2EE Chat!';

  const encrypted = encryptAesGcm(message, key);
  const decrypted = decryptAesGcm(encrypted.ciphertext, key, encrypted.iv, encrypted.tag);

  assert.equal(decrypted.toString('utf8'), message);
});

test('AES-256-GCM: rejects tampering in ciphertext or tag', () => {
  const key = randomBytes(32);
  const message = 'Tamper-proof payload';

  const encrypted = encryptAesGcm(message, key);
  // Mutate ciphertext byte
  encrypted.ciphertext[0] = (encrypted.ciphertext[0] ?? 0) ^ 0xff;

  assert.throws(() => {
    decryptAesGcm(encrypted.ciphertext, key, encrypted.iv, encrypted.tag);
  });
});

test('AES-256-GCM: pack and unpack binary buffer', () => {
  const key = randomBytes(32);
  const payload = encryptAesGcm('Buffer packed data', key);
  const packed = packEncryptedBuffer(payload);
  const unpacked = unpackEncryptedBuffer(packed);

  const decrypted = decryptAesGcm(unpacked.ciphertext, key, unpacked.iv, unpacked.tag);
  assert.equal(decrypted.toString('utf8'), 'Buffer packed data');
});

test('Keypair: X25519 Diffie-Hellman secret computation matches between parties', () => {
  const alice = generateX25519KeyPair();
  const bob = generateX25519KeyPair();

  const secretAlice = computeSharedSecret(alice.privateKey, bob.publicKey);
  const secretBob = computeSharedSecret(bob.privateKey, alice.publicKey);

  assert.deepEqual(secretAlice, secretBob);
});

test('Keypair: Ed25519 signature creates verifiable signatures', () => {
  const identity = generateEd25519KeyPair();
  const data = 'Pre-key bundle signature validation';

  const signature = signEd25519(data, identity.privateKey);
  const valid = verifyEd25519(data, signature, identity.publicKey);
  assert.equal(valid, true);

  const invalid = verifyEd25519('Tampered data', signature, identity.publicKey);
  assert.equal(invalid, false);
});

test('KDF: HKDF derives consistent 32-byte keys', async () => {
  const ikm = randomBytes(32);
  const salt = randomBytes(32);

  const key1 = await deriveHkdf(ikm, salt, 'ratchet-chain-key', 32);
  const key2 = await deriveHkdf(ikm, salt, 'ratchet-chain-key', 32);

  assert.equal(key1.length, 32);
  assert.deepEqual(key1, key2);
});

test('Vault: Encrypt and decrypt key vault using passphrase (DEC-02)', async () => {
  const vaultData = {
    identityKey: 'ed25519-mock-pem',
    signedPreKey: 'x25519-mock-pem',
    ratchetSessions: [{ conversationId: 'c1', rootKey: 'hex-rk' }],
  };
  const passphrase = 'UltraSecureUserPassphrase!2026';

  const encryptedVault = await encryptKeyVault(vaultData, passphrase);
  const restoredVault = await decryptKeyVault(encryptedVault, passphrase);

  assert.deepEqual(restoredVault, vaultData);
});

test('Moderation: Asymmetric report disclosure re-encryption (DEC-08)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const payload: ModerationReportPayload = {
    reportedMessageId: 'msg-999',
    reportedMessageText: 'Offensive violation content',
    senderId: 'user-violator',
    timestamp: new Date().toISOString(),
    contextMessages: [
      {
        messageId: 'msg-998',
        senderId: 'user-reporter',
        text: 'Stop sending that',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const encryptedReport = encryptForModeration(payload, publicKey);
  const decryptedReport = decryptModerationReport(encryptedReport, privateKey);

  assert.deepEqual(decryptedReport, payload);
});

test('JWT: signs and verifies claims with signature check and expiry', () => {
  const secret = 'super-secret-key-for-test-32-bytes!';
  const claims = {
    userId: 'user-jwt-1',
    deviceId: 'device-jwt-1',
    username: 'alice',
    status: 'VERIFIED' as const,
    platform: 'IOS' as const,
  };

  const token = signJwt(claims, secret, 3600);
  const decoded = verifyJwt(token, secret);

  assert.ok(decoded);
  assert.equal(decoded.userId, claims.userId);
  assert.equal(decoded.username, claims.username);
  assert.equal(decoded.status, claims.status);

  // Rejects invalid secret
  assert.equal(verifyJwt(token, 'wrong-secret'), null);

  // Rejects expired token
  const expiredToken = signJwt(claims, secret, -10);
  assert.equal(verifyJwt(expiredToken, secret), null);
});
