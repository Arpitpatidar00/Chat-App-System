export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK' | 'SYSTEM';
export type MessageTransmissionStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface EncryptedPayloads {
  [deviceId: string]: string; // base64 encoded ciphertext
}

export interface SendMessageRequestDTO {
  conversationId: string;
  clientMsgId: string;
  msgType: MessageType;
  encryptedPayloads: EncryptedPayloads;
  replyToMessageId?: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  seqId: string;
  senderId: string;
  senderDeviceId: string;
  clientMsgId: string;
  msgType: MessageType;
  encryptedPayloads: EncryptedPayloads;
  createdAt: string;
  isTombstoned: boolean;
  isEdited?: boolean;
}

export interface MessageAckDTO {
  action: 'MSG_ACK';
  clientMsgId: string;
  messageId: string;
  seqId: string;
  createdAt: string;
  status: 'SENT';
}
