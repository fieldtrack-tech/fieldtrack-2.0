# FieldTrack 2.0 — Frontend

Modern Next.js 15 frontend for the FieldTrack 2.0 workforce management platform.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.9
- **Styling**: TailwindCSS 4
- **UI Components**: shadcn/ui
- **Maps**: Mapbox GL JS
- **Auth**: Supabase Auth
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod validation

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env.local

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

Required environment variables (see `.env.example`):

- `NEXT_PUBLIC_API_URL`: Backend API URL
  - Development: `http://localhost:3001`
  - Production: `https://api.fieldtrack.meowsician.tech`
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox access token

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build production bundle |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript compiler check |

## Project Structure

```
src/
├── app/                # Next.js App Router pages
│   ├── (auth)/        # Authentication pages (login, signup)
│   ├── (dashboard)/   # Protected dashboard pages
│   └── layout.tsx     # Root layout
├── components/        # React components
│   ├── ui/           # shadcn/ui components
│   └── ...           # Feature components
├── lib/              # Utilities and configurations
│   ├── api/          # API client and hooks
│   ├── env.ts        # Environment variable validation
│   └── utils.ts      # Shared utilities
└── types/            # TypeScript type definitions
```

## Architecture

### Domain Architecture

- **Frontend**: `https://fieldtrack.meowsician.tech`
- **API**: `https://api.fieldtrack.meowsician.tech`

### API Communication

The frontend communicates with the backend API using environment-based configuration:

- **Local Development**: Direct connection to `http://localhost:3001`
- **Production**: Uses Next.js API proxy (`/api/proxy/*`) to avoid CORS issues

The API client (`src/lib/api/client.ts`) automatically uses the `NEXT_PUBLIC_API_URL` environment variable.

## Deployment

The frontend is deployed to Vercel with automatic deployments on push to `master`.

### Environment Variables (Vercel)

Set these in your Vercel project settings:

```bash
NEXT_PUBLIC_API_URL=/api/proxy
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

Note: In production, `NEXT_PUBLIC_API_URL` should be set to `/api/proxy` to use the Next.js server-side proxy, which avoids CORS preflight requests.

## Features

- **Authentication**: Secure login/signup with Supabase Auth
- **Dashboard**: Real-time workforce overview and analytics
- **Attendance Tracking**: Check-in/check-out with GPS location
- **Expense Management**: Submit and track expense claims
- **Location Tracking**: Real-time GPS tracking on interactive maps
- **Admin Analytics**: Organization-wide insights and reports
- **Responsive Design**: Mobile-first, works on all devices

## Documentation

For more information, see:

- [Project Structure](STRUCTURE.md) - Detailed frontend architecture
- [API Reference](../docs/API_REFERENCE.md) - Backend API documentation
- [Architecture](../docs/ARCHITECTURE.md) - System design and data flows

## License

[MIT](../../LICENSE) © 2026 Ashish Raj
