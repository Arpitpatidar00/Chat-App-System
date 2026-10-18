import {
  transitionMessageState,
  type MessageStateContext,
} from '../../../state/message-state-machine.js';
import { clientSessionManager } from '../../../crypto/session-manager.js';
import type { SendMessageRequestDTO } from '@chat/types';
import { randomUUID } from 'node:crypto';

export interface UseMessageSendOptions {
  conversationId: string;
  senderId: string;
  senderDeviceId: string;
  recipients: Array<{ userId: string; deviceId: string }>;
  apiBaseUrl: string;
}

export class MessageSender {
  constructor(private readonly options: UseMessageSendOptions) {}

  public async prepareAndSendMessage(
    plaintext: string
  ): Promise<{ state: MessageStateContext; payload: SendMessageRequestDTO }> {
    const clientMsgId = randomUUID();

    // 1. Initialize local pending state
    let state: MessageStateContext = {
      clientMsgId,
      plaintext,
      status: 'PENDING',
      retryCount: 0,
    };

    // 2. Encrypt per-recipient device payload using Double Ratchet / Session keys
    const encryptedPayloads: Record<string, string> = {};
    for (const recipient of this.options.recipients) {
      const encrypted = clientSessionManager.encryptForDevice(
        recipient.userId,
        recipient.deviceId,
        plaintext
      );
      encryptedPayloads[recipient.deviceId] = JSON.stringify(encrypted);
    }

    const payload: SendMessageRequestDTO = {
      conversationId: this.options.conversationId,
      clientMsgId,
      msgType: 'TEXT',
      encryptedPayloads,
    };

    return { state, payload };
  }
}
