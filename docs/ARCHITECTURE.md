# FieldTrack 2.0 — Architecture Overview

A reference document for how the backend is structured, how requests flow through the system, and the key design decisions that shape the codebase.

---

## System Components

```
┌────────────────────────────────────────────────────────────────────┐
│                         Client (Mobile / Web)                      │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  Nginx (infra/nginx/fieldtrack.conf)                               │
│  • TLS termination (Let's Encrypt)                                 │
│  • HTTP → HTTPS redirect                                           │
│  • Upstream: active blue or green container                        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTP (internal network)
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  Fastify 5 Backend  (src/server.ts → src/app.ts)                   │
│                                                                    │
│  Plugin Stack (registered in order):                               │
│    OpenTelemetry SDK  →  Helmet  →  CORS  →  Rate Limit (Redis)   │
│    → Abuse Logging  →  JWT  →  Compression  →  Routes             │
└──────────┬─────────────────────────────┬───────────────────────────┘
           │ Supabase JS client          │ ioredis
           ▼                             ▼
┌─────────────────────┐      ┌──────────────────────────────────────┐
│  PostgreSQL          │      │  Redis                               │
│  (via Supabase)      │      │  • BullMQ job queue                  │
│                      │      │  • Rate-limit counters (separate     │
│  Tables:             │      │    connection from queue)            │
│  • attendance_       │      └───────────────┬──────────────────────┘
│    sessions          │                      │ BullMQ job
│  • gps_locations     │                      ▼
│  • expenses          │      ┌──────────────────────────────────────┐
│  • session_          │◄─────│  Distance Worker (src/workers/)      │
│    summaries         │      │  • Haversine recalculation           │
└─────────────────────┘      │  • Updates session_summaries         │
                              │  • OpenTelemetry instrumented        │
                              └──────────────────────────────────────┘
```

---

## Request Lifecycle

Every inbound HTTP request passes through this chain in order:

```
1. Nginx
   └─ TLS termination, proxy headers injected (X-Real-IP, X-Forwarded-For)

2. Fastify genReqId
   └─ Assigns a UUID as the request ID (from x-request-id header or generated)

3. OpenTelemetry auto-instrumentation (tracing.ts — loaded before Fastify)
   └─ Creates a root HTTP span; fills http.method, http.url

4. onRequest hook (app.ts)
   └─ Enriches active span with http.route, request.id, http.client_ip
   └─ Injects trace_id + span_id into the request's Pino child logger

5. Security plugin stack
   ├─ helmet    → sets secure response headers
   ├─ cors      → validates Origin against ALLOWED_ORIGINS
   ├─ rateLimit → checks Redis counter for this IP / JWT sub
   └─ (if 429: abuse-logging onResponse hook fires and increments Prometheus counters)

6. Route matching → preHandler chain
   ├─ authenticate  → verifies JWT, validates Zod schema, sets request.organizationId
   └─ requireRole   → checks request.user.role against required role

7. Controller function
   └─ Parses + validates request body/query with Zod
   └─ Calls service layer

8. Service layer
   └─ Enforces business rules (domain errors if broken)
   └─ Calls repository layer

9. Repository layer
   └─ Calls Supabase JS client with organization_id filter (tenant isolation)
   └─ Returns typed rows

10. Controller responds via reply.status(N).send({...})
    └─ Response shape: { success: true, data: ... } or handled by handleError()

11. onSend hook
    └─ Sets x-request-id response header
    └─ Stamps http.status_code on active span

12. Prometheus onResponse hook (prometheus.ts)
    └─ Records http_request_duration_seconds and http_requests_total with exemplar

13. Pino log line
    └─ Includes: request method, url, statusCode, responseTime, trace_id, span_id
```

---

## Module Structure

Each domain module follows the same four-layer pattern:

```
src/modules/<domain>/
├── <domain>.schema.ts      — Zod schemas + TypeScript types for requests and responses
├── <domain>.repository.ts  — Direct Supabase query calls; always scoped by organization_id
├── <domain>.service.ts     — Business logic; throws domain errors; calls repository
├── <domain>.controller.ts  — HTTP interface; Zod parsing; calls service; replies via handleError
└── <domain>.routes.ts      — Fastify route registration; auth middleware; rate-limit config
```

