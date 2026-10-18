# Graph Report - chat-app  (2026-10-19)

## Corpus Check
- 195 files · ~128,969 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .example 1, .prisma 1)

## Summary
- 1768 nodes · 2925 edges · 106 communities (92 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2678ebc8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- idea-refine.sh
- DomainError
- Hardening Controls
- moderation-crypto.ts
- mobile/src/index.ts
- Code Review and Quality
- Test-Driven Development
- conversationsRepository
- Context Engineering
- Git Workflow and Versioning
- Optimization Patterns
- Shipping and Launch
- API and Interface Design
- Browser Testing with DevTools
- Frontend UI Engineering
- CI/CD and Automation
- Constraint-Driven Development
- Deprecation and Migration
- Documentation and ADRs
- Incremental Implementation
- package.json
- Code Simplification
- Debugging and Error Recovery
- database/package.json
- 10 — Technical Architecture, Monorepo & System Design Blueprint
- Interview Me
- Planning and Task Breakdown
- mobile/package.json
- ReOrder: Keep Your Regulars Ordering Direct
- Idea Refine
- compilerOptions
- Doubt-Driven Development
- Process
- Using Agent Skills
- crypto/package.json
- tasks
- Spec-Driven Development
- Source-Driven Development
- storageProvider
- 04 — Phase 4: Groups, Membership, and Historical Access
- Refinement & Evaluation Criteria
- server/package.json
- app.ts
- types/package.json
- 03 — Phase 3: Realtime Delivery, Receipts, and Device Sync
- 05 — Phase 5: Message Actions and Conversation Controls
- 06 — Phase 6: Attachments and Links
- 07 — Phase 7: History, Encrypted Search, and Notifications
- 08 — Phase 8: Privacy, Reporting, and Data Lifecycle
- vault.ts
- WebSocketGateway
- 01 — Phase 1: Eligibility, Identity, and Access
- 02 — Phase 2: E2EE and Durable Messaging
- 09 — Phase 9: Non-Functional Acceptance and Release
- AI Agent Operating Instructions & Execution Framework
- Ideation Frameworks Reference
- mobile/tsconfig.json
- messagesRepository
- getRedisClient
- server/tsconfig.json
- crypto/tsconfig.json
- database/tsconfig.json
- pushGateway
- types/tsconfig.json
- 00 — Phase 0: Requirements, Product Decisions & Engineering Baseline
- receiptsService
- authRepository
- Chat System — AI Agent Implementation & Phase Registry
- conversationsController
- reconnect-storm.js
- audit-logs.repository.ts
- devices.repository.ts
- devicesRepository
- presenceService
- LocalSearchRepository
- privacy.types.ts
- crypto.test.ts
- message.types.ts
- B. Shared Contracts (`@chat/types`)
- pushNotificationService
- 2. Deliverables & Implementation Verification
- blocksRepository
- Phase 9 Completion & Final Release Gate Sign-Off Report
- messagesController
- Production Operations, Deployment & Disaster Recovery Runbook
- 1. Architectural Implementation Breakdown
- crypto/src/index.ts
- authController
- Phase 10 Completion Report: Technical Architecture, Monorepo & Operations Blueprint
- canaryController
- conversation.types.ts
- messages.repository.ts
- k6.config.js
- session-manager.ts
- tokenBucketRateLimiter
- 2. Key Architecture & Features Delivered
- 2. Key Architecture & Features Delivered
- Core Principles
- Phase 1 Completion & Sign-Off Report
- Phase 5 Completion Report: Message Actions and Conversation Controls
- main
- Phase 2 Completion & Sign-Off Report: E2EE and Durable Messaging
- Phase 3 Completion & Sign-Off Report: Realtime Delivery, Receipts, and Device Sync
- Release & Versioning
- Phase 6 Completion Report: Attachments and Links
- 5. Emergency Administrative Procedures

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 63 edges
2. `Result` - 50 edges
3. `ok()` - 50 edges
4. `NotFoundError` - 41 edges
5. `err()` - 41 edges
6. `prisma` - 35 edges
7. `fastify` - 33 edges
8. `ForbiddenError` - 31 edges
9. `buildApp()` - 27 edges
10. `conversationsService` - 22 edges

## Surprising Connections (you probably didn't know these)
- `P8-T07: Post-Restore Tombstone Scrubbing Hook (`NFR-040`)` --references--> `tombstoneScrubber`  [INFERRED]
  phases/PHASE_8_COMPLETION_REPORT.md → apps/server/src/features/privacy/tombstone-scrubber.ts
- `B. Shared Contracts (`@chat/types`)` --references--> `MessageType`  [INFERRED]
  phases/PHASE_0_COMPLETION_REPORT.md → packages/types/src/message.types.ts
- `C. Push Notification Gateway & Service (`P7-T05` to `P7-T08`)` --references--> `NotificationDecryptor`  [INFERRED]
  phases/PHASE_7_COMPLETION_REPORT.md → apps/mobile/src/crypto/notification-decryptor.ts
- `B. Core Design Patterns Applied in the Backend` --references--> `UnitOfWork`  [INFERRED]
  phases/10-architecture-tech-stack-and-monorepo.md → apps/server/src/core/database/unit-of-work.ts
- `A. Failure Resilience Mode` --references--> `tokenBucketRateLimiter`  [INFERRED]
  docs/OPERATIONS_RUNBOOK.md → apps/server/src/core/ratelimit/token-bucket.ts

## Import Cycles
- None detected.

## Communities (106 total, 14 thin omitted)

### Community 1 - "DomainError"
Cohesion: 0.06
Nodes (51): AttachmentDeletedError, AttachmentTooLargeError, ConflictError, DeleteWindowExpiredError, DomainError, EditWindowExpiredError, ForbiddenError, GroupLimitExceededError (+43 more)

### Community 2 - "Hardening Controls"
Cohesion: 0.05
Nodes (42): Broken Access Control, Broken Authentication, Cross-Site Scripting (XSS), Data Classification, Dependency Audit Triage, Destructive Operations on Derived Paths, File Upload Safety, Hardening Patterns (+34 more)

### Community 3 - "moderation-crypto.ts"
Cohesion: 0.21
Nodes (8): moderationCrypto, generateRsaKeyPair(), KeyPairPem, decryptModerationReport(), EncryptedModerationEnvelope, encryptForModeration(), ModerationReportPayload, DisclosedMessageItem

### Community 4 - "mobile/src/index.ts"
Cohesion: 0.08
Nodes (45): ChatMessageItem, ChatScreen(), ChatScreenProps, AttachmentPickerButton(), AttachmentPickerButtonProps, DEFAULT_ALLOWED_MIMES, MAX_ATTACHMENT_SIZE_BYTES, ConversationHeader() (+37 more)

### Community 5 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 6 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 7 - "conversationsRepository"
Cohesion: 0.10
Nodes (6): conversationsRepository, 1. Executive Summary, 2. Requirements & Verification Matrix, 3. End-to-End Acceptance Test Results, 4. Key Design Decisions, Phase 4 Completion Report: Groups, Membership, and Historical Access

### Community 8 - "Context Engineering"
Cohesion: 0.07
Nodes (28): Anti-Patterns, Common Rationalizations, Compress before dropping, Confusion Management, Context Budget Management, Context Engineering, Context Packing Strategies, Level 1: Rules Files (+20 more)

### Community 9 - "Git Workflow and Versioning"
Cohesion: 0.15
Nodes (12): Change Summaries, Common Rationalizations, Git Workflow and Versioning, Handling Generated Files, Overview, Pre-Commit Hygiene, Red Flags, The Save Point Pattern (+4 more)

### Community 10 - "Optimization Patterns"
Cohesion: 0.07
Nodes (25): Connection Pool Exhaustion, Large Bundle Size, Missing Caching (Backend), Missing Image Optimization (Frontend), N+1 Queries (Backend), Optimization Patterns, Queries That Ignore Their Index, Unbounded Data Fetching (+17 more)

### Community 11 - "Shipping and Launch"
Cohesion: 0.08
Nodes (25): Accessibility, Code Quality, Common Rationalizations, Documentation, Error Budget Release Gate, Error Reporting, Feature Flag Strategy, Infrastructure (+17 more)

### Community 12 - "API and Interface Design"
Cohesion: 0.08
Nodes (24): 1. Contract First, 2. Consistent Error Semantics, 3. Validate at Boundaries, 4. Prefer Addition Over Modification, 5. Predictable Naming, 6. Honouring an Idempotency Key, API and Interface Design, Common Rationalizations (+16 more)

### Community 13 - "Browser Testing with DevTools"
Cohesion: 0.08
Nodes (24): Accessibility Verification with DevTools, Available Tools, Browser Testing with DevTools, Clean Console Standard, Common Rationalizations, Console Analysis Patterns, Content Boundary Markers, For Network Issues (+16 more)

### Community 14 - "Frontend UI Engineering"
Cohesion: 0.08
Nodes (24): Accessibility (WCAG 2.1 AA), ARIA Labels, Avoid the AI Aesthetic, Color, Common Rationalizations, Component Architecture, Component Patterns, Design System Adherence (+16 more)

### Community 15 - "CI/CD and Automation"
Cohesion: 0.08
Nodes (23): Automation Beyond CI, Basic CI Pipeline, Build Cop Role, CI/CD and Automation, CI Optimization, Common Rationalizations, Dependabot / Renovate, Deployment Strategies (+15 more)

### Community 16 - "Constraint-Driven Development"
Cohesion: 0.08
Nodes (22): Adapting it, Contract, Floor guard: reference implementation, Reference (Node, ~stack-agnostic patterns), Common Rationalizations, Constraint-Driven Development, Escalation Path, Loading Constraints (+14 more)

### Community 17 - "Deprecation and Migration"
Cohesion: 0.08
Nodes (23): Adapter Pattern, Code Is a Liability, Common Rationalizations, Compulsory vs Advisory Deprecation, Core Principles, Database Schema Migrations (Expand/Contract), Deprecation and Migration, Deprecation Planning Starts at Design Time (+15 more)

### Community 18 - "Documentation and ADRs"
Cohesion: 0.09
Nodes (22): ADR Lifecycle, ADR Template, API Documentation, Architecture Decision Records (ADRs), Changelog Maintenance, Common Rationalizations, Document Known Gotchas, Documentation and ADRs (+14 more)

### Community 19 - "Incremental Implementation"
Cohesion: 0.09
Nodes (22): Common Rationalizations, Contract-First Slicing, Implementation Rules, Increment Checklist, Incremental Implementation, Overview, Red Flags, Risk-First Slicing (+14 more)

### Community 20 - "package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, turbo, typescript, engines, node, typescript, name (+14 more)

### Community 21 - "Code Simplification"
Cohesion: 0.09
Nodes (21): 1. Preserve Behavior Exactly, 2. Follow Project Conventions, 3. Prefer Clarity Over Cleverness, 4. Maintain Balance, 5. Scope to What Changed, Code Simplification, Common Rationalizations, Language-Specific Guidance (+13 more)

### Community 22 - "Debugging and Error Recovery"
Cohesion: 0.09
Nodes (21): Build Failure Triage, Common Rationalizations, Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, Overview, Red Flags, Runtime Error Triage (+13 more)

### Community 23 - "database/package.json"
Cohesion: 0.09
Nodes (21): dependencies, @prisma/client, description, devDependencies, prisma, @types/node, typescript, @types/node (+13 more)

### Community 24 - "10 — Technical Architecture, Monorepo & System Design Blueprint"
Cohesion: 0.10
Nodes (17): UnitOfWork, 10 — Technical Architecture, Monorepo & System Design Blueprint, 1. Executive Summary & Tech Stack Matrix, 2. Monorepo Directory Topology (`pnpm-workspace.yaml`), 3. Backend Architecture: 10-Year Principal Engineer Standards, 4. Frontend Architecture: React Native Parent-to-Child Hierarchy, 5. Database Setup: Supabase PostgreSQL & Prisma Schema, 6. Docker & Containerization Blueprint (+9 more)

### Community 25 - "Interview Me"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Example, Interaction with Other Skills, Interview Me, Loading Constraints, Output, Overview, Red Flags (+10 more)

### Community 26 - "Planning and Task Breakdown"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Output Files, Overview, Parallelization Opportunities, Plan Document Template, Planning and Task Breakdown, Red Flags, See Also (+10 more)

### Community 27 - "mobile/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @chat/crypto, @chat/types, description, devDependencies, @types/node, typescript, @chat/crypto (+11 more)

### Community 28 - "ReOrder: Keep Your Regulars Ordering Direct"
Cohesion: 0.11
Nodes (17): Example 1: Vague Early-Stage Concept (Full 3-Phase Session), Example 2: Feature Idea Within an Existing Product (Codebase-Aware), Example 3: Process/Workflow Idea (Non-Product), Ideation Session Examples, Key Assumptions to Validate, MVP Scope, Not Doing (and Why), Open Questions (+9 more)

### Community 29 - "Idea Refine"
Cohesion: 0.11
Nodes (17): Anti-patterns to Avoid, Common Rationalizations, Detailed Instructions, How It Works, Idea Refine, Output, Overview, Phase 1: Understand & Expand (Divergent) (+9 more)

### Community 30 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 31 - "Doubt-Driven Development"
Cohesion: 0.12
Nodes (15): Common Rationalizations, Cross-model escalation, Doubt-Driven Development, Interaction with Other Skills, Loading Constraints, Overview, Red Flags, Step 1: CLAIM — Surface what stands (+7 more)

### Community 32 - "Process"
Cohesion: 0.12
Nodes (15): 1. Define "working" before instrumenting, 2. Pick the right signal for each question, 3. Structured logging, 4. Metrics, 5. Distributed tracing, 6. Alerting, 7. Verify the telemetry itself, Common Rationalizations (+7 more)

### Community 33 - "Using Agent Skills"
Cohesion: 0.13
Nodes (14): 1. Surface Assumptions, 2. Manage Confusion Actively, 3. Push Back When Warranted, 4. Enforce Simplicity, 5. Maintain Scope Discipline, 6. Verify, Don't Assume, Core Operating Behaviors, Failure Modes to Avoid (+6 more)

### Community 34 - "crypto/package.json"
Cohesion: 0.11
Nodes (17): dependencies, @chat/types, description, devDependencies, @types/node, typescript, @chat/types, @types/node (+9 more)

### Community 35 - "tasks"
Cohesion: 0.13
Nodes (14): dependsOn, outputs, cache, cache, persistent, dependsOn, $schema, tasks (+6 more)

### Community 36 - "Spec-Driven Development"
Cohesion: 0.14
Nodes (13): Common Rationalizations, Keeping the Spec Alive, Overview, Phase 0: Scope Check, Phase 1: Specify, Phase 2: Plan, Phase 3: Tasks, Phase 4: Implement (+5 more)

### Community 37 - "Source-Driven Development"
Cohesion: 0.15
Nodes (12): Common Rationalizations, Overview, Red Flags, Retrieval Safety: Treat Fetched Content as Data, Source-Driven Development, Step 1: Detect Stack and Versions, Step 2: Fetch Official Documentation, Step 3: Implement Following Documented Patterns (+4 more)

### Community 38 - "storageProvider"
Cohesion: 0.10
Nodes (3): attachmentsRepository, CreateAttachmentParams, storageProvider

### Community 39 - "04 — Phase 4: Groups, Membership, and Historical Access"
Cohesion: 0.15
Nodes (12): 04 — Phase 4: Groups, Membership, and Historical Access, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 4 AI Implementation Tasks, 6. Phase 4 End-to-End (E2E) Acceptance Test Suite, Flow 4A: Group Creation & 100-Member Ceiling (`FR-009`, `NFR-003`) (+4 more)

### Community 40 - "Refinement & Evaluation Criteria"
Cohesion: 0.17
Nodes (11): 1. User Value, 2. Feasibility, 3. Differentiation, Assumption Audit, Core Evaluation Dimensions, Decision Framework, Might Be True (Nice to Have), Must Be True (Dealbreakers) (+3 more)

### Community 41 - "server/package.json"
Cohesion: 0.04
Nodes (45): dependencies, @chat/crypto, @chat/database, @chat/types, dotenv, fastify, @fastify/cors, @fastify/helmet (+37 more)

### Community 42 - "app.ts"
Cohesion: 0.05
Nodes (51): buildApp(), __dirname, env, envSchema, parsed, authenticateAndCheckEligibility(), fastify, requireAuth (+43 more)

### Community 43 - "types/package.json"
Cohesion: 0.17
Nodes (11): description, devDependencies, typescript, typescript, main, name, scripts, build (+3 more)

### Community 44 - "03 — Phase 3: Realtime Delivery, Receipts, and Device Sync"
Cohesion: 0.17
Nodes (11): 03 — Phase 3: Realtime Delivery, Receipts, and Device Sync, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL & Redis), 4. Client ↔ Server Workflows & Protocols, 5. Phase 3 AI Implementation Tasks, 6. Phase 3 End-to-End (E2E) Acceptance Test Suite, Flow 3A: Live Fan-Out to Connected Devices (`p95 ≤ 1s`, `p99 ≤ 3s`) (+3 more)

