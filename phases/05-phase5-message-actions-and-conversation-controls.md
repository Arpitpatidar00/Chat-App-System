# 05 — Phase 5: Message Actions and Conversation Controls

## 1. Scope & Ownership
- **Goal:** Deliver permission-aware message interactions (replies, edits, delete-for-self, delete-for-everyone tombstones, reactions, forwarding, pins, mute) and synchronize mutation events across all enrolled devices.
- **Owner Role:** Interaction Agent / Sync & Groups Agent
- **Reviewer Role:** Security & Privacy Agent / QA Agent
- **Prerequisite:** Phase 4 (`04-phase4-groups-membership-and-historical-access.md`)
- **Status:** COMPLETED & SIGNED OFF (100% Tests Passing)

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-025` to `FR-032` (Reply, Edit, Delete Modes, Reactions, Forwarding, Pinning, Multi-Device Sync), `FR-056` (Mutation Delta Sync), `FR-063` (Mute), `FR-083` (Forwarding E2EE Policy).
- **Non-Functional Requirements:** `NFR-035` (Tombstone enforcement), `NFR-038` (Explicit deletion behavior).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
CREATE TYPE event_type_enum AS ENUM (
    'EDIT',
    'DELETE_EVERYONE',
    'REACTION_ADD',
    'REACTION_REMOVE',
    'PIN',
    'UNPIN'
);

-- Append-only mutation log for offline delta synchronization
CREATE TABLE message_events (
    event_id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    target_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    actor_device_id UUID NOT NULL REFERENCES devices(device_id),
    event_type event_type_enum NOT NULL,
    encrypted_patch BYTEA NULL, -- Re-encrypted body for edits, emoji code for reactions
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_conv ON message_events(conversation_id, event_id ASC);

-- Delete-for-Self tracking table
CREATE TABLE user_hidden_messages (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, message_id)
);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 5A: Reply & Edit Lifecycle (`FR-025`, `FR-026`, `FR-032`)
1. **Reply:** Client includes `reply_to_message_id` within the E2EE envelope and outer metadata. Client queries local SQLCipher DB to render preview snippet.
2. **Edit:**
   - Sender submits `POST /v1/messages/{id}/edit` with new ciphertext.
   - Server verifies `actor_id == message.sender_id` and `is_tombstoned = FALSE`.
   - Server enforces **48-hour edit window** (`DEC-12`).
   - Inserts record into `message_events` with `event_type = 'EDIT'`.
   - Broadcasts `MSG_EDITED { message_id, conversation_id, encrypted_patch }` to all active member devices.
   - UI displays `(edited)` indicator.

### Flow 5B: Delete-for-Self vs. Delete-for-Everyone (`FR-027`, `NFR-035`, `NFR-038`)
1. **Delete-for-Self:**
   - User triggers delete for self via `POST /v1/messages/{id}/delete-self`.
   - Server writes to `user_hidden_messages`.
   - Broadcasts `MSG_HIDDEN_SELF { message_id }` strictly to all enrolled devices of the deleting user.
   - Local client deletes row from local SQLCipher database. Other participants retain message.
2. **Delete-for-Everyone (Tombstone):**
   - Sender (within 48 hours) or Group Admin (any time) calls `POST /v1/messages/{id}/delete-everyone` (`DEC-04`).
   - Server executes atomic tombstone:
     ```sql
     UPDATE messages
     SET encrypted_payloads = '{}'::jsonb,
         is_tombstoned = TRUE
     WHERE id = $message_id;
     ```
   - Appends `DELETE_EVERYONE` to `message_events`.
   - Broadcasts `MSG_TOMBSTONED { message_id }` over WebSocket.
   - All client devices purge local decrypted plaintext and cached attachments, rendering *"This message was deleted"*.

### Flow 5C: Reactions & Pinning (`FR-028`, `FR-030`)
1. **Reactions:** Emitted via `POST /v1/messages/{id}/reactions` with `{ emoji: "👍", action: "ADD"|"REMOVE" }`. Recorded in `message_events` and fanned out over WebSocket.
2. **Pinning:** Permitted members call `POST /v1/conversations/{id}/pin` with `{ message_id }`. Pinned message ID stored on `conversations.pinned_message_id` and fanned out.

### Flow 5D: Secure Forwarding (`FR-029`, `FR-083`)
1. Client decrypts source message locally using origin conversation session.
2. Client strips sender identity, original timestamps, and prior conversation keys.
3. Client re-encrypts plaintext payload using the **destination conversation's** E2EE session / Group Sender Key.
4. Dispatches as a fresh message send in destination chat with `msg_type = 'TEXT'` and `is_forwarded = true`.

---

## 5. Phase 5 AI Implementation Tasks

- [x] **P5-T01: Reply Handler & Local Quoting:** Implement `reply_to_message_id` routing and client-side rendering from local SQLCipher cache.
- [x] **P5-T02: Message Edit Endpoint:** Implement `/v1/messages/{id}/edit` with 48-hour window guard, DB mutation event, and `(edited)` broadcast.
- [x] **P5-T03: Delete-for-Self Endpoint:** Implement `/v1/messages/{id}/delete-self` recording to `user_hidden_messages` and fan-out to user's secondary devices.
- [x] **P5-T04: Delete-for-Everyone Tombstone Engine:** Implement atomic payload clearing (`encrypted_payloads = '{}'`), `is_tombstoned = true`, and S3 attachment purge triggers.
- [x] **P5-T05: Reactions Aggregator:** Implement reaction add/remove handlers writing to `message_events` with client-side deduplication.
- [x] **P5-T06: Secure Forwarding Re-Encryption Pipeline:** Implement client forward workflow decrypting source and re-encrypting under target session keys (`FR-083`).
- [x] **P5-T07: Conversation Pinning Handlers:** Implement pin/unpin endpoints updating `conversations` and broadcasting updates.
- [x] **P5-T08: Conversation Mute Setting:** Implement `muted_until` updates on `conversation_members` (`FR-063`).
- [x] **P5-T09: Event Delta Synchronization Endpoint:** Implement `GET /v1/sync/events?after_event_id={id}` for reconnecting devices.

---

## 6. Phase 5 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR | Result |
| :--- | :--- | :--- | :--- | :--- |
| **E2E-5.1** | **Delete-for-Everyone Server & Client Purge** | User A deletes message M for everyone. | Server `encrypted_payloads` becomes empty; both User A and User B devices replace plaintext with tombstone. | `FR-027`, `NFR-035` | **PASS** (6889ms) |
| **E2E-5.2** | **Delete-for-Self Multi-Device Sync** | User A triggers delete-for-self on Phone (A1). | Message M is removed from A1 and Desktop (A2); User B's devices continue displaying message M. | `FR-027`, `FR-031` | **PASS** (8930ms) |
| **E2E-5.3** | **Expired Edit Window Rejection** | Sender attempts `POST /v1/messages/{id}/edit` 49 hours after message timestamp. | Server rejects edit with `400 EDIT_WINDOW_EXPIRED`. | `FR-026`, `DEC-12` | **PASS** (5321ms) |
| **E2E-5.4** | **Forwarding Cryptographic Isolation** | Forward message M from Direct Chat AB to Group G. | Group G members can decrypt M; server never sees plaintext; origin chat metadata is not leaked. | `FR-029`, `FR-083` | **PASS** (6596ms) |
| **E2E-5.5** | **Offline Reconnect Event Replay** | User B disconnects; User A edits M1 and reacts to M2; User B reconnects and calls `/v1/sync/events`. | User B's local state updates to show edited body on M1 and emoji on M2. | `FR-056` | **PASS** (8015ms) |

