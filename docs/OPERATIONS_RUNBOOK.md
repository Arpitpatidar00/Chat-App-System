# Production Operations, Deployment & Disaster Recovery Runbook

This document defines the operational procedures, deployment policies, disaster recovery failover workflows, and security incident response protocols for the **Production End-to-End Encrypted (E2EE) Chat System**.

---

## 1. System Topology & Architecture Baseline

```
                                [ Cloudflare CDN / WAF / DDoS Guard ]
                                                  │
                                                  ▼
                        [ AWS Application Load Balancer / NGINX Ingress ]
                                      │                        │
                      HTTP / REST (Port 443)          WebSocket (WSS)
                                      │                        │
                                      ▼                        ▼
                       ┌──────────────────────────────────────────────┐
                       │   Fastify API & WebSocket Gateway Cluster    │
                       │          (Node.js 20 LTS Stateless)          │
                       └───────────────────────┬──────────────────────┘
                                               │
                       ┌───────────────────────┴──────────────────────┐
                       │                                              │
                       ▼                                              ▼
       ┌───────────────────────────────┐              ┌───────────────────────────────┐
       │   Redis Cluster / Sentinel    │              │  Supabase PostgreSQL (15+)    │
       │    (Presence, Typing TTLs,    │              │  (Synchronous Replication)    │
       │    Pub/Sub, Token Bucket)     │              │  Pooler: 6543 | Direct: 5432  │
       └───────────────────────────────┘              └───────────────────────────────┘
                       │                                              │
                       ▼                                              ▼
       ┌───────────────────────────────┐              ┌───────────────────────────────┐
       │   AWS S3 (Multi-AZ Encrypted) │              │  APNs & FCM Push Gateways     │
       │  (10 MB Ceil, Pre-signed URLs)│              │  (Zero-Plaintext Wakeups)     │
       └───────────────────────────────┘              └───────────────────────────────┘
```

---

## 2. Zero-Downtime Deployment & Blue-Green Rollback

### A. Deployment Protocol
1. **Database Schema Migration First (Expand/Contract)**:
   - Run migrations via `DIRECT_URL` (Port 5432):
     ```bash
     pnpm --filter @chat/database exec prisma migrate deploy
     ```
   - Ensure all schema changes are backward-compatible with previous container builds.
2. **Container Image Build & Smoke Test**:
   ```bash
   docker build -t chat-api:v2.0.0 -f apps/server/Dockerfile .
   docker run --rm --env-file .env chat-api:v2.0.0 pnpm --filter @chat/server test
   ```
3. **Rolling Pod / Container Swap**:
   - Deploy new image to Green deployment.
   - Run health probe: `GET http://green-node:4000/health/canary` ensuring HTTP 200 and all database latencies < 50ms.
   - Shift 10% traffic → monitor error budget for 5 minutes → shift 100% traffic.

### B. Instant Blue-Green Rollback Procedure
If p95 message ACK latency exceeds 500ms (`NFR-005`) or error rate exceeds 0.1%:
1. Revert load balancer target group to Blue deployment (`active: blue`).
2. Disconnect existing WebSocket connections gracefully (`WS_CODE_GOING_AWAY = 1001`), prompting clients to reconnect to Blue within 500ms.
3. Post-mortem review of gateway structured logs.

---

## 3. High-Availability Database Operations & Failover (RPO=0, RTO < 4h)

### A. Health & Replication Verification
- **Primary Endpoint**: Supabase PostgreSQL Transaction Pooler (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
- **Canary Probe**:
  ```bash
  curl -X GET https://api.chat.internal/health/canary
  ```
  Expected Response:
  ```json
  {
    "status": "HEALTHY",
    "datastore": "CONNECTED",
    "queryLatencyMs": 12,
    "version": "1.0.0"
  }
  ```

### B. Disaster Recovery Chaos Drill Procedure
In the event of AZ failure or primary DB failover:
1. Supabase automated failover promotes the synchronous standby replica within 60 seconds (`RTO << 4h`).
2. PgBouncer pooler re-points traffic with zero message loss (`RPO = 0`).
3. If point-in-time recovery (PITR) is exercised from backup:
   - Run the Post-Restore Tombstone Scrubber immediately:
     ```bash
     node apps/server/dist/features/moderation/tombstone-scrubber.js
     ```
   - Validates that messages registered in `deleted_entities_registry` have `encrypted_payloads = null` and `is_tombstoned = true` (`NFR-040`).

---

## 4. Ephemeral Redis Pub/Sub & Fallback Modes

### A. Failure Resilience Mode
- The backend features resilient in-memory fallback for rate limiting and presence:
  - If Redis becomes unreachable (`redis.status !== 'ready'`), `TokenBucketRateLimiter` automatically fails open to local in-memory token buckets without dropping user traffic.
  - Presence queries fallback to SQL `devices.last_active_at` timestamps.

### B. Redis Recovery
- Restart or failover to secondary replica:
  ```bash
  docker-compose restart redis
  ```
- Fastify server automatically recovers socket subscriptions on reconnect event.

---

## 5. Emergency Administrative Procedures

### A. Instant Account Suspension Kill-Switch
If a bad actor compromises an account:
1. Update user status to `SUSPENDED`:
   ```sql
   UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = 'bad-actor-uuid';
   ```
2. Revoke all active devices:
   ```sql
   UPDATE devices SET status = 'REVOKED' WHERE user_id = 'bad-actor-uuid';
   ```
3. WebSocket Gateway immediately terminates active connections with `WS_POLICY_VIOLATION (4403)` and rejects all REST endpoints with `403 ACCOUNT_SUSPENDED`.

### B. Scoped Moderation Disclosure (`Mod_PK`)
When an abusive message report is audited:
1. Admin must provide written justification:
   ```json
   {
     "reportId": "report-uuid",
     "justification": "Reviewing child safety violation per CSAM policy section 4.2"
   }
   ```
2. Write-ahead audit log records immutable entry into `admin_audit_logs`.
3. Only authorized moderation microservice holding private `Mod_SK` decrypts the disclosed snapshot. Routine system administrators have metadata-only access.

---

## 6. Security Incident Response & Zero-Plaintext Audit

### A. Security Scanner Execution
Verify datastore confidentiality with zero plaintext:
```bash
npx tsx -e "
  import { SecurityAuditScanner } from './apps/server/src/features/monitoring/security-audit-scanner.js';
  import { PrismaClient } from '@prisma/client';
  const prisma = new PrismaClient();
  const scanner = new SecurityAuditScanner(prisma);
  scanner.auditDatastoreZeroPlaintext().then(res => {
    console.log(res);
    process.exit(res.plaintextLeaksDetected === 0 ? 0 : 1);
  });
"
```

### B. Expected Audit Result
- Leaks Detected: `0`
- Unencrypted Message Payloads: `0`
- Raw Identity Keys Exposed: `0`
- Plaintext Push Notifications: `0`

---

## 7. Operational Runbook Summary & Contacts
- **Primary Architect / Escalation**: Engineering Operations (`ops@chat.system`)
- **Security Lead**: AppSec Review (`security@chat.system`)
- **SLO Metrics Target**: 99.9% uptime, p95 message ACK < 500ms, RPO = 0, RTO < 4h.
