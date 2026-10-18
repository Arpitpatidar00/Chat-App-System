# 01 — Phase 1: Eligibility, Identity, and Access

## 1. Scope & Ownership
- **Goal:** Restrict chat and content access strictly to authenticated, verified, and approved users; guarantee zero direct conversation duplicates; enforce membership boundaries and account suspensions.
- **Owner Role:** Identity & Access Agent
- **Reviewer Role:** Security & Privacy Agent / QA Agent
- **Prerequisite:** Phase 0 (`DEC-01`, `DEC-02`, `DEC-11`)
- **Status:** COMPLETED & SIGNED OFF

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-001` to `FR-005` (Identity, Verified Eligibility, Account States, Session Binding), `FR-006` to `FR-008` (Direct Chat Upsert & Anti-Duplication).
- **Non-Functional Requirements:** `NFR-021` (TLS 1.3), `NFR-022` (Authentication security), `NFR-024` (Scoped authorization), `NFR-026` (Structured log redaction).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
CREATE TYPE user_status_enum AS ENUM ('PENDING', 'VERIFIED', 'APPROVED', 'SUSPENDED', 'DELETED');
CREATE TYPE conversation_type_enum AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE member_role_enum AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'REMOVED');

-- Core users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    status user_status_enum NOT NULL DEFAULT 'PENDING',
    presence_privacy JSONB NOT NULL DEFAULT '{"visibility": "EVERYONE"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations table with deterministic pair hash for 1:1 chats
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type conversation_type_enum NOT NULL,
    direct_pair_hash TEXT UNIQUE NULL, -- SHA256(LEAST(u1, u2) || ':' || GREATEST(u1, u2))
    title TEXT NULL,
    last_seq_id BIGINT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation membership and access permissions
CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role member_role_enum NOT NULL DEFAULT 'MEMBER',
    joined_at_seq_id BIGINT NOT NULL DEFAULT 0,
    history_floor_seq_id BIGINT NOT NULL DEFAULT 1,
    removed_at_seq_id BIGINT NULL,
    muted_until TIMESTAMPTZ NULL,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversations_user ON conversation_members(user_id, conversation_id);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 1A: Eligibility Gate & Session Validation
1. **Client Request:** `POST /v1/auth/verify-session` with JWT bearer token and client device fingerprint.
2. **Gateway Middleware:**
   - Validates cryptographic signature of JWT (RS256/ES256) and expiration.
   - Queries `users.status`.
   - If `status NOT IN ('VERIFIED', 'APPROVED')`, returns `403 Forbidden (ELIGIBILITY_REQUIRED)` and immediately terminates any WebSocket upgrade handshake.
   - Binds `claims.user_id` strictly from token claims to prevent sender impersonation (`FR-004`).

### Flow 1B: Deterministic 1:1 Direct Conversation Upsert (`FR-007`)
1. User A initiates chat with User B via `POST /v1/conversations/direct` with `{ peer_user_id: "UUID-B" }`.
2. Server computes `pair_hash = SHA256(LEAST(UUID-A, UUID-B) || ':' || GREATEST(UUID-A, UUID-B))`.
3. Server executes atomic upsert:
   ```sql
   INSERT INTO conversations (type, direct_pair_hash, created_by)
   VALUES ('DIRECT', pair_hash, $user_id)
   ON CONFLICT (direct_pair_hash) DO UPDATE SET direct_pair_hash = EXCLUDED.direct_pair_hash
   RETURNING id, created_at;
   ```
4. Ensures idempotent direct conversation retrieval without race-condition duplicates.

### Flow 1C: Account Suspension & Deactivation Kill-Switch (`FR-005`)
1. Administrator or security trigger updates user: `POST /v1/admin/users/{id}/status` with `status = 'SUSPENDED'`.
2. Server transaction:
   - Sets Redis token revocation entry `blacklist:user:{id}` with 24h TTL.
   - Closes all active WebSocket connections for `user_id` with WebSocket close code `4403 (Forbidden: Account Suspended)`.
   - Rejects any subsequent REST or WebSocket requests with `403 Forbidden`.

---

## 5. Phase 1 AI Implementation Tasks

- [x] **P1-T01: Authenticated Identity & Token Binding:** Implement JWT parsing, signature verification, and contextual binding of `user_id` across REST and WebSocket handlers.
- [x] **P1-T02: Eligibility Middleware:** Implement gate rejecting users in `PENDING`, `SUSPENDED`, or `DELETED` states with `403 ELIGIBILITY_REQUIRED`.
- [x] **P1-T03: Direct Conversation Upsert:** Implement `/v1/conversations/direct` using the canonical `direct_pair_hash` algorithm to prevent duplicate 1:1 threads under high concurrency.
- [x] **P1-T04: Conversation Listing & Navigation:** Implement `GET /v1/conversations` with pagination, ordering by last activity, unread summaries, and membership filtering.
- [x] **P1-T05: Scoped Membership Authorization:** Implement `EnsureMemberMiddleware` verifying caller is an active member (`role != 'REMOVED'`) of the target conversation.
- [x] **P1-T06: Suspension & Deactivation Enforcement:** Implement user suspension flow with instant WebSocket connection termination and Redis blocklisting.
- [x] **P1-T07: Structured Log Redaction:** Implement logging interceptor stripping authentication tokens, keys, and PII from server logs (`NFR-026`).

---

## 6. Phase 1 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR |
| :--- | :--- | :--- | :--- |
| **E2E-1.1** | **Eligibility Gate Rejection** | Attempt REST call and WebSocket connection using a valid JWT for a user with status `PENDING`. | Both return `403 Forbidden (ELIGIBILITY_REQUIRED)` and connection closes immediately. | `FR-001`, `FR-002` |
| **E2E-1.2** | **Direct Chat Race-Condition Idempotency** | Fire 20 parallel `POST /v1/conversations/direct` requests between User A and User B concurrently. | Exactly 1 conversation row is created in DB; all 20 calls return the identical `conversation_id`. | `FR-007` |
| **E2E-1.3** | **Unauthorized Conversation Probing** | User C sends `GET /v1/conversations/{conv_AB_id}`. | Returns `403 Forbidden` with zero conversation metadata disclosure. | `FR-003`, `NFR-024` |
| **E2E-1.4** | **Instant Suspension Kill-Switch** | Connect User A on active WebSocket; trigger admin suspension API for User A. | WebSocket terminates within ≤ 1.0 second with close code `4403`; subsequent requests return `403`. | `FR-005` |
| **E2E-1.5** | **Zero Sensitive Token Leakage in Logs** | Inspect JSON stdout logs following authentication and conversation requests. | Zero occurrences of Bearer tokens or sensitive headers detected. | `NFR-026` |
