# 10 — Technical Architecture, Monorepo & System Design Blueprint

## 1. Executive Summary & Tech Stack Matrix

This document defines the production engineering baseline, monorepo topology, backend domain-driven feature architecture, frontend React Native component hierarchy, and database configuration for the Chat System.

| Tier | Technology | Rationale & Architectural Role |
| :--- | :--- | :--- |
| **Monorepo Engine** | **pnpm Workspaces + Turborepo** | Zero duplicate types, strict package boundary enforcement, cached build pipeline. |
| **Backend Runtime** | **Node.js (LTS) + TypeScript (Strict)** | Fast I/O, native async event loop for WebSockets, shared AST types with client. |
| **API & Gateway** | **Fastify + `ws` / Socket.IO** | Low-overhead routing, schema-based serialization, high-concurrency WebSocket engine. |
| **Primary Datastore** | **Supabase (PostgreSQL 15+)** | Managed PostgreSQL with row-level security capabilities, synchronous replication. |
| **ORM & Migrations** | **Prisma (Latest v5+)** | Type-safe query engine, automated migrations via `DIRECT_URL`, connection pooling via PgBouncer (`DATABASE_URL`). |
| **Ephemeral Cache & Pub/Sub** | **Redis Cluster (v7+)** | Cross-instance WebSocket message fan-out, 45s presence aggregation, typing TTLs, rate limiting. |
| **Mobile Client** | **React Native (TypeScript)** | Single code-base for Android and iOS, direct native bridge to OS Keychains/Keystores. |
| **Local Client Datastore** | **SQLCipher (AES-256) + FTS5** | On-device encrypted storage, zero server plaintext indexing, sub-millisecond local queries. |
| **End-to-End Cryptography** | **`@signalapp/libsignal-client` / WebCrypto** | Signal X3DH + Double Ratchet (1:1), Group Sender Keys (Groups), Argon2id (Key Vault). |
| **Containerization** | **Docker & Docker Compose** | Multi-stage production containers, local containerized Redis, MinIO, and API services. |
| **Performance & Load Testing** | **k6 (Grafana)** | Real-time WebSocket + REST load generator simulating 100 concurrent users, bursts, and latency gates. |

---

## 2. Monorepo Directory Topology (`pnpm-workspace.yaml`)

