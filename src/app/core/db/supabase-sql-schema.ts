/**
 * Complete Smart PostgreSQL Schema & RPC Functions for Supabase
 * Project: https://lmcxonnuzbamfqxbqshu.supabase.co
 * Covers all 18 tables of Dortmun Smart Contracting & Labor Management System,
 * automatic triggers, analytical views, RLS policies, Realtime publication,
 * and atomic JSONB-to-Relational synchronization stored procedure.
 */

export const SUPABASE_TABLES_LIST = [
  { name: 'dortmun_cloud_state', label: 'الحالة السحابية الموحدة (Realtime Snapshot)' },
  { name: 'dortmun_devices', label: 'سجل الأجهزة المتصلة وأسماء الدخول' },
  { name: 'dortmun_cloud_backups', label: 'نقاط الاستعادة والنسخ الاحتياطية السحابية' },
  { name: 'dortmun_settings', label: 'إعدادات النظام والشركة والضرائب' },
  { name: 'dortmun_projects', label: 'المشاريع وأسعار يوميات وسهرات الشركة' },
  { name: 'dortmun_workers', label: 'العمال والنحاتية والصنايعية' },
  { name: 'dortmun_daily_headcounts', label: 'دفتر العدد اليومي الإجباري (عمالة · نحاتية · سهرة)' },
  { name: 'dortmun_attendance', label: 'سجل الحضور واليوميات والسهرات' },
  { name: 'dortmun_advances', label: 'سجل السلف النقدية' },
  { name: 'dortmun_deductions', label: 'سجل الخصومات والجزاءات' },
  { name: 'dortmun_settlements', label: 'كشوف قبض يوم ١٥ والتسويات' },
  { name: 'dortmun_extracts', label: 'المستخلصات مع الشركات' },
  { name: 'dortmun_extract_lines', label: 'بنود وتفاصيل المستخلصات' },
  { name: 'dortmun_extras', label: 'الإضافي والناش' },
  { name: 'dortmun_extra_cash', label: 'توزيع نقدية الإضافي والناش للعمال' },
  { name: 'dortmun_checks', label: 'دفتر الشيكات الواردة والصادرة' },
  { name: 'dortmun_expenses', label: 'المصاريف الخارجية للموقع' },
  { name: 'dortmun_incoming_payments', label: 'المقبوضات والدفعات الواردة المباشرة (شركة · شخص · شيك)' },
  { name: 'dortmun_audit_logs', label: 'سجل الرقابة والحركات التفصيلي بالأجهزة' },
] as const;

