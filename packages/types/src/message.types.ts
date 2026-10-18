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

export interface EditMessageRequestDTO {
  encryptedPayloads: EncryptedPayloads;
}

export interface ReactionRequestDTO {
  emoji: string;
  action: 'ADD' | 'REMOVE';
}

export interface PinRequestDTO {
  messageId: string;
  action: 'PIN' | 'UNPIN';
}

export interface MuteConversationRequestDTO {
  mutedUntil: string | null;
}

export type EventTypeDTO =
  | 'EDIT'
  | 'DELETE_EVERYONE'
  | 'REACTION_ADD'
  | 'REACTION_REMOVE'
  | 'PIN'
  | 'UNPIN';

export interface MessageEventDTO {
  eventId: string;
  conversationId: string;
  targetMessageId: string;
  actorId: string;
  actorDeviceId: string;
  eventType: EventTypeDTO;
  encryptedPatch?: string | null;
  createdAt: string;
}

export interface SyncEventsResponseDTO {
  events: MessageEventDTO[];
}

export interface PagedHistoryQueryDTO {
  limit?: string;
  before_seq_id?: string;
  beforeSeqId?: string;
}

export interface PagedHistoryResponseDTO {
  messages: MessageDTO[];
  hasMore: boolean;
  nextCursor: string | null;
}