```
chat-app/
├── apps/
│   ├── mobile/                    # React Native Mobile Application (iOS & Android)
│   │   ├── android/
│   │   ├── ios/
│   │   ├── src/
│   │   │   ├── app/               # Navigation, Root Providers, Theme, App Entry
│   │   │   ├── features/          # Feature-based mobile modules (Parent-to-Child)
│   │   │   │   ├── auth/
│   │   │   │   ├── chat/          # Chat feature (Screen -> Container -> List -> Bubble -> Input)
│   │   │   │   ├── conversations/
│   │   │   │   ├── presence/
│   │   │   │   └── settings/
│   │   │   ├── shared/            # Shared UI components, Design tokens, Custom Hooks
│   │   │   └── storage/           # SQLCipher database adapter, FTS5 repository
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── server/                    # Node.js TypeScript API & WebSocket Gateway
│       ├── src/
│       │   ├── core/              # Gateway infrastructure, Config, HTTP/WS Engine, Logger
│       │   ├── features/          # Feature-based domain modules (10-Year Clean Architecture)
│       │   │   ├── auth/          # Identity, Verification, JWT, Eligibility Gate
│       │   │   ├── conversations/ # 1:1 Upsert (Pair Hash), Group CRUD, Memberships
│       │   │   ├── messages/      # MSG_SEND pipeline, Atomic Seq Allocation, Deduplication
│       │   │   ├── receipts/      # Monotonic Receipts (1->2->3), Group Read Attribution
│       │   │   ├── presence/      # Redis Presence Aggregator (45s TTL), Typing Indicators
│       │   │   ├── attachments/   # S3 Pre-signed URLs, Size Guard, MIME Whitelist
│       │   │   ├── search/        # History sync, Cursor pagination
│       │   │   └── moderation/    # User Blocking, Mod_PK Disclosures, Audit Logs
│       │   ├── shared/            # Common Errors, Result Pattern, Middleware, Security Helpers
│       │   └── index.ts           # Server bootstrap & graceful shutdown
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── types/                     # Shared TypeScript contracts & DTOs (Zero Duplication!)
│   │   ├── src/
│   │   │   ├── auth.types.ts
│   │   │   ├── conversation.types.ts
│   │   │   ├── message.types.ts
│   │   │   ├── receipt.types.ts
│   │   │   ├── presence.types.ts
│   │   │   ├── attachment.types.ts
│   │   │   ├── websocket-events.types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── crypto/                    # Shared Cryptographic Primitives
│   │   ├── src/
│   │   │   ├── ratchet.ts         # Double Ratchet interface
│   │   │   ├── sender-keys.ts     # Group Sender Key manager
│   │   │   ├── vault.ts           # Argon2id master backup derivation
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── database/                  # Prisma ORM schema, Client generator, Seeds, Migrations
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       │   └── client.ts          # Singleton PrismaClient with PgBouncer connection logic
│       ├── package.json
│       └── tsconfig.json
│
├── load-tests/                    # k6 Performance & Chaos Test Harness
│   ├── scenarios/
│   │   ├── message-throughput.js  # 25 msg/s sustained + 100 msg/s burst test
│   │   ├── websocket-fanout.js    # Group 100-member fan-out latency test
│   │   └── reconnect-storm.js     # 100 concurrent reconnect delta sync test
│   └── k6.config.js
│
├── docker-compose.yml             # Local runtime (Redis, Server, Mock S3/MinIO, k6)
├── .env                           # Local environment credentials
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 3. Backend Architecture: 10-Year Principal Engineer Standards

To eliminate duplicated logic and enforce clean separation of concerns, the backend strictly implements a **Domain-Driven Feature-Based Architecture** coupled with established design patterns.

### A. Feature Module Internal Structure
Every feature inside `apps/server/src/features/{feature-name}/` is strictly self-contained and follows this uniform 5-layer anatomy:

```
src/features/messages/
├── messages.controller.ts    # HTTP Route handlers & WebSocket action dispatchers
├── messages.service.ts       # Business rules, domain orchestration, transaction boundary
├── messages.repository.ts    # Data access layer strictly abstracting Prisma database queries
├── messages.dto.ts           # Input validation schemas (Zod) and inferred TypeScript types
├── messages.events.ts        # Redis Pub/Sub domain event publishers & listeners
└── index.ts                  # Public module boundary (exposes only what other features may import)
```

### B. Core Design Patterns Applied in the Backend

1. **Repository Pattern (`*.repository.ts`)**:
   - The service layer never queries Prisma directly. All database access is encapsulated inside repository classes with explicit interfaces (e.g., `IMessageRepository`). This isolates ORM idiosyncrasies, simplifies mocking in unit tests, and allows swapping or optimizing SQL queries without touching business rules.
2. **Unit of Work Pattern (`UnitOfWork`)**:
   - Complex state transitions spanning multiple entities (e.g. allocating `conversations.last_seq_id` + inserting `messages` + appending `message_events`) are orchestrated through an atomic transaction context (`prisma.$transaction`).
3. **Strategy Pattern (`StorageStrategy`, `PushStrategy`)**:
   - Pluggable interfaces for external I/O:
     - `IObjectStorage`: AWS S3 in production, MinIO in local Docker/CI.
     - `IPushProvider`: FCM for Android, APNs for iOS, MockPush for test suites.
4. **Observer / Pub-Sub Pattern (`RedisEventBus`)**:
   - WebSocket gateway instances subscribe to Redis channels (`conv:{id}`) to fan out real-time frames across cluster nodes without inter-server coupling.
5. **Middleware / Pipeline Pattern**:
   - Express/Fastify request lifecycle middleware:
     - `VerifyJwtMiddleware`: Anti-spoofing token validation.
     - `EligibilityGateMiddleware`: Status enforcement (`users.status IN ('VERIFIED', 'APPROVED')`).
     - `RateLimiterMiddleware`: Redis Token Bucket enforcement (30 msgs / 10s).
     - `StructuredLogRedactor`: Interceptor automatically wiping `ciphertext`, `tokens`, and credentials from stdout.
6. **Result / Either Pattern (`Result<T, DomainError>`)**:
   - Services return typed `Result.ok(data)` or `Result.fail(new UserBlockedError())` rather than throwing uncontrolled exceptions. Controllers translate domain errors into exact HTTP/WS status codes deterministically.

---

## 4. Frontend Architecture: React Native Parent-to-Child Hierarchy

The mobile application enforces a strict **Unidirectional Data Flow** and parent-to-child component hierarchy.

### A. Component Hierarchy Tree (Example: Chat Conversation)

```
[Screen Container] ChatScreen.tsx (Coordinates route params, active socket listeners)
  │
  └── [Feature View] ConversationView.tsx (Manages local state machine, scroll viewport)
        │
        ├── [Header Section] ConversationHeader.tsx
        │     ├── TitleAndAvatar.tsx (Renders title, avatar, encrypted lock badge)
        │     └── PresenceSubtitle.tsx (Displays "Online", "Typing...", or "Last seen")
        │
        ├── [Message List Section] MessageFlatList.tsx (Virtual list, inverted scrolling)
        │     └── [Row Component] MessageItem.tsx (Encapsulates layout, gestures, swipe-to-reply)
        │           ├── [Bubble Compound] MessageBubble.tsx
        │           │     ├── ReplyQuoteBlock.tsx (Renders quoted parent message preview)
        │           │     ├── MessageContent.tsx (Text, EncryptedImage, FileAttachment, LinkPreview)
        │           │     ├── MessageMetadata.tsx (Timestamp, Edited tag, Monotonic Receipt Ticks)
        │           │     └── ReactionsPillList.tsx (Aggregated emoji pills with counter)
        │           └── MessageActionBar.tsx (Context menu: Copy, Edit, Delete, Forward, Pin)
        │
        └── [Footer Input Section] MessageInputBar.tsx
              ├── AttachmentPickerButton.tsx (Launches modal with MIME & 10 MB guards)
              ├── EncryptedTextInput.tsx (Auto-expanding text box with 4,096 char limit)
              └── SendButton.tsx (Emits optimistic send event to local SQLCipher DB)
