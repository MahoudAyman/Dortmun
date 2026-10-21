import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';

@Component({
  selector: 'app-sync-center-page',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6 pb-16">
      <!-- Top Hero Card: Smart Offline-to-Online & Database Sync Engine -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-xs space-y-5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 text-xs font-bold text-[#3390EC]">
              <mat-icon class="!w-4 !h-4 !text-[16px]">cloud_sync</mat-icon>
              <span>مركز المزامنة الذكية والأوفلاين وقاعدة البيانات السحابية</span>
            </div>
            <h1 class="text-xl sm:text-2xl font-extrabold text-[var(--text-heading)]">
              المزامنة المزدوجة الذكية (أوفلاين وقاعدة البيانات)
            </h1>
            <p class="text-xs sm:text-sm text-[var(--text-secondary)]">
              عندما يكون النت مقفولاً وتسجل سلفة على أي عامل أو يومية أو مصروف، يحفظها النظام فوراً في قائمة الانتظار الذكية، وبمجرد فتح النت تذهب إلى قاعدة البيانات مع رسالة تفصيلية، كما يستقبل كل ما أتى من قاعدة البيانات بذكاء دون ضياع أي حركة.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2.5 shrink-0">
            @if (store.localOnlyMode() || !store.isNetworkOnline()) {
              <button
                type="button"
                (click)="openInternetAndSyncNow()"
                class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px]">wifi</mat-icon>
                <span>فتح النت الآن وإرسال ({{ store.num(store.offlinePendingQueue().length) }}) عمليات لقاعدة البيانات</span>
              </button>
            } @else {
              <button
                type="button"
                (click)="closeInternetForOfflineMode()"
                class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px]">wifi_off</mat-icon>
                <span>قفل النت مؤقتاً (وضع التسجيل أوفلاين)</span>
              </button>
            }

            <button
              type="button"
              (click)="manualBidirectionalSync()"
              class="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[#3390EC] text-[var(--text-heading)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] text-[#3390EC]">sync</mat-icon>
              <span>مزامنة وفحص ما أتى من قاعدة البيانات الآن</span>
            </button>
          </div>
        </div>

        <!-- Live Sync Notification Message Banner -->
        @if (store.syncAlertBanner(); as banner) {
          <div
            class="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3"
            [class.bg-amber-500/10]="banner.direction === 'offline_queued'"
            [class.border-amber-500/40]="banner.direction === 'offline_queued'"
            [class.bg-emerald-500/10]="banner.direction !== 'offline_queued'"
            [class.border-emerald-500/40]="banner.direction !== 'offline_queued'"
          >
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <mat-icon
                  class="!w-5 !h-5 !text-[20px]"
                  [class.text-amber-600]="banner.direction === 'offline_queued'"
                  [class.text-emerald-600]="banner.direction !== 'offline_queued'"
                >
                  {{ banner.direction === 'offline_queued' ? 'cloud_off' : 'cloud_done' }}
                </mat-icon>
                <h2 class="text-sm font-extrabold text-[var(--text-heading)]">
                  {{ banner.title }}
                </h2>
              </div>
              <p class="text-xs text-[var(--text-secondary)]">
                {{ banner.subtitle }}
              </p>
              @if (banner.details.length > 0) {
                <ul class="pt-1 space-y-1 text-xs font-bold text-[var(--text-heading)]">
                  @for (detail of banner.details; track $index) {
                    <li class="flex items-center gap-1.5">
                      <span>•</span>
                      <span>{{ detail }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
            <button
              type="button"
              (click)="store.dismissSyncAlertBanner()"
              class="px-3 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-heading)] self-start cursor-pointer shrink-0"
            >
              إغلاق الرسالة
            </button>
          </div>
        }

        <!-- 4 Status KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div class="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <span class="text-xs font-bold text-[var(--text-secondary)]">حالة الاتصال الحالية</span>
            <div class="text-base font-extrabold text-[var(--text-heading)]">
              @if (store.localOnlyMode() || !store.isNetworkOnline()) {
                <span class="text-amber-600">📴 النت مقفول (أوفلاين ذكي)</span>
              } @else {
                <span class="text-emerald-600">🌐 متصل بقاعدة البيانات ١٠٠٪</span>
              }
            </div>
            <p class="text-[11px] text-[var(--text-secondary)]">
              {{ store.lastCloudOperation() }}
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <span class="text-xs font-bold text-[var(--text-secondary)]">عمليات أوفلاين بانتظار الرفع</span>
            <div class="text-xl font-extrabold text-amber-600 tabular-nums">
              {{ store.num(store.offlinePendingQueue().length) }} عملية
            </div>
            <p class="text-[11px] text-[var(--text-secondary)]">
              تذهب تلقائياً لقاعدة البيانات فور فتح النت
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <span class="text-xs font-bold text-[var(--text-secondary)]">إصدار المزامنة السحابية</span>
            <div class="text-xl font-extrabold text-[#3390EC] tabular-nums">
              v{{ store.num(store.cloudVersion()) }}
            </div>
            <p class="text-[11px] text-[var(--text-secondary)]">
              آخر مزامنة: {{ store.lastCloudSyncAt() ? store.digits(store.lastCloudSyncAt()) : 'الآن' }}
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] space-y-1">
            <span class="text-xs font-bold text-[var(--text-secondary)]">سجل رسائل التبادل السحابي</span>
            <div class="text-xl font-extrabold text-emerald-600 tabular-nums">
              {{ store.num(store.syncExchangeLogs().length) }} رسالة مزامنة
            </div>
            <p class="text-[11px] text-[var(--text-secondary)]">
              توثيق كامل لما ذهب وما أتى من قاعدة البيانات
            </p>
          </div>
        </div>
      </div>

      <!-- Quick Test & Live Recording Box (سجّل سلفة أو حركة الآن وجرّب الأوفلاين والأونلاين) -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-extrabold text-[var(--text-heading)]">
              تسجيل سريع (سلفة / يومية) — يعمل أثناء قفل النت أو فتحه بذكاء
            </h2>
            <p class="text-xs text-[var(--text-secondary)]">
              جرب الآن: اقفل النت من الزر بالأعلى، ثم سجل سلفة على أي عامل هنا، وستراها فوراً في قائمة الانتظار، ثم افتح النت لترى رسالة ذهابها لقاعدة البيانات!
            </p>
          </div>
          <a
            routerLink="/daily-inspector"
            class="px-3 py-1.5 rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1 self-start"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px]">event_note</mat-icon>
            <span>فتح كشف اليوم (٢٠-١٠)</span>
          </a>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div>
            <label for="sync-worker-select" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">اختر العامل / النحات</label>
            <select
              id="sync-worker-select"
              [value]="selectedWorkerId() ?? ''"
              (change)="selectedWorkerId.set(+$any($event.target).value || null)"
              class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
            >
              <option value="">اختر العامل...</option>
              @for (w of store.workers(); track w.id) {
                <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
              }
            </select>
          </div>

          <div>
            <label for="sync-date-input" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">التاريخ</label>
            <input
              id="sync-date-input"
              type="date"
              [value]="recordDate()"
              (input)="recordDate.set($any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)] tabular-nums"
            />
          </div>

          <div>
            <label for="sync-adv-amount" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">مبلغ السلفة (ج.م)</label>
            <input
              id="sync-adv-amount"
              type="number"
              min="1"
              [value]="advanceAmount() || ''"
              (input)="advanceAmount.set(+$any($event.target).value || 0)"
              placeholder="مثلاً 300"
              class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)] tabular-nums"
            />
          </div>

          <div>
            <label for="sync-adv-reason" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">البيان / الملاحظة</label>
            <input
              id="sync-adv-reason"
              type="text"
              [value]="advanceReason()"
              (input)="advanceReason.set($any($event.target).value)"
              placeholder="سلفة نقدية..."
              class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs text-[var(--text-heading)]"
            />
          </div>

          <div class="flex items-end">
            <button
              type="button"
              (click)="recordSmartAdvance()"
              class="w-full py-2 px-4 rounded-xl bg-[#3390EC] hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">payments</mat-icon>
              <span>تسجيل السلفة الآن</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Two Columns: 1) Pending Offline Queue, 2) Bidirectional Database Sync History -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Column 1: Offline Pending Queue (العمليات المسجلة أثناء قفل النت) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-500">pending_actions</mat-icon>
              <h2 class="text-sm sm:text-base font-extrabold text-[var(--text-heading)]">
                قائمة انتظار الأوفلاين ({{ store.num(store.offlinePendingQueue().length) }})
              </h2>
            </div>
            @if (store.offlinePendingQueue().length > 0) {
              <button
                type="button"
                (click)="openInternetAndSyncNow()"
                class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">cloud_upload</mat-icon>
                <span>إرسال الكل لقاعدة البيانات الآن</span>
              </button>
            }
          </div>

          <p class="text-xs text-[var(--text-secondary)]">
            أي سلفة أو حضور أو تعديل تسجله والنت مقفول يظهر هنا فوراً، وينتقل تلقائياً إلى قاعدة البيانات بمجرد فتح النت.
          </p>

          <div class="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            @for (item of store.offlinePendingQueue(); track item.id) {
              <div class="p-3.5 bg-[var(--bg-app)]/50 flex items-start justify-between gap-3 text-xs">
                <div class="space-y-1">
                  <div class="font-extrabold text-[var(--text-heading)]">
                    {{ item.description }}
                  </div>
                  <div class="text-[11px] text-[var(--text-secondary)]">
                    القسم: {{ item.table }} · الوقت: {{ store.digits(item.timestamp) }}
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold whitespace-nowrap">
                  بانتظار فتح النت
                </span>
              </div>
            } @empty {
              <div class="p-8 text-center space-y-2">
                <mat-icon class="!w-8 !h-8 !text-[32px] text-emerald-600 mx-auto">cloud_done</mat-icon>
                <div class="text-sm font-bold text-[var(--text-heading)]">
                  لا توجد عمليات معلقة — جميع تسجيلاتك وصلت إلى قاعدة البيانات ١٠٠٪
                </div>
                <p class="text-xs text-[var(--text-secondary)]">
                  إذا قفلت النت وسجلت أي سلفة أو حركة، ستظهر هنا لحين فتح النت.
                </p>
              </div>
            }
          </div>
        </div>

        <!-- Column 2: Sync Exchange Log (سجل ما ذهب لقاعدة البيانات وما أتى منها) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <mat-icon class="!w-5 !h-5 !text-[20px] text-[#3390EC]">swap_vert</mat-icon>
              <h2 class="text-sm sm:text-base font-extrabold text-[var(--text-heading)]">
                سجل رسائل المزامنة (ما ذهب لقاعدة البيانات وما أتى منها)
              </h2>
            </div>
            <span class="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
              {{ store.num(store.syncExchangeLogs().length) }} عملية
            </span>
          </div>

          <p class="text-xs text-[var(--text-secondary)]">
            يعرض هذا السجل كل رسالة تأكيد عند إرسال بيانات الأوفلاين إلى قاعدة البيانات أو عند وصول بيانات جديدة من قاعدة البيانات.
          </p>

          <div class="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
            @for (log of store.syncExchangeLogs(); track log.id) {
              <div class="p-3.5 space-y-2 text-xs hover:bg-[var(--bg-app)]/50 transition-colors">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-extrabold text-[var(--text-heading)]">
                    {{ log.title }}
                  </span>
                  <span class="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
                    {{ store.digits(log.timestamp) }}
                  </span>
                </div>
                @if (log.details.length > 0) {
                  <ul class="space-y-1 text-[11px] text-[var(--text-secondary)] pr-2">
                    @for (d of log.details; track $index) {
                      <li>• {{ d }}</li>
                    }
                  </ul>
                }
              </div>
            } @empty {
              <div class="p-8 text-center space-y-2">
                <mat-icon class="!w-8 !h-8 !text-[32px] text-[#3390EC] mx-auto">history</mat-icon>
                <div class="text-sm font-bold text-[var(--text-heading)]">
                  سجل التبادل جاهز لتوثيق كل حركة بين جهازك وقاعدة البيانات
                </div>
                <p class="text-xs text-[var(--text-secondary)]">
                  اضغط على "مزامنة وفحص ما أتى من قاعدة البيانات الآن" أو جرب وضع الأوفلاين لترى تفاصيل التبادل هنا.
                </p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SyncCenterPage {
  readonly store = inject(StoreService);

  readonly selectedWorkerId = signal<number | null>(null);
  readonly recordDate = signal<string>(this.store.todayIso());
  readonly advanceAmount = signal<number>(0);
  readonly advanceReason = signal<string>('');

  async closeInternetForOfflineMode(): Promise<void> {
    await this.store.toggleLocalOnlyMode(true);
  }

  async openInternetAndSyncNow(): Promise<void> {
    await this.store.toggleLocalOnlyMode(false);
  }

  async manualBidirectionalSync(): Promise<void> {
    await this.store.flushOfflineQueueToDatabase('فحص ومزامنة يدوية مع قاعدة البيانات');
  }

  async recordSmartAdvance(): Promise<void> {
    const wid = this.selectedWorkerId() || this.store.workers()[0]?.id || null;
    const amt = this.advanceAmount();
    if (!wid || amt <= 0) {
      this.store.showToast('يرجى اختيار العامل وإدخال مبلغ السلفة', 'warning');
      return;
    }
    await this.store.addAdvance({
      date: this.recordDate() || this.store.todayIso(),
      workerId: wid,
      amount: amt,
      reason: this.advanceReason().trim() || 'سلفة مسجلة من مركز المزامنة',
      settlementId: null,
      projectId: this.store.selectedProjectId() ?? this.store.projects()[0]?.id ?? null,
      notes: this.advanceReason().trim(),
    });
    this.advanceAmount.set(0);
    this.advanceReason.set('');
  }
}
