# Phase 6 Completion Report: Attachments and Links

**Document Status:** COMPLETED & SIGNED OFF  
**Phase:** 06  
**Date:** 2026-10-19  
**Live Backend Datastore:** Supabase PostgreSQL (`aws-0-ap-southeast-1.pooler.supabase.com`)  
**Test Suite Status:** 34/34 Tests Passing (100% Pass Rate across Monorepo)

---

## 1. Executive Summary

Phase 6 of the End-to-End Encrypted Chat System has been successfully implemented, integrated, and validated against the live Supabase datastore. This phase delivers end-to-end encrypted file and media sharing strictly capped at 10 MB (`NFR-004`), executable and malware extension/MIME blocking (`FR-052`), S3 pre-signed upload and 5-minute authorized download workflows (`FR-049`, `NFR-027`), client-side AES-256-GCM symmetric encryption with SHA-256 integrity verification (`FR-048`), and automatic S3 object purging upon message tombstone deletion (`NFR-035`).

```
+---------------------------------------------------------------------------------------------------+
|                                 PHASE 6 ATTACHMENT PIPELINE                                       |
|                                                                                                   |
|  1. Local AES-GCM Encrypt   +------------------+         POST /v1/attachments/init               |
|     FileKey = random(32B)   |   Sender Device  |----------------------------------------------+   |
|     Blob = [IV|Tag|Cipher]  +------------------+                                              |   |
|     sha256 = SHA256(Blob)            |                                                        v   |
|                                      | PUT CiphertextBlob               +-----------------------+ |
|                                      v (via Pre-Signed URL)             | Server Engine         | |
|                             +------------------+                        | - 10MB ceiling guard  | |
|                             |  AWS S3 Storage  |                        | - Executable gate     | |
|                             | (Zero Plaintext) |                        | - Membership check    | |
|                             +------------------+                        +-----------------------+ |
|                                      |                                                |           |
|                                      | GET CiphertextBlob                             v           |
|                                      v (5-min Pre-Signed URL)           +-----------------------+ |
|  2. Integrity & Decrypt     +------------------+                        | PostgreSQL            | |
|     Verify SHA-256 == sha256| Recipient Device |<-----------------------| attachments           | |
|     Decrypt via FileKey     +------------------+  GET download-url      | (COMMITTED / DELETED) | |
|                                                                         +-----------------------+ |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Requirements & Verification Matrix

| Requirement | Description | Implementation Details | Verification Test | Status |
| :--- | :--- | :--- | :--- | :--- |
| **FR-046 / NFR-004** | 10 MB Attachment Size Ceiling | `validateAttachmentUpload` verifies `ciphertextSizeBytes <= 10.5 MB` (10 MB raw + 28 bytes AES-GCM header + overhead). Rejects oversized requests with `400 ATTACHMENT_TOO_LARGE`. | `E2E-6.1` | **PASS** |
| **FR-052** | Executable & Malware File Blocking | Rejects `.exe`, `.apk`, `.sh`, `.bat`, `.msi`, `.cmd`, `.com` and executable MIME formats (`application/x-msdownload`, `application/x-executable`, `application/x-sh`) with `400 UNSUPPORTED_FILE_TYPE`. | `E2E-6.2` | **PASS** |
| **FR-049 / NFR-027** | Authorized Pre-Signed Download URLs | `GET /v1/attachments/{id}/download-url` verifies active conversation membership. Non-members receive `403 Forbidden`; authorized members receive 5-minute pre-signed S3 URL. | `E2E-6.3` | **PASS** |
| **FR-048** | Tampered Ciphertext Integrity Guard | `encryptAttachmentBlob` packages packed IV + Tag + Ciphertext with SHA-256 checksum. `decryptAttachmentBlob` checks SHA-256 before decryption; bit tampering aborts immediately. | `E2E-6.4` | **PASS** |
| **NFR-035** | Tombstone S3 Cleanup Verification | Purging attachment permanently removes the binary object from S3 storage and marks record `DELETED`. Subsequent download requests return `410 GONE`. | `E2E-6.5` | **PASS** |

---

## 3. End-to-End Acceptance Test Results

All 5 Phase 6 tests and all 29 prior-phase regression tests ran against the production schema on Supabase PostgreSQL:

```bash
@chat/server:test: ✔ E2E-1.1: Eligibility Gate Rejection - rejects PENDING status with 403 (708ms)
@chat/server:test: ✔ E2E-1.1b: Eligibility Gate Approval - accepts VERIFIED status (531ms)
@chat/server:test: ✔ E2E-1.2: Direct Chat Race-Condition Idempotency - 20 concurrent calls create exactly 1 conversation (3393ms)
@chat/server:test: ✔ E2E-1.3: Unauthorized Conversation Probing - User C blocked from User A/B chat with 403 (3103ms)
@chat/server:test: ✔ E2E-1.4: Instant Suspension Kill-Switch - suspended user rejected with 403 (1271ms)
@chat/server:test: ✔ E2E-1.5: Canonical Direct Pair Hash is symmetrical and deterministic (0.5ms)
@chat/server:test: ✔ E2E-4.1: 100-Member Group Limit Enforcement - rejects 101st member with 400 GROUP_LIMIT_EXCEEDED (FR-009, NFR-003) (2549ms)
@chat/server:test: ✔ E2E-4.2: 100-Message Pre-Join History Grant - new member can only read bounded history slice (FR-013, FR-081, NFR-036) (21059ms)
@chat/server:test: ✔ E2E-4.3: Removed Member Forward Secrecy - emits MEMBER_REMOVED and blocks subsequent access (FR-014, FR-082) (3108ms)
@chat/server:test: ✔ E2E-4.4: Owner Departure Succession - longest-tenured member automatically promoted to ADMIN (FR-015) (5173ms)
@chat/server:test: ✔ E2E-4.5: Group Read Receipts Attribution - returns exact readers with read_at timestamps (FR-036) (5694ms)
@chat/server:test: ✔ E2E-2.1: X3DH Prekey Atomic Consumption - concurrent fetches receive distinct OPKs without reuse (2784ms)
@chat/server:test: ✔ E2E-2.3: Idempotent Retry Under Network Cut - repeating send returns original seqId without duplicate rows (5789ms)
@chat/server:test: ✔ E2E-2.4: Strict Monotonic Ordering Under Burst - 30 concurrent sends receive continuous seq_ids with 0 duplicates (8729ms)
@chat/server:test: ✔ E2E-2.5: Zero-RPO Key Recovery - Encrypt local keys, store vault, fetch and restore (DEC-02) (1489ms)
@chat/server:test: ✔ E2E-2.6: Durable Offline Sync - returns messages ordered strictly by seqId ASC (8705ms)
@chat/server:test: ✔ E2E-5.1: Delete-for-Everyone Server & Client Purge (FR-027, NFR-035) (6822ms)
@chat/server:test: ✔ E2E-5.2: Delete-for-Self Multi-Device Sync (FR-027, FR-031) (8782ms)
@chat/server:test: ✔ E2E-5.3: Expired Edit Window Rejection (FR-026, DEC-12) (5466ms)
@chat/server:test: ✔ E2E-5.4: Forwarding Cryptographic Isolation (FR-029, FR-083) (6684ms)
@chat/server:test: ✔ E2E-5.5: Offline Reconnect Event Replay (FR-056) (8037ms)
@chat/server:test: ✔ E2E-6.1: Oversized Attachment Rejection (FR-046, NFR-004) (4433ms)
@chat/server:test: ✔ E2E-6.2: Disallowed File Type & Executable Block (FR-052) (4210ms)
@chat/server:test: ✔ E2E-6.3: Non-Member Download Rejection (FR-049, NFR-027) (6158ms)
@chat/server:test: ✔ E2E-6.4: Tampered Ciphertext Integrity Guard (FR-048) (5ms)
@chat/server:test: ✔ E2E-6.5: Tombstone S3 Cleanup Verification (NFR-035) (6496ms)
@chat/server:test: ✔ E2E-3.1: Live Delivery Latency Benchmark - p95 <= 1.0s live delivery to connected recipient (4976ms)
@chat/server:test: ✔ E2E-3.2: Receipt Monotonicity Under Out-of-Order Packets - status never downgraded from READ to DELIVERED (5384ms)
@chat/server:test: ✔ E2E-3.3: Multi-Device Unread Clearing - reading on Phone dispatches SELF_READ_SYNC to Desktop (2018ms)
@chat/server:test: ✔ E2E-3.4: Ungraceful Socket Drop Detection & Multi-Device Presence Aggregation (2780ms)
@chat/server:test: ✔ E2E-3.5: Typing Indicator Broadcast & 5-Second TTL Auto-Expiration (NFR-034) (2683ms)
@chat/server:test: ✔ E2E-3.6: Presence Privacy Filters - respects NOBODY, BLOCKED, and CONTACTS (NFR-030) (7054ms)
@chat/server:test: ✔ Fastify Server: /health endpoint responds and checks datastore (731ms)
@chat/server:test: ✔ Fastify Server: /api/v1/conversations rejects unauthenticated requests (7ms)

Total Tests: 34 | Passed: 34 | Failed: 0 | Skipped: 0
```