**Why this separation?**

| Layer | Contains | Never Contains |
|-------|----------|----------------|
| Schema | Types, Zod validators | Business logic |
| Repository | SQL / Supabase queries | `request` / `reply` objects |
| Service | Domain rules, domain errors | Direct DB calls |
| Controller | HTTP parsing, response shaping | Business logic |
| Routes | Middleware wiring | Response logic |

This means services are testable without an HTTP or database layer, and repositories are mockable in integration tests.

---

## Tenant Isolation

Multi-tenancy is enforced on **every** data access via the `enforceTenant()` utility.

```
request.organizationId
   │
   │ set by authenticate() from JWT claim organization_id
   │
   └─► every service call passes this as context
         └─► every repository query adds .eq("organization_id", organizationId)
```

**There is no global admin query path.** Even ADMIN-role users are scoped to their own organization. Cross-organization queries are never possible through the API.

If `organizationId` is missing from the request, `enforceTenant()` throws `ForbiddenError` before any DB call is made.

---

## Authentication & Authorization Flow

```
Client → Authorization: Bearer <JWT>
                │
                ▼
    authenticate() middleware
        │
        ├─ request.jwtVerify()         (signature check via @fastify/jwt)
        ├─ jwtPayloadSchema.safeParse() (Zod: sub, organization_id, role)
        ├─ request.organizationId = payload.organization_id
        └─ span.setAttribute("enduser.id", payload.sub)
                │
                ▼ (if requireRole() in preHandler)
    requireRole(role)
        ├─ request.user.role === requiredRole  → continue
        └─ mismatch → throw ForbiddenError(403)
```

JWT claims are never trusted implicitly — every request re-validates the payload shape. This guards against Supabase JWT schema changes silently breaking auth.

---

## Error Handling Pipeline

All errors flow through `handleError()` in `src/utils/response.ts`:

```
Error thrown anywhere in controller/service/middleware
        │
        ▼
handleError(error, request, reply)
        │
        ├─ AppError (known domain/HTTP error)
        │    └─ reply.status(error.statusCode).send({
        │         success: false,
        │         error: error.message,
        │         requestId: request.id
        │       })
        │
        ├─ ZodError (validation failure)
        │    └─ reply.status(400).send({
        │         success: false,
        │         error: "Validation failed",
        │         details: error.issues,
        │         requestId: request.id
        │       })
        │
        └─ Unknown error
             └─ logs error internally
             └─ reply.status(500).send({
                  success: false,
                  error: "An unexpected error occurred",
                  requestId: request.id
                })
```

`requestId` is always present in error responses — operators can cross-reference it against Loki logs to find the full request trace.

---

## Background Job Flow

Distance and duration are computed asynchronously after check-out to avoid HTTP timeout risk on long sessions with large GPS point sets.

```
POST /attendance/check-out
        │
        ▼
attendanceService.checkOut()
        ├─ Updates session: checked_out_at, status = "CLOSED"
        └─ distanceQueue.add("recalculate", { sessionId }, { jobId: sessionId })
                            │
                            │ jobId = sessionId → deduplication:
                            │ only one pending job per session at a time
                            ▼
                    BullMQ Queue (Redis)
                            │
                            ▼
                    distance.worker.ts
                        │
                        ├─ Creates OTel span: "bullmq.process_job"
                        ├─ Validates session duration < MAX_SESSION_DURATION_HOURS
                        ├─ Fetches GPS points < MAX_POINTS_PER_SESSION
                        ├─ Haversine calculation (src/utils/distance.ts)
                        ├─ Upserts session_summaries { total_distance_km, total_duration_seconds }
                        └─ Updates metrics: totalRecalculations, avgRecalculationMs
```

**Safety limits** (all configurable via env vars):

| Limit | Default | Purpose |
|-------|---------|---------|
| `MAX_QUEUE_DEPTH` | 1,000 | Rejects new jobs when queue is backed up |
| `MAX_POINTS_PER_SESSION` | 50,000 | Guards against multi-MB Haversine computation |
| `MAX_SESSION_DURATION_HOURS` | 168 (7 days) | Rejects data-integrity anomalies (e.g. never-closed dev sessions) |
| `WORKER_CONCURRENCY` | 1 | Sequential processing by default; increase for throughput |

