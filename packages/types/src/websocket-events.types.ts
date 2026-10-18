import { MessageDTO, MessageAckDTO, EncryptedPayloads } from './message.types.js';
import { ReceiptAckDTO, ReadUpToDTO } from './receipt.types.js';
import { TypingIndicatorDTO } from './presence.types.js';

export type InboundWSFrame =
  | ({ action: 'MSG_SEND' } & Record<string, unknown>)
  | ReceiptAckDTO
  | ReadUpToDTO
  | TypingIndicatorDTO
  | { action: 'PING' };

export type OutboundWSFrame =
  | MessageAckDTO
  | { action: 'MSG_EVENT'; message: MessageDTO }
  | { action: 'RECEIPT_EVENT'; messageId: string; userId: string; status: number; timestamp: string }
  | { action: 'SELF_READ_SYNC'; conversationId: string; maxSeqId: string }
  | { action: 'USER_TYPING'; conversationId: string; userId: string }
  | { action: 'MEMBER_REMOVED'; conversationId: string; userId: string }
  | { action: 'MSG_TOMBSTONED'; messageId: string; conversationId: string }
  | { action: 'MSG_HIDDEN_SELF'; messageId: string; conversationId: string }
  | { action: 'MSG_EDITED'; messageId: string; conversationId: string; encryptedPayloads: EncryptedPayloads }
  | { action: 'MSG_REACTION'; messageId: string; conversationId: string; userId: string; emoji: string; reactionAction: 'ADD' | 'REMOVE' }
  | { action: 'CONV_PIN_UPDATE'; conversationId: string; messageId: string; pinAction: 'PIN' | 'UNPIN'; actorId: string }
  | { action: 'CONV_MUTE_UPDATE'; conversationId: string; mutedUntil: string | null }
  | { action: 'PONG' };
