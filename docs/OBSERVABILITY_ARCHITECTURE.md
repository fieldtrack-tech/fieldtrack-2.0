# FieldTrack — Observability Architecture

> **Handled by infra repository.**
>
> The monitoring stack (Prometheus, Grafana, Loki, Tempo, Promtail, Alertmanager) is
> configured and operated out of the infra repository, not this one.

## What this API exposes

| Endpoint | Purpose |
|----------|---------|
| GET /metrics | Prometheus-format metrics (protected by \METRICS_SCRAPE_TOKEN\) |
| OTLP traces | Exported to \TEMPO_ENDPOINT\ (default: \http://tempo:4318\) |
| Structured logs | JSON via Pino, written to stdout — collected by infra's Promtail |

## Environment variables (API side)

| Variable | Purpose |
|----------|---------|
| \METRICS_SCRAPE_TOKEN\ | Token that Prometheus must send when scraping \/metrics\ |
| \TEMPO_ENDPOINT\ | OTLP HTTP endpoint for trace export |

See [env-contract.md](env-contract.md) for full details.

