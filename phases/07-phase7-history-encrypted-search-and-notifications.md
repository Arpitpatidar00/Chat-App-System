# 07 — Phase 7: History, Encrypted Search, and Notifications

## 1. Scope & Ownership
- **Goal:** Provide authorized paged history retrieval, on-device full-text content search via SQLCipher FTS5 with zero server plaintext indexing, and privacy-preserving push notifications with background on-device decryption.
- **Owner Role:** Mobile Agent / Content Agent / Security & Privacy Agent
- **Reviewer Role:** QA & Reliability Agent
- **Prerequisite:** Phase 6 (`06-phase6-attachments-and-links.md`)
- **Status:** COMPLETED & SIGNED OFF

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-053` to `FR-055` (History Pagination & Cursor Sync), `FR-057` to `FR-060` (E2EE Search & Deletion Sync), `FR-061` to `FR-067` (Notifications, Mute, Dismissal, Zero-Plaintext Push).
- **Non-Functional Requirements:** `NFR-009` (`p95 ≤ 1s` open chat + 50 msgs), `NFR-010` (`p95 ≤ 2s` on-device search), `NFR-011` (`p95 ≤ 5s` push dispatch), `NFR-042` (Zero server plaintext indexing).

---

## 3. Client & Server Data Models

### Client Local SQLCipher FTS5 Virtual Table
```sql
CREATE VIRTUAL TABLE local_messages_fts USING fts5(
    message_id UNINDEXED,
    conversation_id UNINDEXED,
    plaintext_body,
    attachment_filename,
    created_at UNINDEXED,
    tokenize='porter unicode61'
);

-- Deletion synchronization trigger
CREATE TRIGGER trg_fts_delete AFTER DELETE ON local_messages
BEGIN
    DELETE FROM local_messages_fts WHERE message_id = OLD.id;
END;
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 7A: Paged History Retrieval (`FR-053` to `FR-055`, `NFR-009`)
1. Client opens conversation and calls:
   ```
   GET /v1/conversations/{id}/messages?limit=50&before_seq_id={cursor}
   ```
2. Server validates membership and history boundary:
   ```sql
   SELECT id, seq_id, sender_id, msg_type, encrypted_payloads, created_at, is_tombstoned
   FROM messages
   WHERE conversation_id = $conv_id
     AND seq_id >= $member_history_floor
     AND ($before_seq_id IS NULL OR seq_id < $before_seq_id)
     AND ($removed_at_seq_id IS NULL OR seq_id <= $removed_at_seq_id)
   ORDER BY seq_id DESC
   LIMIT 50;
   ```
3. Latency passes `p95 ≤ 1s` for initial cold conversation load (`NFR-009`).
4. Client decrypts messages on-device and streams them into local SQLCipher and UI.

### Flow 7B: E2EE On-Device Search (`FR-057` to `FR-060`, `NFR-010`, `NFR-042`)
1. **Indexing Pipeline:** Whenever client decrypts an incoming message or historical synced bundle, it inserts the decrypted text into `local_messages_fts`.
2. **Local Query Execution (`p95 ≤ 2s`):**
   ```sql
   SELECT message_id, conversation_id, snippet(local_messages_fts, 2, '<b>', '</b>', '...', 12)
   FROM local_messages_fts
   WHERE local_messages_fts MATCH ?
   ORDER BY created_at DESC
   LIMIT 50;
   ```
3. **Zero Plaintext Server Guarantee:** Search queries and keywords are processed strictly within device SQLCipher storage. Zero search terms ever touch server logs, API endpoints, or database tables (`NFR-042`).
4. **Tombstone Sync:** When a message is deleted for everyone (`MSG_TOMBSTONED`), the local row is deleted, instantly removing it from search results (`FR-059`).

### Flow 7C: Privacy-Preserving Mobile Push Notifications (`FR-061` to `FR-067`, `NFR-011`)
1. **Dispatch Rules:**
   - If conversation is muted (`muted_until > NOW()`), push is skipped (`FR-063`).
   - If recipient acknowledged the message over an active foreground WebSocket within 500ms, push is suppressed (`FR-064`).
   - When user reads the chat on any device (`READ_UP_TO`), server sends a silent `CLEAR_NOTIFICATION` push to dismiss notifications across other mobile devices.
2. **Zero-Plaintext Push Payload (`FR-067`):**
   - Server dispatches an FCM (Android) / APNs (`mutable-content: 1`) payload containing **only**:
     ```json
     {
       "conversation_id": "UUID",
       "message_id": "UUID",
       "seq_id": 482,
       "encrypted_preview_envelope": "base64_ciphertext"
     }
     ```
   - On iOS (Notification Service Extension) and Android (`FirebaseMessagingService`), client OS background worker wakes, reads ratchet key from Keychain/Keystore, decrypts the envelope locally, and displays the notification alert.
   - Plaintext never traverses Apple APNs or Google FCM servers.

---

## 5. Phase 7 AI Implementation Tasks

- [x] **P7-T01: Paged History Endpoint:** Implement `GET /v1/conversations/{id}/messages` with cursor pagination enforcing member history boundaries (`p95 ≤ 1s`).
- [x] **P7-T02: Client SQLCipher FTS5 Integration:** Build local SQLite FTS5 table indexing decrypted messages and attachment filenames upon decrypt.
- [x] **P7-T03: On-Device Search Repository:** Implement local search repository with snippet highlighting and result navigation (`p95 ≤ 2s`).
- [x] **P7-T04: Missing Key & Re-Index Graceful Handling:** Gracefully handle encrypted messages for which local keys are unavailable without corrupting search index.
- [x] **P7-T05: Push Notification Queue Worker:** Implement asynchronous worker dispatching FCM/APNs wakeups within `p95 ≤ 5s`.
- [x] **P7-T06: Zero-Plaintext Push Payloads:** Package encrypted preview envelopes into APNs/FCM payloads; build client iOS/Android background decryptors.
- [x] **P7-T07: Cross-Device Read Notification Dismissal:** Dispatch silent notification dismissal pushes (`CLEAR_NOTIFICATION`) upon read synchronization.
- [x] **P7-T08: Push Outage Fallback Testing:** Author tests proving messaging succeeds when push gateways fail.

---

## 6. Phase 7 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR |
| :--- | :--- | :--- | :--- |
| **E2E-7.1** | **Cold Conversation Load Latency** | Query `GET /v1/conversations/{id}/messages?limit=50` on a chat with 10,000 historical rows. | Response completes with `p95 ≤ 1.0s`. | `NFR-009` |
| **E2E-7.2** | **On-Device Encrypted Keyword Search** | Search 20,000 decrypted messages in SQLCipher on mobile test device for `"financial report"`. | Query returns matching snippets in `p95 ≤ 2.0s`; 0 search bytes transmitted to server. | `FR-057`, `NFR-010`, `NFR-042` |
| **E2E-7.3** | **Search Deletion Hygiene** | Search finds message M; User A triggers delete-for-everyone on M; re-run search. | Message M disappears from search results instantly. | `FR-059`, `NFR-035` |
| **E2E-7.4** | **Zero Plaintext in Push Payloads** | Intercept outbound APNs/FCM HTTP/2 wire packets. | Zero plaintext words found; only encrypted base64 payload blob present. | `FR-067` |
| **E2E-7.5** | **Push Gateway Outage Resilience** | Mock FCM/APNs returning `503 Service Unavailable` for offline User B; User A sends message. | User A receives `MSG_ACK`; message is durably saved; User B receives message via `/v1/sync` upon reconnect. | `FR-065` |