export const FULL_SUPABASE_SQL_SCHEMA = `-- =========================================================================================
-- نظام شركة دورتمون للمقاولات (Dortmun Smart Cloud SQL Schema v2.0)
-- كود SQL متكامل وذكي ١٠٠٪ لـ Supabase (يشمل الـ ١٨ جدولاً + الدوال الذكية + Views + Realtime + RLS)
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor ثم اضغط Run
-- =========================================================================================

-- 1. دالة تحديث وقت التعديل التلقائي (Auto-Update Timestamp Trigger)
CREATE OR REPLACE FUNCTION public.set_dortmun_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. جدول الحالة السحابية الموحدة الفورية (Main Live Snapshot State)
CREATE TABLE IF NOT EXISTS public.dortmun_cloud_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_device_id TEXT DEFAULT '',
  updated_by_device_name TEXT DEFAULT '',
  last_operation TEXT DEFAULT 'تهيئة النظام',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 3. جدول الأجهزة المتصلة وتسجيل أسماء الدخول (Registered Devices & Live Presence)
CREATE TABLE IF NOT EXISTS public.dortmun_devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  browser_os TEXT DEFAULT '',
  first_login_at TEXT DEFAULT '',
  last_active_at TEXT DEFAULT '',
  last_action TEXT DEFAULT '',
  operations_count BIGINT NOT NULL DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT true,
  sync_mode TEXT NOT NULL DEFAULT 'cloud',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. جدول النسخ الاحتياطية ونقاط الاستعادة السحابية (Cloud Time-Machine Backups)
CREATE TABLE IF NOT EXISTS public.dortmun_cloud_backups (
  id BIGSERIAL PRIMARY KEY,
  backup_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_device_id TEXT DEFAULT '',
  created_by_device_name TEXT DEFAULT '',
  version BIGINT NOT NULL DEFAULT 1,
  workers_count INT NOT NULL DEFAULT 0,
  attendance_count INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. جدول إعدادات الشركة والنظام (App Settings)
CREATE TABLE IF NOT EXISTS public.dortmun_settings (
  id BIGINT PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'شركة دورتمون للمقاولات',
  monthly_day_cap INT NOT NULL DEFAULT 30,
  expected_monthly_days INT NOT NULL DEFAULT 26,
  cap_mode TEXT NOT NULL DEFAULT 'confirm',
  payday_day_of_month INT NOT NULL DEFAULT 15,
  mandatory_daily_headcount BOOLEAN NOT NULL DEFAULT true,
  default_worker_day_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  default_worker_night_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  default_company_day_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  default_company_night_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  default_project_id BIGINT NULL,
  pin_hash TEXT NULL,
  last_backup_date TEXT NULL,
  backup_reminder_days INT NOT NULL DEFAULT 7,
  numeral_mode TEXT NOT NULL DEFAULT 'ar',
  dark_mode BOOLEAN NOT NULL DEFAULT false,
  local_only_mode BOOLEAN NOT NULL DEFAULT false,
  locked_months JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_rates JSONB NOT NULL DEFAULT '[]'::jsonb,
  engineers JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisors JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. جدول المشاريع ومواقع العمل (Projects)
CREATE TABLE IF NOT EXISTS public.dortmun_projects (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  company_day_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_night_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. جدول العمال والنحاتية والصنايعية (Workers & Sculptors)
CREATE TABLE IF NOT EXISTS public.dortmun_workers (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'عامل',
  worker_day_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  worker_night_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  phone TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. جدول دفتر العدد اليومي الإجباري (Mandatory Daily Headcounts)
CREATE TABLE IF NOT EXISTS public.dortmun_daily_headcounts (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  project_id BIGINT NULL,
  expected_day_count INT NOT NULL DEFAULT 0,
  sculptors_count INT NOT NULL DEFAULT 0,
  workers_count INT NOT NULL DEFAULT 0,
  expected_night_count INT NOT NULL DEFAULT 0,
  supervisor_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. جدول الحضور واليوميات والسهرات (Daily Attendance & Night Shifts)
CREATE TABLE IF NOT EXISTS public.dortmun_attendance (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  worker_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  day_worked SMALLINT NOT NULL DEFAULT 1,
  night_worked SMALLINT NOT NULL DEFAULT 0,
  worker_day_rate_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  worker_night_rate_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_day_rate_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_night_rate_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. جدول السلف النقدية (Worker Advances)
CREATE TABLE IF NOT EXISTS public.dortmun_advances (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  worker_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  settlement_id BIGINT NULL,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. جدول الخصومات والجزاءات (Worker Deductions & Penalties)
CREATE TABLE IF NOT EXISTS public.dortmun_deductions (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  worker_id BIGINT NOT NULL,
  project_id BIGINT NULL,
  mode TEXT NOT NULL DEFAULT 'half_day',
  days_deducted NUMERIC(6,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  settlement_id BIGINT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. جدول تسويات وكشوف قبض يوم ١٥ (Payday 15th Settlements)
CREATE TABLE IF NOT EXISTS public.dortmun_settlements (
  id BIGINT PRIMARY KEY,
  worker_id BIGINT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  days NUMERIC(8,2) NOT NULL DEFAULT 0,
  nights NUMERIC(8,2) NOT NULL DEFAULT 0,
  gross_wages NUMERIC(12,2) NOT NULL DEFAULT 0,
  advances_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. جدول المستخلصات مع الشركات (Company Extracts)
CREATE TABLE IF NOT EXISTS public.dortmun_extracts (
  id BIGINT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  number INT NOT NULL DEFAULT 1,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  claimed_amount NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. جدول بنود وتفاصيل المستخلصات (Extract Line Items)
CREATE TABLE IF NOT EXISTS public.dortmun_extract_lines (
  id BIGINT PRIMARY KEY,
  extract_id BIGINT NOT NULL,
  worker_id BIGINT NOT NULL,
  calculated NUMERIC(12,2) NOT NULL DEFAULT 0,
  claimed NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  collected_date TEXT DEFAULT '',
  method TEXT NOT NULL DEFAULT 'نقدي',
  check_id BIGINT NULL,
  status TEXT DEFAULT 'لم يُحصّل',
  is_saved BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. جدول الإضافي والناش (Extras & Overtime Tasks)
CREATE TABLE IF NOT EXISTS public.dortmun_extras (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  project_id BIGINT NOT NULL,
  type TEXT NOT NULL DEFAULT 'يوم إضافي',
  authorized_by TEXT DEFAULT '',
  performed_by TEXT NOT NULL DEFAULT 'workers',
  workers_count INT NOT NULL DEFAULT 1,
  value_mode TEXT NOT NULL DEFAULT 'money',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  days NUMERIC(8,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. جدول توزيع نقدية الإضافي والناش للعمال (Extra Cash Allocations)
CREATE TABLE IF NOT EXISTS public.dortmun_extra_cash (
  id BIGINT PRIMARY KEY,
  extra_id BIGINT NOT NULL,
  worker_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  days NUMERIC(8,2) NOT NULL DEFAULT 0,
  paid_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. جدول الشيكات الواردة والصادرة (Incoming & Outgoing Checks)
CREATE TABLE IF NOT EXISTS public.dortmun_checks (
  id BIGINT PRIMARY KEY,
  direction TEXT NOT NULL DEFAULT 'وارد',
  number TEXT NOT NULL,
  bank TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'معلق',
  project_id BIGINT NULL,
  extract_id BIGINT NULL,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. جدول المصاريف الخارجية للموقع (Site External Expenses)
CREATE TABLE IF NOT EXISTS public.dortmun_expenses (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'مواصلات',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  project_id BIGINT NULL,
  note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. جدول المقبوضات والدفعات الواردة المباشرة (Incoming Direct Payments from Company/Person/Check)
CREATE TABLE IF NOT EXISTS public.dortmun_incoming_payments (
  id BIGINT PRIMARY KEY,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'شركة',
  source_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'نقدي',
  project_id BIGINT NULL,
  check_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. جدول سجل الرقابة والحركات التفصيلي مع اسم الجهاز (Audit Logs with Device Tracking)
CREATE TABLE IF NOT EXISTS public.dortmun_audit_logs (
  id BIGINT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  details TEXT DEFAULT '',
  device_id TEXT DEFAULT '',
  device_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================================
-- الفهارس الذكية لتسريع البحث والتقارير (Smart Performance Indexes)
-- =========================================================================================
CREATE INDEX IF NOT EXISTS idx_dortmun_att_date ON public.dortmun_attendance(date);
CREATE INDEX IF NOT EXISTS idx_dortmun_att_worker ON public.dortmun_attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_dortmun_att_project ON public.dortmun_attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_dortmun_hc_date ON public.dortmun_daily_headcounts(date);
CREATE INDEX IF NOT EXISTS idx_dortmun_adv_worker ON public.dortmun_advances(worker_id);
CREATE INDEX IF NOT EXISTS idx_dortmun_ded_worker ON public.dortmun_deductions(worker_id);
CREATE INDEX IF NOT EXISTS idx_dortmun_chk_status ON public.dortmun_checks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_dortmun_exp_date ON public.dortmun_expenses(date);
CREATE INDEX IF NOT EXISTS idx_dortmun_inc_date ON public.dortmun_incoming_payments(date);
CREATE INDEX IF NOT EXISTS idx_dortmun_audit_ts ON public.dortmun_audit_logs(timestamp DESC);

-- =========================================================================================
-- التقارير الذكية المباشرة في قاعدة البيانات (Smart Analytical SQL Views)
-- =========================================================================================

-- كشف أرصدة العمال والنحاتية المباشر (Live Worker Balance View)
CREATE OR REPLACE VIEW public.dortmun_worker_live_balance_v AS
SELECT
  w.id AS worker_id,
  w.name AS worker_name,
  w.role AS worker_role,
  w.worker_day_rate,
  w.worker_night_rate,
  COALESCE(SUM(a.day_worked), 0) AS total_days_worked,
  COALESCE(SUM(a.night_worked), 0) AS total_nights_worked,
  COALESCE(SUM(a.day_worked * a.worker_day_rate_snapshot + a.night_worked * a.worker_night_rate_snapshot), 0) AS gross_attendance_wages,
  COALESCE((SELECT SUM(adv.amount) FROM public.dortmun_advances adv WHERE adv.worker_id = w.id AND adv.settlement_id IS NULL), 0) AS open_advances,
  COALESCE((SELECT SUM(ded.amount) FROM public.dortmun_deductions ded WHERE ded.worker_id = w.id AND ded.settlement_id IS NULL), 0) AS open_deductions
FROM public.dortmun_workers w
LEFT JOIN public.dortmun_attendance a ON a.worker_id = w.id
GROUP BY w.id, w.name, w.role, w.worker_day_rate, w.worker_night_rate;

-- ملخص الأداء المالي للمشاريع (Project Financial Performance View)
CREATE OR REPLACE VIEW public.dortmun_project_financial_summary_v AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  COALESCE(SUM(a.day_worked), 0) AS total_days,
  COALESCE(SUM(a.night_worked), 0) AS total_nights,
  COALESCE(SUM(a.day_worked * a.worker_day_rate_snapshot + a.night_worked * a.worker_night_rate_snapshot), 0) AS total_worker_wages,
  COALESCE(SUM(a.day_worked * a.company_day_rate_snapshot + a.night_worked * a.company_night_rate_snapshot), 0) AS total_company_entitlement,
  COALESCE((SELECT SUM(ex.amount) FROM public.dortmun_expenses ex WHERE ex.project_id = p.id), 0) AS total_external_expenses,
  COALESCE((SELECT SUM(inc.amount) FROM public.dortmun_incoming_payments inc WHERE inc.project_id = p.id), 0) AS total_incoming_payments
FROM public.dortmun_projects p
LEFT JOIN public.dortmun_attendance a ON a.project_id = p.id
GROUP BY p.id, p.name;

-- =========================================================================================
-- الدالة الذكية للمزامنة الشاملة (Atomic Full Snapshot -> All 19 Relational Tables RPC)
-- تزامن جميع الجداول الـ 19 تلقائياً في عملية واحدة (Transaction) عند كل حركة في الموقع
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.sync_dortmun_full_snapshot(
  p_version BIGINT,
  p_updated_by_device_id TEXT,
  p_updated_by_device_name TEXT,
  p_last_operation TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. تحديث جدول الحالة الموحدة (dortmun_cloud_state)
  INSERT INTO public.dortmun_cloud_state (
    id, version, updated_at, updated_by_device_id, updated_by_device_name, last_operation, payload
  ) VALUES (
    'main', p_version, NOW(), p_updated_by_device_id, p_updated_by_device_name, p_last_operation, p_payload
  )
  ON CONFLICT (id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = NOW(),
    updated_by_device_id = EXCLUDED.updated_by_device_id,
    updated_by_device_name = EXCLUDED.updated_by_device_name,
    last_operation = EXCLUDED.last_operation,
    payload = EXCLUDED.payload;

  -- 2. مزامنة جدول المشاريع (dortmun_projects)
  DELETE FROM public.dortmun_projects;
  IF jsonb_typeof(p_payload->'projects') = 'array' AND jsonb_array_length(p_payload->'projects') > 0 THEN
    INSERT INTO public.dortmun_projects (id, name, company_day_rate, company_night_rate, active, notes)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'name', ''),
      COALESCE((item->>'companyDayRate')::NUMERIC, 0),
      COALESCE((item->>'companyNightRate')::NUMERIC, 0),
      COALESCE((item->>'active')::BOOLEAN, true),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'projects') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      company_day_rate = EXCLUDED.company_day_rate,
      company_night_rate = EXCLUDED.company_night_rate,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = NOW();
  END IF;

  -- 3. مزامنة جدول العمال والنحاتية (dortmun_workers)
  DELETE FROM public.dortmun_workers;
  IF jsonb_typeof(p_payload->'workers') = 'array' AND jsonb_array_length(p_payload->'workers') > 0 THEN
    INSERT INTO public.dortmun_workers (id, name, role, worker_day_rate, worker_night_rate, phone, active, notes)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'name', ''),
      COALESCE(item->>'role', 'عامل'),
      COALESCE((item->>'workerDayRate')::NUMERIC, 0),
      COALESCE((item->>'workerNightRate')::NUMERIC, 0),
      COALESCE(item->>'phone', ''),
      COALESCE((item->>'active')::BOOLEAN, true),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'workers') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      worker_day_rate = EXCLUDED.worker_day_rate,
      worker_night_rate = EXCLUDED.worker_night_rate,
      phone = EXCLUDED.phone,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = NOW();
  END IF;

  -- 4. مزامنة جدول العدد اليومي الإجباري (dortmun_daily_headcounts)
  DELETE FROM public.dortmun_daily_headcounts;
  IF jsonb_typeof(p_payload->'dailyHeadcounts') = 'array' AND jsonb_array_length(p_payload->'dailyHeadcounts') > 0 THEN
    INSERT INTO public.dortmun_daily_headcounts (
      id, date, project_id, expected_day_count, sculptors_count, workers_count, expected_night_count, supervisor_name, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      NULLIF(item->>'projectId', '')::BIGINT,
      COALESCE((item->>'expectedDayCount')::INT, 0),
      COALESCE((item->>'sculptorsCount')::INT, 0),
      COALESCE((item->>'workersCount')::INT, 0),
      COALESCE((item->>'expectedNightCount')::INT, 0),
      COALESCE(item->>'supervisorName', ''),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'dailyHeadcounts') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 5. مزامنة جدول الحضور واليوميات والسهرات (dortmun_attendance)
  DELETE FROM public.dortmun_attendance;
  IF jsonb_typeof(p_payload->'attendances') = 'array' AND jsonb_array_length(p_payload->'attendances') > 0 THEN
    INSERT INTO public.dortmun_attendance (
      id, date, worker_id, project_id, day_worked, night_worked,
      worker_day_rate_snapshot, worker_night_rate_snapshot, company_day_rate_snapshot, company_night_rate_snapshot, note
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE((item->>'workerId')::BIGINT, 0),
      COALESCE((item->>'projectId')::BIGINT, 0),
      COALESCE((item->>'dayWorked')::SMALLINT, 0),
      COALESCE((item->>'nightWorked')::SMALLINT, 0),
      COALESCE((item->>'workerDayRateSnapshot')::NUMERIC, 0),
      COALESCE((item->>'workerNightRateSnapshot')::NUMERIC, 0),
      COALESCE((item->>'companyDayRateSnapshot')::NUMERIC, 0),
      COALESCE((item->>'companyNightRateSnapshot')::NUMERIC, 0),
      COALESCE(item->>'note', '')
    FROM jsonb_array_elements(p_payload->'attendances') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 6. مزامنة جدول السلف (dortmun_advances)
  DELETE FROM public.dortmun_advances;
  IF jsonb_typeof(p_payload->'advances') = 'array' AND jsonb_array_length(p_payload->'advances') > 0 THEN
    INSERT INTO public.dortmun_advances (id, date, worker_id, amount, reason, settlement_id, notes)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE((item->>'workerId')::BIGINT, 0),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE(item->>'reason', ''),
      NULLIF(item->>'settlementId', '')::BIGINT,
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'advances') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 7. مزامنة جدول الخصومات والجزاءات (dortmun_deductions)
  DELETE FROM public.dortmun_deductions;
  IF jsonb_typeof(p_payload->'deductions') = 'array' AND jsonb_array_length(p_payload->'deductions') > 0 THEN
    INSERT INTO public.dortmun_deductions (
      id, date, worker_id, project_id, mode, days_deducted, amount, reason, notes, settlement_id
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE((item->>'workerId')::BIGINT, 0),
      NULLIF(item->>'projectId', '')::BIGINT,
      COALESCE(item->>'mode', 'half_day'),
      COALESCE((item->>'daysDeducted')::NUMERIC, 0),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE(item->>'reason', ''),
      COALESCE(item->>'notes', ''),
      NULLIF(item->>'settlementId', '')::BIGINT
    FROM jsonb_array_elements(p_payload->'deductions') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 8. مزامنة جدول كشوف قبض يوم ١٥ (dortmun_settlements)
  DELETE FROM public.dortmun_settlements;
  IF jsonb_typeof(p_payload->'settlements') = 'array' AND jsonb_array_length(p_payload->'settlements') > 0 THEN
    INSERT INTO public.dortmun_settlements (
      id, worker_id, period_from, period_to, days, nights, gross_wages, advances_deducted, deductions_deducted, net_paid, date, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE((item->>'workerId')::BIGINT, 0),
      COALESCE(item->>'from', ''),
      COALESCE(item->>'to', ''),
      COALESCE((item->>'days')::NUMERIC, 0),
      COALESCE((item->>'nights')::NUMERIC, 0),
      COALESCE((item->>'grossWages')::NUMERIC, 0),
      COALESCE((item->>'advancesDeducted')::NUMERIC, 0),
      COALESCE((item->>'deductionsDeducted')::NUMERIC, 0),
      COALESCE((item->>'netPaid')::NUMERIC, 0),
      COALESCE(item->>'date', ''),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'settlements') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 9. مزامنة جدول المستخلصات (dortmun_extracts)
  DELETE FROM public.dortmun_extracts;
  IF jsonb_typeof(p_payload->'extracts') = 'array' AND jsonb_array_length(p_payload->'extracts') > 0 THEN
    INSERT INTO public.dortmun_extracts (id, project_id, number, period_from, period_to, notes)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE((item->>'projectId')::BIGINT, 0),
      COALESCE((item->>'number')::INT, 1),
      COALESCE(item->>'from', ''),
      COALESCE(item->>'to', ''),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'extracts') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 10. مزامنة جدول بنود المستخلصات (dortmun_extract_lines)
  DELETE FROM public.dortmun_extract_lines;
  IF jsonb_typeof(p_payload->'extractLines') = 'array' AND jsonb_array_length(p_payload->'extractLines') > 0 THEN
    INSERT INTO public.dortmun_extract_lines (
      id, extract_id, worker_id, calculated, claimed, tax_rate, tax_amount, collected, collected_date, method, check_id, status, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE((item->>'extractId')::BIGINT, 0),
      COALESCE((item->>'workerId')::BIGINT, 0),
      COALESCE((item->>'calculated')::NUMERIC, 0),
      COALESCE((item->>'claimed')::NUMERIC, 0),
      COALESCE((item->>'taxRate')::NUMERIC, 0),
      COALESCE((item->>'taxAmount')::NUMERIC, 0),
      COALESCE((item->>'collected')::NUMERIC, 0),
      COALESCE(item->>'collectedDate', ''),
      COALESCE(item->>'method', 'نقدي'),
      NULLIF(item->>'checkId', '')::BIGINT,
      COALESCE(item->>'status', 'لم يُحصّل'),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'extractLines') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 11. مزامنة جدول الإضافي والناش (dortmun_extras)
  DELETE FROM public.dortmun_extras;
  IF jsonb_typeof(p_payload->'extras') = 'array' AND jsonb_array_length(p_payload->'extras') > 0 THEN
    INSERT INTO public.dortmun_extras (
      id, date, project_id, type, authorized_by, performed_by, workers_count, value_mode, amount, days, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE((item->>'projectId')::BIGINT, 0),
      COALESCE(item->>'type', 'يوم إضافي'),
      COALESCE(item->>'authorizedBy', ''),
      COALESCE(item->>'performedBy', 'workers'),
      COALESCE((item->>'workersCount')::INT, 1),
      COALESCE(item->>'valueMode', 'money'),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE((item->>'days')::NUMERIC, 0),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'extras') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 12. مزامنة جدول توزيع نقدية الإضافي (dortmun_extra_cash)
  DELETE FROM public.dortmun_extra_cash;
  IF jsonb_typeof(p_payload->'extraCashes') = 'array' AND jsonb_array_length(p_payload->'extraCashes') > 0 THEN
    INSERT INTO public.dortmun_extra_cash (id, extra_id, worker_id, amount, days, paid_cash, notes)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE((item->>'extraId')::BIGINT, 0),
      COALESCE((item->>'workerId')::BIGINT, 0),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE((item->>'days')::NUMERIC, 0),
      COALESCE((item->>'paidCash')::NUMERIC, 0),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'extraCashes') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 13. مزامنة جدول الشيكات (dortmun_checks)
  DELETE FROM public.dortmun_checks;
  IF jsonb_typeof(p_payload->'checks') = 'array' AND jsonb_array_length(p_payload->'checks') > 0 THEN
    INSERT INTO public.dortmun_checks (
      id, direction, number, bank, amount, due_date, status, project_id, extract_id, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'direction', 'وارد'),
      COALESCE(item->>'number', ''),
      COALESCE(item->>'bank', ''),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE(item->>'dueDate', ''),
      COALESCE(item->>'status', 'معلق'),
      NULLIF(item->>'projectId', '')::BIGINT,
      NULLIF(item->>'extractId', '')::BIGINT,
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'checks') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 14. مزامنة جدول المصاريف الخارجية (dortmun_expenses)
  DELETE FROM public.dortmun_expenses;
  IF jsonb_typeof(p_payload->'expenses') = 'array' AND jsonb_array_length(p_payload->'expenses') > 0 THEN
    INSERT INTO public.dortmun_expenses (id, date, category, amount, project_id, note)
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE(item->>'category', 'مواصلات'),
      COALESCE((item->>'amount')::NUMERIC, 0),
      NULLIF(item->>'projectId', '')::BIGINT,
      COALESCE(item->>'note', '')
    FROM jsonb_array_elements(p_payload->'expenses') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 15. مزامنة جدول المقبوضات والدفعات الواردة المباشرة (dortmun_incoming_payments)
  DELETE FROM public.dortmun_incoming_payments;
  IF jsonb_typeof(p_payload->'incomingPayments') = 'array' AND jsonb_array_length(p_payload->'incomingPayments') > 0 THEN
    INSERT INTO public.dortmun_incoming_payments (
      id, date, source_type, source_name, amount, method, project_id, check_number, notes
    )
    SELECT
      COALESCE((item->>'id')::BIGINT, 0),
      COALESCE(item->>'date', ''),
      COALESCE(item->>'sourceType', 'شركة'),
      COALESCE(item->>'sourceName', ''),
      COALESCE((item->>'amount')::NUMERIC, 0),
      COALESCE(item->>'method', 'نقدي'),
      NULLIF(item->>'projectId', '')::BIGINT,
      COALESCE(item->>'checkNumber', ''),
      COALESCE(item->>'notes', '')
    FROM jsonb_array_elements(p_payload->'incomingPayments') AS item
    WHERE (item->>'id') IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 16. مزامنة سجل الرقابة والحركات (dortmun_audit_logs)
  DELETE FROM public.dortmun_audit_logs;
  IF jsonb_typeof(p_payload->'auditLogs') = 'array' AND jsonb_array_length(p_payload->'auditLogs') > 0 THEN
    INSERT INTO public.dortmun_audit_logs (id, timestamp, action, entity, details, device_id, device_name)
    SELECT
      COALESCE((item->>'id')::BIGINT, floor(random() * 1000000000)::BIGINT),
      COALESCE(item->>'timestamp', ''),
      COALESCE(item->>'action', ''),
      COALESCE(item->>'entity', ''),
      COALESCE(item->>'details', ''),
      COALESCE(item->>'deviceId', ''),
      COALESCE(item->>'deviceName', '')
    FROM jsonb_array_elements(p_payload->'auditLogs') AS item
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'version', p_version,
    'synced_at', NOW()
  );
END;
$$;

-- =========================================================================================
-- تفعيل الحماية وصلاحيات القراءة والكتابة للتطبيق (Row Level Security Policies)
-- =========================================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dortmun_cloud_state', 'dortmun_devices', 'dortmun_cloud_backups', 'dortmun_settings',
    'dortmun_projects', 'dortmun_workers', 'dortmun_daily_headcounts', 'dortmun_attendance',
    'dortmun_advances', 'dortmun_deductions', 'dortmun_settlements', 'dortmun_extracts',
    'dortmun_extract_lines', 'dortmun_extras', 'dortmun_extra_cash', 'dortmun_checks',
    'dortmun_expenses', 'dortmun_incoming_payments', 'dortmun_audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "dortmun_public_access_%s" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "dortmun_public_access_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true);',
      t, t
    );
  END LOOP;
END $$;

-- =========================================================================================
-- تفعيل البث اللحظي (Supabase Realtime Publication) على الجداول الحية
-- =========================================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dortmun_cloud_state;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dortmun_devices;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dortmun_cloud_backups;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
`;

