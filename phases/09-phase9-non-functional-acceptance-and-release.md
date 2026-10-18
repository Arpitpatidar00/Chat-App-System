# 09 — Phase 9: Non-Functional Acceptance and Release

## 1. Scope & Ownership
- **Goal:** Prove that the integrated chat application meets all functional regressions, security and zero-plaintext guarantees, latency and throughput NFR benchmarks, Multi-AZ disaster recovery targets (Zero RPO, RTO ≤ 4h), and release checklist criteria.
- **Owner Role:** QA & Reliability Agent / Security & Privacy Agent
- **Reviewer Role:** Human Decision Owner / Technical Lead
- **Prerequisite:** Phases 0 through 8
- **Status:** READY

---

## 2. Non-Functional (NFR) Performance & Recovery Gate Matrix

| Metric ID | Measure / Objective | Load / Chaos Test Procedure (k6 + Chaos Mesh) | Pass Threshold |
| :--- | :--- | :--- | :--- |
| **NFR-003** | Max Group Size | Create 100-member group; execute concurrent message fan-out. | Handled without degradation |
| **NFR-005** | Message Acceptance Latency | 100 concurrent WebSocket sessions sustaining 25 msg/s + 60s burst at 100 msg/s. Measure `T(MSG_ACK) - T(MSG_SEND)`. | **p95 ≤ 500 ms** |
| **NFR-006 / 007** | Live Delivery Latency | 100 concurrent connected recipients under live load. Measure `T(Recipient WS) - T(Server Accept)`. | **p95 ≤ 1.0 s**<br>**p99 ≤ 3.0 s** |
| **NFR-008** | Presence & Typing Propagation | 50 concurrent presence updates and typing indicators. | **p95 ≤ 2.0 s** |
| **NFR-009** | Cold Conversation Load | Query first 50 messages from conversations with 10k history (`GET /v1/conversations/{id}/messages`). | **p95 ≤ 1.0 s** |
| **NFR-010** | On-Device Encrypted Search | Query local SQLCipher database populated with 20,000 decrypted messages on mobile test devices. | **p95 ≤ 2.0 s** |
| **NFR-011** | Push Notification Dispatch | Offline recipient message trigger; measure `T(Push Gateway Ack) - T(Server Accept)`. | **p95 ≤ 5.0 s** |
| **NFR-012 / 013** | Core-Chat Monthly Availability | Continuous canary synthetic monitor probe every 30 seconds (`Send → Accept → Deliver`). | **≥ 99.9%** (≤ 43.2 min/mo downtime) |
| **NFR-014 / 015 / 018** | Disaster Recovery RPO & RTO | Terminate primary AZ / PostgreSQL node during active stream. Failover to synchronous standby in `ap-south-2`. | **RPO = 0 messages lost**<br>**RTO ≤ 4 hours** |
| **NFR-027 / 042** | Zero-Plaintext Security Audit | Automated string dump inspection of DB, Redis, S3, logs, and APNs/FCM payloads. | **0 plaintext bytes leaked** |

---

## 3. Full-Lifecycle Cross-Phase E2E Test Suite

### E2E-M01: Multi-Device E2EE Lifecycle & Offline Convergence
1. Enroll User A (`Android A1`, `iOS A2`) and User B (`Android B1`, `iOS B2`).
2. Disconnect `A2` and `B2` (airplane mode).
3. `A1` and `B1` exchange 20 text messages, 2 E2EE attachments (`8 MB`), 3 edits, 2 reactions, 1 pin, and 1 delete-for-everyone.
4. `B1` marks all messages as `READ`.
5. Reconnect `A2` and `B2` and invoke `/v1/sync`.
6. **Assertions:**
   - All 4 devices converge to identical sequence order (`seq_id`).
   - Edited, pinned, and reaction states match across all 4 devices.
   - Tombstoned message plaintext and attachments are purged on all 4 devices.
   - `B2` unread count converges to `0`.

### E2E-M02: 100-Member Group Scaling, History Slice & Forward Secrecy
1. Create group with 100 members (`FR-009`); attempt to add 101st member → assert `400 GROUP_LIMIT_EXCEEDED`.
2. Remove Member #100 at `seq_id = 120`. Add New Member #101 at `seq_id = 121`.
3. **Assertions:**
   - Member #101 decrypts `seq_id` `21..121` (latest 100 messages); blocked from `1..20`.
   - Send message `seq_id = 122` → assert Removed Member #100 cannot fetch or decrypt `122`.
   - Suspend group owner → assert longest-tenured member is automatically promoted to `ADMIN`.

