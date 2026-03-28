-- Phase 29: migration reconciliation hardening
-- 1) Enable RLS on newly introduced public tables
-- 2) Add explicit policies for service_role and authenticated admin reads
-- 3) Lock trigger function search_path

alter table if exists public.admin_audit_log enable row level security;
alter table if exists public.webhook_dlq_archive enable row level security;

drop policy if exists service_role_only_admin_audit_log on public.admin_audit_log;
create policy service_role_only_admin_audit_log
  on public.admin_audit_log
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists admin_read_admin_audit_log on public.admin_audit_log;
create policy admin_read_admin_audit_log
  on public.admin_audit_log
  for select
  to authenticated
  using (
    organization_id = (
      select u.organization_id
      from public.users u
      where u.id = (select auth.uid())
    )
    and (
      select u.role
      from public.users u
      where u.id = (select auth.uid())
    ) = 'ADMIN'
  );

drop policy if exists service_role_only_webhook_dlq_archive on public.webhook_dlq_archive;
create policy service_role_only_webhook_dlq_archive
  on public.webhook_dlq_archive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists admin_read_webhook_dlq_archive on public.webhook_dlq_archive;
create policy admin_read_webhook_dlq_archive
  on public.webhook_dlq_archive
  for select
  to authenticated
  using (
    webhook_id in (
      select w.id::text
      from public.webhooks w
      where w.organization_id = (
        select u.organization_id
        from public.users u
        where u.id = (select auth.uid())
      )
    )
    and (
      select u.role
      from public.users u
      where u.id = (select auth.uid())
    ) = 'ADMIN'
  );

alter function public.set_updated_at() set search_path = public, pg_temp;