export interface SmartParsedCommand {
  kind:
    | 'deduction'
    | 'advance'
    | 'expense'
    | 'headcount'
    | 'worker'
    | 'check_withdrawal'
    | 'attendance'
    | 'settlement'
    | 'change_date'
    | 'navigate'
    | 'unknown';
  summary: string;
  workerNameHint?: string;
  workerRole?: 'نحات' | 'صنايعي' | 'عامل' | 'مشرف';
  deductionMode?: 'day' | 'half_day' | 'quarter_day' | 'money';
  amount?: number;
  fee?: number;
  expenseCategory?: 'مواصلات' | 'أكل' | 'أدوات' | 'صيانة' | 'أخرى';
  reason?: string;
  workersCount?: number;
  sculptorsCount?: number;
  nightsCount?: number;
  dayWorked?: 0 | 1;
  nightWorked?: 0 | 1;
  targetDate?: 'today' | 'yesterday' | string;
  targetRoute?: string;
}

/**
 * Pure smart command parser for quick mobile/voice natural-language entry:
 * Examples:
 * - "خصم نص يوم على أحمد بسبب تأخير"
 * - "سلفة 500 لمحمود"
 * - "سحبت 4000 من الشيك ومصاريف 40"
 * - "حضور كريم يوم وسهرة"
 * - "قفل حساب مصطفى اديله حسابه"
 * - "غير التاريخ لأمس" / "تاريخ اليوم"
 * - "مصروف مواصلات 250 عربية نقل"
 * - "العدد اليومي 10 عمال و 4 نحات و 3 سهرة"
 * - "عامل جديد إبراهيم نحات يومية 600"
 */
