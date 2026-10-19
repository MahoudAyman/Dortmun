export type WorkerRole =
  | 'نحات'
  | 'نجار'
  | 'عامل'
  | 'مشرف'
  | 'نقاش'
  | 'حداد'
  | 'بناء'
  | 'كهربائي'
  | 'سباك'
  | 'مبلط'
  | 'أخرى';

export interface Worker {
  id?: number;
  name: string;
  role: string;
  workerDayRate: number;
  workerNightRate: number;
  phone: string;
  active: boolean;
  notes: string;
}

export interface Project {
  id?: number;
  name: string;
  companyDayRate: number;
  companyNightRate: number;
  active: boolean;
  notes: string;
}

export interface Attendance {
  id?: number;
  date: string; // YYYY-MM-DD
  workerId: number;
  projectId: number;
  dayWorked: 0 | 1;
  nightWorked: 0 | 1;
  workerDayRateSnapshot: number;
  workerNightRateSnapshot: number;
  companyDayRateSnapshot: number;
  companyNightRateSnapshot: number;
  note: string;
}

export interface Advance {
  id?: number;
  date: string; // YYYY-MM-DD
  workerId: number;
  amount: number;
  reason: string;
  settlementId: number | null;
  notes: string;
}

export type DeductionMode = 'day' | 'half_day' | 'quarter_day' | 'money';

export interface Deduction {
  id?: number;
  date: string; // YYYY-MM-DD
  workerId: number;
  projectId: number | null;
  mode: DeductionMode;
  daysDeducted: number; // 1, 0.5, 0.25, or 0 for pure money
  amount: number; // EGP value
  reason: string;
  notes: string;
  settlementId: number | null;
}

export interface DailyHeadcount {
  id?: number;
  date: string; // YYYY-MM-DD
  projectId: number | null;
  expectedDayCount: number; // إجمالي العدد اليومي الإجباري (عمالة + نحاتية)
  sculptorsCount: number; // عدد النحاتية
  workersCount: number; // عدد العمال والصنايعية
  expectedNightCount: number; // إجمالي عدد السهرة الإجباري
  supervisorName: string;
  notes: string;
}

export interface Settlement {
  id?: number;
  workerId: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  days: number;
  nights: number;
  grossWages: number;
  advancesDeducted: number;
  deductionsDeducted?: number;
  netPaid: number;
  date: string; // YYYY-MM-DD
  notes: string;
}

export interface Extract {
  id?: number;
  projectId: number;
  number: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  claimedAmount?: number;
  deductions?: number;
  paidAmount?: number;
  notes: string;
}

export type CollectionMethod = 'نقدي' | 'تحويل' | 'شيك';
export type ExtractLineStatus = 'لم يُحصّل' | 'جزئي' | 'محصّل بالكامل';

export interface ExtractLine {
  id?: number;
  extractId: number;
  workerId: number;
  calculated: number;
  claimed: number;
  taxRate: number;
  taxAmount: number;
  collected: number;
  collectedDate: string;
  method: CollectionMethod;
  checkId: number | null;
  status?: ExtractLineStatus;
  isSaved?: boolean;
  notes: string;
}

export type ExtraType = 'يوم إضافي' | 'نص إضافي' | '10 أيام' | 'مخصص';
export type ExtraPerformedBy = 'self' | 'workers';
export type ExtraValueMode = 'money' | 'days' | 'note';

export interface ExtraItem {
  id?: number;
  date: string; // YYYY-MM-DD
  projectId: number;
  type: ExtraType;
  authorizedBy: string;
  performedBy: ExtraPerformedBy;
  workersCount: number;
  valueMode: ExtraValueMode;
  amount: number;
  days: number;
  notes: string;
}

export interface ExtraCash {
  id?: number;
  extraId: number;
  workerId: number;
  amount: number;
  days: number;
  paidCash: number;
  notes: string;
}

export type CheckDirection = 'وارد' | 'صادر';
export type CheckStatus = 'معلق' | 'اتصرف' | 'مرتجع';

