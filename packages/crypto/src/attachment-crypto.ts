import { createHash, randomBytes } from 'node:crypto';
import { encryptAesGcm, decryptAesGcm, packEncryptedBuffer, unpackEncryptedBuffer } from './aes-gcm.js';

export interface EncryptedAttachmentPackage {
  ciphertextBlob: Buffer;
  fileKey: Buffer;
  sha256Ciphertext: string;
}

/**
 * P6-T02: Client Symmetric File Encryption (FR-048, NFR-027).
 * Encrypts raw file using random 256-bit AES-GCM FileKey, packs IV + Tag + Ciphertext,
 * and computes SHA-256 checksum over the ciphertext blob.
 */
export function encryptAttachmentBlob(fileBuffer: Buffer): EncryptedAttachmentPackage {
  const fileKey = randomBytes(32);
  const enc = encryptAesGcm(fileBuffer, fileKey);
  const ciphertextBlob = packEncryptedBuffer(enc);
  const sha256Ciphertext = createHash('sha256').update(ciphertextBlob).digest('hex');

  return {
    ciphertextBlob,
    fileKey,
    sha256Ciphertext,
  };
}

/**
 * P6-T02 & E2E-6.4: Tampered Ciphertext Integrity Guard (FR-048).
 * Strictly verifies SHA-256(ciphertextBlob) === expectedSha256 before decryption.
 * @throws Error if checksum mismatch is detected (tampering/corruption).
 */
export function decryptAttachmentBlob(
  ciphertextBlob: Buffer,
  fileKey: Buffer,
  expectedSha256: string
): Buffer {
  const computedSha256 = createHash('sha256').update(ciphertextBlob).digest('hex');
  if (computedSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `Tampered ciphertext detected: SHA-256 mismatch (expected: ${expectedSha256}, computed: ${computedSha256})`
    );
  }

  const { iv, tag, ciphertext } = unpackEncryptedBuffer(ciphertextBlob);
  return decryptAesGcm(ciphertext, fileKey, iv, tag);
}
