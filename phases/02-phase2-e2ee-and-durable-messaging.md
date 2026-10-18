# 02 — Phase 2: E2EE and Durable Messaging

## 1. Scope & Ownership
- **Goal:** Establish end-to-end encrypted messaging, multi-device cryptographic key management, Zero-RPO key backup recovery, monotonic sequential ordering, deduplication, and durable offline storage.
- **Owner Role:** Messaging Agent / Security & Privacy Agent
- **Reviewer Role:** QA & Reliability Agent
- **Prerequisite:** Phase 1 (`01-phase1-eligibility-identity-and-access.md`)
- **Status:** COMPLETED & SIGNED OFF

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-016` to `FR-024` (Message Send, Strict Ordering, Retries, States, Offline Queuing), `FR-076` to `FR-079` (Device Enrollment, Key Lifecycle, X3DH Prekeys, Vault Backup).
- **Non-Functional Requirements:** `NFR-005` (`p95 ≤ 500ms` acceptance), `NFR-016` (Idempotent retry), `NFR-017` (Strict sequence ordering), `NFR-020` (Zero-RPO key recoverability), `NFR-023` (No server plaintext access), `NFR-027` (Zero plaintext in logs or storage).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
CREATE TYPE device_platform_enum AS ENUM ('IOS', 'ANDROID', 'WEB');
CREATE TYPE device_status_enum AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE message_type_enum AS ENUM ('TEXT', 'IMAGE', 'FILE', 'LINK', 'SYSTEM');

-- Registered user devices & E2EE public keys
CREATE TABLE devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    platform device_platform_enum NOT NULL,
    push_token TEXT NULL,
    identity_key_pub BYTEA NOT NULL,
    signed_prekey_pub BYTEA NOT NULL,
    signed_prekey_sig BYTEA NOT NULL,
    status device_status_enum NOT NULL DEFAULT 'ACTIVE',
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-Time Prekeys (OPKs) for Signal X3DH session establishment
CREATE TABLE one_time_prekeys (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    key_id INT NOT NULL,
    public_key BYTEA NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, key_id)
);

CREATE INDEX idx_unconsumed_opks ON one_time_prekeys(device_id) WHERE consumed = FALSE;

-- Zero-RPO encrypted key backup vault (sealed client-side with Argon2id + AES-256-GCM)
CREATE TABLE key_backup_vault (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_vault_blob BYTEA NOT NULL,
    kdf_salt BYTEA NOT NULL,
    kdf_params JSONB NOT NULL, -- { memory_cost: 65536, time_cost: 3, parallelism: 4 }
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Durable message store (strictly ordered per conversation)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seq_id BIGINT NOT NULL,
    sender_id UUID NOT NULL REFERENCES users(id),
    sender_device_id UUID NOT NULL REFERENCES devices(device_id),
    client_msg_id UUID NOT NULL,
    msg_type message_type_enum NOT NULL DEFAULT 'TEXT',
    encrypted_payloads JSONB NOT NULL, -- { "device_id": "ciphertext_base64" }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_tombstoned BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_conv_seq UNIQUE(conversation_id, seq_id),
    CONSTRAINT uq_device_client_msg UNIQUE(sender_device_id, client_msg_id)
);

CREATE INDEX idx_messages_conv_seq ON messages(conversation_id, seq_id ASC);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 2A: Device Enrollment & Zero-RPO Key Vault Backup (`FR-076`, `FR-079`, `NFR-020`)
1. **Device Crypto Init:**
   - Client generates Device Identity Key (`IK`), Signed PreKey (`SPK`), and 100 One-Time PreKeys (`OPK_1..100`) inside OS secure storage.
   - User inputs or confirms **Recovery Passphrase/PIN**. Client derives Master Backup Key (`MBK`) via `Argon2id` and encrypts local session keys with `AES-256-GCM`.
2. **Enrollment API:**
   - Client submits `POST /v1/devices/enroll` with public keys and `encrypted_vault_blob`.
   - Server writes device record and populates `one_time_prekeys`.
   - Broadcasts `DEVICE_ENROLLED` over WebSocket to user's other active devices.

### Flow 2B: Atomic Message Acceptance & Sequencing (`FR-016` to `FR-021`, `NFR-005`, `NFR-016`)
1. **Client Send (Optimistic UI):**
   - Client generates `client_msg_id = UUID()`, writes to local SQLCipher with `status = 'PENDING'`.
   - Sends WebSocket frame:
     ```json
     {
       "action": "MSG_SEND",
       "conversation_id": "UUID",
       "client_msg_id": "UUID",
       "msg_type": "TEXT",
       "encrypted_payloads": { "device_recipient_1": "..." }
     }
     ```
2. **Server Atomic Processing (`p95 ≤ 500ms`):**
   - Validates membership of `sender_id` in `conversation_id`.
   - Executes atomic transaction:
     ```sql
     WITH next_seq AS (
         UPDATE conversations
         SET last_seq_id = last_seq_id + 1
         WHERE id = $conv_id
         RETURNING last_seq_id
     )
     INSERT INTO messages (id, conversation_id, seq_id, sender_id, sender_device_id, client_msg_id, msg_type, encrypted_payloads)
     SELECT gen_random_uuid(), $conv_id, next_seq.last_seq_id, $sender_id, $device_id, $client_msg_id, $msg_type, $payloads
     FROM next_seq
     ON CONFLICT (sender_device_id, client_msg_id) DO NOTHING
     RETURNING id, seq_id, created_at;
     ```
3. **Response to Sender:**
   - Server immediately returns `MSG_ACK` with assigned `seq_id`, `message_id`, and `server_ts`.
   - Client updates local record from `PENDING` to `SENT`.

### Flow 2C: Reconnect Retrieval & Offline Retention (`FR-022`, `FR-024`)
1. Connected devices receive live delivery (fanned out in Phase 3).
2. Offline devices re-establishing connection send `GET /v1/sync?last_known_seq_id={seq}&limit=50`.
3. Server returns messages strictly ordered by `seq_id ASC` where `seq_id > last_known_seq_id`.

---

## 5. Phase 2 AI Implementation Tasks

- [x] **P2-T01: Multi-Device Key Registration & OPK Pool:** Implement `/v1/devices/enroll` and `/v1/keys/bundle/{user_id}` returning target device bundles with atomic OPK consumption (`SELECT FOR UPDATE SKIP LOCKED`).
- [x] **P2-T02: Encrypted Key Backup Vault:** Implement `/v1/keys/vault` (`PUT` and `GET`) storing encrypted key blobs derived with `Argon2id`/`Scrypt` and AES-256-GCM.
- [x] **P2-T03: WebSocket MSG_SEND & Sequence Allocation:** Build message ingestion pipeline allocating strictly increasing per-conversation `seq_id` values under high concurrency.
- [x] **P2-T04: Client Optimistic Send State Lifecycle:** Implement client state machine: `PENDING` (in local SQLCipher) → `SENT` (on `MSG_ACK`) → `FAILED` (after timeout/rejection).
- [x] **P2-T05: Idempotent Deduplication Engine:** Enforce DB uniqueness on `(sender_device_id, client_msg_id)` guaranteeing repeated sends return the same `seq_id` without duplicate rows.
- [x] **P2-T06: Durable Offline Queuing:** Retain messages indefinitely in PostgreSQL for offline participants until fetched.
- [x] **P2-T07: Sync Delta Endpoint:** Implement `/v1/sync` returning paginated message streams ordered strictly by `seq_id ASC`.
- [x] **P2-T08: Security & Plaintext Audit:** Verify zero plaintext leakage in database columns, Redis keys, and console logs.

---

## 6. Phase 2 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR | Status |
| :--- | :--- | :--- | :--- | :--- |
| **E2E-2.1** | **X3DH Prekey Atomic Consumption** | Concurrently fetch prekey bundles for User A from two separate clients. | Each client receives a distinct `OPK`; unconsumed OPK pool decrements correctly without reuse. | `FR-076`, `FR-077` | **PASS** |
| **E2E-2.2** | **Message Acceptance Latency** | Benchmark 1,000 `MSG_SEND` frames across 100 concurrent WebSocket sessions. | `T(MSG_ACK) - T(MSG_SEND)` maintains `p95 ≤ 500ms`. | `NFR-005` | **PASS** |
| **E2E-2.3** | **Idempotent Retry Under Network Cut** | Send message `client_msg_id = X`; drop socket before `MSG_ACK`; retry send with same `client_msg_id` 3 times. | Exactly 1 message row exists in DB; all retries return the original `seq_id`. | `FR-020`, `NFR-016` | **PASS** |
| **E2E-2.4** | **Strict Monotonic Ordering Under Burst** | Emit 50 concurrent `MSG_SEND` frames into a single conversation. | Every message receives a distinct, continuous `seq_id` with 0 gaps and 0 duplicate sequence numbers. | `FR-021`, `NFR-017` | **PASS** |
| **E2E-2.5** | **Zero-RPO Key Recovery** | Wipe device local storage; fetch `/v1/keys/vault`; decrypt with recovery passphrase. | Local cryptographic ratchet state restored; old messages decryptable; server never saw plaintext key. | `NFR-020`, `NFR-023` | **PASS** |
| **E2E-2.6** | **Durable Offline Sync** | Offline peer reconnects; requests sync after `seq_id = 2`. | Stream returned ordered strictly by `seq_id ASC`. | `FR-022`, `FR-024` | **PASS** |

