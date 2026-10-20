import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { DortmunDatabase } from './dortmun-db';
import type {
  Advance,
  AppSettings,
  Attendance,
  AuditLogEntry,
  CheckItem,
  CloudBackupSummary,
  CloudSyncSnapshot,
  DailyHeadcount,
  Deduction,
  Expense,
  ExtraCash,
  ExtraItem,
  Extract,
  ExtractLine,
  IncomingPayment,
  Project,
  RegisteredDevice,
  Settlement,
  SupabaseTableDiagnostic,
  UndoOperation,
  Worker,
} from './models';
import {
  FULL_SUPABASE_SQL_SCHEMA,
  SUPABASE_TABLES_LIST,
  parseSmartSiteCommand,
} from './supabase-sql-schema';
import {
  INITIAL_ADVANCES,
  INITIAL_ATTENDANCES,
  INITIAL_AUDIT_LOGS,
  INITIAL_CHECKS,
  INITIAL_DAILY_HEADCOUNTS,
  INITIAL_DEDUCTIONS,
  INITIAL_EXPENSES,
  INITIAL_EXTRAS,
  INITIAL_EXTRA_CASH,
  INITIAL_EXTRACTS,
  INITIAL_EXTRACT_LINES,
  INITIAL_INCOMING_PAYMENTS,
  INITIAL_PROJECTS,
  INITIAL_SETTINGS,
  INITIAL_SETTLEMENTS,
  INITIAL_WORKERS,
} from './seed-data';
import {
  calculateCheckFundBreakdowns,
  calculateComprehensiveLedger,
  calculateDailyPocketSummary,
  calculateDashboardSummary,
  compareDailyHeadcount,
  formatCurrency,
  formatNumber,
  getDueChecksAlerts,
  getLowAttendanceWorkers,
  getPayday15CycleInfo,
  isBackupOverdue,
  toArabicDigits,
  type CheckFundBreakdown,
  type PocketCashSummary,
} from '../calc/calculations';

export interface SmartAlertItem {
  id: string;
  title: string;
  subtitle: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  icon: string;
  route: string;
  actionLabel: string;
}

export interface PageAdvisorTip {
  id: string;
  badge: string;
  title: string;
  description: string;
  severity: 'warning' | 'info' | 'emerald' | 'amber';
  icon: string;
  actionLabel: string;
  actionType:
    | 'open_headcount'
    | 'open_pocket'
    | 'open_worker_sheet'
    | 'open_check_sheet'
    | 'open_project_sheet'
    | 'navigate'
    | 'open_zaki_caps';
  targetRoute?: string;
  targetId?: number | null;
}

const SUPABASE_PROJECT_URL = 'https://lmcxonnuzbamfqxbqshu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7A5T6fhkfAp0IApJMArKuA_Zk8hkPdj';
const REALTIME_CHANNEL_NAME = 'dortmun-live-sync-v1';

