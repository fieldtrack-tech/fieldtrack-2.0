-- API keys platform
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  scopes text[] not null default array[]::text[],
  active boolean not null default true,
  request_count bigint not null default 0,
  error_count bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_keys_name_len check (char_length(name) between 3 and 64),
  constraint api_keys_scope_values check (
    scopes <@ array['read:employees','read:sessions','write:expenses','admin:all']::text[]
  ),
  constraint api_keys_admin_scope_exclusive check (
    not ('admin:all' = any(scopes) and array_length(scopes, 1) > 1)
  )
);

create index if not exists idx_api_keys_org on public.api_keys(organization_id);
create index if not exists idx_api_keys_org_active on public.api_keys(organization_id, active);
create index if not exists idx_api_keys_last_used_at on public.api_keys(last_used_at desc nulls last);
create unique index if not exists idx_api_keys_prefix_hash on public.api_keys(key_prefix, key_hash);

drop trigger if exists trg_api_keys_updated_at on public.api_keys;
create trigger trg_api_keys_updated_at
before update on public.api_keys
for each row execute function public.set_updated_at();

alter table public.api_keys enable row level security;

create policy api_keys_select_same_org on public.api_keys
for select
using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

create policy api_keys_insert_same_org on public.api_keys
for insert
with check (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

create policy api_keys_update_same_org on public.api_keys
for update
using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''))
with check (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

create policy api_keys_delete_same_org on public.api_keys
for delete
using (organization_id::text = coalesce(auth.jwt() ->> 'org_id', ''));

create or replace function public.increment_api_key_usage(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys
  set request_count = request_count + 1,
      last_used_at = now()
  where id = p_key_id and active = true and revoked_at is null;
end;
$$;

create or replace function public.increment_api_key_error(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys
  set error_count = error_count + 1
  where id = p_key_id;
end;
$$;

grant execute on function public.increment_api_key_usage(uuid) to service_role;
grant execute on function public.increment_api_key_error(uuid) to service_role;
