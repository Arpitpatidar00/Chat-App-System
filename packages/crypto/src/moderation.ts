import { publicEncrypt, privateDecrypt, constants, randomBytes } from 'node:crypto';
import { encryptAesGcm, decryptAesGcm } from './aes-gcm.js';

export interface ModerationReportPayload {
  reportedMessageId: string;
  reportedMessageText: string;
  senderId: string;
  timestamp: string;
  contextMessages: Array<{
    messageId: string;
    senderId: string;
    text: string;
    timestamp: string;
  }>;
}

export interface EncryptedModerationEnvelope {
  encryptedKey: string; // Base64 RSA-OAEP encrypted 32-byte AES key
  iv: string; // Base64
  tag: string; // Base64
  ciphertext: string; // Base64 AES-256-GCM encrypted report payload
}

/**
 * Hybrid Envelope Encryption for DEC-08 Report Content Disclosure:
 * 1. Generates ephemeral 256-bit AES symmetric key.
 * 2. Encrypts arbitrary report payload with AES-256-GCM.
 * 3. Asymmetrically encrypts the AES key using Moderation RSA Public Key (RSA-OAEP with SHA-256).
 */
export function encryptForModeration(
  reportPayload: ModerationReportPayload,
  modPublicKeyPem: string
): string {
  const ephemeralKey = randomBytes(32);
  const serialized = Buffer.from(JSON.stringify(reportPayload), 'utf8');

  // 1. Symmetric AES-256-GCM encryption of payload
  const { ciphertext, iv, tag } = encryptAesGcm(serialized, ephemeralKey);

  // 2. Asymmetric RSA-OAEP encryption of 32-byte ephemeral key
  const encryptedKey = publicEncrypt(
    {
      key: modPublicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    ephemeralKey
  );

  const envelope: EncryptedModerationEnvelope = {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypts hybrid moderation envelope inside authorized moderation enclave.
 */
export function decryptModerationReport(
  envelopeJson: string,
  modPrivateKeyPem: string
): ModerationReportPayload {
  const envelope = JSON.parse(envelopeJson) as EncryptedModerationEnvelope;

  // 1. Decrypt ephemeral AES key using Moderation RSA Private Key
  const decryptedKey = privateDecrypt(
    {
      key: modPrivateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(envelope.encryptedKey, 'base64')
  );

  // 2. Decrypt payload using AES-256-GCM
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');

  const decryptedPayload = decryptAesGcm(ciphertext, decryptedKey, iv, tag);
  return JSON.parse(decryptedPayload.toString('utf8')) as ModerationReportPayload;
}