### Community 45 - "05 — Phase 5: Message Actions and Conversation Controls"
Cohesion: 0.17
Nodes (11): 05 — Phase 5: Message Actions and Conversation Controls, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 5 AI Implementation Tasks, 6. Phase 5 End-to-End (E2E) Acceptance Test Suite, Flow 5A: Reply & Edit Lifecycle (`FR-025`, `FR-026`, `FR-032`) (+3 more)

### Community 46 - "06 — Phase 6: Attachments and Links"
Cohesion: 0.17
Nodes (11): 06 — Phase 6: Attachments and Links, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 6 AI Implementation Tasks, 6. Phase 6 End-to-End (E2E) Acceptance Test Suite, Flow 6A: Pre-Flight, Encryption & S3 Pre-Signed Upload (`FR-046` to `FR-050`, `NFR-004`) (+3 more)

### Community 47 - "07 — Phase 7: History, Encrypted Search, and Notifications"
Cohesion: 0.17
Nodes (11): 07 — Phase 7: History, Encrypted Search, and Notifications, 1. Scope & Ownership, 2. Requirements Traceability, 3. Client & Server Data Models, 4. Client ↔ Server Workflows & Protocols, 5. Phase 7 AI Implementation Tasks, 6. Phase 7 End-to-End (E2E) Acceptance Test Suite, Client Local SQLCipher FTS5 Virtual Table (+3 more)

