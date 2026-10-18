# 03 — Phase 3: Realtime Delivery, Receipts, and Device Sync

## 1. Scope & Ownership
- **Goal:** Deliver live WebSocket fan-out, monotonic receipt transitions (sent → delivered → read), multi-device unread badge synchronization, Redis presence aggregation with visibility controls, and typing indicator auto-expiration.
- **Owner Role:** Sync & Groups Agent / Messaging Agent
- **Reviewer Role:** QA & Reliability Agent
- **Prerequisite:** Phase 2 (`02-phase2-e2ee-and-durable-messaging.md`)
- **Status:** READY

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-031` (Multi-Device Delivery), `FR-033` to `FR-038` (Monotonic Receipts & Read Lists), `FR-039` to `FR-045` (Presence, Last Seen, Visibility Filters, Typing Indicators).
- **Non-Functional Requirements:** `NFR-006` / `NFR-007` (`p95 ≤ 1s`, `p99 ≤ 3s` live delivery), `NFR-008` (`p95 ≤ 2s` presence/typing propagation), `NFR-030` (Presence privacy), `NFR-033` (Receipt monotonic consistency), `NFR-034` (Stale typing event rejection).

---

## 3. Server Data Models (PostgreSQL & Redis)

```sql
-- Monotonic message receipts per recipient user
CREATE TABLE message_receipts (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status SMALLINT NOT NULL DEFAULT 1, -- 1=SENT, 2=DELIVERED, 3=READ
    delivered_at TIMESTAMPTZ NULL,
    read_at TIMESTAMPTZ NULL,
    PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_receipts_conv_user ON message_receipts(conversation_id, user_id, status);
```

### Redis Real-Time State Keys
- **Presence Hash:** `presence:user:{user_id}:devices` → Field: `{device_id}`, Value: `{last_heartbeat_epoch_ms}` (45s TTL per device).
- **Typing Key:** `typing:conv:{conv_id}:user:{user_id}` → String: `"active"` (5s auto-expiring TTL; client emission throttled to 3s).
- **User Socket Registry:** `routing:user:{user_id}:devices` → Set of `{server_instance_id:connection_id}` for WebSocket push routing.

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 3A: Live Fan-Out to Connected Devices (`p95 ≤ 1s`, `p99 ≤ 3s`)
1. Upon message acceptance (`MSG_ACK` committed), server retrieves all active devices of conversation members from Redis `routing:user:{id}:devices`.
2. Server dispatches WebSocket frame `MSG_EVENT` to every recipient device (and sender's other enrolled devices for multi-device sync, `FR-031`).
3. Recipient device receives frame, decrypts envelope on-device, inserts into local SQLCipher, and immediately emits:
   ```json
   { "action": "RECEIPT_ACK", "message_id": "UUID", "status": 2 }
   ```
4. Server transitions receipt status to `2 (DELIVERED)` and notifies the sender.

### Flow 3B: Monotonic Receipt Machine & Multi-Device Read Sync (`FR-033` to `FR-038`)
1. When User B opens a conversation on `Device B1`, `B1` dispatches:
   ```json
   { "action": "READ_UP_TO", "conversation_id": "UUID", "max_seq_id": 142 }
   ```
2. Server executes monotonic update:
   ```sql
   INSERT INTO message_receipts (conversation_id, message_id, user_id, status, read_at)
   SELECT conversation_id, id, $user_id, 3, NOW()
   FROM messages
   WHERE conversation_id = $conv_id AND seq_id <= $max_seq_id
   ON CONFLICT (message_id, user_id)
   DO UPDATE SET status = GREATEST(message_receipts.status, EXCLUDED.status),
                 read_at = COALESCE(message_receipts.read_at, EXCLUDED.read_at);
   ```
   *Guarantee (`NFR-033`):* Status can never transition backwards (e.g., from `3` back to `2`) even if a delayed delivery ack arrives later from an offline secondary device.
3. Server emits `SELF_READ_SYNC { conversation_id, max_seq_id }` to User B's other active devices (e.g., `Device B2`), causing their unread badge counts to decrement instantly.

### Flow 3C: Multi-Device Presence Aggregator & Typing Indicator (`FR-039` to `FR-045`)
1. **Heartbeat:** Connected clients emit `PING` every 20 seconds.
2. **Aggregation:** User is evaluated as `ONLINE` if at least one enrolled device has a heartbeat recorded in Redis within the last 45 seconds (`now - heartbeat <= 45s`). When the last device disconnects or expires, user state flips to `OFFLINE` with `last_seen_at = NOW()`.
3. **Privacy Filter (`NFR-030`):** Before presence broadcasts or responses to `GET /v1/presence/{id}`, server confirms:
   - Requester and target share an active conversation.
   - Target has not blocked requester.
   - Target `presence_privacy` setting allows visibility (`EVERYONE`, `CONTACTS`, or `NOBODY`).
4. **Typing Indicator (`FR-043`, `FR-044`):** Client emits `TYPING_START` (throttled to 1 per 3s). Server sets Redis 5s auto-expiring key and broadcasts `USER_TYPING` to conversation peers (`p95 ≤ 2s`).

---

## 5. Phase 3 AI Implementation Tasks

- [ ] **P3-T01: Realtime Fan-Out Dispatcher:** Implement Redis Pub/Sub routing delivering incoming messages to all connected devices of members (`p95 ≤ 1s`).
- [ ] **P3-T02: Monotonic Receipt State Machine:** Implement `RECEIPT_ACK` and `READ_UP_TO` endpoints enforcing monotonic progression `1 (SENT) → 2 (DELIVERED) → 3 (READ)`.
- [ ] **P3-T03: Multi-Device Unread Count Synchronization:** Broadcast `SELF_READ_SYNC` frames clearing badges across secondary enrolled devices.
- [ ] **P3-T04: Redis Presence Aggregator & Dead-Socket Reaper:** Implement 20s heartbeat updater and 45s reaper transitioning dead sockets to `OFFLINE`.
- [ ] **P3-T05: Presence Privacy Filter:** Enforce user visibility preferences (`EVERYONE`, `CONTACTS`, `NOBODY`) and blocklist checks.
- [ ] **P3-T06: Typing Indicator TTL Broadcast:** Implement 5s auto-expiring typing broadcast with client-side 3s debounce limiter.
- [ ] **P3-T07: Edge-Case Test Suite:** Author automated tests for delayed delivery acks, out-of-order events, and unclean socket drops.

---

## 6. Phase 3 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR |
| :--- | :--- | :--- | :--- |
| **E2E-3.1** | **Live Delivery Latency Benchmark** | Measure live WebSocket delivery across 100 connected recipients. | `T(Recipient WS Receive) - T(Server Accept)` passes `p95 ≤ 1.0s` and `p99 ≤ 3.0s`. | `NFR-006`, `NFR-007` |
| **E2E-3.2** | **Receipt Monotonicity Under Out-of-Order Packets** | Mark message M as `READ` on Device B1. Inject delayed `DELIVERED` ack for M from Device B2 5 seconds later. | Database receipt status remains `3 (READ)`; status is never downgraded. | `FR-038`, `NFR-033` |
| **E2E-3.3** | **Multi-Device Unread Clearing** | Send 5 messages to User B. User B reads chat on Phone (Device B1). | Desktop (Device B2) unread badge clears immediately upon receiving `SELF_READ_SYNC`. | `FR-035`, `FR-037` |
| **E2E-3.4** | **Ungraceful Socket Drop Detection** | Connect User A on 2 devices. Kill Device A1 interface without TCP FIN. | User A remains `ONLINE` via Device A2. Kill Device A2; User A flips to `OFFLINE` within ≤ 45s. | `FR-041`, `FR-042` |
| **E2E-3.5** | **Typing Expiration Without Clean Stop** | Send `TYPING_START` without follow-up messages or `TYPING_STOP`. | Typing status in recipient UI automatically expires and disappears after 5 seconds. | `FR-044`, `NFR-034` |
