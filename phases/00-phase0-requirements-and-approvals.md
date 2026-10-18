# 00 — Phase 0: Requirements, Product Decisions & Engineering Baseline

## 1. Objective & Ownership
- **Goal:** Establish a deterministic, testable requirements baseline, catalog the 15 critical architectural/product decisions (`DEC-01` to `DEC-15`), and lock down initial engineering resolution proposals before implementation begins.
- **Owner Role:** Requirements Agent / Coordinator
- **Reviewer Role:** Human Decision Owner / Technical Lead
- **Status:** COMPLETED & SIGNED OFF

---

## 2. Target Scale & Infrastructure Topology (Baseline v2.0)
- **User Scale:** ≤ 10,000 registered users | 100 concurrent connected sessions | ~200,000 messages/day ceiling.
- **Primary Region:** India (`ap-south-1` Mumbai, Multi-AZ active-active) with warm standby replication in `ap-south-2` (Hyderabad) to meet **RPO = 0** and **RTO ≤ 4 hours** at **99.9% monthly core-chat availability**.
- **Client Stack:** Android & iOS (React Native / Flutter or Native Kotlin/Swift) + Web Client SDK sharing a unified local **SQLCipher (AES-256)** database with **FTS5** full-text search and a **LibSignal / Olm-Megolm** cryptographic engine.
- **Server Stack:**
  - **API & WebSocket Gateway:** Go or Node.js (TypeScript) stateless cluster behind AWS ALB / Envoy with TLS 1.3 (`NFR-021`).
  - **Primary Datastore:** PostgreSQL (Multi-AZ with synchronous physical replication for `RPO = 0`) storing envelopes, membership, receipts, and encrypted metadata.
  - **Ephemeral & Pub/Sub Bus:** Redis Cluster (AOF enabled) for WebSocket session routing, multi-device presence aggregation, typing TTLs, and rate limiting.
  - **Object Storage:** S3-compatible storage (Mumbai + cross-region replication to Hyderabad) for E2EE attachment ciphertext blobs (`≤ 10 MB`).
  - **Push Worker:** Asynchronous queue worker dispatching wakeup payloads to FCM (Android) and APNs (iOS) within `p95 ≤ 5s`.

---

## 3. Mandatory Decision Register (`DEC-01` to `DEC-15`)

