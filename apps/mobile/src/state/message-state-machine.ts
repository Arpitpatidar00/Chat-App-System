import type { MessageTransmissionStatus } from '@chat/types';

export type StateMachineEvent =
  | { type: 'ENQUEUE'; clientMsgId: string; plaintext: string }
  | { type: 'START_SEND' }
  | { type: 'ACK_RECEIVED'; serverMessageId: string; seqId: string }
  | { type: 'DELIVERED_RECEIVED' }
  | { type: 'READ_RECEIVED' }
  | { type: 'FAIL'; error: string }
  | { type: 'RETRY' };

export interface MessageStateContext {
  clientMsgId: string;
  serverMessageId?: string;
  seqId?: string;
  plaintext: string;
  status: MessageTransmissionStatus;
  retryCount: number;
  lastError?: string;
}

export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Calculates exponential backoff delay in milliseconds.
 * Base: 500ms, Multiplier: 2^retries, Jitter: ±10%
 */
export function calculateBackoffMs(retryCount: number): number {
  const base = 500 * Math.pow(2, retryCount);
  const jitter = (Math.random() * 0.2 - 0.1) * base; // ±10%
  return Math.min(Math.round(base + jitter), 15000); // Max cap 15s
}

export function transitionMessageState(
  ctx: MessageStateContext,
  event: StateMachineEvent
): MessageStateContext {
  switch (ctx.status) {
    case 'PENDING':
      if (event.type === 'START_SEND') {
        return { ...ctx, status: 'PENDING' };
      }
      if (event.type === 'ACK_RECEIVED') {
        return {
          ...ctx,
          status: 'SENT',
          serverMessageId: event.serverMessageId,
          seqId: event.seqId,
        };
      }
      if (event.type === 'FAIL') {
        return {
          ...ctx,
          status: 'FAILED',
          lastError: event.error,
        };
      }
      return ctx;

    case 'SENT':
      if (event.type === 'DELIVERED_RECEIVED') {
        return { ...ctx, status: 'DELIVERED' };
      }
      if (event.type === 'READ_RECEIVED') {
        return { ...ctx, status: 'READ' };
      }
      return ctx;

    case 'DELIVERED':
      if (event.type === 'READ_RECEIVED') {
        return { ...ctx, status: 'READ' };
      }
      return ctx;

    case 'FAILED':
      if (event.type === 'RETRY') {
        if (ctx.retryCount >= MAX_RETRY_ATTEMPTS) {
          return ctx;
        }
        return {
          ...ctx,
          status: 'PENDING',
          retryCount: ctx.retryCount + 1,
          lastError: undefined,
        };
      }
      return ctx;

    case 'READ':
    default:
      return ctx;
  }
}
