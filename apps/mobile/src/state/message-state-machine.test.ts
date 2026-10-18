import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionMessageState,
  calculateBackoffMs,
  type MessageStateContext,
} from './message-state-machine.js';

test('Message State Machine: follows strict PENDING -> SENT -> DELIVERED -> READ lifecycle', () => {
  let state: MessageStateContext = {
    clientMsgId: 'msg-client-1',
    plaintext: 'Hello world',
    status: 'PENDING',
    retryCount: 0,
  };

  // 1. Receive ACK from server
  state = transitionMessageState(state, {
    type: 'ACK_RECEIVED',
    serverMessageId: 'srv-123',
    seqId: '42',
  });
  assert.equal(state.status, 'SENT');
  assert.equal(state.serverMessageId, 'srv-123');
  assert.equal(state.seqId, '42');

  // 2. Receive DELIVERED receipt
  state = transitionMessageState(state, { type: 'DELIVERED_RECEIVED' });
  assert.equal(state.status, 'DELIVERED');

  // 3. Receive READ receipt
  state = transitionMessageState(state, { type: 'READ_RECEIVED' });
  assert.equal(state.status, 'READ');
});

test('Message State Machine: transitions to FAILED on network error and allows retry with backoff', () => {
  let state: MessageStateContext = {
    clientMsgId: 'msg-client-fail',
    plaintext: 'Will fail',
    status: 'PENDING',
    retryCount: 0,
  };

  state = transitionMessageState(state, { type: 'FAIL', error: 'Network timeout' });
  assert.equal(state.status, 'FAILED');
  assert.equal(state.lastError, 'Network timeout');

  // Retry
  state = transitionMessageState(state, { type: 'RETRY' });
  assert.equal(state.status, 'PENDING');
  assert.equal(state.retryCount, 1);
  assert.equal(state.lastError, undefined);

  const delay = calculateBackoffMs(state.retryCount);
  assert.ok(delay >= 900 && delay <= 1100, `Expected backoff around 1000ms, got ${delay}`);
});
