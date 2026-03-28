"use client";

import { useMyProfile } from "@/hooks/queries/useProfile";
import { useLeaderboard } from "@/hooks/queries/useAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileView } from "@/components/ProfileView";
import { PageTransition } from "@/components/motion";
import { UserCircle } from "lucide-react";

export default function MyProfilePage() {
  const { user, role } = useAuth();
  const { data: profile, isLoading: profileLoading, error } = useMyProfile();
  const { data: leaderboard } = useLeaderboard("distance", 50);

  const myRank = profile && leaderboard
    ? leaderboard.find((e) => e.employeeId === profile.id)?.rank
    : undefined;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Profile</h2>
          <p className="text-muted-foreground text-sm">
            Your identity, activity status, and performance metrics.
          </p>
        </div>

        {profileLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ) : error ? (
          role === "ADMIN" ? (
            // Admins typically don't have a field employee profile — show a graceful message
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-card p-12 text-center shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <UserCircle className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">{user?.email?.split("@")[0] ?? "Admin"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
                <span className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                  {role}
                </span>
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Administrator accounts do not have a field employee profile. Employee performance
                metrics, GPS sessions, and attendance data are accessible through the admin dashboard.
              </p>
            </div>
          ) : (
            <ErrorBanner error={error} />
          )
        ) : profile ? (
          <ProfileView profile={profile} rank={myRank} />
        ) : null}
      </div>
    </PageTransition>
  );
}
