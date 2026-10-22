# Chat App System

End-to-end encrypted messaging platform, built as a Turborepo monorepo. The server only ever stores ciphertext: keys are generated and held on the device, and messages, attachments and push notifications are encrypted client-side.

**Stack:** TypeScript · Fastify · WebSocket (`ws`) · PostgreSQL (Supabase) + Prisma · Redis · SQLite FTS5 · pnpm + Turborepo · k6

## Architecture

```
apps/
  server/     Fastify API + WebSocket gateway
              features: messages & device sync, delivery/read receipts,
              privacy (blocks, reports, scoped moderation)
              core: auth guard, unit of work, token-bucket rate limiting,
                    Redis pub/sub, typed Result/DomainError
  mobile/     Client core — session manager, notification decryption,
              on-device message search (SQLite FTS5)
packages/
  crypto/     AES-GCM, key pairs, KDF, key vault, attachment crypto, JWT
  database/   Prisma schema and client
  types/      Shared contracts between server and clients
load-tests/   k6 message-throughput scenarios
docs/         Operations runbook — blue-green deploys, DB failover drills,
              Redis degradation modes, incident response
specs/ phases/  Phase-by-phase specifications (identity → E2EE messaging →
              realtime receipts → groups → attachments → search → privacy)
```

## Run locally

```bash
cp .env.example .env      # DATABASE_URL, DIRECT_URL, REDIS_URL, JWT_SECRET …
pnpm install
pnpm db:generate && pnpm db:push
pnpm dev                  # all apps via Turborepo
pnpm test
pnpm test:load            # k6 load test via docker compose
```

Requires Node.js ≥ 20 and pnpm.
