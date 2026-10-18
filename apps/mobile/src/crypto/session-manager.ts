import {
  encryptAesGcm,
  decryptAesGcm,
  computeSharedSecret,
  generateX25519KeyPair,
  type EncryptedPayload,
} from '@chat/crypto';
import { randomBytes } from 'node:crypto';

export interface DeviceSession {
  recipientId: string;
  recipientDeviceId: string;
  symmetricKey: Buffer;
}

export class ClientSessionManager {
  private readonly sessions = new Map<string, DeviceSession>();

  public establishSession(
    recipientId: string,
    recipientDeviceId: string,
    sharedKey: Buffer
  ): void {
    const key = `${recipientId}:${recipientDeviceId}`;
    this.sessions.set(key, {
      recipientId,
      recipientDeviceId,
      symmetricKey: sharedKey,
    });
  }

  public encryptForDevice(
    recipientId: string,
    recipientDeviceId: string,
    plaintext: string
  ): { ciphertext: string; iv: string; tag: string } {
    const key = `${recipientId}:${recipientDeviceId}`;
    let session = this.sessions.get(key);

    if (!session) {
      // Ephemeral session key for demo/offline test
      const ephemeralKey = randomBytes(32);
      this.establishSession(recipientId, recipientDeviceId, ephemeralKey);
      session = this.sessions.get(key)!;
    }

    const encrypted = encryptAesGcm(plaintext, session.symmetricKey);

    return {
      ciphertext: encrypted.ciphertext.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      tag: encrypted.tag.toString('base64'),
    };
  }

  public decryptFromDevice(
    senderId: string,
    senderDeviceId: string,
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string
  ): string {
    const key = `${senderId}:${senderDeviceId}`;
    const session = this.sessions.get(key);

    if (!session) {
      throw new Error(`No active cryptographic session for ${key}`);
    }

    const ciphertext = Buffer.from(ciphertextBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    const decrypted = decryptAesGcm(ciphertext, session.symmetricKey, iv, tag);
    return decrypted.toString('utf8');
  }
}

export const clientSessionManager = new ClientSessionManager();
