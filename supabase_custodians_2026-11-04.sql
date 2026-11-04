-- Dortmun custodian (أمناء العهدة) migration, 2026-11-04
-- Every money movement now records where it came from and who holds it:
-- which custodian's Vodafone Cash account received it, who withdrew it,
-- and any withdrawal fee. Custodian values are 'mahmoud_ayman',
-- 'mahmoud_hamada', 'ayman_hassan' or 'other' (with the * _name field
-- holding the written name when 'other').
-- No password or secret is stored in this file.
-- The new columns need NO policy change: the existing owner-only policies
-- ("Dortmun owner only", FOR ALL TO authenticated, owner email + not
-- locked) already cover all of these tables, and a new column is governed
-- by its table's policy exactly like the old ones.
-- NOTE on table names: the live database table is dortmun_extra_cashes
-- (plural); the in-app schema file calls it dortmun_extra_cash.

-- 0. The incoming-payments table does not exist in the live database yet,
-- so create it FIRST (with the custodian columns included), before any
-- ALTER on it below. The ALTERs that follow are IF NOT EXISTS, so this
-- file is safe to re-run.
create table if not exists public.dortmun_incoming_payments (
  id bigint primary key,
  date text,
  source_type text default 'شركة',
  source_name text default '',
  sender_name text default '',
  check_number text default '',
  method text default 'نقدي',
  amount numeric(12,2) not null default 0,
  project_id bigint null,
  check_id bigint null,
  extract_id bigint null,
  received_by text,
  received_by_name text,
  notes text default '',
  updated_at timestamptz not null default now()
);

alter table public.dortmun_incoming_payments enable row level security;

-- Owner-only policy, same pattern as supabase_lockdown_2026-10-28.sql:
-- only the single authenticated owner account may read or write, and
-- nothing is readable while the global login lock is active.
drop policy if exists "Dortmun owner only" on public.dortmun_incoming_payments;
create policy "Dortmun owner only" on public.dortmun_incoming_payments
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'gqikdubrjntorldfieo36@gmail.com' and not public.dortmun_login_is_locked())
  with check ((auth.jwt() ->> 'email') = 'gqikdubrjntorldfieo36@gmail.com' and not public.dortmun_login_is_locked());

-- 1. Advances: which custodian's account funded it, who withdrew it, fee.
alter table public.dortmun_advances
  add column if not exists funded_by text,
  add column if not exists funded_by_name text,
  add column if not exists withdrawn_by text,
  add column if not exists withdrawal_fee numeric(12,2) default 0;

-- 2. Incoming payments: who the money reached (who holds it now).
alter table public.dortmun_incoming_payments
  add column if not exists received_by text,
  add column if not exists received_by_name text;

-- 3. Expenses: from whose account it was paid, withdrawal fee.
alter table public.dortmun_expenses
  add column if not exists paid_by text,
  add column if not exists paid_by_name text,
  add column if not exists withdrawal_fee numeric(12,2) default 0;

-- 4. Checks: incoming check reached whom / outgoing check paid from whom.
alter table public.dortmun_checks
  add column if not exists custodian text,
  add column if not exists custodian_name text;

-- 5. Extra cash (nash): from whose account it was paid, withdrawal fee.
alter table public.dortmun_extra_cashes
  add column if not exists paid_by text,
  add column if not exists paid_by_name text,
  add column if not exists withdrawal_fee numeric(12,2) default 0;

-- 6. Settlements (payday 15th): from whose account the net was paid, fee.
alter table public.dortmun_settlements
  add column if not exists paid_by text,
  add column if not exists paid_by_name text,
  add column if not exists withdrawal_fee numeric(12,2) default 0;

-- 7. Extract lines: who collected the amount.
alter table public.dortmun_extract_lines
  add column if not exists collected_by text,
  add column if not exists collected_by_name text;

-- 8. Extracts: who received the extract money.
alter table public.dortmun_extracts
  add column if not exists received_by text,
  add column if not exists received_by_name text;
