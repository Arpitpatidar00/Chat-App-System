import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Encrypts data using AES-256-GCM.
 * @param plaintext Plaintext buffer or string
 * @param key 256-bit (32 bytes) symmetric key
 * @param aad Optional Additional Authenticated Data
 */
export function encryptAesGcm(
  plaintext: Buffer | Uint8Array | string,
  key: Buffer,
  aad?: Buffer
): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, received ${key.length} bytes`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  if (aad) {
    cipher.setAAD(aad);
  }

  const buf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : Buffer.from(plaintext);
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag,
  };
}

/**
 * Decrypts data using AES-256-GCM and verifies authentication tag.
 * @throws Error if authentication fails or payload has been tampered with
 */
export function decryptAesGcm(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
  aad?: Buffer
): Buffer {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, received ${key.length} bytes`);
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, received ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid Tag length: expected ${TAG_LENGTH}, received ${tag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  if (aad) {
    decipher.setAAD(aad);
  }

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Packs IV (12B) + Tag (16B) + Ciphertext into a single contiguous binary buffer.
 */
export function packEncryptedBuffer(payload: EncryptedPayload): Buffer {
  return Buffer.concat([payload.iv, payload.tag, payload.ciphertext]);
}

/**
 * Unpacks contiguous binary buffer into IV, Tag, and Ciphertext.
 */
export function unpackEncryptedBuffer(packed: Buffer): EncryptedPayload {
  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Packed payload too short to contain IV and Tag');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  return { iv, tag, ciphertext };
}
