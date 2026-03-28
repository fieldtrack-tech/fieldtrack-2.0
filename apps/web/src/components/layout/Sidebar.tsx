"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Clock,
  Receipt,
  BarChart3,
  Activity,
  UserCircle,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Users,
  Map,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/queries/useProfile";

// ─── Brand Logo Mark ──────────────────────────────────────────────────────────
// Derived from the attached logo: dark circle + white "F" + blue location pin

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 transition-all duration-300", collapsed && "justify-center")}>
      {/* Logo mark: image asset */}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden">
        <Image
          src="/logo/logo.png"
          alt="FieldTrack"
          width={32}
          height={32}
          className="h-full w-full object-cover"
          priority
        />
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-[15px] font-bold tracking-tight text-foreground whitespace-nowrap"
          >
            FieldTrack
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function NavItemRow({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <motion.div
      className="relative"
      whileHover={{ x: isActive || collapsed ? 0 : 2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      {isActive && (
        <motion.div
          layoutId="active-nav-bg"
          className="absolute inset-0 rounded-lg bg-primary/12 dark:bg-primary/18"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative z-10 flex items-center rounded-lg px-2.5 py-2 text-sm font-medium",
          "transition-colors duration-150",
          collapsed ? "justify-center" : "gap-3",
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <span className={cn("shrink-0", isActive ? "text-primary" : "")}>{item.icon}</span>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </motion.div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="my-1 h-px bg-border/40" />;
  }
  return (
    <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
      {label}
    </p>
  );
}

// ─── SidebarNav ───────────────────────────────────────────────────────────────

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { permissions, role } = useAuth();
  const isAdmin = role === "ADMIN";

  const operationsItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: isAdmin ? "/admin/sessions" : "/sessions",
      label: "Sessions",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      href: isAdmin ? "/admin/expenses" : "/expenses",
      label: "Expenses",
      icon: <Receipt className="h-4 w-4" />,
    },
  ];

  const personalItems: NavItem[] = [
    { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="h-4 w-4" /> },
    { href: "/profile", label: "Profile", icon: <UserCircle className="h-4 w-4" /> },
  ];

  const adminItems: NavItem[] = permissions.viewAnalytics
    ? [
        {
          href: "/admin/analytics",
          label: "Analytics",
          icon: <BarChart3 className="h-4 w-4" />,
        },
        {
          href: "/admin/monitoring",
          label: "Monitoring",
          icon: <Activity className="h-4 w-4" />,
        },
        {
          href: "/admin/employees",
          label: "Employees",
          icon: <Users className="h-4 w-4" />,
        },
        {
          href: "/admin/monitoring/map",
          label: "Live Map",
          icon: <Map className="h-4 w-4" />,
        },
        {
          href: "/admin/webhooks",
          label: "Webhooks",
          icon: <Webhook className="h-4 w-4" />,
        },
      ]
    : [];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-3">
      <SectionLabel label="Operations" collapsed={collapsed} />
      {operationsItems.map((item) => (
        <NavItemRow
          key={item.href}
          item={item}
          isActive={isActive(item.href)}
          collapsed={collapsed}
        />
      ))}

      <div className="my-2 h-px bg-border/40" />

      {personalItems.map((item) => (
        <NavItemRow
          key={item.href}
          item={item}
          isActive={isActive(item.href)}
          collapsed={collapsed}
        />
      ))}

      {adminItems.length > 0 && (
        <>
          <div className="my-2 h-px bg-border/40" />
          <SectionLabel label="Administration" collapsed={collapsed} />
          {adminItems.map((item) => (
            <NavItemRow
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </>
      )}
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, role } = useAuth();
  const { data: profile } = useMyProfile();

  const displayName = profile?.name ?? user?.email?.split("@")[0] ?? "Account";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 240 }}
      transition={{ type: "spring", stiffness: 350, damping: 35 }}
      className={cn(
        "hidden md:flex flex-col shrink-0 overflow-hidden",
        "border-r border-border/60 bg-sidebar",
        "relative"
      )}
    >
      {/* ── Logo header ── */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border/60",
          collapsed ? "justify-center px-0" : "px-4"
        )}
      >
        <BrandMark collapsed={collapsed} />
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarNav collapsed={collapsed} />
      </div>

      {/* ── Bottom: profile micro + collapse toggle ── */}
      <div className="shrink-0 border-t border-border/60">
        {/* Mini profile row */}
        <div
          className={cn(
            "flex items-center gap-2.5 mx-2 mb-1 mt-2 rounded-lg p-2",
            "hover:bg-accent/60 transition-colors cursor-default select-none",
            collapsed && "justify-center"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
            {initials}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="min-w-0 overflow-hidden"
              >
                <p className="truncate text-[13px] font-semibold leading-none">
                  {displayName.split(" ")[0]}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    role === "ADMIN"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-primary"
                  )}
                >
                  {role ?? "EMPLOYEE"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2.5 mb-1",
            "text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60",
            "transition-colors rounded-lg mx-auto",
            collapsed ? "justify-center" : "justify-between"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {!collapsed && <span className="text-[11px]">Collapse</span>}
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}
