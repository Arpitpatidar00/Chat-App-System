import { randomBytes } from 'node:crypto';
import { encryptAesGcm, decryptAesGcm } from './aes-gcm.js';
import { deriveKeyScrypt } from './kdf.js';

export interface EncryptedKeyVaultDto {
  version: number;
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
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

  return {
    version: 1,
    salt: salt.toString('hex'),
    iv: encrypted.iv.toString('hex'),
    tag: encrypted.tag.toString('hex'),
    ciphertext: encrypted.ciphertext.toString('hex'),
  };
}

/**
 * Decrypts user key vault using user passphrase.
 */
export async function decryptKeyVault<T = Record<string, unknown>>(
  vault: EncryptedKeyVaultDto,
  passphrase: string
): Promise<T> {
  const salt = Buffer.from(vault.salt, 'hex');
  const iv = Buffer.from(vault.iv, 'hex');
  const tag = Buffer.from(vault.tag, 'hex');
  const ciphertext = Buffer.from(vault.ciphertext, 'hex');

  const derivedKey = await deriveKeyScrypt(passphrase, salt, 32);
  const decryptedBuf = decryptAesGcm(ciphertext, derivedKey, iv, tag);

  return JSON.parse(decryptedBuf.toString('utf8')) as T;
}