### Community 48 - "08 — Phase 8: Privacy, Reporting, and Data Lifecycle"
Cohesion: 0.17
Nodes (11): 08 — Phase 8: Privacy, Reporting, and Data Lifecycle, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 8 AI Implementation Tasks, 6. Phase 8 End-to-End (E2E) Acceptance Test Suite, Flow 8A: Bidirectional User Blocking (`FR-068`, `FR-069`) (+3 more)

### Community 49 - "vault.ts"
Cohesion: 0.31
Nodes (12): decryptAesGcm(), encryptAesGcm(), packEncryptedBuffer(), unpackEncryptedBuffer(), decryptAttachmentBlob(), encryptAttachmentBlob(), EncryptedAttachmentPackage, deriveKeyScrypt() (+4 more)

### Community 51 - "01 — Phase 1: Eligibility, Identity, and Access"
Cohesion: 0.18
Nodes (10): 01 — Phase 1: Eligibility, Identity, and Access, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 1 AI Implementation Tasks, 6. Phase 1 End-to-End (E2E) Acceptance Test Suite, Flow 1A: Eligibility Gate & Session Validation (+2 more)

### Community 52 - "02 — Phase 2: E2EE and Durable Messaging"
Cohesion: 0.18
Nodes (10): 02 — Phase 2: E2EE and Durable Messaging, 1. Scope & Ownership, 2. Requirements Traceability, 3. Server Data Models (PostgreSQL DDL), 4. Client ↔ Server Workflows & Protocols, 5. Phase 2 AI Implementation Tasks, 6. Phase 2 End-to-End (E2E) Acceptance Test Suite, Flow 2A: Device Enrollment & Zero-RPO Key Vault Backup (`FR-076`, `FR-079`, `NFR-020`) (+2 more)

