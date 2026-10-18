import { hkdf as nodeHkdf, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const hkdfAsync = promisify(nodeHkdf);

/**
 * HKDF key derivation (RFC 5869) using SHA-256.
 * Used in Double Ratchet chain key derivation.
 */
export async function deriveHkdf(
  ikm: Buffer,
  salt: Buffer,
  info: string | Buffer,
  length: number = 32
): Promise<Buffer> {
  const derived = await hkdfAsync('sha256', ikm, salt, info, length);
  return Buffer.from(derived);
}

/**
 * Memory-hard password-based key derivation using Scrypt.
 * (N=32768, r=8, p=1 recommended for sensitive local key vault protection).
 */
export function deriveKeyScrypt(
  passphrase: string,
  salt: Buffer,
  keyLength: number = 32
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      keyLength,
      {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      },
      (err, derived) => {
        if (err) {
          reject(err);
        } else {
          resolve(derived as Buffer);
        }
      }
    );
  });
}
