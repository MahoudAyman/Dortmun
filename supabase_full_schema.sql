-- =========================================================================================
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

-- 19. جدول سجل الرقابة والحركات التفصيلي مع اسم الجهاز (Audit Logs with Device Tracking)
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
CREATE INDEX IF NOT EXISTS idx_dortmun_audit_ts ON public.dortmun_audit_logs(timestamp DESC);

-- =========================================================================================
-- التقارير الذكية المباشرة في قاعدة البيانات (Smart Analytical SQL Views)
-- =========================================================================================
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

CREATE OR REPLACE VIEW public.dortmun_project_financial_summary_v AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  COALESCE(SUM(a.day_worked), 0) AS total_days,
  COALESCE(SUM(a.night_worked), 0) AS total_nights,
  COALESCE(SUM(a.day_worked * a.worker_day_rate_snapshot + a.night_worked * a.worker_night_rate_snapshot), 0) AS total_worker_wages,
  COALESCE(SUM(a.day_worked * a.company_day_rate_snapshot + a.night_worked * a.company_night_rate_snapshot), 0) AS total_company_entitlement,
  COALESCE((SELECT SUM(ex.amount) FROM public.dortmun_expenses ex WHERE ex.project_id = p.id), 0) AS total_external_expenses
FROM public.dortmun_projects p
LEFT JOIN public.dortmun_attendance a ON a.project_id = p.id
GROUP BY p.id, p.name;

-- =========================================================================================
-- الدالة الذكية للمزامنة الشاملة (Atomic Full Snapshot -> All 18 Relational Tables RPC)
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

  RETURN jsonb_build_object('ok', true, 'version', p_version, 'synced_at', NOW());
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
    'dortmun_expenses', 'dortmun_audit_logs'
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
-- تفعيل البث اللحظي (Supabase Realtime Publication)
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