### Community 53 - "09 — Phase 9: Non-Functional Acceptance and Release"
Cohesion: 0.18
Nodes (10): 09 — Phase 9: Non-Functional Acceptance and Release, 1. Scope & Ownership, 2. Non-Functional (NFR) Performance & Recovery Gate Matrix, 3. Full-Lifecycle Cross-Phase E2E Test Suite, 4. Phase 9 AI Implementation Tasks, 5. Final Release Gate Checklist, E2E-M01: Multi-Device E2EE Lifecycle & Offline Convergence, E2E-M02: 100-Member Group Scaling, History Slice & Forward Secrecy (+2 more)

### Community 54 - "AI Agent Operating Instructions & Execution Framework"
Cohesion: 0.18
Nodes (10): 1. Core Operating Rules, 2. Agent Roles & Ownership Matrix, 3. Work Tracking & Task Lifecycle, 4. Standard Agent Execution Procedure (8-Step Workflow), 5. Agent Assignment Template, 6. Phase Completion Report Template, 7. Change Control & Revalidation Workflow, AI Agent Operating Instructions & Execution Framework (+2 more)

### Community 55 - "Ideation Frameworks Reference"
Cohesion: 0.22
Nodes (8): Analogous Inspiration, Constraint-Based Ideation, First Principles Thinking, How Might We (HMW), Ideation Frameworks Reference, Jobs to Be Done (JTBD), Pre-mortem, SCAMPER