---

## Rate Limiting Architecture

Two layers of rate limiting work together:

```
Layer 1 — Global (Redis-backed, per-IP)
    • 100 requests / 1 minute
    • Applies to every route
    • localhost exempt (health checks, Prometheus scrapes)

Layer 2 — Per-endpoint (Redis-backed, per JWT sub)
    • Applies only to high-frequency or sensitive write endpoints
    • Uses JWT sub as key — survives corporate NAT / shared IPs
    • Falls back to IP if JWT cannot be decoded (e.g. before auth runs)

    Endpoint-specific limits:
    ┌────────────────────────────────────────┬──────────┬──────────┐
    │ Endpoint                               │ Limit    │ Window   │
    ├────────────────────────────────────────┼──────────┼──────────┤
    │ POST /locations                        │ 10 req   │ 10 s     │
    │ POST /locations/batch                  │ 10 req   │ 10 s     │
    │ POST /expenses                         │ 10 req   │ 60 s     │
    │ POST /attendance/:id/recalculate       │  5 req   │ 60 s     │
    └────────────────────────────────────────┴──────────┴──────────┘
```

The rate-limit Redis connection is **separate** from the BullMQ Redis connection to avoid contention between job queue operations and limit counter operations.

---

## Observability Stack

Three pillars, all linked:

```
Metrics (Prometheus → Grafana)
    • http_request_duration_seconds{method, route, status_code} — histogram
    • http_requests_total{method, route, status_code}           — counter
    • bullmq_queue_depth                                         — gauge
    • security_rate_limit_hits_total{route}                      — counter
    • security_auth_bruteforce_total{ip}                         — counter
    • Each histogram observation carries a traceId exemplar

Logs (Pino → Promtail → Loki → Grafana)
    • Structured JSON, one line per event
    • Every line includes trace_id + span_id (from otelMixin)
    • Grafana Derived Fields: trace_id → clickable link to Tempo

Traces (OpenTelemetry → Tempo → Grafana)
    • Auto-instrumented: HTTP, ioredis, pg driver
    • Manual span: bullmq.process_job with job metadata
    • Grafana: metric spike → exemplar → Tempo trace
```

---

## Key Design Decisions

### Why ESM (`"module": "NodeNext"`)?
Node.js native ESM enables top-level await, cleaner async module loading, and future compatibility. Chosen in Phase 0 before the codebase grew — retrofitting ESM later is costly.

### Why Zod 4?
Strict RFC-4122 UUID validation (version + variant bits enforced), improved error messages in Zod 4.x, and TypeScript inference quality. The upgrade was made in Phase 16 alongside DB type definitions.

### Why BullMQ + Redis instead of synchronous distance calculation?
Distance calculation on a large session (100k+ points over 8 hours) can take several hundred milliseconds. Doing this synchronously inside `POST /attendance/check-out` would exceed mobile client HTTP timeouts. BullMQ provides durability (jobs survive worker crashes), deduplication, and backpressure via queue depth limits.

### Why per-user (JWT sub) rate limiting instead of per-IP?
Field employees at the same company share a corporate NAT — all outbound requests appear from the same IP. Per-IP rate limits would throttle the entire team when one device misbehaves. JWT sub limits are per identity, regardless of network topology.

### Why Redis-backed rate limiting instead of in-process counters?
In-process counters are per-replica — with N replicas the effective limit becomes N × the configured limit. Redis-backed counters are shared across all replicas, enforcing the true configured limit regardless of horizontal scale.

### Why Blue-Green Deployment?
Zero-downtime deploys with instant rollback. The rollback is a port-swap in Nginx upstream config — no container rebuild needed. GHCR retains all tagged images (tagged by SHA), so rolling back 3 versions is as fast as rolling back 1.

### Why `sequence_number` is nullable
The mobile SDK did not emit sequence numbers in early versions. Forcing `NOT NULL` would reject all location data from older clients during the transition period. `ORDER BY recorded_at` is used as the primary sort for distance calculation, which is correct as long as device clocks are reasonably accurate. The column will be made `NOT NULL` once the mobile SDK version with sequence numbers is fully deployed.
