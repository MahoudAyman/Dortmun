import type {
  Advance,
  AppSettings,
  Attendance,
  AuditLogEntry,
  CheckItem,
  DailyHeadcount,
  Deduction,
  Expense,
  ExtraCash,
  ExtraItem,
  Extract,
  ExtractLine,
  IncomingPayment,
  Project,
  Settlement,
  Worker,
} from './models';

export const INITIAL_SETTINGS: AppSettings = {
  id: 1,
  companyName: 'شركة دورتمون للمقاولات',
  monthlyDayCap: 30,
  expectedMonthlyDays: 26,
  capMode: 'confirm',
  paydayDayOfMonth: 15,
  mandatoryDailyHeadcount: true,
  defaultWorkerDayRate: 400,
  defaultWorkerNightRate: 200,
  defaultCompanyDayRate: 550,
  defaultCompanyNightRate: 275,
  defaultProjectId: null,
  pinHash: null,
  lastBackupDate: null,
  backupReminderDays: 7,
  numeralMode: 'ar',
  darkMode: false,
  lockedMonths: [],
  taxRates: [
    { name: 'بدون ضريبة (0%)', rate: 0 },
    { name: 'ضريبة منبع مقاولات (1%)', rate: 1 },
    { name: 'تأمينات ومصاريف إدارية (3%)', rate: 3 },
    { name: 'ضريبة مقاولات شاملة (5%)', rate: 5 },
    { name: 'ضريبة قيمة مضافة (14%)', rate: 14 },
  ],
  engineers: [],
  supervisors: [],
  notes: 'نظام شركة دورتمون الذكي — جاهز لتسجيل بياناتك الحقيقية من الصفر',
};

// تصفير جميع الجداول والأرقام تماماً ليبدأ المستخدم بتسجيل بياناته الحقيقية من الصفر
export const INITIAL_PROJECTS: Project[] = [];
export const INITIAL_WORKERS: Worker[] = [];
export const INITIAL_ATTENDANCES: Attendance[] = [];
export const INITIAL_ADVANCES: Advance[] = [];
export const INITIAL_DEDUCTIONS: Deduction[] = [];
export const INITIAL_DAILY_HEADCOUNTS: DailyHeadcount[] = [];
export const INITIAL_SETTLEMENTS: Settlement[] = [];
export const INITIAL_EXTRACTS: Extract[] = [];
export const INITIAL_EXTRACT_LINES: ExtractLine[] = [];
export const INITIAL_EXTRAS: ExtraItem[] = [];
export const INITIAL_EXTRA_CASH: ExtraCash[] = [];
export const INITIAL_CHECKS: CheckItem[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_INCOMING_PAYMENTS: IncomingPayment[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