### Community 56 - "mobile/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 59 - "server/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 60 - "crypto/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 61 - "database/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 62 - "pushGateway"
Cohesion: 0.25
Nodes (5): InterceptedPushPacket, IPushGateway, pushGateway, PushResult, OutboundPushPayload

### Community 63 - "types/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 64 - "00 — Phase 0: Requirements, Product Decisions & Engineering Baseline"
Cohesion: 0.29
Nodes (6): 00 — Phase 0: Requirements, Product Decisions & Engineering Baseline, 1. Objective & Ownership, 2. Target Scale & Infrastructure Topology (Baseline v2.0), 3. Mandatory Decision Register (`DEC-01` to `DEC-15`), 4. Phase 0 AI Implementation Tasks, 5. Phase 0 Exit Gate Checklist

### Community 67 - "Chat System — AI Agent Implementation & Phase Registry"
Cohesion: 0.33
Nodes (5): Chat System — AI Agent Implementation & Phase Registry, 📑 Core Documentation & Instructions, 🔄 Delivery Sequence & Phase Dependencies, 🚀 Phase Specifications Index & Signed-Off Completion Reports, 🛠️ Verification Command Reference

### Community 69 - "reconnect-storm.js"
Cohesion: 0.13
Nodes (11): errorRate, messageLatency, options, failureRate, options, syncDuration, syncPayloadBytes, failureRate (+3 more)

