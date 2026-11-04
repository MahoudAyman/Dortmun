-- Dortmun custodian transfers + pocket/Vodafone split (2026-11-04)
-- New table for money movements between custodians and pocket withdrawals,
-- plus paid_from (vodafone/pocket) on the outflow tables.
-- Owner-only, same pattern as supabase_lockdown_2026-10-28.sql.

create table if not exists public.dortmun_custodian_transfers (
  id bigint primary key,
  date text,
  kind text not null default 'transfer',
  from_custodian text,
  from_custodian_name text default '',
  to_custodian text,
  to_custodian_name text default '',
  amount numeric(12,2) not null default 0,
  withdrawal_fee numeric(12,2) default 0,
  method text default 'فودافون كاش',
  notes text default '',
  updated_at timestamptz not null default now()
);

alter table public.dortmun_custodian_transfers enable row level security;

drop policy if exists "Dortmun owner only" on public.dortmun_custodian_transfers;
create policy "Dortmun owner only" on public.dortmun_custodian_transfers
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'gqikdubrjntorldfieo36@gmail.com' and not public.dortmun_login_is_locked())
  with check ((auth.jwt() ->> 'email') = 'gqikdubrjntorldfieo36@gmail.com' and not public.dortmun_login_is_locked());

-- Where each outflow was paid from: 'vodafone' or 'pocket' (default pocket).
alter table public.dortmun_advances
  add column if not exists paid_from text;
alter table public.dortmun_expenses
  add column if not exists paid_from text;
alter table public.dortmun_settlements
  add column if not exists paid_from text;
alter table public.dortmun_extra_cashes
  add column if not exists paid_from text;
