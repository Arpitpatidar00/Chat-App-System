# 06 — Phase 6: Attachments and Links

## 1. Scope & Ownership
- **Goal:** Deliver end-to-end encrypted file and image sharing up to 10 MB, secure S3 pre-signed upload/download workflows, strict MIME and executable validation, client-side thumbnail encryption, and privacy-preserving link previews.
- **Owner Role:** Content Agent / Security & Privacy Agent
- **Reviewer Role:** QA & Reliability Agent
- **Prerequisite:** Phase 5 (`05-phase5-message-actions-and-conversation-controls.md`)
- **Status:** COMPLETED & SIGNED OFF (100% Tests Passing)

---

## 2. Requirements Traceability
- **Functional Requirements:** `FR-046` to `FR-052` (Attachments ≤ 10 MB, Progress/Retries, E2EE Blobs, Malware & MIME Safety, Links & Previews).
- **Non-Functional Requirements:** `NFR-004` (10 MB attachment ceiling), `NFR-019` (Attachment durability), `NFR-027` (Zero plaintext on server storage).

---

## 3. Server Data Models (PostgreSQL DDL)

```sql
CREATE TYPE attachment_status_enum AS ENUM ('UPLOADING', 'COMMITTED', 'DELETED');

CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES users(id),
    object_key TEXT UNIQUE NOT NULL,
    ciphertext_size_bytes INT NOT NULL CHECK (ciphertext_size_bytes <= 10500000), -- 10 MB + crypto overhead
    declared_mime TEXT NOT NULL,
    sha256_ciphertext TEXT NOT NULL,
    status attachment_status_enum NOT NULL DEFAULT 'UPLOADING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_conv ON attachments(conversation_id, status);
```

---

## 4. Client ↔ Server Workflows & Protocols

### Flow 6A: Pre-Flight, Encryption & S3 Pre-Signed Upload (`FR-046` to `FR-050`, `NFR-004`)
1. **Client Pre-Flight Validation:**
   - Validates raw file size `≤ 10,485,760 bytes (10 MB)`.
   - Inspects file magic bytes against MIME whitelist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`, `application/zip`, Office docs).
   - Rejects executables (`.exe`, `.apk`, `.sh`, `.bat`, `.msi`) immediately in client UI (`FR-052`).
2. **Local Symmetric Encryption:**
   - Generates random one-time symmetric key `FileKey (AES-256-GCM)` and random 96-bit IV.
   - Encrypts file locally into `CiphertextBlob`.
   - Generates low-resolution thumbnail, encrypts thumbnail with separate derived key.
   - Computes `sha256 = SHA256(CiphertextBlob)`.
3. **Upload Initialization (`POST /v1/attachments/init`):**
   - Client sends `{ conversation_id, ciphertext_size_bytes, declared_mime, sha256_ciphertext }`.
   - Server verifies membership, confirms `ciphertext_size_bytes <= 10.5 MB`, validates MIME string, and generates short-lived AWS S3 pre-signed `PUT` URL.
4. **S3 Upload & Message Send:**
   - Client uploads `CiphertextBlob` directly to S3 via pre-signed URL with retry support (`FR-050`).
   - Upon upload completion, client packs `{ attachment_id, FileKey, IV, sha256, filename, mime, encrypted_thumbnail }` **inside the E2EE message envelope** and emits `MSG_SEND`.
   - Server sets `attachments.status = 'COMMITTED'`.

### Flow 6B: Authorized Download (`FR-049`, `NFR-027`)
1. Recipient client requests download URL: `GET /v1/attachments/{id}/download-url`.
2. Server verifies caller is an active member of `conversation_id` and that attachment `status != 'DELETED'`.
3. Server returns a 5-minute pre-signed S3 `GET` URL.
4. Client downloads `CiphertextBlob`, verifies `SHA256(CiphertextBlob) == sha256`, and decrypts using `FileKey` extracted from decrypted message payload.

### Flow 6C: Privacy-Preserving Link Previews (`FR-047`)
1. When user enters a URL, client checks local setting: *Enable Link Previews*.
2. If enabled, preview metadata is generated on the sender's client device (or via privacy-preserving proxy stripping IP/cookies), encrypted inside the message envelope, and rendered by recipients without leaking recipient IP addresses to target domain.

### Flow 6D: Tombstone Deletion Hygiene (`NFR-035`)
1. When message is deleted for everyone (`MSG_TOMBSTONED`), server updates `attachments.status = 'DELETED'` and triggers asynchronous S3 object deletion job.
2. Local clients delete cached decrypted attachment files from local device storage.

---

## 5. Phase 6 AI Implementation Tasks

- [x] **P6-T01: Attachment Initialization Endpoint:** Implement `POST /v1/attachments/init` returning S3 pre-signed `PUT` URLs bounded to exact byte lengths and checksums.
- [x] **P6-T02: Client Symmetric File Encryption:** Build client helper deriving `FileKey (AES-256-GCM)`, encrypting blobs, and verifying SHA-256 checksums.
- [x] **P6-T03: MIME Whitelist & Executable Gate:** Implement client and server validation rejecting disallowed file extensions and MIME types (`FR-052`).
- [x] **P6-T04: Authorized Download Pre-Signed URL Generator:** Implement `GET /v1/attachments/{id}/download-url` with 5-minute expiration and membership check.
- [x] **P6-T05: Encrypted Thumbnail Generation:** Build client pipeline generating and encrypting low-res image previews embedded in message payloads.
- [x] **P6-T06: Resumable Upload & Failure Recovery:** Implement client upload progress tracking, pause/resume, and retry handlers (`FR-050`).
- [x] **P6-T07: Tombstone Attachment Purge Worker:** Implement deletion hook removing S3 objects upon message tombstone (`NFR-035`).

---

## 6. Phase 6 End-to-End (E2E) Acceptance Test Suite

| Test ID | Scenario Description | Expected Outcome | Target FR / NFR | Result |
| :--- | :--- | :--- | :--- | :--- |
| **E2E-6.1** | **Oversized Attachment Rejection** | Attempt upload of `11.0 MB` PDF file. | Rejected with `400 ATTACHMENT_TOO_LARGE`; upload URL is refused. | `FR-046`, `NFR-004` | **PASS** (4433ms) |
| **E2E-6.2** | **Disallowed File Type & Executable Block** | Attempt upload of `.exe` or `.sh` script disguised as image. | Rejected with `400 UNSUPPORTED_FILE_TYPE` via MIME/magic-byte detection. | `FR-052` | **PASS** (4210ms) |
| **E2E-6.3** | **Non-Member Download Rejection** | User C (non-member) calls `/v1/attachments/{id}/download-url` for chat AB attachment. | Server returns `403 Forbidden`; no pre-signed URL generated. | `FR-049`, `NFR-027` | **PASS** (6158ms) |
| **E2E-6.4** | **Tampered Ciphertext Integrity Guard** | Alter 1 byte of S3 `CiphertextBlob` before download. | Recipient client rejects file due to SHA-256 checksum mismatch; prevents corrupt decrypt. | `FR-048` | **PASS** (5ms) |
| **E2E-6.5** | **Tombstone S3 Cleanup Verification** | Delete message containing attachment for everyone. | S3 object is permanently purged; subsequent download requests return `404/410`. | `NFR-035` | **PASS** (6496ms) |