### Community 70 - "audit-logs.repository.ts"
Cohesion: 0.11
Nodes (4): auditLogsRepository, CreateAuditLogParams, CreateReportParams, reportsRepository

### Community 74 - "LocalSearchRepository"
Cohesion: 0.13
Nodes (4): LocalMessageRecord, LocalSearchRepository, SearchResult, B. Client SQLCipher / SQLite FTS5 Local Search (`P7-T02`, `P7-T03`, `P7-T04`)

### Community 75 - "privacy.types.ts"
Cohesion: 0.18
Nodes (6): blocksController, AdminActionDTO, AdminAuditLogDTO, BlockUserRequestDTO, MetadataTransparencyManifestDTO, ReportStatusDTO

### Community 76 - "crypto.test.ts"
Cohesion: 0.27
Nodes (8): RFC-5869, deriveHkdf(), hkdfAsync, computeSharedSecret(), generateEd25519KeyPair(), generateX25519KeyPair(), signEd25519(), verifyEd25519()

### Community 77 - "message.types.ts"
Cohesion: 0.17
Nodes (11): EditMessageRequestDTO, EventTypeDTO, MessageAckDTO, MessageEventDTO, MessageType, MuteConversationRequestDTO, PagedHistoryQueryDTO, PagedHistoryResponseDTO (+3 more)

### Community 78 - "B. Shared Contracts (`@chat/types`)"
Cohesion: 0.24
Nodes (11): MessageDTO, PresenceVisibility, TypingIndicatorDTO, UserPresenceDTO, GroupReaderItemDTO, ReadUpToDTO, RECEIPT_STATUS, ReceiptAckDTO (+3 more)

### Community 79 - "pushNotificationService"
Cohesion: 0.18
Nodes (7): pushNotificationService, 1. Executive Summary, 2. Implementation Details, 3. End-to-End Acceptance Test Results, A. Server Paged History Pagination (`P7-T01`), C. Push Notification Gateway & Service (`P7-T05` to `P7-T08`), Phase 7 Completion Report: History, Encrypted Search, and Notifications

### Community 80 - "2. Deliverables & Implementation Verification"
Cohesion: 0.18
Nodes (10): 1. Executive Summary, 2. Deliverables & Implementation Verification, 3. Test & Verification Matrix, 4. Phase 0 Exit Gate Verification, A. Monorepo Architecture & Tooling, C. Database & Prisma ORM (`@chat/database`), D. Cryptographic Suite (`@chat/crypto`), E. Backend Gateway (`@chat/server`) (+2 more)