| Decision ID | Area | Required Outcome & Engineering Resolution Policy | Status |
| :--- | :--- | :--- | :--- |
| **DEC-01** | Peak Workload | 25 msg/s sustained, **100 msg/s burst for 60 seconds** at 100 concurrent connections (`p95 ≤ 500ms` acceptance). | LOCKED & VALIDATED |
| **DEC-02** | Device & Key Lifecycle | Pairwise Signal X3DH + Double Ratchet per device pair. Sender Keys (Megolm) for groups. Zero-RPO key backup using an **Encrypted Key Vault** (`Argon2id` + `AES-256-GCM`). | LOCKED & VALIDATED |
| **DEC-03** | Encrypted Search | **On-Device SQLCipher FTS5** on decrypted local messages (`p95 ≤ 2s`). Zero server plaintext indexing. | LOCKED & VALIDATED |
| **DEC-04** | Deletion Window & Semantics | Sender window: **48 hours** for Delete-for-Everyone; Group Admins can delete at any time. Signed `TOMBSTONE` control frame nulls payloads and purges local cached attachments. Already submitted moderation reports remain isolated. | LOCKED & VALIDATED |
| **DEC-05** | Content Rules & Limits | Text limit: **4,096 UTF-8 characters**. Attachment limit: **10 MB** (`10,485,760 bytes`). MIME whitelist enforced (JPEG, PNG, WebP, PDF, TXT, ZIP, DOCX, XLSX, PPTX). Executables blocked. | LOCKED & VALIDATED |
| **DEC-06** | Availability Boundary | 99.9% monthly availability measured at API/WebSocket edge via synthetic canary probes every 30s (`Send → Accept → Deliver`). Excludes announced maintenance (≤ 2h/month, 02:00–04:00 IST). | LOCKED & VALIDATED |
| **DEC-07** | RPO & Durability Boundary | Point of acknowledgement (`MSG_ACK`) committed to synchronous PostgreSQL replicas before responding to sender (`RPO = 0`). | LOCKED & VALIDATED |
| **DEC-08** | Report Content Disclosure | Users explicitly select reported message + up to 5 context messages. Plaintext decrypted on-device and re-encrypted with **Moderation Public Key (`Mod_PK`)**. Scoped RBAC review + immutable audit log. | LOCKED & VALIDATED |
| **DEC-09** | Receipt Monotonicity | State transitions: `1 (SENT) → 2 (DELIVERED) → 3 (READ)`. Late delivery acks from offline secondary devices never downgrade read status. | LOCKED & VALIDATED |
| **DEC-10** | Group History Slice | New group members receive an encrypted history bundle of the **latest ≤ 100 messages** (`history_floor_seq_id = max(1, current_seq_id - 100)`). Server blocks access to messages before floor. | LOCKED & VALIDATED |
| **DEC-11** | Blocking & Account Suspension | Direct: Bidirectional suppression of messages, presence, and typing. Group: Blocked user cannot add blocker. Suspension immediately closes active WebSockets with code `4403`. | LOCKED & VALIDATED |
| **DEC-12** | Interaction Permissions | Message edit allowed within 48h; renders `(edited)` tag. Pins allowed for members/admins. Forwarding re-encrypts payload under target conversation key. | LOCKED & VALIDATED |
| **DEC-13** | Notifications & Mute Rules | Muted chats suppress push. Active foreground WebSocket sessions suppress push within 500ms. Push payloads contain zero plaintext (`mutable-content` local decrypt). | LOCKED & VALIDATED |
| **DEC-14** | Recovery Measurement | RTO: ≤ 4 hours measured from primary AZ loss to restored message processing on synchronous standby. Zero message loss (`RPO = 0`). | LOCKED & VALIDATED |
| **DEC-15** | Cost Acceptance | Evaluated against single-region Multi-AZ baseline (t4g/c6g AWS instances, db.m6g.large RDS, ElastiCache Redis). | LOCKED & VALIDATED |

---

## 4. Phase 0 AI Implementation Tasks

- [x] **P0-T01 - Catalog Requirements & IDs:** Map all functional (`FR-001` to `FR-085`) and non-functional (`NFR-001` to `NFR-048`) requirements into a traceable requirements register.
- [x] **P0-T02 - Formalize Product Decisions:** Confirm approvals for the 15 decisions in the decision register (`DEC-01` to `DEC-15`).
- [x] **P0-T03 - Specify Test Conditions & Harness:** Define network emulation profiles (3G, packet loss 2%, airplane mode), real/virtual mobile device matrix (Android 11+, iOS 15+), and synthetic load configurations.
- [x] **P0-T04 - Consistency & Security Cross-Review:** Verify that E2EE, group re-keying, search, deletion, backup restoration, and moderation disclosures are mutually consistent.
- [x] **P0-T05 - Technical Design Approval Handoff:** Validate database DDL, WebSocket framing specs, and REST OpenAPI contracts against the 15 decisions.
- [x] **P0-T06 - Acceptance Baseline Sign-Off:** Establish the mandatory launch scope gate; confirm no mandatory launch requirements are deferred.

---

## 5. Phase 0 Exit Gate Checklist

- [x] Requirements catalog contains stable IDs and test criteria for all 85 FRs and 48 NFRs.
- [x] All 15 decisions (`DEC-01` to `DEC-15`) are reviewed and recorded with explicit resolution policies.
- [x] Security & Privacy Agent verifies zero plaintext leaks in architecture design.
- [x] Ready to initiate Phase 1 (`01-phase1-eligibility-identity-and-access.md`).
