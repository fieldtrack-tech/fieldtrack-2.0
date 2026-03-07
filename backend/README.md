# FieldTrack 2.0 — Backend

Production-ready Fastify + TypeScript backend for FieldTrack 2.0 SaaS platform.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.9 (strict mode, ESM)
- **Framework**: Fastify 5
- **Auth**: @fastify/jwt (Supabase JWT)
- **Database**: PostgreSQL via Supabase
- **Job Queue**: BullMQ + Redis
- **Validation**: Zod 4
- **Observability**: OpenTelemetry, Prometheus, Grafana
- **Security**: @fastify/helmet, @fastify/cors, @fastify/rate-limit, @fastify/compress

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Start development server
npm run dev
```

## Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start dev server with hot reload   |
| `npm run build` | Compile TypeScript to `dist/`      |
| `npm start`     | Run compiled production server     |

## Project Structure

```
src/
├── server.ts          # Entry point
├── app.ts             # Fastify app factory
├── tracing.ts         # OpenTelemetry tracing setup
├── config/            # Environment & logger config
├── plugins/           # Fastify plugins (JWT, metrics, etc.)
├── routes/            # Route modules
├── middleware/        # Auth & request middleware
├── modules/           # Business domain modules
│   ├── organization/
│   ├── user/
│   ├── attendance/
│   ├── location/
│   └── expense/
├── workers/           # BullMQ background job workers
├── types/             # TypeScript type definitions
└── utils/             # Shared utilities
```

## Docker

```bash
# Build image
docker build -t fieldtrack-backend .

# Run container
docker run -p 3000:3000 --env-file .env fieldtrack-backend
```

## API Endpoints

| Method | Path      | Description          | Auth     |
| ------ | --------- | -------------------- | -------- |
| GET    | `/health` | Health check         | None     |

## Environment Variables

| Variable                   | Description                 | Required |
| -------------------------- | --------------------------- | -------- |
| `PORT`                     | Server port (default: 3000) | No       |
| `NODE_ENV`                 | Environment mode            | No       |
| `SUPABASE_URL`             | Supabase project URL        | Yes      |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase service role key   | Yes      |
| `SUPABASE_JWT_SECRET`      | JWT signing secret          | Yes      |
| `REDIS_HOST`               | Redis host for BullMQ       | Yes      |
| `REDIS_PORT`               | Redis port (default: 6379)  | No       |
| `TEMPO_ENDPOINT`           | Tempo OTLP endpoint         | No       |

See `.env.example` for a complete list of environment variables.