### E2E-M03: Zero-Plaintext Security & Cross-Tenant Isolation Audit
1. Run automated DB scan across PostgreSQL tables, Redis keys, S3 buckets, and application logs.
2. **Assertions:**
   - Zero plaintext message bodies or secret keys detected outside client memory.
   - Replay User C's token against User A's conversations and attachment pre-signed URLs → `100%` return `403 Forbidden`.

### E2E-M04: Disaster Recovery Chaos Failover Drill
1. Stream continuous messages (`client_msg_id` 1..5000) and delete 50 messages.
2. Forcefully terminate primary PostgreSQL instance / primary AZ mid-stream.
3. Execute automated/runbook failover to synchronous standby replica.
4. **Assertions:**
   - Every acknowledged `MSG_ACK` exists in the promoted database (`0 lost rows, RPO = 0`).
   - Post-restore tombstone scrubber cleans deleted entities (`0 resurrected messages`).
   - Core messaging restored well under the 4-hour RTO boundary.

---

## 4. Phase 9 AI Implementation Tasks

- [ ] **P9-T01: Android & iOS Functional Regression:** Run full automated regression suite across physical/emulator mobile matrix.
- [ ] **P9-T02: Peak-Load & Group Fan-Out Benchmarks:** Execute k6 load tests validating `p95 ≤ 500ms` acceptance and `p95 ≤ 1s` delivery.
- [ ] **P9-T03: Reconnect Storm & Multi-Device Convergence:** Simulate 100 devices dropping and reconnecting simultaneously.
- [ ] **P9-T04: Ordering & Retry Failure Stress:** Verify monotonic sequencing and deduplication under 5% synthetic packet loss.
- [ ] **P9-T05: E2EE, Authorization & Zero-Plaintext Audit:** Execute automated regex and entropy scanner across all datastores.
- [ ] **P9-T06: Backup Restoration & Disaster Recovery Drill:** Execute primary AZ termination and measure failover recovery integrity.
- [ ] **P9-T07: RPO Verification:** Assert zero message data loss for acknowledged frames (`RPO = 0`).
- [ ] **P9-T08: RTO Verification:** Measure time to service restoration (`RTO ≤ 4h`).
- [ ] **P9-T09: Availability Canary Monitoring:** Validate continuous synthetic monitoring alerting on `< 99.9%` uptime.
- [ ] **P9-T10: Resource & Infrastructure Cost Evaluation:** Measure CPU, memory, and bandwidth consumption under peak burst load.
- [ ] **P9-T11: Production Deployment & Rollback Drills:** Validate blue-green deployment and zero-downtime database migration rollback.
- [ ] **P9-T12: Compile Release Evidence Package:** Assemble final evidence package for Human Decision Owner sign-off.

---

## 5. Final Release Gate Checklist

Before authorizing production release, all 12 gates must be verified:

- [ ] **Gate 1:** All 85 Functional Requirements passed with automated test evidence.
- [ ] **Gate 2:** Every requirement maps to executed automated tests in the test catalog.
- [ ] **Gate 3:** Peak workload (25 msg/s sustained, 100 msg/s burst) passed with `p95 ≤ 500ms`.
- [ ] **Gate 4:** Both Android and iOS mobile platforms passed full regression suites.
- [ ] **Gate 5:** Cryptographic review verifies X3DH, Double Ratchet, and GSK forward secrecy.
- [ ] **Gate 6:** Search, history, and tombstone deletion policies verified consistent.
- [ ] **Gate 7:** Scoped moderation disclosure (`Mod_PK`) and admin audit logging verified.
- [ ] **Gate 8:** RPO = 0 and RTO ≤ 4 hours proven during chaos failover drill.
- [ ] **Gate 9:** Availability canary probes operational and reporting ≥ 99.9% availability.
- [ ] **Gate 10:** Zero open critical or high vulnerability findings.
- [ ] **Gate 11:** Production rollback and disaster runbooks tested and documented.
- [ ] **Gate 12:** Formal launch sign-off granted by Product, Security, and Technical leads.