```

### B. Mobile Design Patterns
- **Container / Presentational Pattern**: Pure presentation components receive props and emit events; business logic, cryptographic ratchet invocation, and SQLite triggers live in Custom Hooks (`useConversationMessages`, `usePresence`, `useAttachmentUpload`).
- **State Machine Pattern**: Message transmission follows deterministic states: `PENDING` (optimistic local write) → `SENT` (server ack) → `DELIVERED` (peer ack) → `READ` (peer opened), with explicit `FAILED (Tap to Retry)` recovery.
- **Offline Repository Pattern**: Decoupled SQLCipher FTS5 repository exposing observable streams that seamlessly merge local encrypted SQLite data with remote WebSocket delta sync.

---

## 5. Database Setup: Supabase PostgreSQL & Prisma Schema

### A. Dual Connection String Architecture
To support high-concurrency connection pooling alongside transactional DDL schema migrations, Prisma is configured with dual endpoints:

1. **`DATABASE_URL` (Port 6543, Transaction Pooler - PgBouncer)**:
   - Used by the Node.js application server at runtime.
   - Holds short-lived database connections, supporting thousands of concurrent client requests without exhausting PostgreSQL connection limits.
2. **`DIRECT_URL` (Port 5432, Session Pooler / Direct Postgres)**:
   - Used strictly by Prisma CLI for `prisma migrate deploy`, `prisma db push`, and advisory locks.

### B. Production Prisma Schema (`packages/database/prisma/schema.prisma`)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserStatus {
  PENDING
  VERIFIED
  APPROVED
  SUSPENDED
  DELETED
}

enum Platform {
  IOS
  ANDROID
  WEB
}

enum DeviceStatus {
  ACTIVE
  REVOKED
}

enum ConversationType {
  DIRECT
  GROUP
}

enum MemberRole {
  OWNER
  ADMIN
  MEMBER
  REMOVED
}

enum MessageType {
  TEXT
  IMAGE
  FILE
  LINK
  SYSTEM
}

enum EventType {
  EDIT
  DELETE_EVERYONE
  REACTION_ADD
  REACTION_REMOVE
  PIN
  UNPIN
}

enum AttachmentStatus {
  UPLOADING
  COMMITTED
  DELETED
}

enum ReportStatus {
  OPEN
  IN_REVIEW
  RESOLVED
  PURGED
}

enum AdminAction {
  VIEW_REPORT
  SUSPEND_USER
  RESOLVE_REPORT
  REVOKE_DEVICE
}

model User {
  id              String         @id @default(uuid()) @db.Uuid
  username        String         @unique
  status          UserStatus     @default(PENDING)
  presencePrivacy Json           @default("{\"visibility\": \"EVERYONE\"}") @map("presence_privacy")
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime       @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  devices         Device[]
  keyVault        KeyBackupVault?
  memberships     ConversationMember[]
  createdChats    Conversation[] @relation("CreatedBy")
  sentMessages    Message[]      @relation("SentMessages")
  receipts        MessageReceipt[]
  hiddenMessages  UserHiddenMessage[]
  blockedUsers    UserBlock[]    @relation("Blocker")
  blockedBy       UserBlock[]    @relation("Blocked")
  reportsFiled    ModerationReport[] @relation("Reporter")
  reportsReceived ModerationReport[] @relation("ReportedUser")
  reviewedReports ModerationReport[] @relation("Reviewer")
  adminAuditLogs  AdminAuditLog[]
  historyPackages GroupHistoryPackage[]
  attachments     Attachment[]

  @@map("users")
}

model Device {
  deviceId         String       @id @default(uuid()) @map("device_id") @db.Uuid
  userId           String       @map("user_id") @db.Uuid
  deviceName       String       @map("device_name")
  platform         Platform
  pushToken        String?      @map("push_token")
  identityKeyPub   Bytes        @map("identity_key_pub")
  signedPrekeyPub  Bytes        @map("signed_prekey_pub")
  signedPrekeySig  Bytes        @map("signed_prekey_sig")
  status           DeviceStatus @default(ACTIVE)
  lastActiveAt     DateTime     @default(now()) @map("last_active_at") @db.Timestamptz
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz

  user             User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  oneTimePrekeys   OneTimePrekey[]
  sentMessages     Message[]    @relation("SenderDevice")

  @@map("devices")
}

model OneTimePrekey {
  id        BigInt   @id @default(autoincrement())
  deviceId  String   @map("device_id") @db.Uuid
  keyId     Int      @map("key_id")
  publicKey Bytes    @map("public_key")
  consumed  Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  device    Device   @relation(fields: [deviceId], references: [deviceId], onDelete: Cascade)

  @@unique([deviceId, keyId])
  @@index([deviceId, consumed])
  @@map("one_time_prekeys")
}

model KeyBackupVault {
  userId             String   @id @map("user_id") @db.Uuid
  encryptedVaultBlob Bytes    @map("encrypted_vault_blob")
  kdfSalt            Bytes    @map("kdf_salt")
  kdfParams          Json     @map("kdf_params")
  version            Int      @default(1)
  updatedAt          DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("key_backup_vault")
}

model Conversation {
  id             String           @id @default(uuid()) @db.Uuid
  type           ConversationType
  directPairHash String?          @unique @map("direct_pair_hash")
  title          String?
  lastSeqId      BigInt           @default(0) @map("last_seq_id")
  createdBy      String           @map("created_by") @db.Uuid
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz

  creator        User             @relation("CreatedBy", fields: [createdBy], references: [id])
  members        ConversationMember[]
  messages       Message[]
  events         MessageEvent[]
  historyPackages GroupHistoryPackage[]
  attachments    Attachment[]
  reports        ModerationReport[]

  @@map("conversations")
}

model ConversationMember {
  conversationId    String     @map("conversation_id") @db.Uuid
  userId            String     @map("user_id") @db.Uuid
  role              MemberRole @default(MEMBER)
  joinedAtSeqId     BigInt     @default(0) @map("joined_at_seq_id")
  historyFloorSeqId BigInt     @default(1) @map("history_floor_seq_id")
  removedAtSeqId    BigInt?    @map("removed_at_seq_id")
  mutedUntil        DateTime?  @map("muted_until") @db.Timestamptz

  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([conversationId, userId])
  @@index([userId, conversationId])
  @@map("conversation_members")
}

model Message {
  id                String       @id @default(uuid()) @db.Uuid
  conversationId    String       @map("conversation_id") @db.Uuid
  seqId             BigInt       @map("seq_id")
  senderId          String       @map("sender_id") @db.Uuid
  senderDeviceId    String       @map("sender_device_id") @db.Uuid
  clientMsgId       String       @map("client_msg_id") @db.Uuid
  msgType           MessageType  @default(TEXT) @map("msg_type")
  encryptedPayloads Json         @map("encrypted_payloads")
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz
  isTombstoned      Boolean      @default(false) @map("is_tombstoned")

  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender            User         @relation("SentMessages", fields: [senderId], references: [id])
  senderDevice      Device       @relation("SenderDevice", fields: [senderDeviceId], references: [deviceId])
  receipts          MessageReceipt[]
  hiddenByUsers     UserHiddenMessage[]
  events            MessageEvent[]

  @@unique([conversationId, seqId])
  @@unique([senderDeviceId, clientMsgId])
  @@index([conversationId, seqId(sort: Asc)])
  @@map("messages")
}

model MessageReceipt {
  conversationId String    @map("conversation_id") @db.Uuid
  messageId      String    @map("message_id") @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  status         Int       @default(1) @db.SmallInt // 1=SENT, 2=DELIVERED, 3=READ
  deliveredAt    DateTime? @map("delivered_at") @db.Timestamptz
  readAt         DateTime? @map("read_at") @db.Timestamptz

  message        Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([messageId, userId])
  @@index([conversationId, userId, status])
  @@map("message_receipts")
}

model MessageEvent {
  eventId          BigInt       @id @default(autoincrement()) @map("event_id")
  conversationId   String       @map("conversation_id") @db.Uuid
  targetMessageId  String       @map("target_message_id") @db.Uuid
  actorId          String       @map("actor_id") @db.Uuid
  actorDeviceId    String       @map("actor_device_id") @db.Uuid
  eventType        EventType    @map("event_type")
  encryptedPatch   Bytes?       @map("encrypted_patch")
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz

  conversation     Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  targetMessage    Message      @relation(fields: [targetMessageId], references: [id], onDelete: Cascade)

  @@index([conversationId, eventId(sort: Asc)])
  @@map("message_events")
}

model UserHiddenMessage {
  userId    String   @map("user_id") @db.Uuid
  messageId String   @map("message_id") @db.Uuid
  hiddenAt  DateTime @default(now()) @map("hidden_at") @db.Timestamptz

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@id([userId, messageId])
  @@map("user_hidden_messages")
}

model GroupHistoryPackage {
  id                         String   @id @default(uuid()) @db.Uuid
  conversationId             String   @map("conversation_id") @db.Uuid
  recipientUserId            String   @map("recipient_user_id") @db.Uuid
  fromSeqId                  BigInt   @map("from_seq_id")
  toSeqId                    BigInt   @map("to_seq_id")
  encryptedHistoryKeyBundle  Bytes    @map("encrypted_history_key_bundle")
  createdAt                  DateTime @default(now()) @map("created_at") @db.Timestamptz

  conversation               Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  recipient                  User         @relation(fields: [recipientUserId], references: [id], onDelete: Cascade)

  @@index([conversationId, recipientUserId])
  @@map("group_history_packages")
}

model Attachment {
  id                  String           @id @default(uuid()) @db.Uuid
  conversationId      String           @map("conversation_id") @db.Uuid
  uploaderId          String           @map("uploader_id") @db.Uuid
  objectKey           String           @unique @map("object_key")
  ciphertextSizeBytes Int              @map("ciphertext_size_bytes")
  declaredMime        String           @map("declared_mime")
  sha256Ciphertext    String           @map("sha256_ciphertext")
  status              AttachmentStatus @default(UPLOADING)
  createdAt           DateTime         @default(now()) @map("created_at") @db.Timestamptz

  conversation        Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  uploader            User             @relation(fields: [uploaderId], references: [id])

  @@index([conversationId, status])
  @@map("attachments")
}

model UserBlock {
  blockerId String   @map("blocker_id") @db.Uuid
  blockedId String   @map("blocked_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  blocker   User     @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User     @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@id([blockerId, blockedId])
  @@index([blockedId, blockerId])
  @@map("user_blocks")
}

model ModerationReport {
  reportId                      String       @id @default(uuid()) @map("report_id") @db.Uuid
  reporterId                    String       @map("reporter_id") @db.Uuid
  reportedUserId                String       @map("reported_user_id") @db.Uuid
  conversationId                String       @map("conversation_id") @db.Uuid
  reasonCode                    String       @map("reason_code")
  disclosedMessagesEncrypted    Bytes        @map("disclosed_messages_encrypted_for_mod")
  metadataSnapshot              Json         @map("metadata_snapshot")
  status                        ReportStatus @default(OPEN)
  assignedReviewerId            String?      @map("assigned_reviewer_id") @db.Uuid
  retentionExpiresAt            DateTime     @default(dbgenerated("(now() + interval '90 days')")) @map("retention_expires_at") @db.Timestamptz
  createdAt                     DateTime     @default(now()) @map("created_at") @db.Timestamptz

  reporter                      User         @relation("Reporter", fields: [reporterId], references: [id])
  reportedUser                  User         @relation("ReportedUser", fields: [reportedUserId], references: [id])
  assignedReviewer              User?        @relation("Reviewer", fields: [assignedReviewerId], references: [id])
  conversation                  Conversation @relation(fields: [conversationId], references: [id])

  @@map("moderation_reports")
}

model AdminAuditLog {
  logId         BigInt      @id @default(autoincrement()) @map("log_id")
  actorAdminId  String      @map("actor_admin_id") @db.Uuid
  actionType    AdminAction @map("action_type")
  targetId      String      @map("target_id") @db.Uuid
  ipAddress     String      @map("ip_address")
  justification String
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz

  admin         User        @relation(fields: [actorAdminId], references: [id])

  @@map("admin_audit_logs")
}

model DeletedEntityRegistry {
  entityType String   @map("entity_type") // 'MESSAGE' or 'ATTACHMENT'
  entityId   String   @map("entity_id") @db.Uuid
  deletedAt  DateTime @default(now()) @map("deleted_at") @db.Timestamptz

  @@id([entityType, entityId])
  @@map("deleted_entities_registry")
}
```

