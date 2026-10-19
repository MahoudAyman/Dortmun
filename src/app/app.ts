import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter, Subscription } from 'rxjs';
import { StoreService } from './core/db/store';
import type { DeductionMode, ExpenseCategory, WorkerRole } from './core/db/models';
import { calculateDeductionAmount } from './core/calc/calculations';
import { parseSmartSiteCommand } from './core/db/supabase-sql-schema';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  readonly Math = Math;

  private sectionObserver: IntersectionObserver | null = null;
  private routerSub: Subscription | null = null;

  readonly mobileMenuOpen = signal<boolean>(false);
  readonly notificationsOpen = signal<boolean>(false);
  readonly confirmZeroResetOpen = signal<boolean>(false);
  readonly pinAttempt = signal<string>('');
  readonly pinError = signal<boolean>(false);
  readonly isOnline = signal<boolean>(true);
  readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  readonly showPwaGuideModal = signal<boolean>(false);

  // Cloud Hub & Device Registration state
  readonly deviceNameInput = signal<string>('');
  readonly showSqlSetupPanel = signal<boolean>(true);
  readonly cloudHubTab = signal<'devices' | 'sql' | 'diagnostics' | 'backups'>('devices');
  readonly backupTitleInput = signal<string>('');

  // Smart Command Bar (voice & natural text entry)
  readonly smartCommandInput = signal<string>('');
  readonly isVoiceListening = signal<boolean>(false);
  readonly parsedSmartCommandPreview = computed(() =>
    parseSmartSiteCommand(this.smartCommandInput())
  );

  // New Feature 1: Quick Action Command Modal (+ تسجيل فوري سريع)
  readonly quickActionModalOpen = signal<boolean>(false);
  readonly quickActionTab = signal<'smart' | 'deduction' | 'advance' | 'expense' | 'worker'>('deduction');

  // Quick Deduction state
  readonly qaWorkerId = signal<number>(0);
  readonly qaDeductionMode = signal<DeductionMode>('half_day');
  readonly qaDeductionMoney = signal<number>(0);
  readonly qaDeductionReason = signal<string>('');

  // Quick Advance state
  readonly qaAdvanceAmount = signal<number>(0);
  readonly qaAdvanceReason = signal<string>('');

  // Quick Expense state
  readonly qaExpenseCategory = signal<ExpenseCategory>('مواصلات');
  readonly qaExpenseAmount = signal<number>(0);
  readonly qaExpenseNote = signal<string>('');

  // Quick Add Worker / Sculptor state
  readonly qaNewWorkerName = signal<string>('');
  readonly qaNewWorkerRole = signal<WorkerRole>('نحات');
  readonly qaNewWorkerDayRate = signal<number>(500);
  readonly qaNewWorkerNightRate = signal<number>(250);

  readonly qaCalculatedDeduction = computed(() => {
    const w = this.store.workers().find((x) => x.id === this.qaWorkerId());
    if (!w) return { daysDeducted: 0, amount: 0 };
    return calculateDeductionAmount(
      this.qaDeductionMode(),
      w.workerDayRate,
      this.qaDeductionMoney()
    );
  });

  // New Feature 2: Smart Contractor Site Calculator Modal (حاسبة الموقع الذكية)
  readonly siteCalculatorOpen = signal<boolean>(false);
  readonly calcDays = signal<number>(15);
  readonly calcNights = signal<number>(5);
  readonly calcWorkerDayRate = signal<number>(450);
  readonly calcWorkerNightRate = signal<number>(225);
  readonly calcCompanyDayRate = signal<number>(600);
  readonly calcCompanyNightRate = signal<number>(300);
  readonly calcAdvances = signal<number>(0);
  readonly calcDeductions = signal<number>(0);

  readonly siteCalcResults = computed(() => {
    const days = Math.max(0, this.calcDays() || 0);
    const nights = Math.max(0, this.calcNights() || 0);
    const wDay = Math.max(0, this.calcWorkerDayRate() || 0);
    const wNight = Math.max(0, this.calcWorkerNightRate() || 0);
    const cDay = Math.max(0, this.calcCompanyDayRate() || 0);
    const cNight = Math.max(0, this.calcCompanyNightRate() || 0);
    const adv = Math.max(0, this.calcAdvances() || 0);
    const ded = Math.max(0, this.calcDeductions() || 0);

    const workerGross = days * wDay + nights * wNight;
    const workerNet = workerGross - adv - ded;
    const companyTotal = days * cDay + nights * cNight;
    const contractorMargin = companyTotal - workerGross;

    return {
      workerGross,
      workerNet,
      companyTotal,
      contractorMargin,
    };
  });

  // Quick Mandatory Daily Headcount Modal signals
  readonly hcDate = signal<string>(this.store.todayIso());
  readonly hcSculptors = signal<number>(0);
  readonly hcWorkers = signal<number>(0);
  readonly hcNights = signal<number>(0);
  readonly hcSupervisor = signal<string>('');
  readonly hcNotes = signal<string>('');

  readonly hcTotalDayExpected = computed(() =>
    Math.max(0, (this.hcSculptors() || 0) + (this.hcWorkers() || 0))
  );

  readonly navItems = [
    { path: '/dashboard', label: 'الرئيسية', icon: 'dashboard' },
    { path: '/attendance', label: 'العدد والحضور', icon: 'fact_check' },
    { path: '/bulk', label: 'الإضافة الجماعية', icon: 'playlist_add_check' },
    { path: '/workers', label: 'العمال والنحاتية', icon: 'groups' },
    { path: '/deductions', label: 'الخصومات والجزاءات', icon: 'gavel' },
    { path: '/advances', label: 'السلف', icon: 'payments' },
    { path: '/settlements', label: 'قبض يوم ١٥ والتسويات', icon: 'event_repeat' },
    { path: '/extracts', label: 'المستخلصات', icon: 'receipt' },
    { path: '/extras', label: 'الإضافي والناش', icon: 'add_task' },
    { path: '/checks', label: 'الشيكات', icon: 'account_balance' },
    { path: '/expenses', label: 'المصاريف الخارجية', icon: 'receipt_long' },
    { path: '/reports', label: 'التقارير والتصدير', icon: 'table_view' },
    { path: '/settings', label: 'الإعدادات والمشاريع', icon: 'settings' },
    { path: '/zaki', label: 'المساعد زكي الذكي', icon: 'smart_toy' },
  ];

  readonly searchResults = computed(() => {
    const q = this.store.globalSearchQuery().trim().toLowerCase();
    if (q.length < 2) return [];

    const results: { title: string; subtitle: string; route: string }[] = [];

    for (const w of this.store.workers()) {
      if (
        w.name.toLowerCase().includes(q) ||
        w.role.toLowerCase().includes(q) ||
        (w.phone || '').includes(q)
      ) {
        results.push({
          title: `${w.role}: ${w.name}`,
          subtitle: `يومية ${this.store.money(w.workerDayRate)} · سهرة ${this.store.money(w.workerNightRate)}`,
          route: '/workers',
        });
      }
    }

    for (const ext of this.store.extracts()) {
      const pName = this.store.projectName(ext.projectId);
      if (
        pName.toLowerCase().includes(q) ||
        (ext.notes || '').toLowerCase().includes(q) ||
        String(ext.number).includes(q)
      ) {
        results.push({
          title: `مستخلص #${ext.number} - ${pName}`,
          subtitle: `${ext.from} إلى ${ext.to}`,
          route: '/extracts',
        });
      }
    }

    for (const chk of this.store.checks()) {
      if (
        chk.number.toLowerCase().includes(q) ||
        chk.bank.toLowerCase().includes(q) ||
        (chk.notes || '').toLowerCase().includes(q)
      ) {
        results.push({
          title: `شيك ${chk.direction} #${chk.number}`,
          subtitle: `${chk.bank} · ${this.store.money(chk.amount)} (${chk.status})`,
          route: '/checks',
        });
      }
    }

    return results.slice(0, 8);
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt.set(e as BeforeInstallPromptEvent);
      });

      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.openQuickActionModal('deduction');
          return;
        }
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            void this.store.redoLastOperation();
          } else {
            void this.store.undoLastOperation();
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          void this.store.redoLastOperation();
        }
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('SW registration skipped:', err);
        });
      }
    }
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.setupScrollRevealObserver();
    this.routerSub = this.router.events
      .pipe(filter((evt) => evt instanceof NavigationEnd))
      .subscribe(() => {
        setTimeout(() => this.setupScrollRevealObserver(), 30);
      });
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
    this.routerSub?.unsubscribe();
  }

  private setupScrollRevealObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.sectionObserver?.disconnect();

    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            this.sectionObserver?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 }
    );

    const targets = document.querySelectorAll('.reveal-section, .ceramic-card, .ceramic-hero');
    targets.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      if (!htmlEl.classList.contains('reveal-section')) {
        htmlEl.classList.add('reveal-section');
      }
      htmlEl.style.setProperty('--stagger-delay', `${Math.min(index, 8) * 60}ms`);
      this.sectionObserver?.observe(htmlEl);
    });
  }

  openCloudHubModal(tab: 'devices' | 'sql' | 'diagnostics' | 'backups' = 'devices'): void {
    this.deviceNameInput.set(this.store.currentDevice().deviceName);
    this.cloudHubTab.set(tab);
    this.store.showCloudHubModal.set(true);
    void this.store.runCloudDiagnostics();
  }

  async saveCurrentDeviceName(): Promise<void> {
    await this.store.updateDeviceName(this.deviceNameInput());
  }

  async copySupabaseSqlScript(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && navigator.clipboard) {
      await navigator.clipboard.writeText(this.store.getSupabaseSetupSql());
      this.store.showToast(
        'تم نسخ كود SQL الكامل (١٨ جدولاً + الدوال الذكية) — الصقه في Supabase SQL Editor واضغط Run',
        'success'
      );
    }
  }

  downloadSupabaseSqlFile(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const sql = this.store.getSupabaseSetupSql();
    const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dortmun_supabase_full_schema.sql';
    a.click();
    URL.revokeObjectURL(url);
    this.store.showToast('تم تحميل ملف dortmun_supabase_full_schema.sql بنجاح', 'success');
  }

  async createNewCloudBackup(): Promise<void> {
    await this.store.createCloudBackup(this.backupTitleInput());
    this.backupTitleInput.set('');
  }

  async runSmartCommandNow(): Promise<void> {
    const ok = await this.store.executeSmartCommand(this.smartCommandInput());
    if (ok) {
      this.smartCommandInput.set('');
      this.quickActionModalOpen.set(false);
    }
  }

  startVoiceCommand(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const win = window as unknown as Record<string, unknown>;
    const SpeechRec = (win['SpeechRecognition'] || win['webkitSpeechRecognition']) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
        })
      | undefined;

    if (!SpeechRec) {
      this.store.showToast('الإدخال الصوتي غير مدعوم في هذا المتصفح — يمكنك الكتابة مباشرة', 'warning');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'ar-EG';
      rec.interimResults = false;
      this.isVoiceListening.set(true);
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          this.smartCommandInput.set(transcript);
        }
      };
      rec.onerror = () => this.isVoiceListening.set(false);
      rec.onend = () => this.isVoiceListening.set(false);
      rec.start();
    } catch {
      this.isVoiceListening.set(false);
    }
  }

  openQuickActionModal(
    tab: 'smart' | 'deduction' | 'advance' | 'expense' | 'worker' = 'deduction'
  ): void {
    const firstWorker = this.store.activeWorkers()[0];
    if (firstWorker?.id && !this.qaWorkerId()) {
      this.qaWorkerId.set(firstWorker.id);
    }
    this.quickActionTab.set(tab);
    this.quickActionModalOpen.set(true);
  }

  async submitQuickDeduction(): Promise<void> {
    const workerId = this.qaWorkerId();
    const w = this.store.workers().find((x) => x.id === workerId);
    if (!w) {
      this.store.showToast('اختر العامل أو النحّات أولاً', 'warning');
      return;
    }
    const calc = this.qaCalculatedDeduction();
    if (calc.amount <= 0) {
      this.store.showToast('حدد قيمة الخصم أولاً', 'warning');
      return;
    }
    await this.store.addDeduction({
      date: this.store.todayIso(),
      workerId,
      projectId: this.store.selectedProjectId(),
      mode: this.qaDeductionMode(),
      daysDeducted: calc.daysDeducted,
      amount: calc.amount,
      reason: this.qaDeductionReason().trim() || 'خصم إداري مباشر',
      notes: '',
      settlementId: null,
    });
    this.qaDeductionReason.set('');
    this.qaDeductionMoney.set(0);
    this.quickActionModalOpen.set(false);
  }

  async submitQuickAdvance(): Promise<void> {
    const workerId = this.qaWorkerId();
    const amount = this.qaAdvanceAmount();
    if (!workerId || amount <= 0) {
      this.store.showToast('اختر العامل وأدخل مبلغ السلفة', 'warning');
      return;
    }
    await this.store.addAdvance({
      date: this.store.todayIso(),
      workerId,
      amount,
      reason: this.qaAdvanceReason().trim() || 'سلفة سريعة',
      settlementId: null,
      notes: '',
    });
    this.store.showToast(`تم تسجيل سلفة ${this.store.money(amount)} بنجاح`, 'success');
    this.qaAdvanceAmount.set(0);
    this.qaAdvanceReason.set('');
    this.quickActionModalOpen.set(false);
  }

  async submitQuickExpense(): Promise<void> {
    const amount = this.qaExpenseAmount();
    if (amount <= 0) {
      this.store.showToast('أدخل مبلغ المصروف أولاً', 'warning');
      return;
    }
    await this.store.saveExpense({
      date: this.store.todayIso(),
      category: this.qaExpenseCategory(),
      amount,
      projectId: this.store.selectedProjectId(),
      note: this.qaExpenseNote().trim() || `مصروف ${this.qaExpenseCategory()}`,
    });
    this.store.showToast(`تم تسجيل مصروف ${this.qaExpenseCategory()} بنجاح`, 'success');
    this.qaExpenseAmount.set(0);
    this.qaExpenseNote.set('');
    this.quickActionModalOpen.set(false);
  }

  async submitQuickWorker(): Promise<void> {
    const name = this.qaNewWorkerName().trim();
    if (!name) {
      this.store.showToast('أدخل اسم العامل أو النحّات أولاً', 'warning');
      return;
    }
    const id = await this.store.saveWorker({
      name,
      role: this.qaNewWorkerRole(),
      workerDayRate: Math.max(0, this.qaNewWorkerDayRate() || 0),
      workerNightRate: Math.max(0, this.qaNewWorkerNightRate() || 0),
      phone: '',
      active: true,
      notes: '',
    });
    this.qaWorkerId.set(id);
    this.store.showToast(`تمت إضافة ${this.qaNewWorkerRole()} "${name}" بنجاح`, 'success');
    this.qaNewWorkerName.set('');
    this.quickActionModalOpen.set(false);
  }

  async copyDailyWhatsAppSummary(): Promise<void> {
    const hc = this.store.todayHeadcountMatch();
    const sum = this.store.dashboardSummary();
    const payday = this.store.payday15Info();
    const text = [
      `📊 *تقرير اليوم — ${this.store.settings().companyName}*`,
      `📅 التاريخ: ${this.store.digits(this.store.todayIso())}`,
      `📱 الجهاز المرسل: ${this.store.currentDevice().deviceName}`,
      `━━━━━━━━━━━━━━`,
      `👷 *العدد اليومي الإجباري:* ${this.store.num(hc.expectedDays)} يومية (${this.store.num(hc.expectedRegularWorkers)} عمال + ${this.store.num(hc.expectedSculptors)} نحات) · ${this.store.num(hc.expectedNights)} سهرة`,
      `✅ *المسجل بالأسماء:* ${this.store.num(hc.actualDays)} يومية · ${this.store.num(hc.actualNights)} سهرة (${hc.statusLabel})`,
      `━━━━━━━━━━━━━━`,
      `💰 *أجور العمال والناش:* ${this.store.money(sum.totalWorkerWages)}`,
      `📉 *إجمالي الخصومات المفتوحة:* ${this.store.money(this.store.totalOpenDeductions())}`,
      `💵 *إجمالي السلف المفتوحة:* ${this.store.money(sum.totalAdvancesGiven)}`,
      `🗓️ *دورة قبض يوم ١٥:* ${payday.label}`,
    ].join('\n');

    if (isPlatformBrowser(this.platformId) && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      this.store.showToast('تم نسخ ملخص اليوم جاهزاً للإرسال على واتساب!', 'success');
    }
  }

  openHeadcountModal(): void {
    const existing = this.store.todayHeadcountMatch().headcount;
    this.hcDate.set(this.store.todayIso());
    if (existing) {
      this.hcSculptors.set(existing.sculptorsCount || 0);
      this.hcWorkers.set(existing.workersCount || existing.expectedDayCount || 0);
      this.hcNights.set(existing.expectedNightCount || 0);
      this.hcSupervisor.set(existing.supervisorName || '');
      this.hcNotes.set(existing.notes || '');
    } else {
      this.hcSculptors.set(0);
      this.hcWorkers.set(0);
      this.hcNights.set(0);
      this.hcSupervisor.set('');
      this.hcNotes.set('');
    }
    this.store.showQuickHeadcountModal.set(true);
  }

  async saveQuickHeadcount(): Promise<void> {
    await this.store.saveDailyHeadcount({
      date: this.hcDate(),
      projectId: this.store.selectedProjectId(),
      expectedDayCount: this.hcTotalDayExpected(),
      sculptorsCount: this.hcSculptors(),
      workersCount: this.hcWorkers(),
      expectedNightCount: this.hcNights(),
      supervisorName: this.hcSupervisor(),
      notes: this.hcNotes(),
    });
    this.store.showQuickHeadcountModal.set(false);
  }

  navigateAndCloseAlert(route: string): void {
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl(route);
  }

  navigateFromSearch(route: string): void {
    this.store.globalSearchQuery.set('');
    void this.router.navigateByUrl(route);
  }

  async confirmZeroReset(): Promise<void> {
    await this.store.resetAllDataToZero();
    this.confirmZeroResetOpen.set(false);
  }

  unlockWithPin(): void {
    if (this.pinAttempt() === this.store.settings().pinHash) {
      this.store.isLockedByPin.set(false);
      this.pinError.set(false);
    } else {
      this.pinError.set(true);
    }
  }

  async triggerPwaInstall(): Promise<void> {
    const promptEvt = this.deferredPrompt();
    if (promptEvt) {
      await promptEvt.prompt();
      this.deferredPrompt.set(null);
    } else {
      this.showPwaGuideModal.set(true);
    }
  }
}
