import {
  generateKeyPairSync,
  diffieHellman as nodeDiffieHellman,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';

export interface KeyPairPem {
  publicKey: string;
  privateKey: string;
}

/**
 * Generates an X25519 keypair for Diffie-Hellman key exchange.
 */
export function generateX25519KeyPair(): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Generates an Ed25519 keypair for digital signatures (Identity Keys).
 */
export function generateEd25519KeyPair(): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Computes shared secret using X25519 Diffie-Hellman.
 */
export function computeSharedSecret(
  privateKeyPem: string,
  publicKeyPem: string
): Buffer {
  const priv = createPrivateKey(privateKeyPem);
  const pub = createPublicKey(publicKeyPem);
  return nodeDiffieHellman({ privateKey: priv, publicKey: pub });
}

/**
 * Signs payload using Ed25519 private key.
 */
export function signEd25519(data: Buffer | string, privateKeyPem: string): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const priv = createPrivateKey(privateKeyPem);
  return sign(null, buf, priv);
}

/**
 * Verifies Ed25519 signature against public key.
 */
export function verifyEd25519(
  data: Buffer | string,
  signature: Buffer,
  publicKeyPem: string
): boolean {
  try {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const pub = createPublicKey(publicKeyPem);
    return verify(null, buf, pub, signature);
  } catch {
    return false;
  }
}
