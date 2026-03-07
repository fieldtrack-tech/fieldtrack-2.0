# FieldTrack 2.0

> A multi-tenant SaaS platform for real-time field employee tracking — attendance, GPS location, expense management, and admin analytics.

## Overview

FieldTrack 2.0 is a production-grade backend service built with **Fastify** and **TypeScript**. It provides secure, tenant-isolated APIs for managing field workforce operations including attendance check-in/check-out, real-time GPS location ingestion, expense workflows, and admin analytics dashboards.

## Tech Stack

| Layer              | Technology                                                                 |
|--------------------|----------------------------------------------------------------------------|
| **Runtime**        | Node.js 20 (Alpine)                                                       |
| **Language**        | TypeScript 5.9 (strict, ESM)                                              |
| **Framework**       | Fastify 5                                                                  |
| **Database**        | PostgreSQL via [Supabase](https://supabase.com)                            |
| **Auth**            | JWT (`@fastify/jwt`) with Supabase-issued tokens                          |
| **Job Queue**       | [BullMQ](https://docs.bullmq.io/) + Redis (durable background processing) |
| **Validation**      | [Zod 4](https://zod.dev/)                                                 |
| **Observability**   | Prometheus, Grafana, Loki, Tempo, Promtail, OpenTelemetry                  |
| **Security**        | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/compress` |
| **CI/CD**           | GitHub Actions → GHCR → Blue-Green Deploy to VPS                          |

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **npm** (ships with Node.js)
- **Redis** (for BullMQ job queue)
- A **Supabase** project with the required tables

### Installation

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your .env file with Supabase credentials and Redis connection
```

### Development

```bash
# Run in development mode with hot reload
npm run dev
```

### Production

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

## Project Structure

```
FieldTrack-2.0/
├── backend/          # Fastify backend service
├── infra/            # Infrastructure and monitoring (Docker Compose, Grafana, Prometheus, etc.)
├── docs/             # Project documentation
└── .github/          # GitHub Actions workflows
```

## Monitoring & Observability

The project includes a comprehensive observability stack in the `infra/` directory:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Dashboards and visualization
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Promtail**: Log shipping

To start the monitoring stack:

```bash
cd infra
docker-compose -f docker-compose.monitoring.yml up -d
```

## Documentation

For detailed backend API documentation and architecture, see [Here](./backend/README.md).

## License

ISC
