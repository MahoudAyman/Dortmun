-- Dortmun security lockdown, 2026-10-28
-- Owner-only access: only the single authenticated owner account may read or write.
-- The owner email below is the account the user designated for this project.
-- No password is stored in this file.
-- Global login lock: 3 failed logins in the app login flow lock the whole
-- system for 5 hours. Enforcement is via RLS (locked queries return no rows)
-- plus the app login UI, which checks the lock before signing in.

create table if not exists public.dortmun_login_lock (
  id int primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.dortmun_login_lock (id, failed_count, locked_until)
values (1, 0, null)
on conflict (id) do nothing;

alter table public.dortmun_login_lock enable row level security;
-- No policies on this table on purpose: direct reads/writes by anon or
-- authenticated users are denied. Only the SECURITY DEFINER functions below
-- may read or update it.

create or replace function public.dortmun_login_is_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dortmun_login_lock
    where id = 1 and locked_until is not null and locked_until > now()
  );
$$;

create or replace function public.dortmun_login_lock_status()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select locked_until from public.dortmun_login_lock where id = 1;
$$;

create or replace function public.dortmun_login_record_failure()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_locked timestamptz;
begin
  insert into public.dortmun_login_lock (id, failed_count, locked_until)
  values (1, 0, null)
  on conflict (id) do nothing;

  update public.dortmun_login_lock
  set failed_count = failed_count + 1, updated_at = now()
  where id = 1
  returning failed_count into v_count;

  if v_count >= 3 then
    update public.dortmun_login_lock
    set locked_until = now() + interval '5 hours',
        failed_count = 0,
        updated_at = now()
    where id = 1
    returning locked_until into v_locked;
    return v_locked;
  end if;
  return null;
end;
$$;

create or replace function public.dortmun_login_record_success()
returns void
language sql
security definer
set search_path = public
as $$
  update public.dortmun_login_lock
  set failed_count = 0, locked_until = null, updated_at = now()
  where id = 1;
$$;

grant execute on function public.dortmun_login_is_locked() to anon, authenticated;
grant execute on function public.dortmun_login_lock_status() to anon, authenticated;
grant execute on function public.dortmun_login_record_failure() to anon, authenticated;
grant execute on function public.dortmun_login_record_success() to anon, authenticated;

-- Owner-only policies for every base table.
-- Any request without a valid session for the owner email returns no rows,
-- regardless of origin, tool, server, or API key used.
do $$
declare
  t text;
  tables text[] := array[
    'dortmun_advances','dortmun_attendances','dortmun_audit_logs',
    'dortmun_checks','dortmun_cloud_backups','dortmun_cloud_state',
    'dortmun_daily_headcounts','dortmun_deductions','dortmun_devices',
    'dortmun_expenses','dortmun_extra_cashes','dortmun_extract_lines',
    'dortmun_extracts','dortmun_extras','dortmun_projects',
    'dortmun_settings','dortmun_settlements','dortmun_worker_rate_history',
    'dortmun_workers'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Allow full access for Dortmun app', t);
    execute format('drop policy if exists %I on public.%I', 'Dortmun owner only', t);
    execute format(
      'create policy %I on public.%I for all to authenticated ' ||
      'using ((auth.jwt() ->> %L) = %L and not public.dortmun_login_is_locked()) ' ||
      'with check ((auth.jwt() ->> %L) = %L and not public.dortmun_login_is_locked())',
      'Dortmun owner only', t, 'email', 'gqikdubrjntorldfieo36@gmail.com',
      'email', 'gqikdubrjntorldfieo36@gmail.com'
    );
  end loop;
end $$;

-- Views must run with the caller's privileges so underlying RLS applies.
alter view public.dortmun_v_worker_live_balances set (security_invoker = true);
alter view public.dortmun_v_project_financials set (security_invoker = true);
alter view public.dortmun_v_daily_headcount_audit set (security_invoker = true);
