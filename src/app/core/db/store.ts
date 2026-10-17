import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DortmunDatabase } from './dortmun-db';
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
  Project,
  Settlement,
  UndoOperation,
  Worker,
} from './models';
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
  INITIAL_PROJECTS,
  INITIAL_SETTINGS,
  INITIAL_SETTLEMENTS,
  INITIAL_WORKERS,
} from './seed-data';
import {
  calculateDashboardSummary,
  compareDailyHeadcount,
  formatCurrency,
  formatNumber,
  getDueChecksAlerts,
  getLowAttendanceWorkers,
  getPayday15CycleInfo,
  isBackupOverdue,
  toArabicDigits,
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

@Injectable({
  providedIn: 'root',
})
export class StoreService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private db: DortmunDatabase | null = null;

  readonly todayIso = signal<string>('2026-10-17');

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
  readonly auditLogs = signal<AuditLogEntry[]>([...INITIAL_AUDIT_LOGS]);

  // Global UI state
  readonly selectedProjectId = signal<number | null>(null);
  readonly selectedMonth = signal<string>('2026-10');
  readonly lastUndo = signal<UndoOperation | null>(null);
  readonly toastMessage = signal<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);
  readonly isLockedByPin = signal<boolean>(false);
  readonly globalSearchQuery = signal<string>('');
  readonly showQuickHeadcountModal = signal<boolean>(false);

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
        subtitle: 'كل الأرقام مصفّرة تماماً وجاهزة لبياناتك الحقيقية. أضف اسم المشروع وسعر يومية وسهرة الشركة.',
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
      void this.initDatabase();
    }
  }

  private async initDatabase(): Promise<void> {
    if (!this.db) return;
    try {
      const settingsCount = await this.db.settings.count();
      if (settingsCount === 0) {
        await this.db.settings.put(INITIAL_SETTINGS);
      }
      await this.reloadAllFromDb();

      this.applyDarkMode(this.settings().darkMode);
      if (this.settings().pinHash) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autostart') !== '1') {
          this.isLockedByPin.set(true);
        }
      }
    } catch (err) {
      console.error('Failed to initialize IndexedDB, falling back to in-memory signals:', err);
    }
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
    this.auditLogs.set([]);
    this.selectedProjectId.set(null);
    this.lastUndo.set(null);

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
        this.db.auditLog.clear(),
      ]);
    }
    this.showToast('تم تصفير جميع الأرقام والبيانات بالكامل — يمكنك الآن تسجيل بياناتك الحقيقية من الصفر', 'success');
  }

  // Formatting helpers bound to current numeral mode
  money(val: number | undefined | null): string {
    return formatCurrency(val, this.settings().numeralMode);
  }

  num(val: number | undefined | null, decimals = 0): string {
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

  showToast(text: string, type: 'success' | 'warning' | 'error' = 'success'): void {
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
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  async toggleDarkMode(): Promise<void> {
    const nextDark = !this.settings().darkMode;
    this.applyDarkMode(nextDark);
    await this.updateSettings({ darkMode: nextDark });
  }

  async toggleNumeralMode(): Promise<void> {
    const nextMode = this.settings().numeralMode === 'ar' ? 'en' : 'ar';
    await this.updateSettings({ numeralMode: nextMode });
  }

  async logAudit(action: string, entity: string, details: string): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      action,
      entity,
      details,
    };
    if (this.db) {
      const id = await this.db.auditLog.add(entry);
      entry.id = id;
    }
    this.auditLogs.update((list) => [entry, ...list.slice(0, 99)]);
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
  }

  // Daily Mandatory Headcount (العدد اليومي الإجباري)
  async saveDailyHeadcount(hc: DailyHeadcount): Promise<number> {
    const existing = this.dailyHeadcounts().find(
      (x) => x.date === hc.date && (x.projectId || null) === (hc.projectId || null)
    );
    const recordId = hc.id || existing?.id;

    if (recordId) {
      const updated: DailyHeadcount = { ...hc, id: recordId };
      if (this.db) await this.db.dailyHeadcounts.put(updated);
      this.dailyHeadcounts.update((list) =>
        list.map((x) => (x.id === recordId ? updated : x))
      );
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
    if (this.db) await this.db.dailyHeadcounts.delete(id);
    this.dailyHeadcounts.update((list) => list.filter((x) => x.id !== id));
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
    this.lastUndo.set({
      description: `خصم على ${this.workerName(deduction.workerId)}`,
      table: 'deductions',
      type: 'add',
      recordId: id,
    });
    await this.logAudit(
      'تسجيل خصم / جزاء',
      'الخصومات',
      `خصم ${deduction.amount} ج.م (${deduction.reason}) على ${this.workerName(deduction.workerId)}`
    );
    this.showToast(`تم تسجيل الخصم على ${this.workerName(deduction.workerId)}`, 'success');
    return id;
  }

  async deleteDeduction(id: number): Promise<void> {
    const prev = this.deductions().find((d) => d.id === id);
    if (!prev) return;
    if (this.db) await this.db.deductions.delete(id);
    this.deductions.update((list) => list.filter((d) => d.id !== id));
    this.lastUndo.set({
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
      this.lastUndo.set({
        description: `تعديل العامل ${worker.name}`,
        table: 'workers',
        type: 'update',
        recordId: worker.id,
        previousData: prev,
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
      this.lastUndo.set({
        description: `إضافة العامل ${worker.name}`,
        table: 'workers',
        type: 'add',
        recordId: id,
      });
      await this.logAudit('إضافة عامل', 'العمال', `تمت إضافة العامل ${worker.name} (${worker.role})`);
      return id;
    }
  }

  async deleteWorker(id: number): Promise<void> {
    const prev = this.workers().find((w) => w.id === id);
    if (!prev) return;
    if (this.db) await this.db.workers.delete(id);
    this.workers.update((list) => list.filter((w) => w.id !== id));
    this.lastUndo.set({
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
      if (this.db) await this.db.projects.put(project);
      this.projects.update((list) => list.map((p) => (p.id === project.id ? project : p)));
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
      this.showToast(`الشهر ${params.date.slice(0, 7)} مغلق للأرشفة! فك القفل من الإعدادات أولاً.`, 'error');
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
        this.lastUndo.set({
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
      this.lastUndo.set({
        description: `تعديل حضور ${worker.name} ليوم ${params.date}`,
        table: 'attendance',
        type: 'update',
        recordId: existing.id,
        previousData: existing,
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
    this.lastUndo.set({
      description: `تسجيل حضور ${worker.name} ليوم ${params.date}`,
      table: 'attendance',
      type: 'add',
      recordId: id,
    });
    return created;
  }

  // Advances
  async addAdvance(advance: Omit<Advance, 'id'>): Promise<number> {
    let id = Math.max(0, ...this.advances().map((a) => a.id || 0)) + 1;
    if (this.db) {
      id = await this.db.advances.add(advance as Advance);
    }
    const created: Advance = { ...advance, id };
    this.advances.update((list) => [created, ...list]);
    this.lastUndo.set({
      description: `تسجيل سلفة ${this.workerName(advance.workerId)}`,
      table: 'advances',
      type: 'add',
      recordId: id,
    });
    await this.logAudit(
      'تسجيل سلفة',
      'السلف',
      `سلفة بمبلغ ${advance.amount} ج.م للعامل ${this.workerName(advance.workerId)}`
    );
    return id;
  }

  async deleteAdvance(id: number): Promise<void> {
    const prev = this.advances().find((a) => a.id === id);
    if (!prev) return;
    if (this.db) await this.db.advances.delete(id);
    this.advances.update((list) => list.filter((a) => a.id !== id));
    this.lastUndo.set({
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
      this.lastUndo.set({
        description: `إضافة بند إضافي (${extra.type})`,
        table: 'extras',
        type: 'add',
        recordId: extraId,
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
      if (this.db) await this.db.checks.put(check);
      this.checks.update((list) =>
        list.map((c) => (c.id === check.id ? check : c))
      );
      await this.logAudit('تعديل شيك', 'الشيكات', `تعديل شيك رقم ${check.number} (${check.status})`);
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
      this.lastUndo.set({
        description: `إضافة شيك رقم ${check.number}`,
        table: 'checks',
        type: 'add',
        recordId: id,
      });
      await this.logAudit('إضافة شيك', 'الشيكات', `شيك ${check.direction} رقم ${check.number} بمبلغ ${check.amount}`);
      return id;
    }
  }

  async deleteCheck(id: number): Promise<void> {
    const prev = this.checks().find((c) => c.id === id);
    if (!prev) return;
    if (this.db) await this.db.checks.delete(id);
    this.checks.update((list) => list.filter((c) => c.id !== id));
    await this.logAudit('حذف شيك', 'الشيكات', `تم حذف شيك رقم ${prev.number}`);
    this.showToast('تم حذف الشيك', 'warning');
  }

  // Expenses
  async saveExpense(expense: Expense): Promise<number> {
    if (expense.id) {
      if (this.db) await this.db.expenses.put(expense);
      this.expenses.update((list) =>
        list.map((e) => (e.id === expense.id ? expense : e))
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
      this.lastUndo.set({
        description: `تسجيل مصروف ${expense.category}`,
        table: 'expenses',
        type: 'add',
        recordId: id,
      });
      await this.logAudit('إضافة مصروف', 'المصاريف', `مصروف ${expense.category} بمبلغ ${expense.amount}`);
      return id;
    }
  }

  async deleteExpense(id: number): Promise<void> {
    const prev = this.expenses().find((e) => e.id === id);
    if (!prev) return;
    if (this.db) await this.db.expenses.delete(id);
    this.expenses.update((list) => list.filter((e) => e.id !== id));
    await this.logAudit('حذف مصروف', 'المصاريف', `حذف مصروف ${prev.category} بمبلغ ${prev.amount}`);
    this.showToast('تم حذف المصروف', 'warning');
  }

  // Undo last operation
  async undoLastOperation(): Promise<boolean> {
    const op = this.lastUndo();
    if (!op) {
      this.showToast('لا توجد عملية مسجلة للتراجع عنها حالياً', 'warning');
      return false;
    }

    if (op.table === 'attendance') {
      if (op.type === 'add' && op.recordId) {
        if (this.db) await this.db.attendance.delete(op.recordId);
        this.attendances.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'batch-add' && op.recordIds) {
        if (this.db) await this.db.attendance.bulkDelete(op.recordIds);
        const set = new Set(op.recordIds);
        this.attendances.update((l) => l.filter((x) => !set.has(x.id!)));
      } else if (op.type === 'update' && op.previousData) {
        const prev = op.previousData as Attendance;
        if (this.db) await this.db.attendance.put(prev);
        this.attendances.update((l) => l.map((x) => (x.id === prev.id ? prev : x)));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Attendance;
        if (this.db) await this.db.attendance.put(prev);
        this.attendances.update((l) => [...l, prev]);
      }
    } else if (op.table === 'advances') {
      if (op.type === 'add' && op.recordId) {
        if (this.db) await this.db.advances.delete(op.recordId);
        this.advances.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Advance;
        if (this.db) await this.db.advances.put(prev);
        this.advances.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'deductions') {
      if (op.type === 'add' && op.recordId) {
        if (this.db) await this.db.deductions.delete(op.recordId);
        this.deductions.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Deduction;
        if (this.db) await this.db.deductions.put(prev);
        this.deductions.update((l) => [prev, ...l]);
      }
    } else if (op.table === 'workers') {
      if (op.type === 'add' && op.recordId) {
        if (this.db) await this.db.workers.delete(op.recordId);
        this.workers.update((l) => l.filter((x) => x.id !== op.recordId));
      } else if (op.type === 'delete' && op.previousData) {
        const prev = op.previousData as Worker;
        if (this.db) await this.db.workers.put(prev);
        this.workers.update((l) => [...l, prev]);
      }
    } else if (op.table === 'extras' && op.type === 'add' && op.recordId) {
      await this.deleteExtra(op.recordId);
    }

    await this.logAudit('تراجع', op.table, `تم التراجع عن: ${op.description}`);
    this.showToast(`تم التراجع عن: ${op.description}`, 'success');
    this.lastUndo.set(null);
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
      auditLogs: this.auditLogs(),
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

            if (data.settings) await this.db!.settings.put({ ...INITIAL_SETTINGS, ...data.settings });
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
          }
        );
      }

      await this.logAudit('استعادة نسخة', 'النظام', 'تم استيراد نسخة احتياطية JSON بنجاح');
      this.showToast('تم استيراد النسخة الاحتياطية بنجاح', 'success');
      return true;
    } catch {
      this.showToast('فشل استيراد النسخة الاحتياطية: تأكد من صحة ملف JSON', 'error');
      return false;
    }
  }
}
