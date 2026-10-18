import { MessageDTO, MessageAckDTO } from './message.types.js';
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
  | { action: 'MSG_TOMBSTONED'; messageId: string }
  | { action: 'PONG' };
