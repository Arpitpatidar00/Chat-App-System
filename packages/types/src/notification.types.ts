export interface ZeroPlaintextPushPayload {
  conversation_id: string;
  message_id: string;
  seq_id: number;
  encrypted_preview_envelope: string; // base64_ciphertext
}

export interface ClearNotificationPushPayload {
  action: 'CLEAR_NOTIFICATION';
  conversation_id: string;
  max_seq_id: number;
}

export type OutboundPushPayload = ZeroPlaintextPushPayload | ClearNotificationPushPayload;