---

## 6. Docker & Containerization Blueprint

### A. `docker-compose.yml`
```yaml
version: '3.8'

services:
  # Ephemeral session cache, presence aggregator & pub/sub bus
  redis:
    image: redis:7-alpine
    container_name: chat_redis
    ports:
      - "6379:6379"
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # Node.js API & WebSocket Gateway Server
  api:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    container_name: chat_api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - DIRECT_URL=${DIRECT_URL}
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - AWS_REGION=${AWS_REGION:-ap-south-1}
      - AWS_S3_BUCKET=${AWS_S3_BUCKET}
    depends_on:
      redis:
        condition: service_healthy

  # k6 Load & Chaos Testing Harness
  k6:
    image: grafana/k6:latest
    container_name: chat_k6
    volumes:
      - ./load-tests:/scripts
    environment:
      - TARGET_URL=http://api:3000
      - WS_URL=ws://api:3000/ws
    profiles:
      - testing

volumes:
  redis_data:
```

### B. Production Multi-Stage `Dockerfile` (`apps/server/Dockerfile`)
```dockerfile
# Multi-stage build for optimal image size & security
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chat/database exec prisma generate
RUN pnpm --filter @chat/server build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/

RUN pnpm install --prod --frozen-lockfile

USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
```

---

## 7. k6 Performance Testing Architecture

