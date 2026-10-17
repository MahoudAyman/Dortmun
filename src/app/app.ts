import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from './core/db/store';

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
export class App {
  readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  readonly Math = Math;

  readonly mobileMenuOpen = signal<boolean>(false);
  readonly notificationsOpen = signal<boolean>(false);
  readonly confirmZeroResetOpen = signal<boolean>(false);
  readonly pinAttempt = signal<string>('');
  readonly pinError = signal<boolean>(false);
  readonly isOnline = signal<boolean>(true);
  readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  readonly showPwaGuideModal = signal<boolean>(false);

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

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('SW registration skipped:', err);
        });
      }
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
