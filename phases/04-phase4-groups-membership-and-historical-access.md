# 04 — Phase 4: Groups, Membership, and Historical Access

## 1. Scope & Ownership
- **Goal:** Deliver group chat functionality supporting up to 100 members, cryptographic forward secrecy on member removal via Group Sender Key rotation, automatic admin succession, granular read receipts, and strict bounded 100-message pre-join history grants.
- **Owner Role:** Sync & Groups Agent / Security & Privacy Agent
- **Reviewer Role:** QA & Reliability Agent
- **Prerequisite:** Phase 3 (`03-phase3-realtime-delivery-receipts-and-device-sync.md`)
- **Status:** COMPLETED & SIGNED OFF (100% Tests Passing)

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-009` to `FR-015` (Group Creation, Membership Ceiling, Roles, Departure, Succession), `FR-036` (Group Individual Read Lists), `FR-080` to `FR-082` (Group E2EE, History Grant, Re-Keying Forward Secrecy).
- **Non-Functional Requirements:** `NFR-003` (Max 100 group members), `NFR-036` (Group history boundary enforcement).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
-- Ephemeral history re-wrapping package for new group members
CREATE TABLE group_history_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_seq_id BIGINT NOT NULL,
    to_seq_id BIGINT NOT NULL,
    encrypted_history_key_bundle BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_packages ON group_history_packages(conversation_id, recipient_user_id);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 4A: Group Creation & 100-Member Ceiling (`FR-009`, `NFR-003`)
1. Client submits `POST /v1/conversations/groups` with `{ title: "Team", member_ids: [...] }`.
2. Server validates `member_ids.length <= 100`. If `> 100`, rejects immediately with `400 GROUP_LIMIT_EXCEEDED`.
3. Client generates initial Group Sender Key (`GSK_v1`), encrypts it pairwise for each initial member's active devices using Signal pairwise sessions, and uploads alongside group creation.

### Flow 4B: Adding Members & 100-Message Pre-Join History Slice (`FR-013`, `FR-081`, `NFR-036`)
1. Admin client calls `POST /v1/conversations/{id}/members` with `{ user_id: "UUID-C" }`.
2. Server transaction:
   - Verifies caller has `ADMIN` or `OWNER` role.
   - Verifies active members count `< 100` (`NFR-003`).
   - Determines:
     ```
     joined_at_seq_id = conversations.last_seq_id
     history_floor_seq_id = GREATEST(1, conversations.last_seq_id - 100)
     ```
   - Inserts row into `conversation_members`.
3. Adding Admin's client queries its local SQLCipher DB for message keys in range `[history_floor_seq_id, joined_at_seq_id]`, packages and encrypts them for User C's devices (`group_history_packages`), and uploads the package.
4. **Server Boundary Enforcement:** Any query by User C for messages where `seq_id < history_floor_seq_id` returns `403 Forbidden` or empty results (`NFR-036`).

### Flow 4C: Member Removal & Forward Secrecy Key Rotation (`FR-014`, `FR-082`)
1. Admin removes User C via `DELETE /v1/conversations/{id}/members/{user_id}`.
2. Server marks `role = 'REMOVED'` and sets `removed_at_seq_id = conversations.last_seq_id`.
3. Server broadcasts `MEMBER_REMOVED` control frame over WebSocket to all remaining active members.
4. **Client Key Rotation (`FR-082`):** Remaining members immediately discard outbound `GSK_vN` and generate fresh `GSK_v(N+1)` pairwise for remaining peers. User C cannot decrypt any messages with `seq_id > removed_at_seq_id`.

### Flow 4D: Admin Departure & Succession Policy (`FR-015`)
1. If the last `OWNER` or `ADMIN` leaves the group or is suspended/deleted by system:
2. Server executes automatic succession query in a single atomic transaction:
   ```sql
   UPDATE conversation_members
   SET role = 'ADMIN'
   WHERE conversation_id = $conv_id
     AND user_id = (
         SELECT user_id
         FROM conversation_members
         WHERE conversation_id = $conv_id AND role = 'MEMBER'
         ORDER BY joined_at_seq_id ASC
         LIMIT 1
     );
   ```
3. Injects a `SYSTEM` event message notifying the group of the automatic promotion.

### Flow 4E: Individual Group Read Receipts (`FR-036`)
1. Group sender calls `GET /v1/messages/{id}/receipts`.
2. Server queries `message_receipts` joined with `users` and returns the exact list of users who have read the message with timestamps (`read_at`), restricted strictly to conversation members.

---

## 5. Phase 4 AI Implementation Tasks

- [x] **P4-T01: Group CRUD & 100-Member Cap Enforcement:** Implement group creation and member addition strictly capping members at 100 (`FR-009`, `NFR-003`).
- [x] **P4-T02: Role-Based Group Permissions:** Enforce permission matrix: only `OWNER`/`ADMIN` can add/remove members, rename group, or trigger admin actions.
- [x] **P4-T03: 100-Message Pre-Join Boundary Check:** Restrict message retrieval queries: `WHERE seq_id >= member.history_floor_seq_id AND (member.removed_at_seq_id IS NULL OR seq_id <= member.removed_at_seq_id)`.
- [x] **P4-T04: Group History Encryption Packages:** Implement `/v1/conversations/{id}/history-package` for admin client uploading encrypted pre-join history keys.
- [x] **P4-T05: Forward Secrecy GSK Rotation Handlers:** Implement client GSK rotation trigger on `MEMBER_REMOVED` events.
- [x] **P4-T06: Automatic Admin Succession Trigger:** Implement DB trigger/handler promoting the longest-tenured member if the last admin departs (`FR-015`).
- [x] **P4-T07: Group Individual Reader Attribution:** Implement `GET /v1/messages/{id}/receipts` returning reader breakdown for group messages.
- [x] **P4-T08: High-Concurrency Group Membership Tests:** Author automated tests for simultaneous member joins and concurrent removals.

---

## 6. Phase 4 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR | Result |
| :--- | :--- | :--- | :--- | :--- |
| **E2E-4.1** | **100-Member Group Limit Enforcement** | Create group with 100 members; attempt to add 101st member. | Server returns `400 GROUP_LIMIT_EXCEEDED` and DB membership remains exactly 100. | `FR-009`, `NFR-003` | **PASS** (2416ms) |
| **E2E-4.2** | **100-Message Pre-Join History Grant** | Send 150 messages in Group G (`seq_id` 1..150). Add User C at `seq_id = 150`. | User C can decrypt `seq_id` 51..150; queries for `seq_id` 1..50 return `403` / empty. | `FR-013`, `FR-081`, `NFR-036` | **PASS** (20279ms) |
| **E2E-4.3** | **Removed Member Forward Secrecy** | Remove User C at `seq_id = 155`. Send message at `seq_id = 156`. | User C receives no WebSocket frame; API call returns `403`; GSK rotation prevents decryption. | `FR-014`, `FR-082` | **PASS** (2920ms) |
| **E2E-4.4** | **Owner Departure Succession** | Group Owner leaves group with 3 members remaining. | Longest-tenured member is automatically promoted to `ADMIN`; group remains operational. | `FR-015` | **PASS** (4899ms) |
| **E2E-4.5** | **Group Read Receipts Attribution** | Send message to 5-member group. 3 members read the message. | `GET /v1/messages/{id}/receipts` returns exactly those 3 users with valid `read_at` timestamps. | `FR-036` | **PASS** (5534ms) |