export interface CheckItem {
  id?: number;
  direction: CheckDirection;
  number: string;
  bank: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: CheckStatus;
  projectId: number | null;
  extractId: number | null;
  notes: string;
}

export type ExpenseCategory = 'مواصلات' | 'أكل' | 'أدوات' | 'صيانة' | 'أخرى';

export interface Expense {
  id?: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  projectId: number | null;
  note: string;
}

export type PaymentSourceType = 'شركة' | 'شخص' | 'شيك' | 'مستخلص' | 'أخرى';
export type PaymentMethodType =
  | 'نقدي'
  | 'تحويل بنكي'
  | 'إنستا باي / محفظة'
  | 'محفظة إلكترونية'
  | 'شيك';

export interface IncomingPayment {
  id?: number;
  date: string; // YYYY-MM-DD
  sourceType: PaymentSourceType;
  sourceName: string; // اسم الشخص أو الشركة أو رقم الشيك
  senderName?: string;
  checkNumber?: string;
  method: PaymentMethodType;
  amount: number;
  projectId: number | null; // راح لحساب مشروع إيه
  checkId?: number | null;
  extractId?: number | null;
  notes: string;
}

export interface TaxRateItem {
  name: string;
  rate: number; // percentage e.g. 5 for 5%
}

export type CapMode = 'block' | 'confirm';
export type NumeralMode = 'ar' | 'en';

export interface AppSettings {
  id?: number;
  companyName: string;
  monthlyDayCap: number;
  expectedMonthlyDays: number;
  capMode: CapMode;
  paydayDayOfMonth: number; // افتراضي 15 (قبض يوم 15)
  mandatoryDailyHeadcount: boolean; // إلزامية تسجيل العدد اليومي
  defaultWorkerDayRate: number;
  defaultWorkerNightRate: number;
  defaultCompanyDayRate: number;
  defaultCompanyNightRate: number;
  defaultProjectId: number | null;
  pinHash: string | null;
  lastBackupDate: string | null;
  backupReminderDays: number;
  numeralMode: NumeralMode;
  darkMode: boolean;
  localOnlyMode?: boolean; // true = وضع محلي فقط بدون خادم, false = متصل بالخادم 100%
  lockedMonths: string[]; // ['YYYY-MM']
  taxRates: TaxRateItem[];
  engineers: string[];
  supervisors: string[];
  notes: string;
}

export interface AuditLogEntry {
  id?: number;
  timestamp: string;
  action: string;
  entity: string;
  details: string;
  deviceId?: string;
  deviceName?: string;
}

export interface UndoOperation {
  description: string;
  table: string;
  type: 'add' | 'update' | 'delete' | 'batch-add';
  recordId?: number;
  recordIds?: number[];
  previousData?: unknown;
  newData?: unknown;
}

export interface RegisteredDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browserOs: string;
  firstLoginAt: string;
  lastActiveAt: string;
  lastAction: string;
  operationsCount: number;
  isOnline?: boolean;
  syncMode: 'cloud' | 'local';
}

export interface CloudSyncSnapshot {
  version: number;
  updatedAt: string;
  updatedByDeviceId: string;
  updatedByDeviceName: string;
  lastOperation: string;
  workers: Worker[];
  projects: Project[];
  attendances: Attendance[];
  advances: Advance[];
  deductions: Deduction[];
  dailyHeadcounts: DailyHeadcount[];
  settlements: Settlement[];
  extracts: Extract[];
  extractLines: ExtractLine[];
  extras: ExtraItem[];
  extraCashes: ExtraCash[];
  checks: CheckItem[];
  expenses: Expense[];
  incomingPayments?: IncomingPayment[];
  settings: AppSettings;
  auditLogs: AuditLogEntry[];
  devices: RegisteredDevice[];
}

export interface CloudBackupSummary {
  id: number;
  backupTitle: string;
  createdAt: string;
  createdByDeviceId: string;
  createdByDeviceName: string;
  version: number;
  workersCount: number;
  attendanceCount: number;
}

export interface SupabaseTableDiagnostic {
  name: string;
  label: string;
  ready: boolean;
  rowCount: number;
}

