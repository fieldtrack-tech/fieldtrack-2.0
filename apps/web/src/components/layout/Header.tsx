"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  LogOut,
  ChevronDown,
  UserCircle,
  Search,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/queries/useProfile";
import { useOrgSummary } from "@/hooks/queries/useAnalytics";
import { SidebarNav } from "@/components/layout/Sidebar";
import { formatDistance } from "@/lib/utils";
import { cn } from "@/lib/utils";

function useTodayString() {
  return useMemo(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString("en-IN", { weekday: "long" });
    const date = now.toLocaleDateString("en-IN", { month: "long", day: "numeric" });
    return `${weekday}, ${date}`;
  }, []);
}

function useTodayRange() {
  return useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
}

// ─── Live stat pill ───────────────────────────────────────────────────────────

function LiveStatPill({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "emerald" | "blue" | "violet" | "default";
}) {
  const variantClasses = {
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    blue:
      "bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    violet:
      "bg-violet-50 text-violet-700 border-violet-200/60 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    default:
      "bg-secondary text-secondary-foreground border-border/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[11px] font-semibold leading-none tabular-nums",
        variantClasses[variant]
      )}
    >
      <span>{value}</span>
      <span className="opacity-60 font-normal">{label}</span>
    </span>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────

function AvatarInitials({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary",
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm"
      )}
    >
      {initials}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header() {
  const { user, role, logout } = useAuth();
  const { data: profile } = useMyProfile();
  const { from, to } = useTodayRange();
  const { data: orgSummary } = useOrgSummary(from, to);
  const today = useTodayString();
  const [searchOpen, setSearchOpen] = useState(false);

  const isAdmin = role === "ADMIN";
  const displayName = profile?.name ?? user?.email?.split("@")[0] ?? "Account";
  const firstName = displayName.split(" ")[0];

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-4 gap-3">
        {/* ── Left: mobile menu + context ── */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r border-border/60">
              <SheetHeader className="flex h-14 items-center justify-start px-4 border-b border-border/60">
                <SheetTitle className="flex items-center gap-2 text-[15px] font-bold">
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden shrink-0">
                    <Image
                      src="/logo/logo.png"
                      alt="FieldTrack"
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                      priority
                    />
                  </div>
                  FieldTrack
                </SheetTitle>
              </SheetHeader>
              <SidebarNav />
            </SheetContent>
          </Sheet>

          {/* Greeting — hidden on small screens */}
          <div className="hidden md:block">
            <p className="text-sm font-semibold leading-none text-foreground">
              Hello, {firstName} 👋
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{today}</p>
          </div>
        </div>

        {/* ── Center: search bar ── */}
        <div className={cn("hidden md:flex flex-1 max-w-xs items-center", searchOpen && "flex")}>
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search sessions, employees..."
              className="h-8 pl-8 text-xs bg-muted/40 border-border/50 focus-visible:bg-background"
            />
          </div>
        </div>

        {/* ── Right: stats + controls ── */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Admin live stats */}
          {isAdmin && orgSummary && (
            <div className="hidden lg:flex items-center gap-1.5 mr-1">
              <LiveStatPill
                label="active"
                value={String(orgSummary.activeEmployeesCount)}
                variant="emerald"
              />
              <LiveStatPill
                label="sessions"
                value={String(orgSummary.totalSessions)}
                variant="blue"
              />
              <LiveStatPill
                label="distance"
                value={formatDistance(orgSummary.totalDistanceKm)}
                variant="violet"
              />
            </div>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Identity dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 hover:bg-accent rounded-lg"
              >
                <AvatarInitials name={displayName} size="sm" />
                <div className="hidden sm:block text-left">
                  <p className="text-[12px] font-semibold leading-none">{firstName}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[10px] leading-none",
                      isAdmin
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-primary"
                    )}
                  >
                    {role ?? "EMPLOYEE"}
                  </p>
                </div>
                <ChevronDown className="hidden sm:block h-3 w-3 text-muted-foreground/70" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border border-border/60">
              <DropdownMenuLabel className="pb-1.5">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground font-normal truncate mt-0.5">
                  {user?.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href="/profile"
                  className="cursor-pointer flex items-center gap-2 text-sm"
                >
                  <UserCircle className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin/monitoring"
                    className="cursor-pointer flex items-center gap-2 text-sm"
                  >
                    <Activity className="h-4 w-4" />
                    Monitoring
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void logout()}
                className="cursor-pointer text-destructive focus:text-destructive gap-2 text-sm"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}