export function parseSmartSiteCommand(rawInput: string): SmartParsedCommand {
  const normalized = rawInput
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  if (!normalized) {
    return {
      kind: 'unknown',
      summary: 'اكتب أو انطق أمراً ذكياً مثل: "سلفة 500 لمحمد" أو "سحبت 4000 من الشيك ومصاريف 40" أو "حضور كريم يوم وسهرة"',
    };
  }

  // 0. Date Change Command ("غير التاريخ لأمس", "تاريخ امبارح", "تاريخ اليوم", "النهارده")
  if (
    normalized.includes('امبارح') ||
    normalized.includes('أمس') ||
    normalized.includes('تاريخ امس') ||
    normalized.includes('غير لامس')
  ) {
    return {
      kind: 'change_date',
      targetDate: 'yesterday',
      summary: 'التحويل إلى تاريخ أمس (خلي بالك: أنت تعدل وتسجل على إمبارح)',
    };
  }

  if (
    normalized.includes('النهارده') ||
    normalized.includes('تاريخ اليوم') ||
    normalized.includes('رجعني لليوم') ||
    normalized.includes('ارجع لليوم')
  ) {
    return {
      kind: 'change_date',
      targetDate: 'today',
      summary: 'الرجوع إلى تاريخ اليوم الفعلي وتحديث كافة التسجيلات',
    };
  }

  // 0.1 Navigation / Report Shortcuts ("التقارير", "افتح التقارير", "تقرير الشهر", "الخزنة", "الشيكات")
  if (normalized.includes('تقرير') || normalized.includes('تقارير')) {
    return {
      kind: 'navigate',
      targetRoute: '/reports',
      summary: 'فتح صفحة التقارير والتصدير الشاملة',
    };
  }

  // 0.2 Check Withdrawal Command ("سحبت 4000 من الشيك ورسوم 40" / "سحب 4000 شيك ومصاريف 40")
  if (
    (normalized.includes('سحب') || normalized.includes('سحبت')) &&
    (normalized.includes('شيك') || normalized.includes('الشيك') || normalized.includes('بنك'))
  ) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    const amount = numMatch ? Number(numMatch[1]) : 0;
    const feeMatch = normalized.match(/(?:رسوم|مصاريف|حق السحب|مصروف)\s*(\d+(?:\.\d+)?)/);
    const fee = feeMatch ? Number(feeMatch[1]) : 0;

    return {
      kind: 'check_withdrawal',
      amount,
      fee,
      summary: `تسجيل سحبة كاش ${amount} ج.م من شيك المشروع ورسوم سحب ${fee} ج.م`,
    };
  }

  // 0.3 Worker Settlement Command ("قفل حساب كريم", "اديله حسابه", "تصفية حساب أحمد")
  if (
    normalized.includes('قفل حساب') ||
    normalized.includes('اديله حسابه') ||
    normalized.includes('اديلو حسابه') ||
    normalized.includes('تصفية حساب') ||
    normalized.includes('صفي حساب')
  ) {
    const workerNameHint = normalized
      .replace(/^(?:قفل حساب|اديله حسابه|اديلو حسابه|تصفية حساب|صفي حساب)\s*/, '')
      .replace(/^(?:لـ|ل|على)\s*/, '')
      .trim();

    return {
      kind: 'settlement',
      workerNameHint,
      summary: `تقفيل وصرف كامل حساب العامل المستحق ${workerNameHint ? '"' + workerNameHint + '"' : ''}`,
    };
  }

  // 0.4 Worker Attendance Command ("حضور كريم يوم وسهرة", "سجل حضور محمد", "حضر علي يوم")
  if (
    normalized.startsWith('حضور') ||
    normalized.startsWith('سجل حضور') ||
    normalized.startsWith('حضر')
  ) {
    const hasNight = normalized.includes('سهرة') || normalized.includes('سهره') || normalized.includes('سهرتين');
    const dayWorked: 0 | 1 = normalized.includes('نص') ? 0 : 1;
    const nightWorked: 0 | 1 = hasNight ? 1 : 0;
    const workerNameHint = normalized
      .replace(/^(?:سجل حضور|حضور|حضر)\s*/, '')
      .replace(/\s+(?:يوم|يومية|وسهرة|وسهره|سهرة|سهره).*$/, '')
      .trim();

    return {
      kind: 'attendance',
      workerNameHint,
      dayWorked,
      nightWorked,
      summary: `تسجيل حضور العامل "${workerNameHint}" (${dayWorked ? 'يوم' : ''}${nightWorked ? ' + سهرة' : ''})`,
    };
  }

  // 1. Check for Daily Headcount command ("العدد اليومي 10 عمال و 4 نحات و 3 سهرة")
  if (
    normalized.includes('العدد') ||
    (normalized.includes('عامل') && normalized.includes('نحات')) ||
    (normalized.includes('عمال') && normalized.includes('سهرة'))
  ) {
    const workersMatch = normalized.match(/(\d+)\s*(?:عامل|عمال|صنايعي)/);
    const sculptorsMatch = normalized.match(/(\d+)\s*(?:نحات|نحّات|نحاتين|نحاتية)/);
    const nightsMatch = normalized.match(/(\d+)\s*(?:سهرة|سهرات)/);

    const workersCount = workersMatch ? Number(workersMatch[1]) : 0;
    const sculptorsCount = sculptorsMatch ? Number(sculptorsMatch[1]) : 0;
    const nightsCount = nightsMatch ? Number(nightsMatch[1]) : 0;

    if (workersCount > 0 || sculptorsCount > 0 || nightsCount > 0) {
      return {
        kind: 'headcount',
        workersCount,
        sculptorsCount,
        nightsCount,
        summary: `تسجيل العدد اليومي الإجباري: ${workersCount} عمال + ${sculptorsCount} نحاتية · ${nightsCount} سهرة`,
      };
    }
  }

  // 2. Check for Deduction ("خصم نص يوم على أحمد بسبب تأخير" / "خصم 200 على سيد")
  if (normalized.startsWith('خصم') || normalized.includes('جزاء')) {
    let deductionMode: 'day' | 'half_day' | 'quarter_day' | 'money' = 'half_day';
    let amount = 0;

    if (normalized.includes('ربع يوم') || normalized.includes('ربع يومية')) {
      deductionMode = 'quarter_day';
    } else if (normalized.includes('نص يوم') || normalized.includes('نصف يوم')) {
      deductionMode = 'half_day';
    } else if (normalized.includes('يوم كامل') || normalized.includes('يوميه') || normalized.includes('يومية')) {
      deductionMode = 'day';
    } else {
      const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        deductionMode = 'money';
        amount = Number(numMatch[1]);
      }
    }

    const withoutReason = normalized.replace(/\s+(?:بسبب|لأن|عشان)\s+.+$/, '').trim();
    const nameMatch =
      withoutReason.match(/(?:على|لـ|ل)\s+([^\d]+)$/) ||
      withoutReason.match(/^(?:خصم|جزاء)\s+(?:ربع يوم|نص يوم|نصف يوم|يوم كامل|يومية|\d+(?:\.\d+)?)\s+(.+)$/);
    const reasonMatch = normalized.match(/(?:بسبب|لأن|عشان)\s+(.+)$/);
    const workerNameHint = nameMatch ? nameMatch[1].replace(/^(?:على|لـ|ل)\s+/, '').trim() : '';
    const reason = reasonMatch ? reasonMatch[1].trim() : 'خصم فوري من الأمر الذكي';

    return {
      kind: 'deduction',
      deductionMode,
      amount,
      workerNameHint,
      reason,
      summary: `خصم (${deductionMode === 'half_day' ? 'نص يوم' : deductionMode === 'day' ? 'يوم كامل' : deductionMode === 'quarter_day' ? 'ربع يوم' : amount + ' ج.م'})${workerNameHint ? ' على: ' + workerNameHint : ''}`,
    };
  }

  // 3. Check for Advance ("سلفة 500 لأحمد" / "سلفه 300 على حسن" / "سلفة 500 محمد")
  if (normalized.startsWith('سلف') || normalized.includes('سلفة') || normalized.includes('سلفه')) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    const amount = numMatch ? Number(numMatch[1]) : 0;
    const withoutPrefix = normalized
      .replace(/^(?:سلفة|سلفه|سلف)\s*/, '')
      .replace(/\d+(?:\.\d+)?\s*(?:جنيه|ج\.م)?\s*/, '')
      .replace(/^(?:على|لـ|ل)\s*/, '')
      .trim();
    const workerNameHint = withoutPrefix;

    return {
      kind: 'advance',
      amount,
      workerNameHint,
      reason: 'سلفة نقدية سريعة',
      summary: `سلفة نقدية بقيمة ${amount} ج.م${workerNameHint ? ' للعامل: ' + workerNameHint : ''}`,
    };
  }

  // 4. Check for Expense ("مصروف مواصلات 150" / "مصروف أكل 300")
  if (
    normalized.startsWith('مصروف') ||
    normalized.startsWith('مصاريف') ||
    normalized.includes('مواصلات') ||
    normalized.includes('فطار') ||
    normalized.includes('غداء')
  ) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    const amount = numMatch ? Number(numMatch[1]) : 0;
    let expenseCategory: 'مواصلات' | 'أكل' | 'أدوات' | 'صيانة' | 'أخرى' = 'مواصلات';
    if (normalized.includes('أكل') || normalized.includes('اكل') || normalized.includes('فطار') || normalized.includes('غداء') || normalized.includes('شاي')) {
      expenseCategory = 'أكل';
    } else if (normalized.includes('أدوات') || normalized.includes('ادوات') || normalized.includes('خامات') || normalized.includes('أسطوان')) {
      expenseCategory = 'أدوات';
    } else if (normalized.includes('صيانة') || normalized.includes('تصليح')) {
      expenseCategory = 'صيانة';
    }

    return {
      kind: 'expense',
      amount,
      expenseCategory,
      reason: rawInput.trim(),
      summary: `مصروف خارجي (${expenseCategory}) بقيمة ${amount} ج.م`,
    };
  }

  // 5. Check for Adding a new worker ("إضافة نحات إبراهيم 550")
  if (normalized.startsWith('إضافة') || normalized.startsWith('اضافة') || normalized.startsWith('عامل جديد') || normalized.startsWith('نحات جديد')) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    const amount = numMatch ? Number(numMatch[1]) : 500;
    const isSculptor = normalized.includes('نحات') || normalized.includes('نحّات');
    const cleanName = normalized
      .replace(/^(إضافة|اضافة|عامل جديد|نحات جديد|نحّات|نحات|عامل|صنايعي|يومية)/g, '')
      .replace(/\d+/g, '')
      .trim();

    return {
      kind: 'worker',
      workerNameHint: cleanName || 'عامل جديد',
      workerRole: isSculptor ? 'نحات' : 'عامل',
      amount,
      summary: `إضافة ${isSculptor ? 'نحّات' : 'عامل'} جديد "${cleanName || 'جديد'}" بيومية ${amount} ج.م`,
    };
  }

  return {
    kind: 'unknown',
    summary: 'جرّب مثلاً: "خصم نص يوم على أحمد" أو "سلفة 500 لعلي" أو "مصروف مواصلات 200"',
  };
}
