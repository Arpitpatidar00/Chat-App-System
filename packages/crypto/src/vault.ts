import { randomBytes } from 'node:crypto';
import {
  encryptAesGcm,
  decryptAesGcm,
  packEncryptedBuffer,
  unpackEncryptedBuffer,
} from './aes-gcm.js';
import { deriveKeyScrypt } from './kdf.js';

export interface EncryptedKeyVaultDto {
  version: number;
  salt: string; // base64
  encryptedVaultBlob: string; // base64 packed (IV 12B + Tag 16B + Ciphertext)
}

/**
 * Encrypts user identity keys and device state into an encrypted key vault blob (DEC-02).
 */
export async function encryptKeyVault(
  payload: Record<string, unknown>,
  passphrase: string
): Promise<EncryptedKeyVaultDto> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKeyScrypt(passphrase, salt, 32);

  const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = encryptAesGcm(serialized, derivedKey);
  const packed = packEncryptedBuffer(encrypted);

  return {
    version: 1,
    salt: salt.toString('base64'),
    encryptedVaultBlob: packed.toString('base64'),
  };
}

/**
 * Decrypts user key vault using user passphrase.
 */
export async function decryptKeyVault<T = Record<string, unknown>>(
  vault: { version?: number; salt: string; encryptedVaultBlob: string },
  passphrase: string
): Promise<T> {
  const salt = Buffer.from(vault.salt, 'base64');
  const packed = Buffer.from(vault.encryptedVaultBlob, 'base64');
  const { iv, tag, ciphertext } = unpackEncryptedBuffer(packed);

  const derivedKey = await deriveKeyScrypt(passphrase, salt, 32);
  const decryptedBuf = decryptAesGcm(ciphertext, derivedKey, iv, tag);

  return JSON.parse(decryptedBuf.toString('utf8')) as T;
}