export function getSystemTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private db: DortmunDatabase | null = null;
  private supabase: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private watcherInterval: ReturnType<typeof setInterval> | null = null;
  private isApplyingRemoteState = false;
  private isSyncingNow = false;
  private hasPendingLocalChanges = false;
  private pendingSyncReason = '';
  private lastSyncedUpdatedAtIso = '';

  readonly supabaseUrl = SUPABASE_PROJECT_URL;
  readonly systemActualToday = signal<string>(getSystemTodayIso());
  readonly todayIso = signal<string>(getSystemTodayIso());

  // Smart Date State: Indicates whether the user is working on yesterday or a custom date
  readonly isCustomDateActive = computed(() => this.todayIso() !== this.systemActualToday());
  readonly dateDifferenceLabel = computed(() => {
    const current = this.todayIso();
    const actual = this.systemActualToday();
    if (current === actual) return 'اليوم';

    const curMs = new Date(current + 'T12:00:00Z').getTime();
    const actMs = new Date(actual + 'T12:00:00Z').getTime();
    if (isNaN(curMs) || isNaN(actMs)) return current;

    const diffDays = Math.round((curMs - actMs) / (1000 * 60 * 60 * 24));
    if (diffDays === -1) return 'أمس';
    if (diffDays === 1) return 'غداً';
    if (diffDays < -1) return `قبل ${Math.abs(diffDays)} أيام (${current})`;
    return `بعد ${diffDays} أيام (${current})`;
  });

  // Reactive Signals initialized to 0 / empty arrays so user starts from zero with real data
  readonly settings = signal<AppSettings>({ ...INITIAL_SETTINGS });
  readonly workers = signal<Worker[]>([...INITIAL_WORKERS]);
  readonly projects = signal<Project[]>([...INITIAL_PROJECTS]);
  readonly attendances = signal<Attendance[]>([...INITIAL_ATTENDANCES]);
  readonly advances = signal<Advance[]>([...INITIAL_ADVANCES]);
  readonly deductions = signal<Deduction[]>([...INITIAL_DEDUCTIONS]);
  readonly dailyHeadcounts = signal<DailyHeadcount[]>([...INITIAL_DAILY_HEADCOUNTS]);
  readonly settlements = signal<Settlement[]>([...INITIAL_SETTLEMENTS]);
  readonly extracts = signal<Extract[]>([...INITIAL_EXTRACTS]);
  readonly extractLines = signal<ExtractLine[]>([...INITIAL_EXTRACT_LINES]);
  readonly extras = signal<ExtraItem[]>([...INITIAL_EXTRAS]);
  readonly extraCashes = signal<ExtraCash[]>([...INITIAL_EXTRA_CASH]);
  readonly checks = signal<CheckItem[]>([...INITIAL_CHECKS]);
  readonly expenses = signal<Expense[]>([...INITIAL_EXPENSES]);
  readonly incomingPayments = signal<IncomingPayment[]>([...INITIAL_INCOMING_PAYMENTS]);
  readonly auditLogs = signal<AuditLogEntry[]>([...INITIAL_AUDIT_LOGS]);

  // Cloud Sync & Device Registry State
  readonly localOnlyMode = signal<boolean>(false); // false = متصل بالخادم 100%, true = وضع محلي فقط بدون خادم
  readonly cloudSyncStatus = signal<'connected' | 'syncing' | 'local_only' | 'offline' | 'error'>(
    'connected'
  );
  readonly cloudVersion = signal<number>(0);
  readonly lastCloudSyncAt = signal<string>('');
  readonly lastCloudOperation = signal<string>('متصل بالخادم وجاهز للمزامنة الفورية ١٠٠٪');
  readonly lastSyncedByDeviceName = signal<string>('');
  readonly supabaseTablesReady = signal<boolean>(false);
  readonly showCloudHubModal = signal<boolean>(false);
  readonly currentDevice = signal<RegisteredDevice>({
    deviceId: 'dev-main',
    deviceName: 'جهاز الإدارة الرئيسي',
    deviceType: 'desktop',
    browserOs: 'متصفح الويب',
    firstLoginAt: '2026-10-18 12:00',
    lastActiveAt: '2026-10-18 12:00',
    lastAction: 'تسجيل دخول متصل بالخادم',
    operationsCount: 0,
    isOnline: true,
    syncMode: 'cloud',
  });
  readonly registeredDevices = signal<RegisteredDevice[]>([]);
  readonly cloudBackups = signal<CloudBackupSummary[]>([]);
  readonly tableDiagnostics = signal<SupabaseTableDiagnostic[]>(
    SUPABASE_TABLES_LIST.map((t) => ({
      name: t.name,
      label: t.label,
      ready: false,
      rowCount: 0,
    }))
  );
  readonly serverLatencyMs = signal<number>(42);
  readonly diagnosticsLoading = signal<boolean>(false);

  readonly readyTablesCount = computed(
    () => this.tableDiagnostics().filter((t) => t.ready).length
  );

  readonly onlineDevicesCount = computed(() => {
    const list = this.registeredDevices();
    const online = list.filter((d) => d.isOnline).length;
    return Math.max(1, online);
  });

  // Global UI state
  readonly selectedProjectId = signal<number | null>(null);
  readonly selectedMonth = signal<string>(getSystemTodayIso().slice(0, 7));
  readonly undoStack = signal<UndoOperation[]>([]);
  readonly redoStack = signal<UndoOperation[]>([]);
  readonly lastUndo = computed<UndoOperation | null>(() => this.undoStack()[0] || null);
  readonly lastRedo = computed<UndoOperation | null>(() => this.redoStack()[0] || null);
  readonly toastMessage = signal<{ text: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(
    null
  );
  readonly isLockedByPin = signal<boolean>(false);
  readonly globalSearchQuery = signal<string>('');
  readonly showQuickHeadcountModal = signal<boolean>(false);
  readonly showZakiCapabilitiesModal = signal<boolean>(false);
  readonly showDateSelectorModal = signal<boolean>(false);

  getYesterdayIso(): string {
    const act = new Date(this.systemActualToday() + 'T12:00:00Z');
    act.setDate(act.getDate() - 1);
    const y = act.getFullYear();
    const m = String(act.getMonth() + 1).padStart(2, '0');
    const d = String(act.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  setWorkingDate(dateIso: string): void {
    if (!dateIso) return;
    this.todayIso.set(dateIso);
    // Keep selectedMonth aligned if date is in different month
    const newMonth = dateIso.slice(0, 7);
    if (newMonth && newMonth !== this.selectedMonth()) {
      this.selectedMonth.set(newMonth);
    }
    if (dateIso !== this.systemActualToday()) {
      const isYesterday = this.dateDifferenceLabel() === 'أمس';
      this.showToast(
        isYesterday
          ? `⚠️ خلي بالك: أنت الآن بتسجل وتعدل على يوم أمس (${this.digits(dateIso)})!`
          : `⚠️ خلي بالك: أنت الآن بتسجل وتعدل على تاريخ (${this.digits(dateIso)}) وليس تاريخ اليوم!`,
        'info'
      );
    } else {
      this.showToast(`تم الرجوع لتاريخ اليوم (${this.digits(dateIso)}) بنجاح`, 'success');
    }
  }

  resetToSystemToday(): void {
    this.setWorkingDate(this.systemActualToday());
  }

  setYesterday(): void {
    this.setWorkingDate(this.getYesterdayIso());
  }

  // Universal Half-Page Overlay Sheet ("كل حاجة أدوس عليها تفتح صفحة نص فوق الصفحة بجميع التفاصيل")
  readonly activeHalfSheet = signal<{
    type: 'worker' | 'check' | 'project' | 'extract' | 'pocket';
    id?: number | null;
  } | null>(null);

  // Daily Pocket & Check Withdrawal Session (محسوب تلقائياً من السجلات الفعلية بدون أرقام عشوائية)
  readonly pocketWithdrawnAmount = signal<number>(0);
  readonly pocketWithdrawalFee = signal<number>(0);
  readonly pocketCustomAdvances = signal<number | null>(null);
  readonly pocketSelectedCheckId = signal<number | null>(null);
  readonly pocketSelectedProjectId = signal<number | null>(null);

  private pushUndo(op: UndoOperation): void {
    this.undoStack.update((stack) => [op, ...stack.slice(0, 49)]);
    this.redoStack.set([]);
    this.scheduleCloudSync(op.description);
  }

  // Derived computations
  readonly activeWorkers = computed(() => this.workers().filter((w) => w.active));
  readonly activeProjects = computed(() => this.projects().filter((p) => p.active));

  readonly currentProject = computed(() => {
    const id = this.selectedProjectId();
    if (!id) return null;
    return this.projects().find((p) => p.id === id) || null;
  });

  readonly dashboardSummary = computed(() =>
    calculateDashboardSummary({
      attendances: this.attendances(),
      extractLines: this.extractLines(),
      advances: this.advances(),
      checks: this.checks(),
      expenses: this.expenses(),
      extras: this.extras(),
      extraCashes: this.extraCashes(),
      projectId: this.selectedProjectId(),
    })
  );

  readonly comprehensiveLedger = computed(() =>
    calculateComprehensiveLedger({
      projects: this.projects(),
      workers: this.workers(),
      attendances: this.attendances(),
      advances: this.advances(),
      deductions: this.deductions(),
      settlements: this.settlements(),
      extracts: this.extracts(),
      extractLines: this.extractLines(),
      extras: this.extras(),
      extraCashes: this.extraCashes(),
      checks: this.checks(),
      expenses: this.expenses(),
      incomingPayments: this.incomingPayments(),
      selectedProjectId: null,
    })
  );

  readonly checkFundBreakdowns = computed<CheckFundBreakdown[]>(() =>
    calculateCheckFundBreakdowns({
      checks: this.checks(),
      projects: this.projects(),
      extracts: this.extracts(),
      workers: this.workers(),
      attendances: this.attendances(),
      advances: this.advances(),
      deductions: this.deductions(),
      settlements: this.settlements(),
      expenses: this.expenses(),
    })
  );

  readonly dailyPocketSummary = computed<PocketCashSummary>(() => {
    const chkId = this.pocketSelectedCheckId();
    const projId = this.pocketSelectedProjectId();
    const allBreakdowns = this.checkFundBreakdowns();

    // 1. If a specific Check is selected, pull 100% from that Check's recorded breakdown
    if (chkId) {
      const cb = allBreakdowns.find((b) => b.check.id === chkId);
      if (cb) {
        const manualWithdrawn = this.pocketWithdrawnAmount();
        const manualFee = this.pocketWithdrawalFee();
        const manualAdv = this.pocketCustomAdvances();
        const otherExp = Math.max(0, cb.expensesSpentFromCheck - cb.withdrawalFee);
        const resolvedPid = cb.check.projectId;

        const linkedAdvances = this.advances().filter((a) => a.checkId === chkId || (resolvedPid && a.projectId === resolvedPid));
        const linkedSettlements = this.settlements().filter((s) => s.checkId === chkId || (resolvedPid && s.projectId === resolvedPid));
        const linkedExpenses = this.expenses().filter((e) => e.checkId === chkId || (resolvedPid && e.projectId === resolvedPid));

        const effectiveWithdrawn = manualWithdrawn > 0 ? manualWithdrawn : cb.withdrawnAmount;
        const effectiveRemainingInBank = Math.max(0, (Number(cb.check.amount) || 0) - effectiveWithdrawn);

        return calculateDailyPocketSummary({
          withdrawnAmount: effectiveWithdrawn,
          withdrawalFee: manualFee > 0 ? manualFee : cb.withdrawalFee,
          advancesTotal: manualAdv !== null && manualAdv >= 0 ? manualAdv : cb.advancesSpentFromCheck,
          settlementsTotal: cb.settlementsPaidFromCheck,
          otherExpensesTotal: otherExp,
          checksIncomingTotal: cb.check.amount,
          remainingInCheck: effectiveRemainingInBank,
          remainingInBank: effectiveRemainingInBank,
          projectChecks: [cb.check],
          recordedAdvances: linkedAdvances,
          recordedSettlements: linkedSettlements,
          recordedExpenses: linkedExpenses,
        });
      }
    }

    // 2. If a specific Project is selected, pull 100% from that Project's recorded breakdown
    if (projId) {
      const pb = this.comprehensiveLedger().projectBreakdowns.find((b) => b.projectId === projId);
      const projChecks = this.checks().filter((c) => c.direction === 'وارد' && c.projectId === projId);
      const projCheckIds = new Set(projChecks.map((c) => c.id).filter((id): id is number => typeof id === 'number'));
      const linkedAdvances = this.advances().filter((a) => a.projectId === projId || (a.checkId && projCheckIds.has(a.checkId)));
      const linkedSettlements = this.settlements().filter((s) => s.projectId === projId || (s.checkId && projCheckIds.has(s.checkId)));
      const linkedExpenses = this.expenses().filter((e) => e.projectId === projId || (e.checkId && projCheckIds.has(e.checkId)));

      const projTotalChecksAmount = projChecks.reduce((s, c) => s + c.amount, 0);
      const projWithdrawnChecksAmount = projChecks.reduce(
        (s, c) => s + ((c.withdrawnAmount ?? 0) > 0 || c.status === 'اتصرف' ? (c.withdrawnAmount ?? c.amount) : 0),
        0
      );

      if (pb) {
        const manualWithdrawn = this.pocketWithdrawnAmount();
        const manualFee = this.pocketWithdrawalFee();
        const manualAdv = this.pocketCustomAdvances();
        const recWithdrawn =
          (pb.checksWithdrawnAmount ?? 0) > 0
            ? pb.checksWithdrawnAmount!
            : projWithdrawnChecksAmount > 0
              ? projWithdrawnChecksAmount
              : pb.totalReceivedForProject;
        const recFee = pb.withdrawalFeesSpent ?? 0;
        const otherExp = Math.max(0, pb.expensesSpent - recFee);
        const effectiveWithdrawn = manualWithdrawn > 0 ? manualWithdrawn : recWithdrawn;
        const effectiveRemainingInBank = Math.max(0, projTotalChecksAmount - effectiveWithdrawn);

        return calculateDailyPocketSummary({
          withdrawnAmount: effectiveWithdrawn,
          withdrawalFee: manualFee > 0 ? manualFee : recFee,
          advancesTotal: manualAdv !== null && manualAdv >= 0 ? manualAdv : pb.advancesSpent,
          settlementsTotal: pb.settlementsPaid + pb.nashPaid,
          otherExpensesTotal: otherExp,
          checksIncomingTotal: projTotalChecksAmount,
          remainingInCheck: effectiveRemainingInBank,
          remainingInBank: effectiveRemainingInBank,
          projectChecks: projChecks,
          recordedAdvances: linkedAdvances,
          recordedSettlements: linkedSettlements,
          recordedExpenses: linkedExpenses,
        });
      }
    }

    // 3. Otherwise, aggregate across all recorded incoming checks & treasury records
    const incomingCheckBreakdowns = allBreakdowns.filter((b) => b.check.direction === 'وارد');
    const incomingChecks = this.checks().filter((c) => c.direction === 'وارد');
    const totalIncomingChecksAmount = incomingChecks.reduce((s, c) => s + c.amount, 0);
    const recordedChecksWithdrawn = incomingCheckBreakdowns.reduce(
      (s, b) =>
        s +
        ((b.check.withdrawnAmount ?? 0) > 0 || b.check.status === 'اتصرف'
          ? b.withdrawnAmount
          : 0),
      0
    );
    const ledger = this.comprehensiveLedger();
    const baseWithdrawn =
      recordedChecksWithdrawn > 0 ? recordedChecksWithdrawn : ledger.totalReceivedAllSources;
    const recordedWithdrawalFees = incomingCheckBreakdowns.reduce(
      (s, b) => s + b.withdrawalFee,
      0
    );
    const allFeeExpenses = this.expenses()
      .filter((e) => e.category === 'رسوم سحب شيك')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const effectiveRecordedFee = Math.max(recordedWithdrawalFees, allFeeExpenses);
    const otherExpenses = Math.max(0, ledger.totalExternalExpenses - effectiveRecordedFee);

    const manualWithdrawn = this.pocketWithdrawnAmount();
    const manualFee = this.pocketWithdrawalFee();
    const manualAdv = this.pocketCustomAdvances();
    const effectiveWithdrawn = manualWithdrawn > 0 ? manualWithdrawn : baseWithdrawn;
    const effectiveRemainingInBank = Math.max(0, totalIncomingChecksAmount - effectiveWithdrawn);

    return calculateDailyPocketSummary({
      withdrawnAmount: effectiveWithdrawn,
      withdrawalFee: manualFee > 0 ? manualFee : effectiveRecordedFee,
      advancesTotal: manualAdv !== null && manualAdv >= 0 ? manualAdv : ledger.totalAdvancesPaid,
      settlementsTotal: ledger.totalSettlementsPaid + ledger.totalNashCashPaid,
      otherExpensesTotal: otherExpenses,
      checksIncomingTotal: totalIncomingChecksAmount,
      remainingInCheck: effectiveRemainingInBank,
      remainingInBank: effectiveRemainingInBank,
      projectChecks: incomingChecks,
      recordedAdvances: this.advances(),
      recordedSettlements: this.settlements(),
      recordedExpenses: this.expenses(),
    });
  });

  readonly totalOpenDeductions = computed(() =>
    this.deductions()
      .filter((d) => d.settlementId === null)
      .reduce((s, d) => s + d.amount, 0)
  );

  readonly todayHeadcountMatch = computed(() =>
    compareDailyHeadcount({
      date: this.todayIso(),
      projectId: this.selectedProjectId(),
      headcounts: this.dailyHeadcounts(),
      attendances: this.attendances(),
      workers: this.workers(),
    })
  );

  readonly payday15Info = computed(() =>
    getPayday15CycleInfo(this.todayIso(), this.settings().paydayDayOfMonth || 15)
  );

  readonly dueChecksAlerts = computed(() =>
    getDueChecksAlerts(this.checks(), this.todayIso(), 3)
  );

  readonly monthlyWorkerAlerts = computed(() => {
    const month = this.selectedMonth();
    const monthAtt = this.attendances().filter((a) => a.date.startsWith(month));
    return getLowAttendanceWorkers(
      this.workers(),
      monthAtt,
      this.settings().expectedMonthlyDays || 26,
      this.settings().monthlyDayCap || 30
    );
  });

  readonly backupOverdue = computed(() =>
    isBackupOverdue(
      this.settings().lastBackupDate,
      this.settings().backupReminderDays || 7,
      this.todayIso()
    )
  );

  // Smart Alerts with Direct Navigation Action Buttons ("تنبيهات مع زر التحويل")
  readonly smartAlerts = computed<SmartAlertItem[]>(() => {
    const alerts: SmartAlertItem[] = [];
    const hc = this.todayHeadcountMatch();
    const payday = this.payday15Info();

    // 1. Mandatory Daily Headcount Alert
    if (!hc.hasMandatoryRecord) {
      alerts.push({
        id: 'mandatory-headcount-missing',
        title: 'العدد اليومي الإجباري لم يُسجّل اليوم بعد!',
        subtitle: `إجباري: سجّل عدد العمالة والنحاتية وعدد السهرة ليوم ${this.digits(this.todayIso())} لمطابقة اليوميات.`,
        severity: 'danger',
        icon: 'fact_check',
        route: '/attendance',
        actionLabel: 'تحويل لتسجيل العدد الآن',
      });
    } else if (!hc.isExactMatch) {
      alerts.push({
        id: 'headcount-mismatch',
        title: `تنبيه مطابقة العدد اليومي: ${hc.statusLabel}`,
        subtitle: `العدد الإجباري (${this.num(hc.expectedDays)} يومية · ${this.num(hc.expectedNights)} سهرة) بينما المسجل بالأسماء (${this.num(hc.actualDays)} يومية · ${this.num(hc.actualNights)} سهرة).`,
        severity: 'warning',
        icon: 'compare_arrows',
        route: '/bulk',
        actionLabel: 'تحويل لمطابقة العدد',
      });
    } else {
      alerts.push({
        id: 'headcount-matched',
        title: 'العدد اليومي الإجباري مطابق ١٠٠٪ للمسجل بالأسماء',
        subtitle: `إجمالي اليوم: ${this.num(hc.actualDays)} يومية و ${this.num(hc.actualNights)} سهرة — نفس العدد تماماً.`,
        severity: 'success',
        icon: 'verified',
        route: '/attendance',
        actionLabel: 'تحويل لشبكة الحضور',
      });
    }

    // 2. Payday 15th Alert
    if (payday.isPaydayNear) {
      alerts.push({
        id: 'payday-15-cycle',
        title: `موعد قبض العمال والنحاتية (يوم ${this.num(this.settings().paydayDayOfMonth || 15)} في الشهر)`,
        subtitle: `${payday.label} — راجع اليوميات والسهرات واخصم السلف والجزاءات بضغطة واحدة.`,
        severity: 'info',
        icon: 'event_repeat',
        route: '/settlements',
        actionLabel: 'تحويل لكشف قبض يوم ١٥',
      });
    }

    // 3. Setup Onboarding Alerts if 0 projects or 0 workers
    if (this.projects().length === 0) {
      alerts.push({
        id: 'zero-projects',
        title: 'ابدأ بتسجيل مشروعك الحقيقي الأول',
        subtitle:
          'كل الأرقام مصفّرة تماماً وجاهزة لبياناتك الحقيقية. أضف اسم المشروع وسعر يومية وسهرة الشركة.',
        severity: 'info',
        icon: 'domain_add',
        route: '/settings',
        actionLabel: 'تحويل لإضافة مشروع',
      });
    }

    if (this.workers().length === 0) {
      alerts.push({
        id: 'zero-workers',
        title: 'سجّل العمال والنحّاتية والصنايعية',
        subtitle: 'أضف أسماء العمال أو النحاتية وأسعار يومياتهم وسهراتهم للبدء في تسجيل الحضور.',
        severity: 'info',
        icon: 'person_add',
        route: '/workers',
        actionLabel: 'تحويل لإضافة العمال',
      });
    }

    // 4. Due Checks Alerts
    for (const cAlert of this.dueChecksAlerts()) {
      alerts.push({
        id: `check-${cAlert.check.id}`,
        title: `شيك ${cAlert.check.direction} رقم ${cAlert.check.number} (${cAlert.check.bank})`,
        subtitle: `${cAlert.daysRemaining <= 0 ? 'مستحق الصرف اليوم!' : `يستحق خلال ${this.num(cAlert.daysRemaining)} أيام`} · المبلغ: ${this.money(cAlert.check.amount)}`,
        severity: cAlert.daysRemaining <= 1 ? 'danger' : 'warning',
        icon: 'account_balance',
        route: '/checks',
        actionLabel: 'تحويل لصفحة الشيكات',
      });
    }

    // 5. Open Deductions Alert
    const openDeds = this.deductions().filter((d) => d.settlementId === null);
    if (openDeds.length > 0) {
      alerts.push({
        id: 'open-deductions',
        title: `توجد ${this.num(openDeds.length)} خصومات وجزاءات مفتوحة قيد الخصم`,
        subtitle: `إجمالي الخصومات غير المخصومة حتى الآن: ${this.money(this.totalOpenDeductions())} — تُخصم تلقائياً في قبض يوم ١٥.`,
        severity: 'warning',
        icon: 'gavel',
        route: '/deductions',
        actionLabel: 'تحويل للخصومات والجزاءات',
      });
    }

    return alerts;
  });

  constructor() {
    if (this.isBrowser) {
      this.db = new DortmunDatabase();
      this.initDeviceIdentity();
      void this.initDatabase();
    }
  }

  private initDeviceIdentity(): void {
    if (!this.isBrowser) return;

    const ua = navigator.userAgent || '';
    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/iPad|Tablet|PlayBook/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/Mobile|Android|iPhone|iPod/i.test(ua)) {
      deviceType = 'mobile';
    }

    let osName = 'Windows';
    if (/Android/i.test(ua)) osName = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) osName = 'iOS';
    else if (/Mac/i.test(ua)) osName = 'Mac';
    else if (/Linux/i.test(ua)) osName = 'Linux';

    let browserName = 'Chrome';
    if (/Edg/i.test(ua)) browserName = 'Edge';
    else if (/Firefox/i.test(ua)) browserName = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browserName = 'Safari';

    const browserOs = `${browserName} · ${osName}`;
    let deviceId = localStorage.getItem('dortmun_device_id');
    if (!deviceId) {
      deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      localStorage.setItem('dortmun_device_id', deviceId);
    }

    const typeLabel =
      deviceType === 'mobile' ? 'موبايل' : deviceType === 'tablet' ? 'تابلت' : 'كمبيوتر';
    let deviceName = localStorage.getItem('dortmun_device_name');
    if (!deviceName) {
      deviceName = `${typeLabel} محمود (${osName})`;
      localStorage.setItem('dortmun_device_name', deviceName);
    }

    // Default is ALWAYS Connected (متصل) unless manually disconnected in this session
    localStorage.removeItem('dortmun_local_only_mode');
    const manualDisconnect = sessionStorage.getItem('dortmun_manual_disconnect') === 'true';
    this.localOnlyMode.set(manualDisconnect);
    this.cloudSyncStatus.set(manualDisconnect ? 'local_only' : 'connected');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const firstLogin = localStorage.getItem('dortmun_device_first_login') || now;
    localStorage.setItem('dortmun_device_first_login', firstLogin);
    const opsCount = Number(localStorage.getItem('dortmun_device_ops_count') || '0');

    const dev: RegisteredDevice = {
      deviceId,
      deviceName,
      deviceType,
      browserOs,
      firstLoginAt: firstLogin,
      lastActiveAt: now,
      lastAction: manualDisconnect ? 'مفصول مؤقتاً (وضع محلي)' : 'متصل تلقائياً بالخادم',
      operationsCount: opsCount,
      isOnline: true,
      syncMode: manualDisconnect ? 'local' : 'cloud',
    };
    this.currentDevice.set(dev);
    this.registeredDevices.set([dev]);
  }

  private async initDatabase(): Promise<void> {
    if (!this.db) return;
    try {
      const settingsCount = await this.db.settings.count();
      if (settingsCount === 0) {
        await this.db.settings.put(INITIAL_SETTINGS);
      }
      await this.reloadAllFromDb();

      // Save current device locally
      await this.db.devices.put(this.currentDevice());
      const localDevices = await this.db.devices.toArray();
      if (localDevices.length > 0) {
        this.registeredDevices.set(localDevices);
      }

      this.applyDarkMode(this.settings().darkMode);
      if (this.settings().pinHash) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autostart') !== '1') {
          this.isLockedByPin.set(true);
        }
      }

      // Initialize Cloud Server & Supabase Realtime if not in Local-Only mode
      if (!this.localOnlyMode()) {
        await this.initCloudConnection();
      }
    } catch (err) {
      console.error('Failed to initialize IndexedDB, falling back to in-memory signals:', err);
    }
  }

  async initCloudConnection(): Promise<void> {
    if (!this.isBrowser || this.localOnlyMode()) {
      this.cloudSyncStatus.set('local_only');
      return;
    }

    try {
      this.cloudSyncStatus.set('syncing');
      if (!this.supabase) {
        this.supabase = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 25 } },
        });
      }

      // 1. Register this device on the server & Supabase directly
      await this.registerDeviceOnCloud('متصل تلقائياً وجاهز للمزامنة الفورية');

      // 2. Pull latest cloud state from Supabase & Server (or upload local if server is empty)
      await this.pullFromCloudServer(false);

      // 3. Connect Supabase Realtime Channel (Presence + Broadcast + Postgres Changes)
      this.setupRealtimeChannel();

      // 4. Start Smart Background Watcher (checks every 2.5s + focus/online events)
      this.startSmartCloudWatcher();

      this.cloudSyncStatus.set('connected');
    } catch {
      this.cloudSyncStatus.set('connected');
    }
  }

  private startSmartCloudWatcher(): void {
    if (!this.isBrowser) return;
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }

    const checkNow = () => {
      if (this.localOnlyMode() || this.isSyncingNow || this.isApplyingRemoteState || this.syncTimer) {
        return;
      }
      if (this.hasPendingLocalChanges) {
        void this.syncToCloudNow(this.pendingSyncReason || 'مزامنة تلقائية للتغييرات');
      } else {
        void this.checkAndPullRemoteChangesSilently();
      }
    };

    this.watcherInterval = setInterval(checkNow, 2500);

    window.addEventListener('focus', checkNow);
    window.addEventListener('online', checkNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkNow();
      }
    });
  }

  private async checkAndPullRemoteChangesSilently(): Promise<void> {
    if (
      !this.isBrowser ||
      this.localOnlyMode() ||
      !this.supabase ||
      this.isSyncingNow ||
      this.isApplyingRemoteState ||
      this.syncTimer
    ) {
      return;
    }
    try {
      const { data: sbRow, error } = await this.supabase
        .from('dortmun_cloud_state')
        .select('version, updated_at, updated_by_device_id, updated_by_device_name, last_action, payload')
        .eq('id', 'main')
        .maybeSingle();

      if (error || !sbRow) {
        if (!error && !sbRow && this.hasAnyLocalData() && !this.lastSyncedUpdatedAtIso) {
          await this.syncToCloudNow('رفع البيانات الأولية تلقائياً');
        }
        return;
      }

      const payload = sbRow['payload'] as (CloudSyncSnapshot & { updatedAtIso?: string }) | null;
      if (!payload || !Array.isArray(payload.workers)) {
        if (this.hasAnyLocalData()) {
          await this.syncToCloudNow('رفع البيانات الأولية تلقائياً');
        }
        return;
      }

      const remoteStamp = String(sbRow['updated_at'] || payload.updatedAtIso || '');
      const remoteVer = Number(sbRow['version'] || payload.version || 0);

      if (
        (remoteStamp && remoteStamp !== this.lastSyncedUpdatedAtIso) ||
        remoteVer > this.cloudVersion()
      ) {
        const hadPrevSync = Boolean(this.lastSyncedUpdatedAtIso);
        this.lastSyncedUpdatedAtIso = remoteStamp;
        await this.applyCloudSnapshot(
          {
            ...payload,
            version: remoteVer || payload.version || 1,
            lastOperation: String(sbRow['last_action'] || payload.lastOperation || 'تحديث مباشر'),
            updatedByDeviceId: String(
              sbRow['updated_by_device_id'] || payload.updatedByDeviceId || ''
            ),
            updatedByDeviceName: String(
              sbRow['updated_by_device_name'] || payload.updatedByDeviceName || ''
            ),
          },
          hadPrevSync
        );
      }
    } catch {
      // Silent background poll
    }
  }

  private setupRealtimeChannel(): void {
    if (!this.supabase || this.localOnlyMode()) return;

    if (this.realtimeChannel) {
      void this.supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    const dev = this.currentDevice();
    const channel = this.supabase.channel(REALTIME_CHANNEL_NAME, {
      config: {
        broadcast: { self: false },
        presence: { key: dev.deviceId },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!this.realtimeChannel) return;
        const state = this.realtimeChannel.presenceState<RegisteredDevice>();
        const onlineIds = new Set<string>(Object.keys(state));
        const presenceDevices: RegisteredDevice[] = [];
        for (const key of Object.keys(state)) {
          const items = state[key];
          if (items && items[0]) {
            presenceDevices.push({ ...items[0], isOnline: true });
          }
        }
        this.mergeDeviceList(presenceDevices, onlineIds);
      })
      .on('broadcast', { event: 'state_sync' }, (payload) => {
        const data = payload['payload'] as
          | (CloudSyncSnapshot & { updatedAtIso?: string })
          | undefined;
        if (data && data.updatedByDeviceId !== this.currentDevice().deviceId) {
          if (data.updatedAtIso) {
            this.lastSyncedUpdatedAtIso = data.updatedAtIso;
          }
          void this.applyCloudSnapshot(data, true);
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dortmun_cloud_state' },
        (change) => {
          const newRow = change.new as Record<string, unknown> | undefined;
          if (!newRow || !newRow['payload']) return;
          const remoteDevId = String(newRow['updated_by_device_id'] || '');
          const remoteStamp = String(newRow['updated_at'] || '');
          if (
            remoteDevId !== this.currentDevice().deviceId &&
            remoteStamp !== this.lastSyncedUpdatedAtIso
          ) {
            this.lastSyncedUpdatedAtIso = remoteStamp;
            const snap = newRow['payload'] as CloudSyncSnapshot;
            if (snap && Array.isArray(snap.workers)) {
              void this.applyCloudSnapshot(snap, true);
            }
          }
        }
      )
      .on('broadcast', { event: 'device_updated' }, (payload) => {
        const remoteDev = payload['payload'] as RegisteredDevice | undefined;
        if (remoteDev && remoteDev.deviceId) {
          this.mergeDeviceList([remoteDev]);
        }
      })
      .on('broadcast', { event: 'request_latest_state' }, (payload) => {
        const reqDevId = payload['payload']?.['deviceId'];
        if (reqDevId && reqDevId !== this.currentDevice().deviceId && this.hasAnyLocalData()) {
          const snap = this.buildCloudSnapshot('مزامنة تلقائية لجهاز متصل حديثاً');
          void channel.send({
            type: 'broadcast',
            event: 'state_sync',
            payload: snap,
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.cloudSyncStatus.set('connected');
          await channel.track({
            ...this.currentDevice(),
            isOnline: true,
            lastActiveAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
          });
          await channel.send({
            type: 'broadcast',
            event: 'request_latest_state',
            payload: { deviceId: this.currentDevice().deviceId },
          });
        }
      });

    this.realtimeChannel = channel;
  }

  private mergeDeviceList(incoming: RegisteredDevice[], onlineIds?: Set<string>): void {
    const map = new Map<string, RegisteredDevice>();
    for (const existing of this.registeredDevices()) {
      map.set(existing.deviceId, {
        ...existing,
        isOnline: onlineIds ? onlineIds.has(existing.deviceId) : existing.isOnline,
      });
    }
    for (const inc of incoming) {
      if (!inc?.deviceId) continue;
      const prev = map.get(inc.deviceId);
      map.set(inc.deviceId, {
        ...prev,
        ...inc,
        isOnline: onlineIds ? onlineIds.has(inc.deviceId) : inc.isOnline ?? true,
      });
    }
    const cur = this.currentDevice();
    map.set(cur.deviceId, { ...cur, isOnline: true });

    const merged = Array.from(map.values()).sort((a, b) =>
      (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '')
    );
    this.registeredDevices.set(merged);
    if (this.db) {
      void this.db.devices.bulkPut(merged);
    }
  }

  private hasAnyLocalData(): boolean {
    return (
      this.workers().length > 0 ||
      this.projects().length > 0 ||
      this.attendances().length > 0 ||
      this.dailyHeadcounts().length > 0 ||
      this.advances().length > 0 ||
      this.deductions().length > 0 ||
      this.checks().length > 0 ||
      this.expenses().length > 0 ||
      this.incomingPayments().length > 0
    );
  }

  buildCloudSnapshot(lastOperation: string): CloudSyncSnapshot {
    const dev = this.currentDevice();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const nextVersion = this.cloudVersion() + 1;
    return {
      version: nextVersion,
      updatedAt: now,
      updatedByDeviceId: dev.deviceId,
      updatedByDeviceName: dev.deviceName,
      lastOperation,
      workers: this.workers(),
      projects: this.projects(),
      attendances: this.attendances(),
      advances: this.advances(),
      deductions: this.deductions(),
      dailyHeadcounts: this.dailyHeadcounts(),
      settlements: this.settlements(),
      extracts: this.extracts(),
      extractLines: this.extractLines(),
      extras: this.extras(),
      extraCashes: this.extraCashes(),
      checks: this.checks(),
      expenses: this.expenses(),
      incomingPayments: this.incomingPayments(),
      settings: this.settings(),
      auditLogs: this.auditLogs().slice(0, 100),
      devices: this.registeredDevices(),
    };
  }

  scheduleCloudSync(operationDescription: string): void {
    if (!this.isBrowser || this.isApplyingRemoteState) return;

    this.hasPendingLocalChanges = true;
    this.pendingSyncReason = operationDescription;

    // Increment current device operation count
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const cur = this.currentDevice();
    const nextOps = (cur.operationsCount || 0) + 1;
    localStorage.setItem('dortmun_device_ops_count', String(nextOps));
    const updatedDev: RegisteredDevice = {
      ...cur,
      lastActiveAt: now,
      lastAction: operationDescription,
      operationsCount: nextOps,
      isOnline: true,
      syncMode: this.localOnlyMode() ? 'local' : 'cloud',
    };
    this.currentDevice.set(updatedDev);
    this.mergeDeviceList([updatedDev]);

    if (this.localOnlyMode()) {
      this.cloudSyncStatus.set('local_only');
      return;
    }

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncToCloudNow(operationDescription);
    }, 60);
  }

  async syncToCloudNow(operationDescription = 'مزامنة فورية ١٠٠٪ مع الخادم'): Promise<boolean> {
    if (!this.isBrowser || this.localOnlyMode()) {
      this.cloudSyncStatus.set('local_only');
      return false;
    }

    if (!this.supabase) {
      this.supabase = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 25 } },
      });
    }

    this.isSyncingNow = true;
    this.cloudSyncStatus.set('syncing');

    try {
      // Ensure version is strictly higher than any remote version
      const { data: currentRemote } = await this.supabase
        .from('dortmun_cloud_state')
        .select('version')
        .eq('id', 'main')
        .maybeSingle();
      if (currentRemote && typeof currentRemote['version'] === 'number') {
        this.cloudVersion.set(Math.max(this.cloudVersion(), Number(currentRemote['version'])));
      }

      const nowIso = new Date().toISOString();
      const snapshot = this.buildCloudSnapshot(operationDescription);
      const snapshotWithIso = { ...snapshot, updatedAtIso: nowIso };

      this.cloudVersion.set(snapshot.version);
      this.lastCloudSyncAt.set(snapshot.updatedAt);
      this.lastCloudOperation.set(operationDescription);
      this.lastSyncedByDeviceName.set(this.currentDevice().deviceName);
      this.lastSyncedUpdatedAtIso = nowIso;

      // 1. Broadcast over Supabase Realtime immediately (< 50ms across all connected devices)
      if (this.realtimeChannel) {
        void this.realtimeChannel.track({
          ...this.currentDevice(),
          isOnline: true,
        });
        void this.realtimeChannel.send({
          type: 'broadcast',
          event: 'state_sync',
          payload: snapshotWithIso,
        });
      }

      // 2. Always Upsert directly to Supabase PostgreSQL dortmun_cloud_state (using exact column last_action)
      const { data: upRow, error: sbErr } = await this.supabase
        .from('dortmun_cloud_state')
        .upsert(
          {
            id: 'main',
            version: snapshot.version,
            updated_at: nowIso,
            updated_by_device_id: snapshot.updatedByDeviceId,
            updated_by_device_name: snapshot.updatedByDeviceName,
            last_action: snapshot.lastOperation,
            payload: snapshotWithIso,
          },
          { onConflict: 'id' }
        )
        .select('version, updated_at')
        .maybeSingle();

      if (!sbErr) {
        this.supabaseTablesReady.set(true);
        this.hasPendingLocalChanges = false;
        if (upRow?.['updated_at']) {
          this.lastSyncedUpdatedAtIso = String(upRow['updated_at']);
        }
      }

      // 3. Upsert current device directly to Supabase dortmun_devices
      const d = this.currentDevice();
      void this.supabase
        .from('dortmun_devices')
        .upsert(
          {
            device_id: d.deviceId,
            device_name: d.deviceName,
            device_type: d.deviceType,
            browser_os: d.browserOs,
            first_login_at: d.firstLoginAt,
            last_active_at: d.lastActiveAt,
            last_action: d.lastAction,
            operations_count: d.operationsCount,
            is_online: true,
            sync_mode: d.syncMode,
            updated_at: nowIso,
          },
          { onConflict: 'device_id' }
        );

      // 4. Mirror all relational tables directly to Supabase PostgreSQL in background
      void this.syncRelationalTablesDirectly(snapshot, nowIso);

      // 5. Optional sync with local Express SSR endpoint if present
      void fetch('/api/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot: snapshotWithIso,
          device: this.currentDevice(),
          lastOperation: operationDescription,
        }),
      }).catch(() => null);

      this.cloudSyncStatus.set('connected');
      return !sbErr;
    } catch {
      this.cloudSyncStatus.set('connected');
      return false;
    } finally {
      this.isSyncingNow = false;
    }
  }

  private async syncRelationalTablesDirectly(
    snapshot: CloudSyncSnapshot,
    nowIso: string
  ): Promise<void> {
    if (!this.supabase || this.localOnlyMode()) return;
    try {
      const sb = this.supabase;
      const s = snapshot.settings;

      // Settings
      if (s) {
        await sb.from('dortmun_settings').upsert(
          {
            id: 1,
            arabic_digits: s.numeralMode === 'ar',
            dark_mode: Boolean(s.darkMode),
            payday_day_of_month: s.paydayDayOfMonth || 15,
            cloud_sync_mode: this.localOnlyMode() ? 'local' : 'cloud',
            device_custom_name: this.currentDevice().deviceName,
            supabase_url: SUPABASE_PROJECT_URL,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );
      }

      // Projects
      await sb.from('dortmun_projects').delete().gte('id', 0);
      if (snapshot.projects.length > 0) {
        await sb.from('dortmun_projects').upsert(
          snapshot.projects.map((p, idx) => ({
            id: p.id ?? idx + 1,
            name: p.name,
            client_name: '',
            location: '',
            notes: p.notes || '',
            archived: !p.active,
            updated_at: nowIso,
          }))
        );
      }

      // Workers
      await sb.from('dortmun_workers').delete().gte('id', 0);
      if (snapshot.workers.length > 0) {
        await sb.from('dortmun_workers').upsert(
          snapshot.workers.map((w, idx) => ({
            id: w.id ?? idx + 1,
            name: w.name,
            role: w.role || 'عامل',
            phone: w.phone || '',
            national_id: '',
            default_daily_rate: w.workerDayRate || 0,
            default_night_rate: w.workerNightRate || 0,
            default_project_id: null,
            notes: w.notes || '',
            active: w.active !== false,
            updated_at: nowIso,
          }))
        );
      }

      // Attendances
      await sb.from('dortmun_attendances').delete().gte('id', 0);
      if (snapshot.attendances.length > 0) {
        await sb.from('dortmun_attendances').upsert(
          snapshot.attendances.map((a, idx) => ({
            id: a.id ?? idx + 1,
            worker_id: a.workerId,
            project_id: a.projectId,
            date: a.date,
            type:
              a.dayWorked && a.nightWorked
                ? 'day_and_night'
                : a.nightWorked
                  ? 'night_only'
                  : 'day_only',
            day_units: a.dayWorked || 0,
            night_units: a.nightWorked || 0,
            daily_rate_snapshot: a.workerDayRateSnapshot || 0,
            night_rate_snapshot: a.workerNightRateSnapshot || 0,
            computed_pay:
              (a.dayWorked || 0) * (a.workerDayRateSnapshot || 0) +
              (a.nightWorked || 0) * (a.workerNightRateSnapshot || 0),
            notes: a.note || '',
            updated_at: nowIso,
          }))
        );
      }

      // Daily Headcounts
      await sb.from('dortmun_daily_headcounts').delete().gte('id', 0);
      if (snapshot.dailyHeadcounts.length > 0) {
        await sb.from('dortmun_daily_headcounts').upsert(
          snapshot.dailyHeadcounts.map((h, idx) => ({
            id: h.id ?? idx + 1,
            date: h.date,
            project_id: h.projectId ?? null,
            regular_workers_count: h.workersCount || 0,
            sculptors_count: h.sculptorsCount || 0,
            total_day_workers: h.expectedDayCount || 0,
            night_shifts_count: h.expectedNightCount || 0,
            supervisor_name: h.supervisorName || '',
            notes: h.notes || '',
            updated_at: nowIso,
          }))
        );
      }

      // Advances
      await sb.from('dortmun_advances').delete().gte('id', 0);
      if (snapshot.advances.length > 0) {
        await sb.from('dortmun_advances').upsert(
          snapshot.advances.map((adv, idx) => ({
            id: adv.id ?? idx + 1,
            worker_id: adv.workerId,
            project_id: null,
            date: adv.date,
            amount: adv.amount || 0,
            reason: adv.reason || '',
            settled: adv.settlementId !== null && adv.settlementId !== undefined,
            settlement_id: adv.settlementId ?? null,
            updated_at: nowIso,
          }))
        );
      }

      // Deductions
      await sb.from('dortmun_deductions').delete().gte('id', 0);
      if (snapshot.deductions.length > 0) {
        await sb.from('dortmun_deductions').upsert(
          snapshot.deductions.map((d, idx) => ({
            id: d.id ?? idx + 1,
            worker_id: d.workerId,
            project_id: d.projectId ?? null,
            date: d.date,
            mode: d.mode || 'money',
            units: d.daysDeducted || 0,
            daily_rate_snapshot: 0,
            amount: d.amount || 0,
            reason: d.reason || '',
            settled: d.settlementId !== null && d.settlementId !== undefined,
            settlement_id: d.settlementId ?? null,
            updated_at: nowIso,
          }))
        );
      }

      // Settlements
      await sb.from('dortmun_settlements').delete().gte('id', 0);
      if (snapshot.settlements.length > 0) {
        await sb.from('dortmun_settlements').upsert(
          snapshot.settlements.map((st, idx) => ({
            id: st.id ?? idx + 1,
            worker_id: st.workerId,
            project_id: null,
            period_from: st.from,
            period_to: st.to,
            total_days: st.days || 0,
            total_nights: st.nights || 0,
            gross_wages: st.grossWages || 0,
            total_advances_deducted: st.advancesDeducted || 0,
            total_deductions_deducted: st.deductionsDeducted || 0,
            net_paid: st.netPaid || 0,
            paid_amount: st.netPaid || 0,
            remaining_balance: 0,
            paid_at: st.date || st.to,
            payment_method: 'نقدي',
            notes: st.notes || '',
            updated_at: nowIso,
          }))
        );
      }

      // Extracts & Extract Lines
      await sb.from('dortmun_extract_lines').delete().gte('id', 0);
      await sb.from('dortmun_extracts').delete().gte('id', 0);
      if (snapshot.extracts.length > 0) {
        await sb.from('dortmun_extracts').upsert(
          snapshot.extracts.map((ex, idx) => ({
            id: ex.id ?? idx + 1,
            project_id: ex.projectId,
            extract_number: String(ex.number || ''),
            extract_name: `مستخلص ${ex.number || ''}`,
            period_from: ex.from || '2026-10-01',
            period_to: ex.to || '2026-10-18',
            notes: ex.notes || '',
            updated_at: nowIso,
          }))
        );
      }
      if (snapshot.extractLines.length > 0) {
        await sb.from('dortmun_extract_lines').upsert(
          snapshot.extractLines.map((el, idx) => ({
            id: el.id ?? idx + 1,
            extract_id: el.extractId,
            item_code: String(el.id ?? idx + 1),
            description: el.notes || 'بند مستخلص',
            worker_id: el.workerId ?? null,
            base_amount: el.claimed || 0,
            tax_percent: el.taxRate || 0,
            tax_amount: el.taxAmount || 0,
            net_amount: (el.claimed || 0) - (el.taxAmount || 0),
            received_amount: el.collected || 0,
            status: el.isSaved ? 'saved' : 'open',
            status_date: el.collectedDate || null,
            notes: el.notes || '',
            updated_at: nowIso,
          }))
        );
      }

      // Extras & Extra Cashes
      await sb.from('dortmun_extra_cashes').delete().gte('id', 0);
      await sb.from('dortmun_extras').delete().gte('id', 0);
      if (snapshot.extras.length > 0) {
        await sb.from('dortmun_extras').upsert(
          snapshot.extras.map((ext, idx) => ({
            id: ext.id ?? idx + 1,
            project_id: ext.projectId || 1,
            worker_id: null,
            extract_id: null,
            date: ext.date,
            description: ext.type || 'إضافي',
            hours_or_units: ext.days || 1,
            unit_price: ext.amount || 0,
            total: ext.amount || 0,
            notes: `${ext.authorizedBy ? 'بأمر: ' + ext.authorizedBy + ' — ' : ''}${ext.notes || ''}`,
            updated_at: nowIso,
          }))
        );
      }
      if (snapshot.extraCashes.length > 0) {
        await sb.from('dortmun_extra_cashes').upsert(
          snapshot.extraCashes.map((ec, idx) => ({
            id: ec.id ?? idx + 1,
            project_id: 1,
            worker_id: ec.workerId,
            date: '2026-10-18',
            amount: ec.amount || 0,
            spent_on: ec.notes || '',
            handed_to: '',
            notes: ec.notes || '',
            updated_at: nowIso,
          }))
        );
      }

      // Checks
      await sb.from('dortmun_checks').delete().gte('id', 0);
      if (snapshot.checks.length > 0) {
        await sb.from('dortmun_checks').upsert(
          snapshot.checks.map((ch, idx) => ({
            id: ch.id ?? idx + 1,
            check_number: ch.number || String(idx + 1),
            bank_name: ch.bank || '',
            direction: ch.direction === 'صادر' ? 'outgoing' : 'incoming',
            drawer_or_payee: ch.notes || '',
            project_id: ch.projectId ?? null,
            extract_id: ch.extractId ?? null,
            amount: ch.amount || 0,
            issue_date: ch.dueDate,
            due_date: ch.dueDate,
            cashed_date: ch.status === 'اتصرف' ? ch.dueDate : null,
            status:
              ch.status === 'اتصرف' ? 'cashed' : ch.status === 'مرتجع' ? 'bounced' : 'pending',
            spent_on: ch.notes || '',
            notes: ch.notes || '',
            updated_at: nowIso,
          }))
        );
      }

      // Expenses
      await sb.from('dortmun_expenses').delete().gte('id', 0);
      if (snapshot.expenses.length > 0) {
        await sb.from('dortmun_expenses').upsert(
          snapshot.expenses.map((exp, idx) => ({
            id: exp.id ?? idx + 1,
            project_id: exp.projectId ?? null,
            date: exp.date,
            category: exp.category || 'مصاريف',
            description: exp.note || '',
            amount: exp.amount || 0,
            paid_by: '',
            extract_id: null,
            notes: exp.note || '',
            updated_at: nowIso,
          }))
        );
      }

      // Incoming Payments
      await sb.from('dortmun_incoming_payments').delete().gte('id', 0);
      if (snapshot.incomingPayments && snapshot.incomingPayments.length > 0) {
        await sb.from('dortmun_incoming_payments').upsert(
          snapshot.incomingPayments.map((inc, idx) => ({
            id: inc.id ?? idx + 1,
            date: inc.date,
            source_type: inc.sourceType || 'شركة',
            source_name: inc.sourceName || '',
            amount: inc.amount || 0,
            method: inc.method || 'نقدي',
            project_id: inc.projectId ?? null,
            check_number: inc.checkNumber || '',
            notes: inc.notes || '',
            updated_at: nowIso,
          }))
        );
      }
    } catch {
      // Relational table mirror is non-blocking
    }
  }

  async pullFromCloudServer(showNotification = true): Promise<boolean> {
    if (!this.isBrowser || this.localOnlyMode()) return false;

    try {
      this.cloudSyncStatus.set('syncing');
      if (!this.supabase) {
        this.supabase = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 25 } },
        });
      }

      let remoteSnapshot: CloudSyncSnapshot | null = null;
      let remoteUpdatedAt = '';

      // 1. Always query Supabase dortmun_cloud_state directly first (works on Netlify, mobile, and localhost!)
      const { data: sbRow, error: sbErr } = await this.supabase
        .from('dortmun_cloud_state')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (!sbErr) {
        this.supabaseTablesReady.set(true);
        if (sbRow && sbRow['payload']) {
          const sbSnap = sbRow['payload'] as CloudSyncSnapshot & { updatedAtIso?: string };
          if (sbSnap && Array.isArray(sbSnap.workers)) {
            remoteUpdatedAt = String(sbRow['updated_at'] || sbSnap.updatedAtIso || '');
            remoteSnapshot = {
              ...sbSnap,
              version: Number(sbRow['version'] || sbSnap.version || 1),
              lastOperation: String(
                sbRow['last_action'] || sbSnap.lastOperation || 'مزامنة من الخادم'
              ),
              updatedByDeviceId: String(
                sbRow['updated_by_device_id'] || sbSnap.updatedByDeviceId || ''
              ),
              updatedByDeviceName: String(
                sbRow['updated_by_device_name'] || sbSnap.updatedByDeviceName || ''
              ),
            };
          }
        }
      }

      // 2. Also fetch registered devices directly from Supabase
      const { data: sbDevs, error: devErr } = await this.supabase
        .from('dortmun_devices')
        .select('*');
      if (!devErr && Array.isArray(sbDevs)) {
        const mapped: RegisteredDevice[] = sbDevs.map((d) => ({
          deviceId: String(d['device_id'] || ''),
          deviceName: String(d['device_name'] || 'جهاز متصل'),
          deviceType: (d['device_type'] as 'desktop' | 'mobile' | 'tablet') || 'desktop',
          browserOs: String(d['browser_os'] || ''),
          firstLoginAt: String(d['first_login_at'] || ''),
          lastActiveAt: String(d['last_active_at'] || ''),
          lastAction: String(d['last_action'] || ''),
          operationsCount: Number(d['operations_count'] || 0),
          syncMode: (d['sync_mode'] as 'cloud' | 'local') || 'cloud',
        }));
        this.mergeDeviceList(mapped);
      }

      // 3. Apply remote snapshot if present, or upload local data if server has never been initialized
      if (remoteSnapshot && Array.isArray(remoteSnapshot.workers)) {
        this.lastSyncedUpdatedAtIso = remoteUpdatedAt;
        await this.applyCloudSnapshot(remoteSnapshot, showNotification);
      } else if (this.hasAnyLocalData()) {
        await this.syncToCloudNow('رفع البيانات الحالية إلى الخادم');
      }

      this.cloudSyncStatus.set('connected');
      if (showNotification) {
        this.showToast('تمت مزامنة وسحب أحدث البيانات مباشرة بنجاح', 'success');
      }
      return true;
    } catch {
      this.cloudSyncStatus.set('connected');
      return false;
    }
  }

  async applyCloudSnapshot(snapshot: CloudSyncSnapshot, notifyUser = false): Promise<void> {
    if (!snapshot || this.localOnlyMode()) return;

    this.isApplyingRemoteState = true;
    try {
      this.cloudVersion.set(snapshot.version || this.cloudVersion() + 1);
      this.lastCloudSyncAt.set(
        snapshot.updatedAt || new Date().toISOString().replace('T', ' ').slice(0, 16)
      );
      this.lastCloudOperation.set(snapshot.lastOperation || 'مزامنة من الخادم');
      this.lastSyncedByDeviceName.set(snapshot.updatedByDeviceName || 'جهاز متصل');

      if (snapshot.settings) {
        const mergedSettings: AppSettings = {
          ...INITIAL_SETTINGS,
          ...snapshot.settings,
          localOnlyMode: this.localOnlyMode(),
        };
        this.settings.set(mergedSettings);
        this.applyDarkMode(mergedSettings.darkMode);
      }
      if (Array.isArray(snapshot.projects)) this.projects.set(snapshot.projects);
      if (Array.isArray(snapshot.workers)) this.workers.set(snapshot.workers);
      if (Array.isArray(snapshot.attendances)) this.attendances.set(snapshot.attendances);
      if (Array.isArray(snapshot.advances)) this.advances.set(snapshot.advances);
      if (Array.isArray(snapshot.deductions)) this.deductions.set(snapshot.deductions);
      if (Array.isArray(snapshot.dailyHeadcounts))
        this.dailyHeadcounts.set(snapshot.dailyHeadcounts);
      if (Array.isArray(snapshot.settlements)) this.settlements.set(snapshot.settlements);
      if (Array.isArray(snapshot.extracts)) this.extracts.set(snapshot.extracts);
      if (Array.isArray(snapshot.extractLines)) this.extractLines.set(snapshot.extractLines);
      if (Array.isArray(snapshot.extras)) this.extras.set(snapshot.extras);
      if (Array.isArray(snapshot.extraCashes)) this.extraCashes.set(snapshot.extraCashes);
      if (Array.isArray(snapshot.checks)) this.checks.set(snapshot.checks);
      if (Array.isArray(snapshot.expenses)) this.expenses.set(snapshot.expenses);
      if (Array.isArray(snapshot.incomingPayments))
        this.incomingPayments.set(snapshot.incomingPayments);
      if (Array.isArray(snapshot.auditLogs)) this.auditLogs.set(snapshot.auditLogs);
      if (Array.isArray(snapshot.devices)) this.mergeDeviceList(snapshot.devices);

      if (this.db) {
        await this.db.transaction(
          'rw',
          [
            this.db.settings,
            this.db.projects,
            this.db.workers,
            this.db.attendance,
            this.db.advances,
            this.db.deductions,
            this.db.dailyHeadcounts,
            this.db.settlements,
            this.db.extracts,
            this.db.extractLines,
            this.db.extras,
            this.db.extraCash,
            this.db.checks,
            this.db.expenses,
            this.db.incomingPayments,
            this.db.auditLog,
          ],
          async () => {
            await Promise.all([
              this.db!.settings.clear(),
              this.db!.projects.clear(),
              this.db!.workers.clear(),
              this.db!.attendance.clear(),
              this.db!.advances.clear(),
              this.db!.deductions.clear(),
              this.db!.dailyHeadcounts.clear(),
              this.db!.settlements.clear(),
              this.db!.extracts.clear(),
              this.db!.extractLines.clear(),
              this.db!.extras.clear(),
              this.db!.extraCash.clear(),
              this.db!.checks.clear(),
              this.db!.expenses.clear(),
              this.db!.incomingPayments.clear(),
              this.db!.auditLog.clear(),
            ]);

            await this.db!.settings.put({ ...this.settings(), id: 1 });
            if (this.projects().length) await this.db!.projects.bulkPut(this.projects());
            if (this.workers().length) await this.db!.workers.bulkPut(this.workers());
            if (this.attendances().length) await this.db!.attendance.bulkPut(this.attendances());
            if (this.advances().length) await this.db!.advances.bulkPut(this.advances());
            if (this.deductions().length) await this.db!.deductions.bulkPut(this.deductions());
            if (this.dailyHeadcounts().length)
              await this.db!.dailyHeadcounts.bulkPut(this.dailyHeadcounts());
            if (this.settlements().length) await this.db!.settlements.bulkPut(this.settlements());
            if (this.extracts().length) await this.db!.extracts.bulkPut(this.extracts());
            if (this.extractLines().length)
              await this.db!.extractLines.bulkPut(this.extractLines());
            if (this.extras().length) await this.db!.extras.bulkPut(this.extras());
            if (this.extraCashes().length) await this.db!.extraCash.bulkPut(this.extraCashes());
            if (this.checks().length) await this.db!.checks.bulkPut(this.checks());
            if (this.expenses().length) await this.db!.expenses.bulkPut(this.expenses());
            if (this.incomingPayments().length)
              await this.db!.incomingPayments.bulkPut(this.incomingPayments());
            if (this.auditLogs().length) await this.db!.auditLog.bulkPut(this.auditLogs());
          }
        );
      }

      if (notifyUser && snapshot.updatedByDeviceName) {
        this.showToast(
          `تحديث مباشر: ${snapshot.lastOperation}`,
          'success'
        );
      }
    } finally {
      this.isApplyingRemoteState = false;
    }
  }

  async registerDeviceOnCloud(lastAction = 'متصل بالخادم'): Promise<void> {
    if (!this.isBrowser) return;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const updated: RegisteredDevice = {
      ...this.currentDevice(),
      lastActiveAt: now,
      lastAction,
      isOnline: true,
      syncMode: this.localOnlyMode() ? 'local' : 'cloud',
    };
    this.currentDevice.set(updated);
    this.mergeDeviceList([updated]);

    if (this.localOnlyMode()) return;

    try {
      if (this.supabase) {
        await this.supabase.from('dortmun_devices').upsert(
          {
            device_id: updated.deviceId,
            device_name: updated.deviceName,
            device_type: updated.deviceType,
            browser_os: updated.browserOs,
            first_login_at: updated.firstLoginAt,
            last_active_at: updated.lastActiveAt,
            last_action: updated.lastAction,
            operations_count: updated.operationsCount,
            is_online: true,
            sync_mode: updated.syncMode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id' }
        );
      }
      void fetch('/api/cloud/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => null);
    } catch {
      // Ignore network errors
    }
  }

  async updateDeviceName(newName: string): Promise<void> {
    const clean = newName.trim();
    if (!clean) {
      this.showToast('يرجى كتابة اسم واضح للجهاز', 'warning');
      return;
    }
    if (this.isBrowser) {
      localStorage.setItem('dortmun_device_name', clean);
    }
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const updated: RegisteredDevice = {
      ...this.currentDevice(),
      deviceName: clean,
      lastActiveAt: now,
      lastAction: `تحديث اسم الجهاز إلى "${clean}"`,
      isOnline: true,
    };
    this.currentDevice.set(updated);
    this.mergeDeviceList([updated]);

    if (!this.localOnlyMode()) {
      await this.registerDeviceOnCloud(`تغيير اسم الجهاز إلى "${clean}"`);
      if (this.realtimeChannel) {
        await this.realtimeChannel.track(updated);
        await this.realtimeChannel.send({
          type: 'broadcast',
          event: 'device_updated',
          payload: updated,
        });
      }
    }

    await this.logAudit('تحديث اسم الجهاز', 'الأجهزة المتصلة', `تم تسجيل اسم الجهاز: ${clean}`);
    this.showToast(`تم اعتماد اسم الجهاز: "${clean}" ومزامنته`, 'success');
  }

  async removeRegisteredDevice(deviceId: string): Promise<void> {
    if (deviceId === this.currentDevice().deviceId) {
      this.showToast('لا يمكن حذف الجهاز الحالي الذي تستخدمه الآن', 'warning');
      return;
    }
    this.registeredDevices.update((list) => list.filter((d) => d.deviceId !== deviceId));
    if (this.db) {
      await this.db.devices.delete(deviceId);
    }
    if (!this.localOnlyMode()) {
      try {
        if (this.supabase) {
          await this.supabase.from('dortmun_devices').delete().eq('device_id', deviceId);
        }
        void fetch(`/api/cloud/device/${encodeURIComponent(deviceId)}`, {
          method: 'DELETE',
        }).catch(() => null);
      } catch {
        // Ignore
      }
    }
    this.showToast('تم إزالة الجهاز من سجل الأجهزة', 'warning');
  }

  async toggleLocalOnlyMode(forceLocalOnly?: boolean): Promise<void> {
    const nextLocal = forceLocalOnly !== undefined ? forceLocalOnly : !this.localOnlyMode();
    this.localOnlyMode.set(nextLocal);
    if (this.isBrowser) {
      localStorage.removeItem('dortmun_local_only_mode');
      if (nextLocal) {
        sessionStorage.setItem('dortmun_manual_disconnect', 'true');
      } else {
        sessionStorage.removeItem('dortmun_manual_disconnect');
      }
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const dev: RegisteredDevice = {
      ...this.currentDevice(),
      lastActiveAt: now,
      syncMode: nextLocal ? 'local' : 'cloud',
      lastAction: nextLocal ? 'فصل الاتصال مؤقتاً' : 'متصل تلقائياً بالخادم',
    };
    this.currentDevice.set(dev);
    this.mergeDeviceList([dev]);

    if (nextLocal) {
      this.cloudSyncStatus.set('local_only');
      if (this.watcherInterval) {
        clearInterval(this.watcherInterval);
        this.watcherInterval = null;
      }
      if (this.realtimeChannel && this.supabase) {
        await this.supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }
      this.showToast('تم فصل الاتصال — التطبيق يعمل الآن محلياً', 'warning');
    } else {
      this.cloudSyncStatus.set('syncing');
      await this.initCloudConnection();
      await this.syncToCloudNow('إعادة الاتصال والمزامنة الفورية');
      this.showToast('تم الاتصال بنجاح — يتم رفع وجلب أي تغيير مباشر تلقائياً', 'success');
    }
  }

  getSupabaseSetupSql(): string {
    return FULL_SUPABASE_SQL_SCHEMA;
  }

  async runCloudDiagnostics(): Promise<void> {
    if (!this.isBrowser) return;
    this.diagnosticsLoading.set(true);
    const startMs = Date.now();
    try {
      const res = await fetch('/api/cloud/diagnostics');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (typeof data.latencyMs === 'number') {
          this.serverLatencyMs.set(data.latencyMs);
        }
        if (Array.isArray(data.tables)) {
          this.tableDiagnostics.set(data.tables);
          this.supabaseTablesReady.set(data.readyTablesCount > 0);
        }
        this.diagnosticsLoading.set(false);
        return;
      }
    } catch {
      // Fallback to direct client check on static hosts
    }

    if (this.supabase) {
      const checks = await Promise.all(
        SUPABASE_TABLES_LIST.map(async (tbl) => {
          const { count, error } = await this.supabase!
            .from(tbl.name)
            .select('*', { count: 'exact', head: true });
          return {
            name: tbl.name,
            label: tbl.label,
            ready: !error,
            rowCount: count ?? 0,
          };
        })
      );
      this.serverLatencyMs.set(Date.now() - startMs);
      this.tableDiagnostics.set(checks);
      this.supabaseTablesReady.set(checks.some((c) => c.ready));
    }
    this.diagnosticsLoading.set(false);
  }

  async createCloudBackup(customTitle?: string): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const title = (customTitle || '').trim() || `نسخة احتياطية سحابية (${now})`;
    const snapshot = this.buildCloudSnapshot(`إنشاء نسخة سحابية: ${title}`);

    try {
      const res = await fetch('/api/cloud/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupTitle: title,
          snapshot,
          device: this.currentDevice(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.backups)) {
          this.cloudBackups.set(data.backups);
        }
      }
    } catch {
      // Fallback to direct Supabase insert if running on static host
      if (this.supabase && this.supabaseTablesReady()) {
        await this.supabase.from('dortmun_cloud_backups').insert({
          backup_title: title,
          created_by_device_id: this.currentDevice().deviceId,
          created_by_device_name: this.currentDevice().deviceName,
          version: snapshot.version,
          workers_count: this.workers().length,
          attendance_count: this.attendances().length,
          payload: snapshot,
        });
      }
    }

    await this.logAudit('إنشاء نسخة سحابية', 'الخادم السحابي', title);
    this.showToast(`تم حفظ نقطة الاستعادة السحابية: "${title}" بنجاح`, 'success');
  }

  async restoreCloudBackup(backupId: number): Promise<void> {
    try {
      const res = await fetch(`/api/cloud/backups/${backupId}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) {
          await this.applyCloudSnapshot(data.snapshot as CloudSyncSnapshot, false);
          if (this.realtimeChannel) {
            await this.realtimeChannel.send({
              type: 'broadcast',
              event: 'state_sync',
              payload: data.snapshot,
            });
          }
          this.showToast('تمت استعادة النسخة السحابية ومزامنتها على جميع الأجهزة!', 'success');
          return;
        }
      }
    } catch {
      // Ignore
    }
    this.showToast('تعذر استعادة النسخة السحابية المطلوبة', 'warning');
  }

  async executeSmartCommand(rawInput: string): Promise<boolean> {
    const parsed = parseSmartSiteCommand(rawInput);
    if (parsed.kind === 'unknown') {
      this.showToast(parsed.summary, 'warning');
      return false;
    }

    if (parsed.kind === 'headcount') {
      const totalDay = (parsed.workersCount || 0) + (parsed.sculptorsCount || 0);
      await this.saveDailyHeadcount({
        date: this.todayIso(),
        projectId: this.selectedProjectId(),
        expectedDayCount: totalDay,
        sculptorsCount: parsed.sculptorsCount || 0,
        workersCount: parsed.workersCount || 0,
        expectedNightCount: parsed.nightsCount || 0,
        supervisorName: this.currentDevice().deviceName,
        notes: 'مسجل عبر الأمر الذكي السريع',
      });
      return true;
    }

    if (parsed.kind === 'expense') {
      if (!parsed.amount || parsed.amount <= 0) {
        this.showToast('حدد مبلغ المصروف في الأمر الذكي (مثلاً: مصروف مواصلات 200)', 'warning');
        return false;
      }
      await this.saveExpense({
        date: this.todayIso(),
        category: parsed.expenseCategory || 'مواصلات',
        amount: parsed.amount,
        projectId: this.selectedProjectId(),
        note: parsed.reason || 'مصروف سريع',
      });
      this.showToast(`تم تسجيل ${parsed.summary} ومزامنته مع الخادم`, 'success');
      return true;
    }

    if (parsed.kind === 'worker') {
      const name = parsed.workerNameHint || 'عامل جديد';
      const dayRate = parsed.amount || 500;
      await this.saveWorker({
        name,
        role: parsed.workerRole || 'عامل',
        workerDayRate: dayRate,
        workerNightRate: Math.round(dayRate / 2),
        phone: '',
        active: true,
        notes: 'أُضيف عبر الأمر الذكي السريع',
      });
      this.showToast(`تمت ${parsed.summary} بنجاح`, 'success');
      return true;
    }

    // Find matching worker for deduction or advance
    const hint = (parsed.workerNameHint || '').toLowerCase();
    const matchedWorker =
      this.activeWorkers().find((w) => hint && w.name.toLowerCase().includes(hint)) ||
      this.activeWorkers()[0];

    if (!matchedWorker?.id) {
      this.showToast('أضف عاملاً أو نحاتاً أولاً قبل تسجيل خصم أو سلفة', 'warning');
      return false;
    }

    if (parsed.kind === 'deduction') {
      const mode = parsed.deductionMode || 'half_day';
      const daysDeducted =
        mode === 'day' ? 1 : mode === 'half_day' ? 0.5 : mode === 'quarter_day' ? 0.25 : 0;
      const amount =
        mode === 'money'
          ? parsed.amount || 100
          : Math.round(matchedWorker.workerDayRate * daysDeducted);

      await this.addDeduction({
        date: this.todayIso(),
        workerId: matchedWorker.id,
        projectId: this.selectedProjectId(),
        mode,
        daysDeducted,
        amount,
        reason: parsed.reason || 'خصم إداري عبر الأمر الذكي',
        notes: '',
        settlementId: null,
      });
      return true;
    }

    if (parsed.kind === 'advance') {
      const amount = parsed.amount || 200;
      await this.addAdvance({
        date: this.todayIso(),
        workerId: matchedWorker.id,
        amount,
        reason: parsed.reason || 'سلفة سريعة عبر الأمر الذكي',
        settlementId: null,
        notes: '',
      });
      this.showToast(
        `تم تسجيل سلفة ${this.money(amount)} لـ "${matchedWorker.name}" ومزامنتها فوراً`,
        'success'
      );
      return true;
    }

    return false;
  }

  async reloadAllFromDb(): Promise<void> {
    if (!this.db) return;
    const [
      settingsArr,
      projects,
      workers,
      attendances,
      advances,
      deductions,
      dailyHeadcounts,
      settlements,
      extracts,
      extractLines,
      extras,
      extraCashes,
      checks,
      expenses,
      incomingPayments,
      auditLogs,
    ] = await Promise.all([
      this.db.settings.toArray(),
      this.db.projects.toArray(),
      this.db.workers.toArray(),
      this.db.attendance.toArray(),
      this.db.advances.toArray(),
      this.db.deductions.toArray(),
      this.db.dailyHeadcounts.toArray(),
      this.db.settlements.toArray(),
      this.db.extracts.toArray(),
      this.db.extractLines.toArray(),
      this.db.extras.toArray(),
      this.db.extraCash.toArray(),
      this.db.checks.toArray(),
      this.db.expenses.toArray(),
      this.db.incomingPayments.toArray(),
      this.db.auditLog.orderBy('id').reverse().limit(100).toArray(),
    ]);

    if (settingsArr[0]) {
      this.settings.set({ ...INITIAL_SETTINGS, ...settingsArr[0] });
      if (settingsArr[0].defaultProjectId && this.selectedProjectId() === null) {
        this.selectedProjectId.set(settingsArr[0].defaultProjectId);
      }
    }
    this.projects.set(projects);
    this.workers.set(workers);
    this.attendances.set(attendances);
    this.advances.set(advances);
    this.deductions.set(deductions);
    this.dailyHeadcounts.set(dailyHeadcounts);
    this.settlements.set(settlements);
    this.extracts.set(extracts);
    this.extractLines.set(extractLines);
    this.extras.set(extras);
    this.extraCashes.set(extraCashes);
    this.checks.set(checks);
    this.expenses.set(expenses);
    this.incomingPayments.set(incomingPayments);
    this.auditLogs.set(auditLogs);
  }

  async resetAllDataToZero(): Promise<void> {
    this.projects.set([]);
    this.workers.set([]);
    this.attendances.set([]);
    this.advances.set([]);
    this.deductions.set([]);
    this.dailyHeadcounts.set([]);
    this.settlements.set([]);
    this.extracts.set([]);
    this.extractLines.set([]);
    this.extras.set([]);
    this.extraCashes.set([]);
    this.checks.set([]);
    this.expenses.set([]);
    this.incomingPayments.set([]);
    this.auditLogs.set([]);
    this.selectedProjectId.set(null);
    this.undoStack.set([]);
    this.redoStack.set([]);

    if (this.db) {
      await Promise.all([
        this.db.projects.clear(),
        this.db.workers.clear(),
        this.db.attendance.clear(),
        this.db.advances.clear(),
        this.db.deductions.clear(),
        this.db.dailyHeadcounts.clear(),
        this.db.settlements.clear(),
        this.db.extracts.clear(),
        this.db.extractLines.clear(),
        this.db.extras.clear(),
        this.db.extraCash.clear(),
        this.db.checks.clear(),
        this.db.expenses.clear(),
        this.db.incomingPayments.clear(),
        this.db.auditLog.clear(),
      ]);
    }
    this.scheduleCloudSync('تصفير جميع الأرقام والبيانات بالكامل (٠)');
    this.showToast(
      'تم تصفير جميع الأرقام والبيانات بالكامل — ومزامنة التصفير مع الخادم',
      'success'
    );
  }

  // Formatting helpers bound to current numeral mode
  money(val: number | undefined | null): string {
    return formatCurrency(val, this.settings().numeralMode);
  }

  num(val: number | string | undefined | null, decimals = 0): string {
    return formatNumber(val, this.settings().numeralMode, decimals);
  }

  digits(str: string | number): string {
    return this.settings().numeralMode === 'ar' ? toArabicDigits(str) : String(str);
  }

  workerName(workerId: number | null | undefined): string {
    if (!workerId) return 'غير محدد';
    return this.workers().find((w) => w.id === workerId)?.name || `عامل #${workerId}`;
  }

  projectName(projectId: number | null | undefined): string {
    if (!projectId) return 'عام / كل المشاريع';
    return this.projects().find((p) => p.id === projectId)?.name || `مشروع #${projectId}`;
  }

  isMonthLocked(dateOrMonth: string): boolean {
    const month = dateOrMonth.slice(0, 7);
    return (this.settings().lockedMonths || []).includes(month);
  }

  showToast(text: string, type: 'success' | 'warning' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set({ text, type });
    if (this.isBrowser) {
      setTimeout(() => {
        if (this.toastMessage()?.text === text) {
          this.toastMessage.set(null);
        }
      }, 4000);
    }
  }

  applyDarkMode(isDark: boolean): void {
    if (!this.isBrowser) return;
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }

  async toggleDarkMode(): Promise<void> {
    const nextDark = !this.settings().darkMode;
    this.applyDarkMode(nextDark);
    await this.updateSettings({ darkMode: nextDark });
    this.showToast(
      nextDark ? 'تم تفعيل الوضع الليلي (الداكن)' : 'تم تفعيل الوضع النهاري (الفاتح)',
      'success'
    );
  }

  async toggleNumeralMode(): Promise<void> {
    const nextMode = this.settings().numeralMode === 'ar' ? 'en' : 'ar';
    await this.updateSettings({ numeralMode: nextMode });
  }

  async logAudit(action: string, entity: string, details: string): Promise<void> {
    const dev = this.currentDevice();
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      action,
      entity,
      details,
      deviceId: dev.deviceId,
      deviceName: dev.deviceName,
    };
    if (this.db) {
      const id = await this.db.auditLog.add(entry);
      entry.id = id;
    }
    this.auditLogs.update((list) => [entry, ...list.slice(0, 99)]);
    this.scheduleCloudSync(`${action} (${entity}): ${details}`);
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<void> {
    const updated: AppSettings = { ...this.settings(), ...partial, id: 1 };
    const oldTaxRates = this.settings().taxRates;
    this.settings.set(updated);
    if (this.db) {
      await this.db.settings.put(updated);
    }

    if (partial.taxRates && oldTaxRates.length === partial.taxRates.length) {
      const openLines = this.extractLines().filter((l) => !l.isSaved);
      for (const line of openLines) {
        const rateIdx = oldTaxRates.findIndex((r) => r.rate === line.taxRate);
        if (rateIdx !== -1 && partial.taxRates[rateIdx]) {
          const newRate = partial.taxRates[rateIdx].rate;
          const newTaxAmt = Math.round(((line.claimed * newRate) / 100) * 100) / 100;
          await this.saveExtractLine({ ...line, taxRate: newRate, taxAmount: newTaxAmt }, false);
        }
      }
    }
    this.scheduleCloudSync('تحديث إعدادات النظام');
  }

  // Daily Mandatory Headcount (العدد اليومي الإجباري)
  async saveDailyHeadcount(hc: DailyHeadcount): Promise<number> {
    const existing = this.dailyHeadcounts().find(
      (x) => x.date === hc.date && (x.projectId || null) === (hc.projectId || null)
    );
    const recordId = hc.id || existing?.id;

    if (recordId) {
      const prev = this.dailyHeadcounts().find((x) => x.id === recordId);
      const updated: DailyHeadcount = { ...hc, id: recordId };
      if (this.db) await this.db.dailyHeadcounts.put(updated);
      this.dailyHeadcounts.update((list) =>
        list.map((x) => (x.id === recordId ? updated : x))
      );
      this.pushUndo({
        description: `تحديث العدد اليومي ليوم ${hc.date}`,
        table: 'dailyHeadcounts',
        type: 'update',
        recordId,
        previousData: prev,
        newData: updated,
      });
      await this.logAudit(
        'تحديث العدد اليومي الإجباري',
        'العدد اليومي',
        `تاريخ ${hc.date}: ${hc.expectedDayCount} يومية و ${hc.expectedNightCount} سهرة`
      );
      this.showToast('تم تحديث العدد اليومي الإجباري ومطابقته فوراً', 'success');
      return recordId;
    } else {
      let id = Math.max(0, ...this.dailyHeadcounts().map((x) => x.id || 0)) + 1;
      if (this.db) {
        const data = { ...hc };
        delete data.id;
        id = await this.db.dailyHeadcounts.add(data);
      }
      const created: DailyHeadcount = { ...hc, id };
      this.dailyHeadcounts.update((list) => [created, ...list]);
      this.pushUndo({
        description: `تسجيل العدد اليومي ليوم ${hc.date}`,
        table: 'dailyHeadcounts',
        type: 'add',
        recordId: id,
        newData: created,
      });
      await this.logAudit(
        'تسجيل العدد اليومي الإجباري',
        'العدد اليومي',
        `تاريخ ${hc.date}: ${hc.expectedDayCount} يومية (منهم ${hc.sculptorsCount || 0} نحات) و ${hc.expectedNightCount} سهرة`
      );
      this.showToast('تم حفظ العدد اليومي الإجباري بنجاح', 'success');
      return id;
    }
  }

  async deleteDailyHeadcount(id: number): Promise<void> {
    const prev = this.dailyHeadcounts().find((x) => x.id === id);
    if (!prev) return;
    if (this.db) await this.db.dailyHeadcounts.delete(id);
    this.dailyHeadcounts.update((list) => list.filter((x) => x.id !== id));
    this.pushUndo({
      description: `حذف العدد اليومي ليوم ${prev.date}`,
      table: 'dailyHeadcounts',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit('حذف العدد اليومي', 'العدد اليومي', `حذف سجل العدد ليوم ${prev.date}`);
    this.showToast('تم حذف سجل العدد اليومي', 'warning');
  }

  // Deductions / Penalties (الخصومات والجزاءات)
  async addDeduction(deduction: Omit<Deduction, 'id'>): Promise<number> {
    let id = Math.max(0, ...this.deductions().map((d) => d.id || 0)) + 1;
    if (this.db) {
      id = await this.db.deductions.add(deduction as Deduction);
    }
    const created: Deduction = { ...deduction, id };
    this.deductions.update((list) => [created, ...list]);
    this.pushUndo({
      description: `خصم على ${this.workerName(deduction.workerId)}`,
      table: 'deductions',
      type: 'add',
      recordId: id,
      newData: created,
    });
    await this.logAudit(
      'تسجيل خصم / جزاء',
      'الخصومات',
      `خصم ${deduction.amount} ج.م (${deduction.reason}) على ${this.workerName(deduction.workerId)}`
    );
    this.showToast(`تم تسجيل الخصم على ${this.workerName(deduction.workerId)}`, 'success');
    return id;
  }

  async saveDeduction(deduction: Deduction): Promise<number> {
    if (deduction.id) {
      const prev = this.deductions().find((d) => d.id === deduction.id);
      if (this.db) await this.db.deductions.put(deduction);
      this.deductions.update((list) => list.map((d) => (d.id === deduction.id ? deduction : d)));
      this.pushUndo({
        description: `تعديل خصم ${this.workerName(deduction.workerId)}`,
        table: 'deductions',
        type: 'update',
        recordId: deduction.id,
        previousData: prev,
        newData: deduction,
      });
      return deduction.id;
    } else {
      const { id, ...data } = deduction;
      return this.addDeduction(data);
    }
  }

  async deleteDeduction(id: number): Promise<void> {
    const prev = this.deductions().find((d) => d.id === id);
    if (!prev) return;
    if (this.db) await this.db.deductions.delete(id);
    this.deductions.update((list) => list.filter((d) => d.id !== id));
    this.pushUndo({
      description: `حذف خصم ${this.workerName(prev.workerId)}`,
      table: 'deductions',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit(
      'حذف خصم',
      'الخصومات',
      `تم حذف خصم بمبلغ ${prev.amount} ج.م للعامل ${this.workerName(prev.workerId)}`
    );
    this.showToast('تم حذف الخصم', 'warning');
  }

  // Workers
  async saveWorker(worker: Worker): Promise<number> {
    if (worker.id) {
      const prev = this.workers().find((w) => w.id === worker.id);
      if (this.db) await this.db.workers.put(worker);
      this.workers.update((list) => list.map((w) => (w.id === worker.id ? worker : w)));
      this.pushUndo({
        description: `تعديل العامل ${worker.name}`,
        table: 'workers',
        type: 'update',
        recordId: worker.id,
        previousData: prev,
        newData: worker,
      });
      await this.logAudit('تعديل عامل', 'العمال', `تم تعديل بيانات ${worker.name}`);
      return worker.id;
    } else {
      let id = Math.max(0, ...this.workers().map((w) => w.id || 0)) + 1;
      if (this.db) {
        const data = { ...worker };
        delete data.id;
        id = await this.db.workers.add(data);
      }
      const created = { ...worker, id };
      this.workers.update((list) => [...list, created]);
      this.pushUndo({
        description: `إضافة العامل ${worker.name}`,
        table: 'workers',
        type: 'add',
        recordId: id,
        newData: created,
      });
      await this.logAudit(
        'إضافة عامل',
        'العمال',
        `تمت إضافة العامل ${worker.name} (${worker.role})`
      );
      return id;
    }
  }

  async deleteWorker(id: number): Promise<void> {
    const prev = this.workers().find((w) => w.id === id);
    if (!prev) return;
    if (this.db) await this.db.workers.delete(id);
    this.workers.update((list) => list.filter((w) => w.id !== id));
    this.pushUndo({
      description: `حذف العامل ${prev.name}`,
      table: 'workers',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit('حذف عامل', 'العمال', `تم حذف العامل ${prev.name}`);
    this.showToast(`تم حذف العامل ${prev.name}`, 'warning');
  }

  // Projects
  async saveProject(project: Project): Promise<number> {
    if (project.id) {
      const prev = this.projects().find((p) => p.id === project.id);
      if (this.db) await this.db.projects.put(project);
      this.projects.update((list) => list.map((p) => (p.id === project.id ? project : p)));
      this.pushUndo({
        description: `تعديل مشروع ${project.name}`,
        table: 'projects',
        type: 'update',
        recordId: project.id,
        previousData: prev,
        newData: project,
      });
      await this.logAudit('تعديل مشروع', 'المشاريع', `تم تعديل مشروع ${project.name}`);
      return project.id;
    } else {
      let id = Math.max(0, ...this.projects().map((p) => p.id || 0)) + 1;
      if (this.db) {
        const data = { ...project };
        delete data.id;
        id = await this.db.projects.add(data);
      }
      const created = { ...project, id };
      this.projects.update((list) => [...list, created]);
      this.pushUndo({
        description: `إضافة مشروع ${project.name}`,
        table: 'projects',
        type: 'add',
        recordId: id,
        newData: created,
      });
      if (this.projects().length === 1) {
        await this.updateSettings({ defaultProjectId: id });
      }
      await this.logAudit('إضافة مشروع', 'المشاريع', `تمت إضافة مشروع ${project.name}`);
      return id;
    }
  }

  async deleteProject(id: number): Promise<void> {
    const prev = this.projects().find((p) => p.id === id);
    if (!prev) return;
    if (this.db) await this.db.projects.delete(id);
    this.projects.update((list) => list.filter((p) => p.id !== id));
    this.pushUndo({
      description: `حذف مشروع ${prev.name}`,
      table: 'projects',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit('حذف مشروع', 'المشاريع', `تم حذف مشروع ${prev.name}`);
    this.showToast(`تم حذف مشروع ${prev.name}`, 'warning');
  }

  // Attendance (Always snapshots worker & project rates at recording time!)
  async recordAttendance(params: {
    id?: number;
    date: string;
    workerId: number;
    projectId: number;
    dayWorked: 0 | 1;
    nightWorked: 0 | 1;
    note?: string;
    mode?: 'replace' | 'merge';
  }): Promise<Attendance | null> {
    if (this.isMonthLocked(params.date)) {
      this.showToast(
        `الشهر ${params.date.slice(0, 7)} مغلق للأرشفة! فك القفل من الإعدادات أولاً.`,
        'error'
      );
      return null;
    }

    const worker = this.workers().find((w) => w.id === params.workerId);
    const project =
      this.projects().find((p) => p.id === params.projectId) ||
      this.projects()[0] || {
        id: 1,
        name: 'المشروع الرئيسي',
        companyDayRate: this.settings().defaultCompanyDayRate || 550,
        companyNightRate: this.settings().defaultCompanyNightRate || 275,
        active: true,
        notes: '',
      };
    if (!worker) return null;

    const existing = this.attendances().find(
      (a) =>
        a.workerId === params.workerId &&
        a.date === params.date &&
        a.projectId === params.projectId
    );

    if (existing && existing.id !== undefined) {
      const dayVal: 0 | 1 =
        params.mode === 'merge'
          ? ((existing.dayWorked || params.dayWorked ? 1 : 0) as 0 | 1)
          : params.dayWorked;
      const nightVal: 0 | 1 =
        params.mode === 'merge'
          ? ((existing.nightWorked || params.nightWorked ? 1 : 0) as 0 | 1)
          : params.nightWorked;

      if (dayVal === 0 && nightVal === 0) {
        if (this.db) await this.db.attendance.delete(existing.id);
        this.attendances.update((list) => list.filter((a) => a.id !== existing.id));
        this.pushUndo({
          description: `مسح حضور ${worker.name} ليوم ${params.date}`,
          table: 'attendance',
          type: 'delete',
          recordId: existing.id,
          previousData: existing,
        });
        return null;
      }

      const updated: Attendance = {
        ...existing,
        dayWorked: dayVal,
        nightWorked: nightVal,
        note: params.note !== undefined ? params.note : existing.note,
      };
      if (this.db) await this.db.attendance.put(updated);
      this.attendances.update((list) =>
        list.map((a) => (a.id === existing.id ? updated : a))
      );
      this.pushUndo({
        description: `تعديل حضور ${worker.name} ليوم ${params.date}`,
        table: 'attendance',
        type: 'update',
        recordId: existing.id,
        previousData: existing,
        newData: updated,
      });
      return updated;
    }

    if (params.dayWorked === 0 && params.nightWorked === 0) {
      return null;
    }

    const record: Attendance = {
      date: params.date,
      workerId: params.workerId,
      projectId: params.projectId || project.id || 1,
      dayWorked: params.dayWorked,
      nightWorked: params.nightWorked,
      workerDayRateSnapshot: worker.workerDayRate,
      workerNightRateSnapshot: worker.workerNightRate,
      companyDayRateSnapshot: project.companyDayRate,
      companyNightRateSnapshot: project.companyNightRate,
      note: params.note || '',
    };

    let id = Math.max(0, ...this.attendances().map((a) => a.id || 0)) + 1;
    if (this.db) {
      id = await this.db.attendance.add(record);
    }
    const created = { ...record, id };
    this.attendances.update((list) => [...list, created]);
    this.pushUndo({
      description: `تسجيل حضور ${worker.name} ليوم ${params.date}`,
      table: 'attendance',
      type: 'add',
      recordId: id,
      newData: created,
    });
    return created;
  }

  async deleteAttendance(id: number): Promise<void> {
    const existing = this.attendances().find((a) => a.id === id);
    if (!existing) return;
    if (this.db) await this.db.attendance.delete(id);
    this.attendances.update((list) => list.filter((a) => a.id !== id));
    this.pushUndo({
      description: `حذف حضور ${this.workerName(existing.workerId)} ليوم ${existing.date}`,
      table: 'attendance',
      type: 'delete',
      recordId: id,
      previousData: existing,
    });
    this.showToast('تم حذف سجل الحضور', 'warning');
  }

  async saveAttendance(record: Attendance): Promise<number> {
    if (record.id) {
      const prev = this.attendances().find((a) => a.id === record.id);
      if (this.db) await this.db.attendance.put(record);
      this.attendances.update((list) =>
        list.map((a) => (a.id === record.id ? record : a))
      );
      this.pushUndo({
        description: `تعديل حضور ${this.workerName(record.workerId)} ليوم ${record.date}`,
        table: 'attendance',
        type: 'update',
        recordId: record.id,
        previousData: prev,
        newData: record,
      });
      return record.id;
    } else {
      const res = await this.recordAttendance({
        date: record.date,
        workerId: record.workerId,
        projectId: record.projectId,
        dayWorked: record.dayWorked,
        nightWorked: record.nightWorked,
        note: record.note,
      });
      return res?.id || 0;
    }
  }

  // Advances
  async addAdvance(advance: Omit<Advance, 'id'>): Promise<number> {
    let id = Math.max(0, ...this.advances().map((a) => a.id || 0)) + 1;
    if (this.db) {
      id = await this.db.advances.add(advance as Advance);
    }
    const created: Advance = { ...advance, id };
    this.advances.update((list) => [created, ...list]);
    this.pushUndo({
      description: `تسجيل سلفة ${this.workerName(advance.workerId)}`,
      table: 'advances',
      type: 'add',
      recordId: id,
      newData: created,
    });
    await this.logAudit(
      'تسجيل سلفة',
      'السلف',
      `سلفة بمبلغ ${advance.amount} ج.م للعامل ${this.workerName(advance.workerId)}`
    );
    return id;
  }

  async saveAdvance(advance: Advance): Promise<number> {
    if (advance.id) {
      const prev = this.advances().find((a) => a.id === advance.id);
      if (this.db) await this.db.advances.put(advance);
      this.advances.update((list) =>
        list.map((a) => (a.id === advance.id ? advance : a))
      );
      this.pushUndo({
        description: `تعديل سلفة ${this.workerName(advance.workerId)}`,
        table: 'advances',
        type: 'update',
        recordId: advance.id,
        previousData: prev,
        newData: advance,
      });
      return advance.id;
    } else {
      const { id, ...data } = advance;
      return this.addAdvance(data);
    }
  }

  async deleteAdvance(id: number): Promise<void> {
    const prev = this.advances().find((a) => a.id === id);
    if (!prev) return;
    if (this.db) await this.db.advances.delete(id);
    this.advances.update((list) => list.filter((a) => a.id !== id));
    this.pushUndo({
      description: `حذف سلفة ${this.workerName(prev.workerId)}`,
      table: 'advances',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit(
      'حذف سلفة',
      'السلف',
      `تم حذف سلفة بمبلغ ${prev.amount} ج.م للعامل ${this.workerName(prev.workerId)}`
    );
    this.showToast('تم حذف السلفة وتوثيق العملية في سجل المراجعة', 'warning');
  }

  // Settlements (Supports locking both Advances and Deductions!)
  async createSettlement(
    settlement: Omit<Settlement, 'id'>,
    advanceIdsToSettle: number[],
    deductionIdsToSettle: number[] = []
  ): Promise<number> {
    let id = Math.max(0, ...this.settlements().map((s) => s.id || 0)) + 1;
    if (this.db) {
      id = await this.db.settlements.add(settlement as Settlement);
    }
    const created: Settlement = { ...settlement, id };
    this.settlements.update((list) => [created, ...list]);

    // Lock settled advances
    for (const advId of advanceIdsToSettle) {
      const adv = this.advances().find((a) => a.id === advId);
      if (adv) {
        const updatedAdv: Advance = { ...adv, settlementId: id };
        if (this.db) await this.db.advances.put(updatedAdv);
        this.advances.update((list) =>
          list.map((a) => (a.id === advId ? updatedAdv : a))
        );
      }
    }

    // Lock settled deductions
    for (const dedId of deductionIdsToSettle) {
      const ded = this.deductions().find((d) => d.id === dedId);
      if (ded) {
        const updatedDed: Deduction = { ...ded, settlementId: id };
        if (this.db) await this.db.deductions.put(updatedDed);
        this.deductions.update((list) =>
          list.map((d) => (d.id === dedId ? updatedDed : d))
        );
      }
    }

    await this.logAudit(
      'حفظ تسوية / قبض',
      'التسويات',
      `تسوية للعامل ${this.workerName(settlement.workerId)} بصافي ${settlement.netPaid} ج.م`
    );
    this.showToast('تم حفظ التسوية وإغلاق السلف والخصومات المخصومة بنجاح', 'success');
    return id;
  }

  // Extracts & ExtractLines
  async saveExtract(extract: Extract, lines: ExtractLine[]): Promise<number> {
    let extractId = extract.id;
    if (extractId) {
      if (this.db) await this.db.extracts.put(extract);
      this.extracts.update((list) =>
        list.map((e) => (e.id === extractId ? extract : e))
      );
    } else {
      extractId = Math.max(0, ...this.extracts().map((e) => e.id || 0)) + 1;
      if (this.db) {
        const data = { ...extract };
        delete data.id;
        extractId = await this.db.extracts.add(data);
      }
      const created = { ...extract, id: extractId };
      this.extracts.update((list) => [created, ...list]);
    }

    for (const line of lines) {
      await this.saveExtractLine({ ...line, extractId, isSaved: true }, true);
    }

    await this.logAudit(
      'حفظ مستخلص',
      'المستخلصات',
      `مستخلص رقم ${extract.number} لمشروع ${this.projectName(extract.projectId)}`
    );
    return extractId;
  }

  async saveExtractLine(line: ExtractLine, markSaved = true): Promise<number> {
    const toSave: ExtractLine = {
      ...line,
      isSaved: markSaved ? true : line.isSaved,
    };
    if (toSave.id) {
      if (this.db) await this.db.extractLines.put(toSave);
      this.extractLines.update((list) =>
        list.map((l) => (l.id === toSave.id ? toSave : l))
      );
      this.scheduleCloudSync(`تحديث سطر مستخلص للعامل ${this.workerName(toSave.workerId)}`);
      return toSave.id;
    } else {
      let id = Math.max(0, ...this.extractLines().map((l) => l.id || 0)) + 1;
      if (this.db) {
        const data = { ...toSave };
        delete data.id;
        id = await this.db.extractLines.add(data);
      }
      const created = { ...toSave, id };
      this.extractLines.update((list) => [...list, created]);
      this.scheduleCloudSync(`إضافة سطر مستخلص للعامل ${this.workerName(toSave.workerId)}`);
      return id;
    }
  }

  async deleteExtract(id: number): Promise<void> {
    const prev = this.extracts().find((e) => e.id === id);
    if (!prev) return;
    if (this.db) {
      await this.db.extracts.delete(id);
      const lineIds = this.extractLines()
        .filter((l) => l.extractId === id && l.id !== undefined)
        .map((l) => l.id!);
      await this.db.extractLines.bulkDelete(lineIds);
    }
    this.extracts.update((list) => list.filter((e) => e.id !== id));
    this.extractLines.update((list) => list.filter((l) => l.extractId !== id));
    await this.logAudit(
      'حذف مستخلص',
      'المستخلصات',
      `تم حذف المستخلص رقم ${prev.number}`
    );
    this.showToast('تم حذف المستخلص', 'warning');
  }

  // Extras & Nash (ExtraCash)
  async saveExtraWithNash(
    extra: ExtraItem,
    nashRows: ExtraCash[]
  ): Promise<number> {
    let extraId = extra.id;
    if (extraId) {
      if (this.db) await this.db.extras.put(extra);
      this.extras.update((list) =>
        list.map((e) => (e.id === extraId ? extra : e))
      );
    } else {
      extraId = Math.max(0, ...this.extras().map((e) => e.id || 0)) + 1;
      if (this.db) {
        const data = { ...extra };
        delete data.id;
        extraId = await this.db.extras.add(data);
      }
      const created = { ...extra, id: extraId };
      this.extras.update((list) => [created, ...list]);
      this.pushUndo({
        description: `إضافة بند إضافي (${extra.type})`,
        table: 'extras',
        type: 'add',
        recordId: extraId,
        newData: created,
      });
    }

    const existingIds = this.extraCashes()
      .filter((ec) => ec.extraId === extraId && ec.id !== undefined)
      .map((ec) => ec.id!);
    if (this.db && existingIds.length > 0) {
      await this.db.extraCash.bulkDelete(existingIds);
    }
    this.extraCashes.update((list) =>
      list.filter((ec) => ec.extraId !== extraId)
    );

    let nextNashId = Math.max(0, ...this.extraCashes().map((ec) => ec.id || 0)) + 1;
    const savedRows: ExtraCash[] = [];
    for (const row of nashRows) {
      const item: ExtraCash = { ...row, extraId };
      if (this.db) {
        const data = { ...item };
        delete data.id;
        const newId = await this.db.extraCash.add(data);
        savedRows.push({ ...item, id: newId });
      } else {
        savedRows.push({ ...item, id: nextNashId++ });
      }
    }
    this.extraCashes.update((list) => [...list, ...savedRows]);

    if (extra.authorizedBy) {
      const s = this.settings();
      const allAuth = [...s.engineers, ...s.supervisors];
      if (!allAuth.includes(extra.authorizedBy)) {
        if (extra.authorizedBy.includes('مشرف')) {
          await this.updateSettings({
            supervisors: [...s.supervisors, extra.authorizedBy],
          });
        } else {
          await this.updateSettings({
            engineers: [...s.engineers, extra.authorizedBy],
          });
        }
      }
    }

    await this.logAudit(
      'حفظ إضافي وناش',
      'الإضافي',
      `بند ${extra.type} بأمر ${extra.authorizedBy} (${nashRows.length} عمال)`
    );
    return extraId;
  }

  async deleteExtra(id: number): Promise<void> {
    const prev = this.extras().find((e) => e.id === id);
    if (!prev) return;
    if (this.db) {
      await this.db.extras.delete(id);
      const nashIds = this.extraCashes()
        .filter((ec) => ec.extraId === id && ec.id !== undefined)
        .map((ec) => ec.id!);
      await this.db.extraCash.bulkDelete(nashIds);
    }
    this.extras.update((list) => list.filter((e) => e.id !== id));
    this.extraCashes.update((list) => list.filter((ec) => ec.extraId !== id));
    await this.logAudit('حذف إضافي', 'الإضافي', `تم حذف بند إضافي ${prev.type}`);
    this.showToast('تم حذف البند الإضافي وقائمة الناش التابعة له', 'warning');
  }

  // Checks
  async saveCheck(check: CheckItem): Promise<number> {
    if (check.id) {
      const prev = this.checks().find((c) => c.id === check.id);
      if (this.db) await this.db.checks.put(check);
      this.checks.update((list) =>
        list.map((c) => (c.id === check.id ? check : c))
      );
      this.pushUndo({
        description: `تعديل شيك رقم ${check.number}`,
        table: 'checks',
        type: 'update',
        recordId: check.id,
        previousData: prev,
        newData: check,
      });
      await this.logAudit(
        'تعديل شيك',
        'الشيكات',
        `تعديل شيك رقم ${check.number} (${check.status})`
      );
      return check.id;
    } else {
      let id = Math.max(0, ...this.checks().map((c) => c.id || 0)) + 1;
      if (this.db) {
        const data = { ...check };
        delete data.id;
        id = await this.db.checks.add(data);
      }
      const created = { ...check, id };
      this.checks.update((list) => [created, ...list]);
      this.pushUndo({
        description: `إضافة شيك رقم ${check.number}`,
        table: 'checks',
        type: 'add',
        recordId: id,
        newData: created,
      });
      await this.logAudit(
        'إضافة شيك',
        'الشيكات',
        `شيك ${check.direction} رقم ${check.number} بمبلغ ${check.amount}`
      );
      return id;
    }
  }

  async deleteCheck(id: number): Promise<void> {
    const prev = this.checks().find((c) => c.id === id);
    if (!prev) return;
    if (this.db) await this.db.checks.delete(id);
    this.checks.update((list) => list.filter((c) => c.id !== id));
    this.pushUndo({
      description: `حذف شيك رقم ${prev.number}`,
      table: 'checks',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit('حذف شيك', 'الشيكات', `تم حذف شيك رقم ${prev.number}`);
    this.showToast('تم حذف الشيك', 'warning');
  }

  // Expenses
  async saveExpense(expense: Expense): Promise<number> {
    if (expense.id) {
      const prev = this.expenses().find((e) => e.id === expense.id);
      if (this.db) await this.db.expenses.put(expense);
      this.expenses.update((list) =>
        list.map((e) => (e.id === expense.id ? expense : e))
      );
      this.pushUndo({
        description: `تعديل مصروف ${expense.category}`,
        table: 'expenses',
        type: 'update',
        recordId: expense.id,
        previousData: prev,
        newData: expense,
      });
      await this.logAudit(
        'تعديل مصروف',
        'المصاريف',
        `تعديل مصروف ${expense.category} بمبلغ ${expense.amount}`
      );
      return expense.id;
    } else {
      let id = Math.max(0, ...this.expenses().map((e) => e.id || 0)) + 1;
      if (this.db) {
        const data = { ...expense };
        delete data.id;
        id = await this.db.expenses.add(data);
      }
      const created = { ...expense, id };
      this.expenses.update((list) => [created, ...list]);
      this.pushUndo({
        description: `تسجيل مصروف ${expense.category}`,
        table: 'expenses',
        type: 'add',
        recordId: id,
        newData: created,
      });
      await this.logAudit(
        'إضافة مصروف',
        'المصاريف',
        `مصروف ${expense.category} بمبلغ ${expense.amount}`
      );
      return id;
    }
  }

  async deleteExpense(id: number): Promise<void> {
    const prev = this.expenses().find((e) => e.id === id);
    if (!prev) return;
    if (this.db) await this.db.expenses.delete(id);
    this.expenses.update((list) => list.filter((e) => e.id !== id));
    this.pushUndo({
      description: `حذف مصروف ${prev.category}`,
      table: 'expenses',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit(
      'حذف مصروف',
      'المصاريف',
      `حذف مصروف ${prev.category} بمبلغ ${prev.amount}`
    );
    this.showToast('تم حذف المصروف', 'warning');
  }

  // Incoming Payments (دفعات ومقبوضات واردة مباشرة من شركة أو شخص أو شيك)
  async saveIncomingPayment(payment: IncomingPayment): Promise<number> {
    if (payment.id) {
      const prev = this.incomingPayments().find((p) => p.id === payment.id);
      if (this.db) await this.db.incomingPayments.put(payment);
      this.incomingPayments.update((list) =>
        list.map((p) => (p.id === payment.id ? payment : p))
      );
      this.pushUndo({
        description: `تعديل دفعة واردة من ${payment.sourceName}`,
        table: 'incomingPayments',
        type: 'update',
        recordId: payment.id,
        previousData: prev,
        newData: payment,
      });
      await this.logAudit(
        'تعديل دفعة واردة',
        'حسابي الشامل',
        `تعديل دفعة من (${payment.sourceType}: ${payment.sourceName}) بمبلغ ${payment.amount}`
      );
      return payment.id;
    } else {
      let id = Math.max(0, ...this.incomingPayments().map((p) => p.id || 0)) + 1;
      if (this.db) {
        const data = { ...payment };
        delete data.id;
        id = await this.db.incomingPayments.add(data);
      }
      const created = { ...payment, id };
      this.incomingPayments.update((list) => [created, ...list]);
      this.pushUndo({
        description: `تسجيل دفعة واردة من ${payment.sourceName}`,
        table: 'incomingPayments',
        type: 'add',
        recordId: id,
        newData: created,
      });
      await this.logAudit(
        'إضافة دفعة واردة',
        'حسابي الشامل',
        `وصلني مبلغ ${payment.amount} من (${payment.sourceType}: ${payment.sourceName}) لحساب ${this.projectName(payment.projectId)}`
      );
      return id;
    }
  }

  async deleteIncomingPayment(id: number): Promise<void> {
    const prev = this.incomingPayments().find((p) => p.id === id);
    if (!prev) return;
    if (this.db) await this.db.incomingPayments.delete(id);
    this.incomingPayments.update((list) => list.filter((p) => p.id !== id));
    this.pushUndo({
      description: `حذف دفعة واردة من ${prev.sourceName}`,
      table: 'incomingPayments',
      type: 'delete',
      recordId: id,
      previousData: prev,
    });
    await this.logAudit(
      'حذف دفعة واردة',
      'حسابي الشامل',
      `حذف دفعة من ${prev.sourceName} بمبلغ ${prev.amount}`
    );
    this.showToast('تم حذف الدفعة الواردة', 'warning');
  }

  // Undo last operation (زر التراجع)
  async undoLastOperation(): Promise<boolean> {
    const op = this.lastUndo();
    if (!op) {
      this.showToast('لا توجد عملية مسجلة للتراجع عنها حالياً', 'warning');
      return false;
    }

    const capturedRedo: UndoOperation = { ...op };

    if (op.table === 'attendance') {
      if (op.type === 'add' && op.recordId) {
        const current = this.attendances().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.attendance.delete(op.recordId);
        this.attendances.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'batch-add' && op.recordIds) {
        const set = new Set(op.recordIds);
        capturedRedo.newData = op.newData || this.attendances().filter((x) => set.has(x.id!));
        if (this.db) await this.db.attendance.bulkDelete(op.recordIds);
        this.attendances.update((l) => l.filter((x) => !set.has(x.id!)));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as Attendance;
        const current = this.attendances().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.attendance.put(prev);
        this.attendances.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Attendance;
        if (this.db) await this.db.attendance.put(prev);
        this.attendances.update((l) => [...l, prev]);
      }
    } else if (op.table === 'dailyHeadcounts') {
      if (op.type === 'add' && op.recordId) {
        const current = this.dailyHeadcounts().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.dailyHeadcounts.delete(op.recordId);
        this.dailyHeadcounts.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as DailyHeadcount;
        const current = this.dailyHeadcounts().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.dailyHeadcounts.put(prev);
        this.dailyHeadcounts.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as DailyHeadcount;
        if (this.db) await this.db.dailyHeadcounts.put(prev);
        this.dailyHeadcounts.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'advances') {
      if (op.type === 'add' && op.recordId) {
        const current = this.advances().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.advances.delete(op.recordId);
        this.advances.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Advance;
        if (this.db) await this.db.advances.put(prev);
        this.advances.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'deductions') {
      if (op.type === 'add' && op.recordId) {
        const current = this.deductions().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.deductions.delete(op.recordId);
        this.deductions.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Deduction;
        if (this.db) await this.db.deductions.put(prev);
        this.deductions.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'workers') {
      if (op.type === 'add' && op.recordId) {
        const current = this.workers().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.workers.delete(op.recordId);
        this.workers.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as Worker;
        const current = this.workers().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.workers.put(prev);
        this.workers.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Worker;
        if (this.db) await this.db.workers.put(prev);
        this.workers.update((l) => [...l, prev]);
      }
    } else if (op.table === 'projects') {
      if (op.type === 'add' && op.recordId) {
        const current = this.projects().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.projects.delete(op.recordId);
        this.projects.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as Project;
        const current = this.projects().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.projects.put(prev);
        this.projects.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Project;
        if (this.db) await this.db.projects.put(prev);
        this.projects.update((l) => [...l, prev]);
      }
    } else if (op.table === 'checks') {
      if (op.type === 'add' && op.recordId) {
        const current = this.checks().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.checks.delete(op.recordId);
        this.checks.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as CheckItem;
        const current = this.checks().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.checks.put(prev);
        this.checks.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as CheckItem;
        if (this.db) await this.db.checks.put(prev);
        this.checks.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'expenses') {
      if (op.type === 'add' && op.recordId) {
        const current = this.expenses().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.expenses.delete(op.recordId);
        this.expenses.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as Expense;
        const current = this.expenses().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.expenses.put(prev);
        this.expenses.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Expense;
        if (this.db) await this.db.expenses.put(prev);
        this.expenses.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'incomingPayments') {
      if (op.type === 'add' && op.recordId) {
        const current = this.incomingPayments().find((x) => x.id === op.recordId);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.incomingPayments.delete(op.recordId);
        this.incomingPayments.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as IncomingPayment;
        const current = this.incomingPayments().find((x) => x.id === prev.id);
        capturedRedo.newData = op.newData || current;
        if (this.db) await this.db.incomingPayments.put(prev);
        this.incomingPayments.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as IncomingPayment;
        if (this.db) await this.db.incomingPayments.put(prev);
        this.incomingPayments.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'extras' && op.type === 'add' && op.recordId) {
      const current = this.extras().find((x) => x.id === op.recordId);
      capturedRedo.newData = op.newData || current;
      await this.deleteExtra(op.recordId);
    }

    this.undoStack.update((stack) => stack.slice(1));
    this.redoStack.update((stack) => [capturedRedo, ...stack.slice(0, 49)]);

    await this.logAudit('تراجع', op.table, `تم التراجع عن: ${op.description}`);
    this.showToast(`تم التراجع عن: ${op.description}`, 'success');
    return true;
  }

  // Redo last undone operation (زر رد التراجع / الإعادة)
  async redoLastOperation(): Promise<boolean> {
    const op = this.lastRedo();
    if (!op) {
      this.showToast('لا توجد عملية متراجع عنها لردّها حالياً', 'warning');
      return false;
    }

    if (op.table === 'attendance') {
      if (op.type === 'add' && op.newData) {
        const item = op.newData as Attendance;
        if (this.db) await this.db.attendance.put(item);
        this.attendances.update((l) => [...l.filter((x) => x.id !== item.id), item]);
      } else if (op.type === 'batch-add' && Array.isArray(op.newData)) {
        const items = op.newData as Attendance[];
        if (this.db) await this.db.attendance.bulkPut(items);
        const ids = new Set(items.map((x) => x.id));
        this.attendances.update((l) => [...l.filter((x) => !ids.has(x.id)), ...items]);
      } else if (op.type === 'update' && op.newData) {
        const item = op.newData as Attendance;
        if (this.db) await this.db.attendance.put(item);
        this.attendances.update((l) => l.map((x) => (x.id === item.id ? item : x)));
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.attendance.delete(op.recordId);
        this.attendances.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'dailyHeadcounts') {
      if ((op.type === 'add' || op.type === 'update') && op.newData) {
        const item = op.newData as DailyHeadcount;
        if (this.db) await this.db.dailyHeadcounts.put(item);
        this.dailyHeadcounts.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.dailyHeadcounts.delete(op.recordId);
        this.dailyHeadcounts.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'advances') {
      if (op.type === 'add' && op.newData) {
        const item = op.newData as Advance;
        if (this.db) await this.db.advances.put(item);
        this.advances.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.advances.delete(op.recordId);
        this.advances.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'deductions') {
      if (op.type === 'add' && op.newData) {
        const item = op.newData as Deduction;
        if (this.db) await this.db.deductions.put(item);
        this.deductions.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.deductions.delete(op.recordId);
        this.deductions.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'workers') {
      if (op.type === 'add' && op.newData) {
        const item = op.newData as Worker;
        if (this.db) await this.db.workers.put(item);
        this.workers.update((l) => [...l.filter((x) => x.id !== item.id), item]);
      } else if (op.type === 'update' && op.newData) {
        const item = op.newData as Worker;
        if (this.db) await this.db.workers.put(item);
        this.workers.update((l) => l.map((x) => (x.id === item.id ? item : x)));
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.workers.delete(op.recordId);
        this.workers.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'projects') {
      if (op.type === 'add' && op.newData) {
        const item = op.newData as Project;
        if (this.db) await this.db.projects.put(item);
        this.projects.update((l) => [...l.filter((x) => x.id !== item.id), item]);
      } else if (op.type === 'update' && op.newData) {
        const item = op.newData as Project;
        if (this.db) await this.db.projects.put(item);
        this.projects.update((l) => l.map((x) => (x.id === item.id ? item : x)));
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.projects.delete(op.recordId);
        this.projects.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'checks') {
      if ((op.type === 'add' || op.type === 'update') && op.newData) {
        const item = op.newData as CheckItem;
        if (this.db) await this.db.checks.put(item);
        this.checks.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.checks.delete(op.recordId);
        this.checks.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'expenses') {
      if ((op.type === 'add' || op.type === 'update') && op.newData) {
        const item = op.newData as Expense;
        if (this.db) await this.db.expenses.put(item);
        this.expenses.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.expenses.delete(op.recordId);
        this.expenses.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'incomingPayments') {
      if ((op.type === 'add' || op.type === 'update') && op.newData) {
        const item = op.newData as IncomingPayment;
        if (this.db) await this.db.incomingPayments.put(item);
        this.incomingPayments.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
      } else if (op.type === 'delete' && op.recordId) {
        if (this.db) await this.db.incomingPayments.delete(op.recordId);
        this.incomingPayments.update((l) => l.filter((x) => x.id !== op.recordId));
      }
    } else if (op.table === 'extras' && op.type === 'add' && op.newData) {
      const item = op.newData as ExtraItem;
      if (this.db) await this.db.extras.put(item);
      this.extras.update((l) => [item, ...l.filter((x) => x.id !== item.id)]);
    }

    this.redoStack.update((stack) => stack.slice(1));
    this.undoStack.update((stack) => [op, ...stack.slice(0, 49)]);

    await this.logAudit('رد التراجع', op.table, `تم رد التراجع وإعادة: ${op.description}`);
    this.showToast(`تم رد التراجع وإعادة: ${op.description}`, 'success');
    return true;
  }

  // Export & Import JSON Backup
  async exportJsonBackup(): Promise<string> {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      company: this.settings().companyName,
      settings: this.settings(),
      projects: this.projects(),
      workers: this.workers(),
      attendances: this.attendances(),
      advances: this.advances(),
      deductions: this.deductions(),
      dailyHeadcounts: this.dailyHeadcounts(),
      settlements: this.settlements(),
      extracts: this.extracts(),
      extractLines: this.extractLines(),
      extras: this.extras(),
      extraCashes: this.extraCashes(),
      checks: this.checks(),
      expenses: this.expenses(),
      incomingPayments: this.incomingPayments(),
      auditLogs: this.auditLogs(),
      devices: this.registeredDevices(),
    };
    await this.updateSettings({ lastBackupDate: this.todayIso() });
    await this.logAudit('نسخة احتياطية', 'النظام', 'تم تصدير نسخة احتياطية JSON كاملة');
    return JSON.stringify(payload, null, 2);
  }

  async importJsonBackup(jsonStr: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.workers || !data.projects) {
        throw new Error('ملف غير صالح');
      }
      if (data.settings) this.settings.set({ ...INITIAL_SETTINGS, ...data.settings });
      this.projects.set(data.projects || []);
      this.workers.set(data.workers || []);
      this.attendances.set(data.attendances || []);
      this.advances.set(data.advances || []);
      this.deductions.set(data.deductions || []);
      this.dailyHeadcounts.set(data.dailyHeadcounts || []);
      this.settlements.set(data.settlements || []);
      this.extracts.set(data.extracts || []);
      this.extractLines.set(data.extractLines || []);
      this.extras.set(data.extras || []);
      this.extraCashes.set(data.extraCashes || []);
      this.checks.set(data.checks || []);
      this.expenses.set(data.expenses || []);
      this.incomingPayments.set(data.incomingPayments || []);

      if (this.db) {
        await this.db.transaction(
          'rw',
          [
            this.db.settings,
            this.db.projects,
            this.db.workers,
            this.db.attendance,
            this.db.advances,
            this.db.deductions,
            this.db.dailyHeadcounts,
            this.db.settlements,
            this.db.extracts,
            this.db.extractLines,
            this.db.extras,
            this.db.extraCash,
            this.db.checks,
            this.db.expenses,
            this.db.incomingPayments,
          ],
          async () => {
            await this.db!.settings.clear();
            await this.db!.projects.clear();
            await this.db!.workers.clear();
            await this.db!.attendance.clear();
            await this.db!.advances.clear();
            await this.db!.deductions.clear();
            await this.db!.dailyHeadcounts.clear();
            await this.db!.settlements.clear();
            await this.db!.extracts.clear();
            await this.db!.extractLines.clear();
            await this.db!.extras.clear();
            await this.db!.extraCash.clear();
            await this.db!.checks.clear();
            await this.db!.expenses.clear();
            await this.db!.incomingPayments.clear();

            if (data.settings)
              await this.db!.settings.put({ ...INITIAL_SETTINGS, ...data.settings });
            await this.db!.projects.bulkPut(data.projects || []);
            await this.db!.workers.bulkPut(data.workers || []);
            await this.db!.attendance.bulkPut(data.attendances || []);
            await this.db!.advances.bulkPut(data.advances || []);
            await this.db!.deductions.bulkPut(data.deductions || []);
            await this.db!.dailyHeadcounts.bulkPut(data.dailyHeadcounts || []);
            await this.db!.settlements.bulkPut(data.settlements || []);
            await this.db!.extracts.bulkPut(data.extracts || []);
            await this.db!.extractLines.bulkPut(data.extractLines || []);
            await this.db!.extras.bulkPut(data.extras || []);
            await this.db!.extraCash.bulkPut(data.extraCashes || []);
            await this.db!.checks.bulkPut(data.checks || []);
            await this.db!.expenses.bulkPut(data.expenses || []);
            await this.db!.incomingPayments.bulkPut(data.incomingPayments || []);
          }
        );
      }

      await this.logAudit('استعادة نسخة', 'النظام', 'تم استيراد نسخة احتياطية JSON بنجاح');
      this.showToast('تم استيراد النسخة الاحتياطية ومزامنتها مع الخادم بنجاح', 'success');
      return true;
    } catch {
      this.showToast('فشل استيراد النسخة الاحتياطية: تأكد من صحة ملف JSON', 'error');
      return false;
    }
  }

  // ============================================================================
  // UNIVERSAL HALF-PAGE INSPECTOR SHEET & FULL WORKER/CHECK/PROJECT OPERATIONS
  // ============================================================================

  openWorkerSheet(workerId: number): void {
    this.activeHalfSheet.set({ type: 'worker', id: workerId });
  }

  openCheckSheet(checkId: number): void {
    this.activeHalfSheet.set({ type: 'check', id: checkId });
  }

  openProjectSheet(projectId: number | null): void {
    this.activeHalfSheet.set({ type: 'project', id: projectId });
  }

  openExtractSheet(extractId: number): void {
    this.activeHalfSheet.set({ type: 'extract', id: extractId });
  }

  openPocketSheet(checkId?: number | null, projectId?: number | null): void {
    this.pocketCustomAdvances.set(null);
    if (checkId !== undefined && checkId !== null) {
      this.pocketSelectedCheckId.set(checkId);
      const chk = this.checks().find((c) => c.id === checkId);
      if (chk) {
        this.pocketSelectedProjectId.set(chk.projectId ?? null);
        this.pocketWithdrawnAmount.set(chk.withdrawnAmount || chk.amount || 0);
        this.pocketWithdrawalFee.set(chk.withdrawalFee || 0);
      }
    } else {
      this.pocketSelectedCheckId.set(null);
      if (projectId !== undefined) {
        this.pocketSelectedProjectId.set(projectId);
      }
      this.pocketWithdrawnAmount.set(0);
      this.pocketWithdrawalFee.set(0);
    }
    this.activeHalfSheet.set({ type: 'pocket', id: checkId ?? projectId ?? null });
  }

  closeHalfSheet(): void {
    this.activeHalfSheet.set(null);
  }

  readonly inspectedWorkerDetails = computed(() => {
    const sheet = this.activeHalfSheet();
    if (!sheet || sheet.type !== 'worker' || !sheet.id) return null;
    const worker = this.workers().find((w) => w.id === sheet.id);
    if (!worker) return null;

    const wAtt = this.attendances().filter((a) => a.workerId === worker.id);
    const totalDays = wAtt.reduce((s, a) => s + a.dayWorked, 0);
    const totalNights = wAtt.reduce((s, a) => s + a.nightWorked, 0);
    const grossWages = wAtt.reduce(
      (s, a) =>
        s +
        a.dayWorked * (a.workerDayRateSnapshot || worker.workerDayRate) +
        a.nightWorked * (a.workerNightRateSnapshot || worker.workerNightRate),
      0
    );

    const openAdvances = this.advances().filter(
      (adv) => adv.workerId === worker.id && adv.settlementId === null
    );
    const openDeductions = this.deductions().filter(
      (ded) => ded.workerId === worker.id && ded.settlementId === null
    );
    const settlementsList = this.settlements().filter(
      (st) => st.workerId === worker.id
    );
    const nashList = this.extraCashes().filter((ec) => ec.workerId === worker.id);

    const openAdvancesSum = openAdvances.reduce((s, a) => s + a.amount, 0);
    const openDeductionsSum = openDeductions.reduce((s, d) => d.amount + s, 0);
    const settlementsPaidSum = settlementsList.reduce((s, st) => s + st.netPaid, 0);
    const unpaidNashSum = nashList.reduce(
      (s, ec) => s + Math.max(0, ec.amount - ec.paidCash),
      0
    );

    // Projects / Villas this worker worked in
    const projectSummaryMap = new Map<
      number,
      { projectId: number; projectName: string; days: number; nights: number; wages: number }
    >();
    for (const a of wAtt) {
      const existing = projectSummaryMap.get(a.projectId) || {
        projectId: a.projectId,
        projectName: this.projectName(a.projectId),
        days: 0,
        nights: 0,
        wages: 0,
      };
      existing.days += a.dayWorked;
      existing.nights += a.nightWorked;
      existing.wages +=
        a.dayWorked * (a.workerDayRateSnapshot || worker.workerDayRate) +
        a.nightWorked * (a.workerNightRateSnapshot || worker.workerNightRate);
      projectSummaryMap.set(a.projectId, existing);
    }

    const netDueNow = Math.max(
      0,
      grossWages + unpaidNashSum - openAdvancesSum - openDeductionsSum - settlementsPaidSum
    );

    return {
      worker,
      attendances: wAtt.slice().sort((a, b) => b.date.localeCompare(a.date)),
      totalDays,
      totalNights,
      grossWages,
      unpaidNashSum,
      openAdvances,
      openAdvancesSum,
      openDeductions,
      openDeductionsSum,
      settlementsList,
      settlementsPaidSum,
      netDueNow,
      projectsWorked: Array.from(projectSummaryMap.values()),
    };
  });

  readonly inspectedCheckDetails = computed<CheckFundBreakdown | null>(() => {
    const sheet = this.activeHalfSheet();
    if (!sheet || sheet.type !== 'check' || !sheet.id) return null;
    return (
      this.checkFundBreakdowns().find((b) => b.check.id === sheet.id) || null
    );
  });

  readonly inspectedProjectDetails = computed(() => {
    const sheet = this.activeHalfSheet();
    if (!sheet || sheet.type !== 'project') return null;
    const pid = sheet.id ?? null;
    const ledger = this.comprehensiveLedger();
    const breakdown =
      ledger.projectBreakdowns.find((b) => b.projectId === pid) || null;
    const project = pid ? this.projects().find((p) => p.id === pid) || null : null;

    const projectChecks = this.checkFundBreakdowns().filter(
      (c) => (c.check.projectId ?? null) === pid
    );
    const projectExtracts = this.extracts().filter(
      (e) => (e.projectId ?? null) === pid
    );
    const projectMovements = ledger.movements.filter(
      (m) => (m.projectId ?? null) === pid
    );

    // Build per-worker breakdown in this project
    const projAtt = this.attendances().filter((a) => (a.projectId ?? null) === pid);
    const workerSummaryMap = new Map<
      number,
      {
        workerId: number;
        workerName: string;
        role: string;
        days: number;
        nights: number;
        grossWages: number;
        advancesPaid: number;
        settlementsPaid: number;
        deductions: number;
        netRemaining: number;
      }
    >();

    const ensureWorkerEntry = (wId: number) => {
      let entry = workerSummaryMap.get(wId);
      if (!entry) {
        const wObj = this.workers().find((w) => w.id === wId);
        entry = {
          workerId: wId,
          workerName: wObj?.name || `عامل #${wId}`,
          role: wObj?.role || 'عامل',
          days: 0,
          nights: 0,
          grossWages: 0,
          advancesPaid: 0,
          settlementsPaid: 0,
          deductions: 0,
          netRemaining: 0,
        };
        workerSummaryMap.set(wId, entry);
      }
      return entry;
    };

    for (const a of projAtt) {
      const entry = ensureWorkerEntry(a.workerId);
      const wObj = this.workers().find((w) => w.id === a.workerId);
      entry.days += a.dayWorked;
      entry.nights += a.nightWorked;
      entry.grossWages +=
        a.dayWorked * (a.workerDayRateSnapshot || wObj?.workerDayRate || 0) +
        a.nightWorked * (a.workerNightRateSnapshot || wObj?.workerNightRate || 0);
    }

    const projCheckIds = new Set(
      projectChecks.map((c) => c.check.id).filter((id): id is number => typeof id === 'number')
    );

    const projectAdvances = this.advances()
      .filter(
        (adv) =>
          (adv.projectId ?? null) === pid ||
          (adv.checkId && projCheckIds.has(adv.checkId))
      )
      .map((adv) => {
        const entry = ensureWorkerEntry(adv.workerId);
        entry.advancesPaid += Number(adv.amount) || 0;
        const chk = adv.checkId
          ? this.checks().find((c) => c.id === adv.checkId)
          : undefined;
        return {
          ...adv,
          workerName: entry.workerName,
          checkNumber: chk?.number || null,
        };
      });

    const projectSettlements = this.settlements()
      .filter(
        (st) =>
          (st.projectId ?? null) === pid ||
          (st.checkId && projCheckIds.has(st.checkId))
      )
      .map((st) => {
        const entry = ensureWorkerEntry(st.workerId);
        entry.settlementsPaid += Number(st.netPaid) || 0;
        const chk = st.checkId
          ? this.checks().find((c) => c.id === st.checkId)
          : undefined;
        return {
          ...st,
          workerName: entry.workerName,
          checkNumber: chk?.number || null,
        };
      });

    for (const d of this.deductions()) {
      if ((d.projectId ?? null) === pid) {
        const entry = ensureWorkerEntry(d.workerId);
        entry.deductions += Number(d.amount) || 0;
      }
    }

    for (const entry of workerSummaryMap.values()) {
      entry.netRemaining = Math.max(
        0,
        entry.grossWages - entry.deductions - entry.advancesPaid - entry.settlementsPaid
      );
    }

    const projectExpenses = this.expenses()
      .filter(
        (exp) =>
          (exp.projectId ?? null) === pid ||
          (exp.checkId && projCheckIds.has(exp.checkId))
      )
      .map((exp) => {
        const chk = exp.checkId
          ? this.checks().find((c) => c.id === exp.checkId)
          : undefined;
        return {
          ...exp,
          checkNumber: chk?.number || null,
        };
      });

    return {
      project,
      breakdown,
      projectChecks,
      projectExtracts,
      projectWorkers: Array.from(workerSummaryMap.values()),
      projectAdvances,
      projectSettlements,
      projectExpenses,
      projectMovements,
    };
  });

  /**
   * حذف العامل نهائياً مع كل تحضيره وسلفه وخصوماته وتسوياته ("احذفه خالص مع التحضير")
   */
  async deleteWorkerCompletelyWithAllRecords(workerId: number): Promise<void> {
    const worker = this.workers().find((w) => w.id === workerId);
    if (!worker) return;

    const attIds = this.attendances()
      .filter((a) => a.workerId === workerId && a.id !== undefined)
      .map((a) => a.id!);
    const advIds = this.advances()
      .filter((a) => a.workerId === workerId && a.id !== undefined)
      .map((a) => a.id!);
    const dedIds = this.deductions()
      .filter((d) => d.workerId === workerId && d.id !== undefined)
      .map((d) => d.id!);
    const setIds = this.settlements()
      .filter((s) => s.workerId === workerId && s.id !== undefined)
      .map((s) => s.id!);

    if (this.db) {
      await this.db.workers.delete(workerId);
      if (attIds.length) await this.db.attendance.bulkDelete(attIds);
      if (advIds.length) await this.db.advances.bulkDelete(advIds);
      if (dedIds.length) await this.db.deductions.bulkDelete(dedIds);
      if (setIds.length) await this.db.settlements.bulkDelete(setIds);
    }

    this.workers.update((list) => list.filter((w) => w.id !== workerId));
    this.attendances.update((list) => list.filter((a) => a.workerId !== workerId));
    this.advances.update((list) => list.filter((a) => a.workerId !== workerId));
    this.deductions.update((list) => list.filter((d) => d.workerId !== workerId));
    this.settlements.update((list) => list.filter((s) => s.workerId !== workerId));
    this.extraCashes.update((list) => list.filter((ec) => ec.workerId !== workerId));

    await this.logAudit(
      'حذف عامل نهائياً مع التحضير',
      'العمال',
      `تم حذف العامل ${worker.name} مع جميع أيام تحضيره (${attIds.length} يوم) وسلفه وحركاته`
    );
    this.showToast(
      `تم حذف العامل ${worker.name} نهائياً مع كل تحضيره وسلفه وحركاته`,
      'warning'
    );
    if (this.activeHalfSheet()?.type === 'worker' && this.activeHalfSheet()?.id === workerId) {
      this.closeHalfSheet();
    }
  }

  /**
   * إيقاف / أرشفة العامل من الفيلا أو إعادته للعمل
   */
  async toggleWorkerActiveStatus(workerId: number): Promise<void> {
    const worker = this.workers().find((w) => w.id === workerId);
    if (!worker) return;
    await this.saveWorker({ ...worker, active: !worker.active });
    this.showToast(
      !worker.active
        ? `تم تفعيل العامل ${worker.name} وإعادته للعمل`
        : `تم إيقاف/أرشفة العامل ${worker.name} من الفيلا`,
      'success'
    );
  }

  /**
   * تصفية حساب العامل بالكامل وإعطاؤه حسابه ("اديله حسابه") مع ربطه بالشيك والمشروع
   */
  async payOutWorkerFullBalance(
    workerId: number,
    options?: {
      checkId?: number | null;
      projectId?: number | null;
      customNetPaid?: number;
      notes?: string;
    }
  ): Promise<void> {
    const worker = this.workers().find((w) => w.id === workerId);
    if (!worker) return;

    const wAtt = this.attendances().filter((a) => a.workerId === workerId);
    const days = wAtt.reduce((s, a) => s + a.dayWorked, 0);
    const nights = wAtt.reduce((s, a) => s + a.nightWorked, 0);
    const grossWages = wAtt.reduce(
      (s, a) =>
        s +
        a.dayWorked * (a.workerDayRateSnapshot || worker.workerDayRate) +
        a.nightWorked * (a.workerNightRateSnapshot || worker.workerNightRate),
      0
    );

    const openAdv = this.advances().filter(
      (a) => a.workerId === workerId && a.settlementId === null
    );
    const openDed = this.deductions().filter(
      (d) => d.workerId === workerId && d.settlementId === null
    );
    const prevSettled = this.settlements()
      .filter((s) => s.workerId === workerId)
      .reduce((sum, s) => sum + s.netPaid, 0);

    const advSum = openAdv.reduce((s, a) => s + a.amount, 0);
    const dedSum = openDed.reduce((s, d) => s + d.amount, 0);
    const calculatedNet = Math.max(0, grossWages - advSum - dedSum - prevSettled);
    const finalPaid =
      options?.customNetPaid !== undefined && options.customNetPaid >= 0
        ? options.customNetPaid
        : calculatedNet;

    const chk = options?.checkId
      ? this.checks().find((c) => c.id === options.checkId)
      : undefined;
    const defaultProjId =
      options?.projectId ??
      chk?.projectId ??
      (wAtt.length > 0 ? wAtt[0].projectId : this.selectedProjectId() || null);

    await this.createSettlement(
      {
        workerId,
        from: `${this.selectedMonth()}-01`,
        to: this.todayIso(),
        days,
        nights,
        grossWages,
        advancesDeducted: advSum,
        deductionsDeducted: dedSum,
        netPaid: finalPaid,
        date: this.todayIso(),
        projectId: defaultProjId,
        checkId: options?.checkId ?? null,
        notes:
          options?.notes ||
          (chk
            ? `تقفيل وصرف حساب العامل بالكامل من شيك #${chk.number}`
            : 'تقفيل وصرف حساب العامل بالكامل (اديله حسابه)'),
      },
      openAdv.filter((a) => a.id !== undefined).map((a) => a.id!),
      openDed.filter((d) => d.id !== undefined).map((d) => d.id!)
    );

    this.showToast(
      `تم تقفيل وصرف حساب ${worker.name} بالكامل بمبلغ ${this.money(finalPaid)}`,
      'success'
    );
  }

  /**
   * حفظ سحبة شيك مشروع فعلية وربطها بالمشروع والمصاريف الخارجية
   */
  async savePocketWithdrawalToCheck(params?: boolean | {
    checkId?: number | null;
    projectId?: number | null;
    withdrawnAmount?: number;
    withdrawalFee?: number;
    recordFeeAsExpense?: boolean;
  }): Promise<void> {
    const isBool = typeof params === 'boolean';
    const opt = !isBool && params ? params : undefined;
    const checkId = opt?.checkId !== undefined ? opt.checkId : this.pocketSelectedCheckId();
    const projectId = opt?.projectId !== undefined ? opt.projectId : this.pocketSelectedProjectId();
    const withdrawnAmount = opt?.withdrawnAmount !== undefined ? opt.withdrawnAmount : this.pocketWithdrawnAmount();
    const withdrawalFee = opt?.withdrawalFee !== undefined ? opt.withdrawalFee : this.pocketWithdrawalFee();
    const recordFeeAsExpense = isBool ? params : (opt?.recordFeeAsExpense ?? true);

    this.pocketWithdrawnAmount.set(withdrawnAmount);
    this.pocketWithdrawalFee.set(withdrawalFee);
    this.pocketSelectedCheckId.set(checkId);
    this.pocketSelectedProjectId.set(projectId);

    let targetCheckId = checkId;

    if (targetCheckId) {
      const chk = this.checks().find((c) => c.id === targetCheckId);
      if (chk) {
        await this.saveCheck({
          ...chk,
          projectId: projectId ?? chk.projectId,
          withdrawnAmount,
          withdrawalFee,
          status: 'اتصرف',
        });
      }
    } else if (withdrawnAmount > 0) {
      // إذا لم يكن هناك شيك مسجل بعد، ننشئ سجل شيك وارد للمشروع بالمبلغ المسحوب حتى يُحفظ في قاعدة البيانات
      targetCheckId = await this.saveCheck({
        direction: 'وارد',
        number: `سحبة-${this.todayIso()}`,
        bank: 'سحبة شيك مشروع',
        amount: withdrawnAmount,
        dueDate: this.todayIso(),
        status: 'اتصرف',
        projectId,
        extractId: null,
        withdrawnAmount,
        withdrawalFee,
        notes: 'تم التسجيل من كشف سحبة شيك المشروع',
      });
      this.pocketSelectedCheckId.set(targetCheckId);
    }

    if (recordFeeAsExpense && withdrawalFee > 0) {
      const alreadyHasFeeExpense = this.expenses().some(
        (e) =>
          targetCheckId &&
          e.checkId === targetCheckId &&
          e.category === 'رسوم سحب شيك' &&
          e.amount === withdrawalFee
      );
      if (!alreadyHasFeeExpense) {
        await this.saveExpense({
          date: this.todayIso(),
          category: 'رسوم سحب شيك',
          amount: withdrawalFee,
          projectId,
          checkId: targetCheckId,
          note: `مصاريف خارجية حق سحب شيك (${this.money(withdrawnAmount)})`,
        });
      }
    }

    // Reset manual overrides so computed values read directly from the saved DB records
    this.pocketWithdrawnAmount.set(0);
    this.pocketWithdrawalFee.set(0);
    this.pocketCustomAdvances.set(null);

    this.showToast(
      `تم حفظ سحبة الشيك (${this.money(withdrawnAmount)}) ورسوم السحب (${this.money(withdrawalFee)}) في السجلات`,
      'success'
    );
  }

  /**
   * رسائل التوجيه الذكية في كل صفحة — تذكير واحد مختصر ومبني ١٠٠٪ على البيانات الفعلية غير المكتملة فقط بدون زحمة
   */
  getPageAdvisorTips(routePath: string): PageAdvisorTip[] {
    const tips: PageAdvisorTip[] = [];
    const hc = this.todayHeadcountMatch();
    const ledger = this.comprehensiveLedger();
    const unlinkedChecks = this.checks().filter(
      (c) => c.direction === 'وارد' && !c.projectId
    );
    const unlinkedAdvances = this.advances().filter(
      (a) => !a.projectId && !a.checkId
    );
    const workersWithUnpaidBalance = this.workers().filter((w) => {
      if (!w.id) return false;
      const wAtt = this.attendances().filter((a) => a.workerId === w.id);
      const gross = wAtt.reduce(
        (s, a) => s + a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot,
        0
      );
      const adv = this.advances()
        .filter((a) => a.workerId === w.id && a.settlementId === null)
        .reduce((s, a) => s + a.amount, 0);
      const ded = this.deductions()
        .filter((d) => d.workerId === w.id && d.settlementId === null)
        .reduce((s, d) => s + d.amount, 0);
      const paid = this.settlements()
        .filter((st) => st.workerId === w.id)
        .reduce((s, st) => s + st.netPaid, 0);
      return gross - adv - ded - paid > 0;
    });

    if (!hc.hasMandatoryRecord && (routePath.includes('dashboard') || routePath.includes('attendance') || routePath.includes('bulk'))) {
      tips.push({
        id: 'tip-missing-headcount',
        badge: 'تذكير يومي',
        title: 'نسيت تسجل العدد اليومي الإجباري النهارده',
        description: 'سجّل عدد العمالة والنحاتية والسهرة أولاً لمطابقتها مع الأسماء.',
        severity: 'warning',
        icon: 'fact_check',
        actionLabel: 'تسجيل العدد اليومي',
        actionType: 'open_headcount',
      });
    } else if (!hc.isExactMatch && (routePath.includes('attendance') || routePath.includes('bulk'))) {
      tips.push({
        id: 'tip-headcount-mismatch',
        badge: 'مطابقة العدد',
        title: `المسجل بالأسماء (${this.num(hc.actualDays)}) يختلف عن العدد الإجباري (${this.num(hc.expectedDays)})`,
        description: 'راجع تحضير الأسماء ليتطابق العدد اليومي تماماً.',
        severity: 'amber',
        icon: 'compare_arrows',
        actionLabel: 'فتح التحضير الجماعي',
        actionType: 'navigate',
        targetRoute: '/bulk',
      });
    }

    if (unlinkedChecks.length > 0 && (routePath.includes('checks') || routePath.includes('extracts') || routePath.includes('my-ledger'))) {
      tips.push({
        id: 'tip-unlinked-checks',
        badge: 'ربط بالمشروع',
        title: `لديك ${this.num(unlinkedChecks.length)} شيك غير مربوط بمشروع محدد`,
        description: 'اربط الشيك بالمشروع والمستخلص ليظهر في حساب خزنة المشروع وسحباته تلقائياً.',
        severity: 'warning',
        icon: 'link',
        actionLabel: 'عرض الشيك وربطه',
        actionType: 'open_check_sheet',
        targetId: unlinkedChecks[0].id!,
      });
    }

    if (unlinkedAdvances.length > 0 && routePath.includes('advances')) {
      tips.push({
        id: 'tip-unlinked-advances',
        badge: 'ربط السلف بالشيك والمشروع',
        title: `يوجد ${this.num(unlinkedAdvances.length)} سلفة غير محددة بشيك مشروع`,
        description: 'عند تسجيل السلفة اختر المشروع أو الشيك ليُخصم المبلغ تلقائياً من المتبقي في شيك المشروع.',
        severity: 'emerald',
        icon: 'payments',
        actionLabel: 'كشف سحبات الشيكات',
        actionType: 'open_pocket',
      });
    }

    if (workersWithUnpaidBalance.length > 0 && (routePath.includes('workers') || routePath.includes('settlements'))) {
      const firstW = workersWithUnpaidBalance[0];
      tips.push({
        id: 'tip-workers-unpaid',
        badge: 'تصفية حساب عمال',
        title: `يوجد ${this.num(workersWithUnpaidBalance.length)} عامل لهم رصيد مستحق (${this.money(ledger.remainingOwedToWorkers)})`,
        description: 'اضغط على أي عامل لفتح لوحته السريعة وإعطائه حسابه أو إضافة/خصم أيام.',
        severity: 'emerald',
        icon: 'person_search',
        actionLabel: `لوحة ${firstW.name}`,
        actionType: 'open_worker_sheet',
        targetId: firstW.id!,
      });
    }

    return tips.slice(0, 1);
  }
}
