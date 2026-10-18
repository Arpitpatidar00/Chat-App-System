# 08 — Phase 8: Privacy, Reporting, and Data Lifecycle

## 1. Scope & Ownership
- **Goal:** Complete governance controls including bidirectional user blocking, scoped cryptographic moderation disclosure using dedicated Moderation Public Keys (`Mod_PK`), immutable write-ahead administrative audit logging, abuse rate limiters, and post-restore tombstone scrubbing.
- **Owner Role:** Security & Privacy Agent / Identity & Access Agent
- **Reviewer Role:** QA & Reliability Agent / Human Decision Owner
- **Prerequisite:** Phase 7 (`07-phase7-history-encrypted-search-and-notifications.md`)
- **Status:** READY

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-068` to `FR-075` (Blocking, Reporting, Scoped Moderation, Rate Limits, Audit Logs), `FR-084` (Cryptographic Disclosure Protocol), `FR-085` (Metadata Privacy Manifest).
- **Non-Functional Requirements:** `NFR-028` (Vulnerability gate), `NFR-029` (Scoped moderator access), `NFR-037` (Data retention limits), `NFR-039` (Moderation vault isolation), `NFR-040` (Tombstone restoration scrubbing), `NFR-041` (Transparency disclosures).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
CREATE TYPE report_status_enum AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'PURGED');
CREATE TYPE admin_action_enum AS ENUM ('VIEW_REPORT', 'SUSPEND_USER', 'RESOLVE_REPORT', 'REVOKE_DEVICE');

-- Bidirectional user blocklist
CREATE TABLE user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX idx_user_blocks_reverse ON user_blocks(blocked_id, blocker_id);

-- Isolated moderation report vault (E2EE disclosed payloads)
CREATE TABLE moderation_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    reported_user_id UUID NOT NULL REFERENCES users(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    reason_code TEXT NOT NULL,
    disclosed_messages_encrypted_for_mod BYTEA NOT NULL, -- Re-encrypted on-device with Mod_PK
    metadata_snapshot JSONB NOT NULL,
    status report_status_enum NOT NULL DEFAULT 'OPEN',
    assigned_reviewer_id UUID NULL REFERENCES users(id),
    retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable append-only audit log table
CREATE TABLE admin_audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    actor_admin_id UUID NOT NULL REFERENCES users(id),
    action_type admin_action_enum NOT NULL,
    target_id UUID NOT NULL,
    ip_address INET NOT NULL,
    justification TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registry for post-restore tombstone scrubbing across backups (NFR-040)
CREATE TABLE deleted_entities_registry (
    entity_type TEXT NOT NULL, -- 'MESSAGE' or 'ATTACHMENT'
    entity_id UUID NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id)
);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 8A: Bidirectional User Blocking (`FR-068`, `FR-069`)
1. User A blocks User B via `POST /v1/blocks` with `{ blocked_user_id: "UUID-B" }`.
2. Server writes to `user_blocks`.
3. **Enforcement Rules:**
   - 1:1 message sends between User A and User B reject with `403 USER_BLOCKED`.
   - Online presence, last-seen timestamps, and typing indicators are mutually suppressed in both directions (`FR-045`).
   - User B is blocked from adding User A to any group.

### Flow 8B: Scoped Cryptographic Moderation Disclosure (`FR-070` to `FR-073`, `FR-084`, `NFR-029`)
1. **Explicit User Selection:** User A flags Message #5. The client UI allows User A to explicitly select up to 5 surrounding messages for context.
2. **On-Device Scoped Re-Encryption:**
   - Client decrypts *only* the selected messages on-device.
   - Fetches official **Moderation Queue Public Key (`Mod_PK`)** from `/v1/keys/moderation-key`.
   - Encrypts disclosed message plaintexts + server cryptographic signatures using `Mod_PK`.
   - Submits `POST /v1/reports`.
3. **Zero Routine Plaintext Access:**
   - Routine database administrators and service operators have zero access to chat plaintexts or unselected messages (`FR-078`).
4. **Authorized Review & Audit:**
   - Only a reviewer with `MOD_REVIEWER` role assigned to `report_id` can request decryption.
   - Every view access requires an input justification and writes a write-ahead record to `admin_audit_logs` before returning decrypted payload.

### Flow 8C: Abuse Rate Limiting (`FR-074`)
Redis Token Bucket middleware enforces per-user rate limits:
- Messages: **30 messages / 10 seconds** per user.
- New Conversations/Groups: **10 / minute** per user.
- Attachment Uploads: **20 / 5 minutes** per user.
- Excess frames return `429 Too Many Requests` without terminating the socket.

### Flow 8D: Backup Tombstone Scrubbing (`NFR-040`)
1. `deleted_entities_registry` records every message/attachment deletion.
2. During database or S3 backup restoration drills, a post-restore hook automatically executes:
   ```sql
   DELETE FROM messages
   WHERE id IN (
       SELECT entity_id FROM deleted_entities_registry WHERE entity_type = 'MESSAGE'
   );
   ```
   Ensures deleted messages and attachments are never resurrected from older backup snapshots.

---

## 5. Phase 8 AI Implementation Tasks

- [ ] **P8-T01: User Blocking Middleware:** Implement bidirectional block enforcement across 1:1 chat, group invitations, presence, and typing.
- [ ] **P8-T02: Scoped Cryptographic Report Ingestion:** Implement `/v1/reports` validating `Mod_PK` re-encrypted payloads with user-selected context messages.
- [ ] **P8-T03: Scoped Moderator Review API:** Implement `/v1/admin/reports/{id}` restricted to assigned reviewers.
- [ ] **P8-T04: Write-Ahead Admin Audit Logger:** Implement immutable logging of all administrative actions with IP and justification recording.
- [ ] **P8-T05: Redis Token Bucket Rate Limiter:** Build rate limiting middleware enforcing 30 msgs / 10s rules (`FR-074`).
- [ ] **P8-T06: Metadata Transparency Manifest Endpoint:** Implement `GET /v1/privacy/metadata-manifest` exposing retained metadata policies (`FR-085`, `NFR-041`).
- [ ] **P8-T07: Post-Restore Tombstone Scrubbing Hook:** Build database restoration hygiene script purging resurrected rows present in `deleted_entities_registry` (`NFR-040`).
- [ ] **P8-T08: Routine Admin Metadata-Only Audit:** Execute automated test asserting routine admin credentials cannot query decrypted message text.

---

## 6. Phase 8 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR |
| :--- | :--- | :--- | :--- |
| **E2E-8.1** | **Bidirectional Blocking Enforcement** | User A blocks User B; User B attempts message send, presence query, and group add. | All 3 operations return `403 Forbidden` (`FR-068`, `FR-069`). |
| **E2E-8.2** | **Scoped Moderation Disclosure Boundary** | User A reports Message #5 out of 10 messages. Review report. | Moderator sees only Message #5 + explicitly checked context; zero access to unselected messages. | `FR-071` to `FR-073`, `FR-084` |
| **E2E-8.3** | **Immutable Audit Log Write-Ahead Verification** | Moderator inspects report #101. | `admin_audit_logs` records entry with moderator ID, IP, and justification prior to data release. | `FR-075`, `NFR-029` |
| **E2E-8.4** | **Message Rate Limit Burst** | Burst 45 `MSG_SEND` frames from a single user within 2 seconds. | First 30 succeed; subsequent frames receive `429 Too Many Requests`; WebSocket connection stays alive. | `FR-074` |
| **E2E-8.5** | **Post-Restore Tombstone Hygiene** | Delete message M; restore older database backup from before deletion; run reconciliation hook. | Message M is scrubbed and purged; does not resurrect. | `NFR-040` |