### Community 82 - "Phase 9 Completion & Final Release Gate Sign-Off Report"
Cohesion: 0.29
Nodes (5): 1. Full-Lifecycle Cross-Phase Acceptance Suite Results, 2. Final Release Gate Verification Checklist, 3. Monorepo Status Overview (Phases 0 — 9), Executive Summary, Phase 9 Completion & Final Release Gate Sign-Off Report

### Community 83 - "messagesController"
Cohesion: 0.14
Nodes (9): MessageSender, UseMessageSendOptions, calculateBackoffMs(), MAX_RETRY_ATTEMPTS, MessageStateContext, StateMachineEvent, transitionMessageState(), messagesController (+1 more)

### Community 84 - "Production Operations, Deployment & Disaster Recovery Runbook"
Cohesion: 0.15
Nodes (12): 1. System Topology & Architecture Baseline, 2. Zero-Downtime Deployment & Blue-Green Rollback, 3. High-Availability Database Operations & Failover (RPO=0, RTO < 4h), 6. Security Incident Response & Zero-Plaintext Audit, 7. Operational Runbook Summary & Contacts, A. Deployment Protocol, A. Health & Replication Verification, A. Security Scanner Execution (+4 more)

### Community 85 - "1. Architectural Implementation Breakdown"
Cohesion: 0.18
Nodes (10): 1. Architectural Implementation Breakdown, 2. Test Verification Matrix, 3. Full Monorepo Status (Phase 0 — Phase 8), Executive Summary, P8-T01: Bidirectional User Blocking (`FR-068`, `FR-069`), P8-T02 & P8-T03: Scoped Cryptographic Moderation Disclosure (`FR-070` to `FR-073`, `FR-084`, `NFR-029`), P8-T04: Immutable Write-Ahead Admin Audit Logger (`FR-075`, `NFR-029`), P8-T06: Metadata Transparency Manifest (`FR-085`, `NFR-041`) (+2 more)

### Community 86 - "crypto/src/index.ts"
Cohesion: 0.22
Nodes (5): DecryptedNotificationAlert, NotificationDecryptor, PreviewEnvelopeData, ClearNotificationPushPayload, ZeroPlaintextPushPayload

### Community 88 - "Phase 10 Completion Report: Technical Architecture, Monorepo & Operations Blueprint"
Cohesion: 0.20
Nodes (9): 1. Executive Summary, 2. Deliverables Summary, 3. Monorepo Verification Matrix Across All Phases, 4. Sign-Off Statement, A. React Native Mobile Component Hierarchy (`apps/mobile/src`), B. Master k6 Performance & Chaos Testing Harness (`load-tests/`), C. Containerization & Deployment Orchestration, D. Production Operations Runbook (+1 more)

### Community 90 - "conversation.types.ts"
Cohesion: 0.25
Nodes (6): AddGroupMemberDTO, ConversationType, CreateDirectConversationDTO, CreateGroupConversationDTO, MemberRole, UploadHistoryPackageDTO

### Community 91 - "messages.repository.ts"
Cohesion: 0.31
Nodes (4): TransactionClient, uow, CreateMessageParams, EncryptedPayloads

### Community 93 - "session-manager.ts"
Cohesion: 0.33
Nodes (3): clientSessionManager, DeviceSession, EncryptedPayload

### Community 94 - "tokenBucketRateLimiter"
Cohesion: 0.29
Nodes (5): tokenBucketRateLimiter, 4. Ephemeral Redis Pub/Sub & Fallback Modes, A. Failure Resilience Mode, B. Redis Recovery, P8-T05: Abuse Rate Limiting (`FR-074`)

### Community 95 - "2. Key Architecture & Features Delivered"
Cohesion: 0.29
Nodes (7): 2. Key Architecture & Features Delivered, A. Multi-Device Registration & X3DH Prekey Pool (`P2-T01`, `FR-076`, `FR-077`), B. Encrypted Key Backup Vault (Zero-RPO Recovery) (`P2-T02`, `NFR-020`, `NFR-023`), C. Atomic Monotonic Message Sequencing (`P2-T03`, `FR-021`, `NFR-017`), D. Idempotent Deduplication Engine (`P2-T05`, `FR-020`, `NFR-016`), E. Durable Offline Sync (`P2-T06`, `P2-T07`, `FR-022`, `FR-024`), F. Client Send State Machine (`P2-T04`, `apps/mobile`)

