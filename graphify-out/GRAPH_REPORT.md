# Graph Report - chat-app  (2026-10-19)

## Corpus Check
- 142 files · ~108,955 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .example 1, .prisma 1)

## Summary
- 1486 nodes · 2316 edges · 80 communities (65 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5b1d5984`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- idea-refine.sh
- messages.service.ts
- Hardening Controls
- crypto.test.ts
- useMessageSend.ts
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
- phase3.test.ts
- types/package.json
- 03 — Phase 3: Realtime Delivery, Receipts, and Device Sync
- 05 — Phase 5: Message Actions and Conversation Controls
- 06 — Phase 6: Attachments and Links
- 07 — Phase 7: History, Encrypted Search, and Notifications
- 08 — Phase 8: Privacy, Reporting, and Data Lifecycle
- app.ts
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
- phase3.test.ts
- authRepository
- Chat System — AI Agent Implementation & Phase Registry
- conversationsController
- message-throughput.js
- messagesController
- conversations.repository.ts
- devicesRepository
- presenceService
- LocalSearchRepository
- env.ts
- receiptsRepository
- messages.repository.ts
- authController

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 56 edges
2. `Result` - 43 edges
3. `ok()` - 43 edges
4. `NotFoundError` - 36 edges
5. `err()` - 36 edges
6. `ForbiddenError` - 25 edges
7. `fastify` - 23 edges
8. `prisma` - 23 edges
9. `buildApp()` - 21 edges
10. `B. Shared Contracts (`@chat/types`)` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Feature Branches` --references--> `main()`  [INFERRED]
  .agents/skills/git-workflow-and-versioning/SKILL.md → apps/server/src/index.ts
- `Trunk-Based Development (Recommended)` --references--> `main()`  [INFERRED]
  .agents/skills/git-workflow-and-versioning/SKILL.md → apps/server/src/index.ts
- `B. Core Design Patterns Applied in the Backend` --references--> `UnitOfWork`  [INFERRED]
  phases/10-architecture-tech-stack-and-monorepo.md → apps/server/src/core/database/unit-of-work.ts
- `B. Shared Contracts (`@chat/types`)` --references--> `EnrollDeviceRequestDTO`  [INFERRED]
  phases/PHASE_0_COMPLETION_REPORT.md → packages/types/src/auth.types.ts
- `B. Shared Contracts (`@chat/types`)` --references--> `PrekeyBundleDTO`  [INFERRED]
  phases/PHASE_0_COMPLETION_REPORT.md → packages/types/src/auth.types.ts

## Import Cycles
- None detected.

## Communities (80 total, 15 thin omitted)

### Community 1 - "messages.service.ts"
Cohesion: 0.07
Nodes (48): AttachmentDeletedError, AttachmentTooLargeError, ConflictError, DeleteWindowExpiredError, DomainError, EditWindowExpiredError, ForbiddenError, GroupLimitExceededError (+40 more)

### Community 2 - "Hardening Controls"
Cohesion: 0.05
Nodes (42): Broken Access Control, Broken Authentication, Cross-Site Scripting (XSS), Data Classification, Dependency Audit Triage, Destructive Operations on Derived Paths, File Upload Safety, Hardening Patterns (+34 more)

### Community 3 - "crypto.test.ts"
Cohesion: 0.10
Nodes (32): DecryptedNotificationAlert, NotificationDecryptor, PreviewEnvelopeData, clientSessionManager, DeviceSession, PresignedUrlResult, RFC-5869, decryptAesGcm() (+24 more)

### Community 4 - "useMessageSend.ts"
Cohesion: 0.05
Nodes (55): ChatMessageItem, ChatScreen(), ChatScreenProps, MessageBubble(), MessageBubbleProps, ReceiptIcon(), ReceiptIconProps, MessageSender (+47 more)

### Community 5 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 6 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 8 - "Context Engineering"
Cohesion: 0.07
Nodes (28): Anti-Patterns, Common Rationalizations, Compress before dropping, Confusion Management, Context Budget Management, Context Engineering, Context Packing Strategies, Level 1: Rules Files (+20 more)

### Community 9 - "Git Workflow and Versioning"
Cohesion: 0.07
Nodes (26): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Branch Naming, Branching Strategy, Change Summaries (+18 more)

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
Cohesion: 0.05
Nodes (43): dependencies, @chat/crypto, @chat/database, @chat/types, dotenv, fastify, @fastify/cors, @fastify/helmet (+35 more)

### Community 42 - "phase3.test.ts"
Cohesion: 0.26
Nodes (6): env, closeRedisConnections(), createAuthToken(), main(), signJwt(), prisma

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

### Community 49 - "app.ts"
Cohesion: 0.23
Nodes (14): buildApp(), authenticateAndCheckEligibility(), fastify, requireAuth, attachmentsRoutes(), authRoutes(), conversationsRoutes(), devicesRoutes() (+6 more)

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
Cohesion: 0.15
Nodes (7): InterceptedPushPacket, IPushGateway, pushGateway, PushResult, pushNotificationService, ClearNotificationPushPayload, OutboundPushPayload

### Community 63 - "types/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, rootDir, extends, include, ../../tsconfig.base.json

### Community 64 - "00 — Phase 0: Requirements, Product Decisions & Engineering Baseline"
Cohesion: 0.29
Nodes (6): 00 — Phase 0: Requirements, Product Decisions & Engineering Baseline, 1. Objective & Ownership, 2. Target Scale & Infrastructure Topology (Baseline v2.0), 3. Mandatory Decision Register (`DEC-01` to `DEC-15`), 4. Phase 0 AI Implementation Tasks, 5. Phase 0 Exit Gate Checklist

### Community 65 - "phase3.test.ts"
Cohesion: 0.14
Nodes (7): ActiveSession, wsGateway, PresenceRecord, receiptsController, ReceiptDto, receiptsService, ws

### Community 67 - "Chat System — AI Agent Implementation & Phase Registry"
Cohesion: 0.33
Nodes (5): Chat System — AI Agent Implementation & Phase Registry, 📑 Core Documentation & Instructions, 🔄 Delivery Sequence & Phase Dependencies, 🛠️ Execution Protocol for AI Agents, 🚀 Phase Specifications Index

### Community 69 - "message-throughput.js"
Cohesion: 0.40
Nodes (3): errorRate, messageLatency, options

### Community 74 - "LocalSearchRepository"
Cohesion: 0.13
Nodes (3): LocalMessageRecord, LocalSearchRepository, SearchResult

### Community 75 - "env.ts"
Cohesion: 0.25
Nodes (5): __dirname, envSchema, parsed, dotenv, zod

## Knowledge Gaps
- **28 isolated node(s):** `@chat/crypto`, `@chat/types`, `@types/node`, `typescript`, `../../tsconfig.base.json` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 972 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `database/package.json` to `phase3.test.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `@chat/crypto`, `@chat/types`, `@types/node` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `messages.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06824193263974608 - nodes in this community are weakly interconnected._
- **Why does `prisma` connect `phase3.test.ts` to `messages.service.ts`, `phase3.test.ts`, `storageProvider`, `conversations.repository.ts`, `receiptsRepository`, `messages.repository.ts`, `auth.repository.ts`, `app.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Hardening Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Why does `fastify` connect `app.ts` to `phase3.test.ts`, `messages.service.ts`, `server/package.json`, `phase3.test.ts`, `presenceService`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `crypto.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09551020408163265 - nodes in this community are weakly interconnected._