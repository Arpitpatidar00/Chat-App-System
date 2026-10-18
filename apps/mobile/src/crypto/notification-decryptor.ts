import { decryptAesGcm, encryptAesGcm } from '@chat/crypto';
import type { ZeroPlaintextPushPayload } from '@chat/types';

export interface DecryptedNotificationAlert {
  title: string;
  body: string;
  conversationId: string;
  messageId: string;
  seqId: number;
}

export interface PreviewEnvelopeData {
  senderName: string;
  previewText: string;
  messageType?: string;
}

/**
 * P7-T06: Client iOS / Android Background Notification Decryptor (FR-067).
 * Executes in OS background worker (iOS Notification Service Extension / Android FirebaseMessagingService).
 * Decrypts zero-plaintext payload locally using on-device cryptographic key.
 */
export class NotificationDecryptor {
  /**
   * Helper to construct an encrypted preview envelope (used by sender or server with sender's key).
   */
  public static createEncryptedPreviewEnvelope(
    data: PreviewEnvelopeData,
    encryptionKey: Buffer
  ): string {
    const plaintext = JSON.stringify(data);
    const encrypted = encryptAesGcm(plaintext, encryptionKey);
    // Bundle ciphertext, iv, tag into a serialized base64 envelope
    const envelope = JSON.stringify({
      c: encrypted.ciphertext.toString('base64'),
      i: encrypted.iv.toString('base64'),
      t: encrypted.tag.toString('base64'),
    });
    return Buffer.from(envelope, 'utf-8').toString('base64');
  }

  /**
   * Decrypts an incoming push notification envelope using the local device key.
   */
  public static decryptNotification(
    payload: ZeroPlaintextPushPayload,
    decryptionKey: Buffer
  ): DecryptedNotificationAlert {
    const rawEnvelope = Buffer.from(payload.encrypted_preview_envelope, 'base64').toString('utf-8');
    const { c, i, t } = JSON.parse(rawEnvelope);

    const ciphertext = Buffer.from(c, 'base64');
    const iv = Buffer.from(i, 'base64');
    const tag = Buffer.from(t, 'base64');

    const decryptedBuffer = decryptAesGcm(ciphertext, decryptionKey, iv, tag);
    const data = JSON.parse(decryptedBuffer.toString('utf-8')) as PreviewEnvelopeData;

    return {
      title: data.senderName,
      body: data.previewText,
      conversationId: payload.conversation_id,
      messageId: payload.message_id,
      seqId: payload.seq_id,
    };
  }
}
