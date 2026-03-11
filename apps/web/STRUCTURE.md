# Frontend Structure Chart

## Overview
Next.js 14+ application with App Router, TypeScript, TailwindCSS, and React Query for state management.

## Directory Structure

```
frontend/
├── .next/                      # Next.js build output (auto-generated)
├── node_modules/              # Dependencies (auto-generated)
├── public/                    # Static assets
├── src/                       # Source code
│   ├── app/                   # Next.js App Router pages
│   │   ├── (protected)/       # Protected routes (requires auth)
│   │   │   ├── analytics/     # Analytics dashboard
│   │   │   ├── attendance/    # Attendance management
│   │   │   ├── expenses/      # Expense tracking
│   │   │   ├── locations/     # Location management
│   │   │   └── layout.tsx     # Protected layout wrapper
│   │   ├── login/             # Login page
│   │   │   └── page.tsx
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home/landing page
│   │   └── providers.tsx      # App-level providers
│   │
│   ├── components/            # Reusable components
│   │   ├── charts/            # Chart components (Recharts)
│   │   │   ├── AttendanceChart.tsx
│   │   │   ├── ExpenseChart.tsx
│   │   │   └── ...
│   │   ├── layout/            # Layout components
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ...
│   │   ├── maps/              # Map components (Mapbox)
│   │   │   ├── AttendanceMap.tsx
│   │   │   ├── LocationMap.tsx
│   │   │   └── ...
│   │   ├── tables/            # Table components
│   │   │   ├── AttendanceTable.tsx
│   │   │   ├── ExpenseTable.tsx
│   │   │   └── ...
│   │   ├── ui/                # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   └── use-toast.ts
│   │   ├── EmptyState.tsx     # Empty state component
│   │   ├── ErrorBanner.tsx    # Error display component
│   │   └── LoadingSkeleton.tsx # Loading state component
│   │
│   ├── contexts/              # React contexts
│   │   └── AuthContext.tsx    # Authentication context
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── queries/           # React Query hooks
│   │   │   ├── useAnalytics.ts
│   │   │   ├── useAttendance.ts
│   │   │   ├── useExpenses.ts
│   │   │   └── useLocations.ts
│   │   └── useAuth.ts         # Authentication hook
│   │
│   ├── lib/                   # Utility libraries
│   │   ├── api.ts             # API client configuration
│   │   ├── env.ts             # Environment variables
│   │   ├── permissions.ts     # Permission utilities
│   │   ├── query-client.ts    # React Query client
│   │   ├── supabase.ts        # Supabase client
│   │   └── utils.ts           # General utilities
│   │
│   └── types/                 # TypeScript type definitions
│       └── index.ts           # Shared types
│
├── .eslintrc.json             # ESLint configuration
├── .gitignore                 # Git ignore rules
├── components.json            # shadcn/ui configuration
├── next.config.mjs            # Next.js configuration
├── next-env.d.ts              # Next.js TypeScript declarations
├── package.json               # Dependencies and scripts
├── package-lock.json          # Dependency lock file
├── postcss.config.mjs         # PostCSS configuration
├── README.md                  # Frontend documentation
├── STRUCTURE.md               # This file
├── tailwind.config.ts         # TailwindCSS configuration
└── tsconfig.json              # TypeScript configuration

```

## Key Technologies

### Core Framework
- **Next.js 14+**: React framework with App Router
- **React 18**: UI library
- **TypeScript**: Type safety

### Styling
- **TailwindCSS**: Utility-first CSS framework
- **shadcn/ui**: Reusable component library
- **Radix UI**: Headless UI primitives

### State Management
- **React Query (@tanstack/react-query)**: Server state management
- **React Context**: Client state management

### Data Visualization
- **Recharts**: Chart library
- **Mapbox GL**: Interactive maps

### Authentication
- **Supabase**: Authentication and database client

### Development Tools
- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **Autoprefixer**: CSS vendor prefixing

## Routing Structure

```
/                              # Landing page
/login                         # Login page
/(protected)/                  # Protected routes (requires authentication)
  ├── /analytics               # Analytics dashboard
  ├── /attendance              # Attendance management
  ├── /expenses                # Expense tracking
  └── /locations               # Location management
```

## Component Architecture

### UI Components (shadcn/ui)
Reusable, accessible components built on Radix UI primitives:
- Buttons, Inputs, Labels
- Cards, Dialogs, Dropdowns
- Tabs, Toasts, Separators

### Feature Components
Domain-specific components organized by feature:
- **Charts**: Data visualization components
- **Maps**: Geographic visualization components
- **Tables**: Data table components
- **Layout**: Navigation and structure components

### State Components
- **EmptyState**: Display when no data available
- **ErrorBanner**: Error message display
- **LoadingSkeleton**: Loading state placeholders

## Data Flow

1. **Authentication**: Supabase Auth → AuthContext → Protected Routes
2. **API Calls**: React Query hooks → API client → Backend
3. **State Management**: React Query cache + React Context
4. **UI Updates**: Query invalidation → Automatic refetch → UI update

## Environment Variables

Required environment variables (see `.env.example`):
- `NEXT_PUBLIC_API_URL`: Backend API URL
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key

## Build & Development

### Development
```bash
npm run dev          # Start development server (port 3000)
npm run lint         # Run ESLint
```

### Production
```bash
npm run build        # Build for production
npm start            # Start production server
```

## Code Organization Principles

1. **Feature-based organization**: Components grouped by feature/domain
2. **Separation of concerns**: UI, logic, and data layers separated
3. **Reusability**: Shared components in `components/ui/`
4. **Type safety**: TypeScript throughout
5. **Server state**: Managed by React Query
6. **Client state**: Managed by React Context when needed

## Best Practices

- Use React Query for all server state
- Keep components small and focused
- Use TypeScript for type safety
- Follow Next.js App Router conventions
- Use shadcn/ui components for consistency
- Implement proper error boundaries
- Use loading states for better UX
- Follow accessibility guidelines (WCAG)
