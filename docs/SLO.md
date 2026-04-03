# FieldTrack Service Level Objectives (SLOs)

This document defines the service-level objectives for FieldTrack production services. Alert rules are implemented in the standalone infra repository.

---

## Definitions

| Term | Meaning |
|---|---|
| **SLO** | Service Level Objective — the target reliability level |
| **SLI** | Service Level Indicator — the metric used to measure the objective |
| **Error Budget** | Allowable downtime / failure rate before the SLO is violated |
| **Burn Rate** | How fast the error budget is being consumed relative to normal |

---

## SLO 1 — API Availability

| | |
|---|---|
| **SLI** | HTTP availability measured from `up` metric on API containers |
| **Target** | 99.9% monthly availability |
| **Error budget** | 43.8 minutes / month |
| **Window** | 30-day rolling |

### Rationale
Sub-1h monthly downtime budget is appropriate for a B2B scheduling SaaS.  Breaching this SLO triggers an incident review.

---

## SLO 2 — API Latency

| | |
|---|---|
| **SLI** | p95 HTTP request duration (measured via `http_request_duration_seconds_bucket`) |
| **Target p95** | < 500 ms |
| **Target p99** | < 2 000 ms |
| **Error budget** | 5% of requests may exceed the p95 threshold |
| **Window** | 5-minute rolling (monitored), 1-hour burn rate (alerting) |

### Rationale
500 ms p95 ensures interactive response times for connected clients.  The 2 s p99 provides a safety margin for background operations (bulk import, report generation) without breaching the user-visible latency SLO.

---

## SLO 3 — API Error Rate

| | |
|---|---|
| **SLI** | Ratio of 5xx responses to total HTTP requests |
| **Target** | < 1% 5xx error rate |
| **Error budget** | 1% of requests may fail with 5xx |
| **Window** | 5-minute rolling |

### Rationale
1% is tight but achievable given the stateless Fastify API + managed Supabase backend.  4xx errors (client mistakes) are excluded from the SLO.

---

## SLO 4 — Webhook Delivery

| | |
|---|---|
| **SLI** | Fraction of webhook deliveries that eventually succeed within the retry window |
| **Target** | 99% of deliveries succeed within 1 hour (across all retry attempts) |
| **Error budget** | 1% permanent failure rate |
| **Window** | 1-hour rolling |

### Retry schedule (for reference)

| Attempt | Delay from previous |
|---|---|
| 1 | Immediate |
| 2 | ~1 min (±20% jitter) |
| 3 | ~5 min (±20% jitter) |
| 4 | ~15 min (±20% jitter) |
| 5 | ~1 h (±20% jitter) |
| After attempt 5 | Moved to Dead-Letter Queue |

All 5 retry attempts fit within the 1-hour SLO window.

### Rationale
Webhook delivery failures directly affect customer integrations.  The DLQ captures permanent failures for manual replay; the SLO tracks the fraction that need manual intervention.

---

## SLO 5 — Dead-Letter Queue Depth

| | |
|---|---|
| **SLI** | `dlq_size{queue="webhook-delivery-dlq"}` |
| **Target** | DLQ depth stays below 100 jobs |
| **Error budget** | DLQ may transiently spike above 100 for < 30 minutes |
| **Window** | 30-minute sustained |

### Rationale
A DLQ backlog above 100 indicates a systemic delivery failure (bad endpoint configuration, network partition) requiring operator attention.  Transient spikes under 30 minutes are tolerated.

---

## Error Budget Alert Strategy

The following multi-burn-rate windows are used for the error budget alerts to catch both fast burns (page immediately) and slow burns (ticket within the hour):

| Window | Burn rate threshold | Severity | Action |
|---|---|---|---|
| 1h/5m | 14× | critical | Page on-call |
| 6h/30m | 6× | warning | Open ticket |
| 1d/2h | 3× | warning | Engineering review |

---

## Alert → SLO Mapping

| Alert name | SLO | Severity |
|---|---|---|
| `FieldTrackHighErrorRate` | SLO 3 | critical |
| `FieldTrackSloErrorBudgetBurnFast` | SLO 3 | critical |
| `FieldTrackSloErrorBudgetBurnSlow` | SLO 3 | warning |
| `FieldTrackHighLatency` | SLO 2 | warning |
| `FieldTrackLatencyP99High` | SLO 2 p99 | warning |
| `WebhookDeliveryFailureRateHigh` | SLO 4 | critical |
| `WebhookDeliveryFailureRateWarning` | SLO 4 | warning |
| `WebhookDlqGrowing` | SLO 5 | warning |
| `WebhookCircuitBreakerOpened` | SLO 4 | warning |
| `DeploymentFailure` | SLO 1 | critical |
| `ReadinessCheckFailing` | SLO 1 | critical |

---

## Review Cadence

- **Monthly**: review error budget consumption; adjust SLO thresholds if engineering velocity is affected.
- **Post-incident**: update error budget retroactively; add alert tuning if a regression was missed.
- **Quarterly**: revisit SLO targets vs. customer expectations.