Load tests in `load-tests/` enforce the non-functional benchmarks defined in `09-phase9-non-functional-acceptance-and-release.md`:

```javascript
// load-tests/scenarios/message-throughput.js
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const ackLatency = new Trend('msg_ack_latency_ms');
const failureRate = new Rate('failed_requests');

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
    },
    burst_load: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '60s', target: 200 }, // 100 msg/s burst spike
        { duration: '30s', target: 100 },
      ],
    },
  },
  thresholds: {
    msg_ack_latency_ms: ['p(95)<500'], // NFR-005: p95 <= 500ms
    failed_requests: ['rate<0.01'],    // 99.9% acceptance reliability
  },
};

export default function () {
  const url = `${__ENV.WS_URL}?token=test_user_jwt`;
  ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      const sendTime = Date.now();
      socket.send(JSON.stringify({
        action: 'MSG_SEND',
        client_msg_id: 'test-uuid',
        conversation_id: 'test-conv-uuid',
        encrypted_payloads: { "dev-1": "test-ciphertext" }
      }));

      socket.on('message', (data) => {
        const res = JSON.parse(data);
        if (res.action === 'MSG_ACK') {
          ackLatency.add(Date.now() - sendTime);
          check(res, { 'status is SENT': (r) => r.status === 'SENT' });
          socket.close();
        }
      });
    });
  });
}
```