### Community 96 - "2. Key Architecture & Features Delivered"
Cohesion: 0.29
Nodes (7): 2. Key Architecture & Features Delivered, A. Realtime Fan-Out Dispatcher (`P3-T01`, `NFR-006`, `NFR-007`), B. Monotonic Receipt State Machine (`P3-T02`, `FR-038`, `NFR-033`), C. Multi-Device Unread Synchronization (`P3-T03`, `FR-035`, `FR-037`), D. Multi-Device Presence Aggregator & Dead-Socket Reaper (`P3-T04`, `FR-041`, `FR-042`), E. Presence Privacy & Visibility Engine (`P3-T05`, `NFR-030`), F. Typing Indicator TTL Broadcast (`P3-T06`, `FR-044`, `NFR-034`)

### Community 97 - "Core Principles"
Cohesion: 0.33
Nodes (6): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Core Principles

### Community 98 - "Phase 1 Completion & Sign-Off Report"
Cohesion: 0.33
Nodes (5): 1. Executive Summary, 2. Delivered Capabilities & Requirement Traceability, 3. Test Evidence, 4. Sign-Off Statement, Phase 1 Completion & Sign-Off Report

### Community 99 - "Phase 5 Completion Report: Message Actions and Conversation Controls"
Cohesion: 0.33
Nodes (5): 1. Executive Summary, 2. Requirements & Verification Matrix, 3. End-to-End Acceptance Test Results, 4. Key Architectural Patterns Maintained, Phase 5 Completion Report: Message Actions and Conversation Controls

### Community 100 - "main"
Cohesion: 0.40
Nodes (5): Branch Naming, Branching Strategy, Feature Branches, Trunk-Based Development (Recommended), main()

### Community 101 - "Phase 2 Completion & Sign-Off Report: E2EE and Durable Messaging"
Cohesion: 0.40
Nodes (4): 1. Executive Summary, 3. Automated Acceptance Test Results, 4. Git Commit Traceability, Phase 2 Completion & Sign-Off Report: E2EE and Durable Messaging

### Community 102 - "Phase 3 Completion & Sign-Off Report: Realtime Delivery, Receipts, and Device Sync"
Cohesion: 0.40
Nodes (4): 1. Executive Summary, 3. Automated Acceptance Test Results, 4. Git Commit Traceability, Phase 3 Completion & Sign-Off Report: Realtime Delivery, Receipts, and Device Sync

### Community 103 - "Release & Versioning"
Cohesion: 0.50
Nodes (4): Keep a changelog written for humans, Release & Versioning, Semantic Versioning, Tag the release, and let the tag be the source of truth

### Community 104 - "Phase 6 Completion Report: Attachments and Links"
Cohesion: 0.50
Nodes (3): 1. Executive Summary, 3. End-to-End Acceptance Test Results, Phase 6 Completion Report: Attachments and Links

### Community 105 - "5. Emergency Administrative Procedures"
Cohesion: 0.67
Nodes (3): 5. Emergency Administrative Procedures, A. Instant Account Suspension Kill-Switch, B. Scoped Moderation Disclosure (`Mod_PK`)

## Knowledge Gaps
- **28 isolated node(s):** `@chat/crypto`, `@chat/types`, `@types/node`, `typescript`, `../../tsconfig.base.json` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1093 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fastify` connect `app.ts` to `server/package.json`, `DomainError`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `@chat/crypto`, `@chat/types`, `@types/node` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DomainError` be split into smaller, more focused modules?**
  _Cohesion score 0.057177129148340666 - nodes in this community are weakly interconnected._
- **Why does `main()` connect `main` to `Phase 10 Completion Report: Technical Architecture, Monorepo & Operations Blueprint`, `app.ts`, `Phase 2 Completion & Sign-Off Report: E2EE and Durable Messaging`, `Phase 3 Completion & Sign-Off Report: Realtime Delivery, Receipts, and Device Sync`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `Hardening Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Why does `prisma` connect `app.ts` to `DomainError`, `authRepository`, `receiptsService`, `storageProvider`, `devices.repository.ts`, `audit-logs.repository.ts`, `messages.repository.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `mobile/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08461538461538462 - nodes in this community are weakly interconnected._