import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import { calculateDashboardSummary, calculateSettlement } from '../../core/calc/calculations';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-4 sm:space-y-6">
      <!-- Smart Quick Field Command Strip -->
      <div class="ceramic-card p-3 sm:p-4 bg-gradient-to-l from-indigo-500/10 via-[var(--bg-card)] to-emerald-500/10 border border-indigo-500/20">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <mat-icon class="!w-5 !h-5 !text-[20px]">bolt</mat-icon>
            </span>
            <div>
              <h2 class="text-sm font-black text-[var(--text-heading)]">المساعد الميداني الذكي السريع</h2>
              <p class="text-[11px] text-[var(--text-secondary)]">اكتب أمراً مباشراً مثل: <strong>سلفة 500 أحمد</strong> أو <strong>مصروف 250 مواصلات</strong> ليتم تسجيله فوراً</p>
            </div>
          </div>

          <div class="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              [value]="dashSmartCommand()"
              (input)="dashSmartCommand.set($any($event.target).value)"
              (keydown.enter)="runDashSmartCommand()"
              placeholder="اكتب بالعامية (مثال: وصلني 25000 شيك من طلعت مصطفى لمشروع مدينتي)..."
              class="flex-1 sm:w-64 min-w-0 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              (click)="runDashSmartCommand()"
              class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 shadow-2xs cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">send</mat-icon>
              <span>تنفيذ</span>
            </button>
          </div>
        </div>
      </div>

      <!-- My Comprehensive Ledger & Zaki Capabilities Quick Banner -->
      @let ledger = store.comprehensiveLedger();
      <div class="ceramic-card p-4 sm:p-5 bg-gradient-to-l from-emerald-500/12 via-[var(--bg-card)] to-violet-500/10 border border-emerald-500/30 reveal-section">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-black">
                حسابي الشامل والخزنة
              </span>
              <h2 class="text-base sm:text-lg font-black text-[var(--text-heading)]">
                ملخصك المالي الكامل (واصلك · صرفت · ليك · عليك · صافي ربحك)
              </h2>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div class="text-[10px] font-bold text-[var(--text-secondary)]">إجمالي اللي وصلك</div>
                <div class="text-xs sm:text-sm font-black text-emerald-600 tabular-nums mt-0.5">{{ store.money(ledger.totalReceivedAllSources) }}</div>
              </div>
              <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div class="text-[10px] font-bold text-[var(--text-secondary)]">اتصرف (سلف وقبض ومصاريف)</div>
                <div class="text-xs sm:text-sm font-black text-rose-600 tabular-nums mt-0.5">{{ store.money(ledger.totalSpentAllProjects) }}</div>
              </div>
              <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div class="text-[10px] font-bold text-[var(--text-secondary)]">فلوس ليا (مستحقات)</div>
                <div class="text-xs sm:text-sm font-black text-[#3390EC] tabular-nums mt-0.5">{{ store.money(ledger.totalOwedToMe) }}</div>
              </div>
              <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
                <div class="text-[10px] font-bold text-[var(--text-secondary)]">فلوس عليا (باقي عمال)</div>
                <div class="text-xs sm:text-sm font-black text-amber-600 tabular-nums mt-0.5">{{ store.money(ledger.totalOwedByMe) }}</div>
              </div>
              <div class="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">صافي ربحك العام</div>
                <div class="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{{ store.money(ledger.overallNetProfit) }}</div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap sm:flex-nowrap lg:flex-col gap-2 shrink-0">
            <a
              routerLink="/my-ledger"
              class="flex-1 sm:flex-initial px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-xs"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">account_balance_wallet</mat-icon>
              <span>فتح صفحة حسابي وتفاصيل المشاريع</span>
            </a>
            <button
              type="button"
              (click)="store.showZakiCapabilitiesModal.set(true)"
              class="flex-1 sm:flex-initial px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">auto_awesome</mat-icon>
              <span>ماذا يمكن للبوت (زكي) فعله؟</span>
            </button>
          </div>
        </div>
      </div>

      <!-- NEW: Daily Date Inspector (20-10) + Smart Offline/Online Sync Quick Hub + Developer Attribution -->
      @let dayRep = store.currentDailyDateReport();
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 reveal-section">
        <!-- Daily Date Inspector Quick Card (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-4 sm:p-5 border border-indigo-500/30 bg-gradient-to-l from-indigo-500/10 via-[var(--bg-card)] to-sky-500/5 flex flex-col justify-between gap-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black">جديد وذكي</span>
                <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                  📆 كشف اليوم بالتاريخ ({{ store.digits(dayRep.date) }}) — كان معاك كام واتصرف كام ومين اشتغل
                </h2>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-1">
                اختر أي يوم (مثل ٢٠-١٠) لمعرفة السيولة المتاحة، المصروف، المكسب، والعمال اللي اشتغلوا بالسلف واللي مخدوش سلف.
              </p>
            </div>
            <a
              routerLink="/daily-inspector"
              class="px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center gap-1 shrink-0 shadow-xs"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">calendar_month</mat-icon>
              <span>فتح كشف اليوم الكامل</span>
            </a>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">كان معايا متاح</div>
              <div class="text-xs font-black text-emerald-600 tabular-nums mt-0.5">{{ store.money(dayRep.totalAvailableOnDay) }}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">اتصرف في اليوم</div>
              <div class="text-xs font-black text-rose-600 tabular-nums mt-0.5">{{ store.money(dayRep.totalSpentOnDay) }}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">اشتغلوا (بسلف / بدون)</div>
              <div class="text-xs font-black text-[#3390EC] tabular-nums mt-0.5">
                {{ store.num(dayRep.totalWorkersWhoWorked) }} ({{ store.num(dayRep.workersWhoWorkedWithAdvanceCount) }} سلف / {{ store.num(dayRep.workersWhoWorkedWithoutAdvanceCount) }} بدون)
              </div>
            </div>
            <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">مكسب اليوم</div>
              <div class="text-xs font-black text-emerald-600 tabular-nums mt-0.5">{{ store.money(dayRep.netProfitOnDay) }}</div>
            </div>
          </div>
        </div>

        <!-- Smart Offline Sync & Developer Credit Card (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-4 sm:p-5 border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-[var(--bg-card)] to-emerald-500/10 flex flex-col justify-between gap-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span
                  class="w-2.5 h-2.5 rounded-full"
                  [class.bg-amber-500]="store.localOnlyMode() || !store.isNetworkOnline()"
                  [class.bg-emerald-500]="!store.localOnlyMode() && store.isNetworkOnline()"
                ></span>
                <h3 class="text-sm font-black text-[var(--text-heading)]">
                  🔄 المزامنة الذكية (أوفلاين وقاعدة البيانات)
                </h3>
              </div>
              <p class="text-[11px] text-[var(--text-secondary)] mt-1">
                سجّل سلف أو يوميات وأنت قافل النت، وعند فتح النت يذهب لقاعدة البيانات ويأتي الجديد برسالة تفصيلية.
              </p>
            </div>
            <span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-black shrink-0">
              بالانتظار: {{ store.num(store.offlinePendingQueue().length) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              (click)="store.toggleLocalOnlyMode()"
              class="flex-1 py-2 px-3 rounded-xl font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              [class.bg-emerald-600]="store.localOnlyMode()"
              [class.text-white]="store.localOnlyMode()"
              [class.bg-amber-500]="!store.localOnlyMode()"
              [class.text-slate-950]="!store.localOnlyMode()"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">{{ store.localOnlyMode() ? 'wifi' : 'wifi_off' }}</mat-icon>
              <span>{{ store.localOnlyMode() ? 'فتح النت ومزامنة الطابور الآن' : 'قفل النت مؤقتاً (وضع أوفلاين)' }}</span>
            </button>
            <a
              routerLink="/sync-center"
              class="py-2 px-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[#3390EC] text-xs font-black text-[var(--text-heading)] inline-flex items-center gap-1"
            >
              <span>مركز المزامنة</span>
            </a>
          </div>

          <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-black">
            <span class="text-[var(--text-heading)] flex items-center gap-1">
              <mat-icon class="!w-3.5 !h-3.5 !text-[14px] text-[#3390EC]">verified</mat-icon>
              <span>المطور: م/ {{ store.developerName }}</span>
            </span>
            <a [href]="'tel:' + store.developerPhone" class="text-emerald-600 dark:text-emerald-400 hover:underline tabular-nums" dir="ltr">
              {{ store.developerPhone }}
            </a>
          </div>
        </div>
      </div>

      <!-- Mandatory Daily Headcount & Payday 15 Command Banner -->
      @let hc = store.todayHeadcountMatch();
      @let payday = store.payday15Info();
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 reveal-section">
        <!-- Mandatory Daily Headcount Card (7 cols) -->
        <div
          class="lg:col-span-7 ceramic-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <span
                class="px-3 py-0.5 rounded-full text-[11px] font-bold"
                [class.bg-[#E7C78F]]="!hc.isExactMatch"
                [class.text-[#1F2A37]]="!hc.isExactMatch"
                [class.bg-emerald-600]="hc.isExactMatch"
                [class.text-white]="hc.isExactMatch"
              >
                {{ !hc.hasMandatoryRecord ? 'إجباري كل يوم' : hc.isExactMatch ? 'نفس العدد ✓' : 'يوجد فرق في العدد!' }}
              </span>
              <h2 class="text-lg font-bold text-[var(--text-heading)]">
                دفتر العدد اليومي الإجباري ({{ store.digits(store.todayIso()) }})
              </h2>
            </div>

            <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
              @if (!hc.hasMandatoryRecord) {
                سجّل أولاً <strong>عدد العمالة والنحّاتية وعدد السهرة</strong> اليوم، وبناءً عليه طابق اليوميات المسجلة بالأسماء.
              } @else {
                العدد الإجباري: <strong>{{ store.num(hc.expectedDays) }} يومية</strong> ({{ store.num(hc.expectedRegularWorkers) }} عمال + {{ store.num(hc.expectedSculptors) }} نحات) و <strong>{{ store.num(hc.expectedNights) }} سهرة</strong> · المسجل بالأسماء: <strong>{{ store.num(hc.actualDays) }} يومية</strong> و <strong>{{ store.num(hc.actualNights) }} سهرة</strong> ({{ hc.statusLabel }}).
              }
            </p>
          </div>

          <div class="flex flex-wrap sm:flex-col gap-2 shrink-0">
            <button
              type="button"
              (click)="store.showQuickHeadcountModal.set(true)"
              class="px-4 py-2.5 rounded-full bg-[#3390EC] dark:bg-[#4EA4F6] text-white dark:text-[#0E1621] font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"></path>
              </svg>
              <span>{{ hc.hasMandatoryRecord ? 'تعديل العدد اليومي' : 'تسجيل العدد الإجباري الآن' }}</span>
            </button>
            <a
              routerLink="/bulk"
              class="px-4 py-2 rounded-full border border-[var(--border-subtle)] hover:border-[var(--color-primary)] text-xs font-bold inline-flex items-center justify-center gap-1.5"
            >
              <span>تحويل لتسجيل الأسماء</span>
              <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </a>
          </div>
        </div>

        <!-- Payday 15th & Deductions Card (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 flex flex-col justify-between gap-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 text-sm font-bold text-[#3390EC] dark:text-[#4EA4F6]">
                <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                  <line x1="2" x2="22" y1="10" y2="10"></line>
                </svg>
                <span>دورة قبض يوم {{ store.num(store.settings().paydayDayOfMonth || 15) }} في الشهر</span>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-1">
                {{ payday.label }} · الخصومات المفتوحة: <strong class="text-rose-600">{{ store.money(store.totalOpenDeductions()) }}</strong>
              </p>
            </div>
            <span class="px-3 py-1 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-xs font-bold">
              قبض يوم ١٥
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <a
              routerLink="/settlements"
              class="flex-1 py-2.5 px-4 rounded-full bg-[#3390EC] dark:bg-[#4EA4F6] text-white dark:text-[#0E1621] font-bold text-xs inline-flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              <span>تحويل لكشف قبض يوم ١٥</span>
            </a>
            <a
              routerLink="/deductions"
              class="py-2.5 px-4 rounded-full bg-[var(--color-secondary-soft)] text-[var(--text-heading)] border border-[#E7C78F] font-bold text-xs inline-flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 12h8"></path>
              </svg>
              <span>تسجيل خصم</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Filter & Quick Action Bar -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 ceramic-card p-4 lg:p-5 reveal-section">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
          <div>
            <label for="dash-project-filter" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">فلترة حسب المشروع</label>
            <select
              id="dash-project-filter"
              [value]="store.selectedProjectId() ?? ''"
              (change)="onProjectFilterChange($event)"
              class="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-2xl px-3 py-2 text-sm font-bold text-[var(--text-heading)] focus:outline-none"
            >
              <option value="">كل المشاريع ({{ store.num(store.projects().length) }})</option>
              @for (proj of store.projects(); track proj.id) {
                <option [value]="proj.id">{{ proj.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="dash-period-from" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">من تاريخ</label>
            <input
              id="dash-period-from"
              type="date"
              [value]="fromDate()"
              (change)="fromDate.set($any($event.target).value)"
              class="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-2xl px-3 py-2 text-sm tabular-nums text-[var(--text-heading)]"
            />
          </div>

          <div>
            <label for="dash-period-to" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">إلى تاريخ</label>
            <input
              id="dash-period-to"
              type="date"
              [value]="toDate()"
              (change)="toDate.set($any($event.target).value)"
              class="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-2xl px-3 py-2 text-sm tabular-nums text-[var(--text-heading)]"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a
            routerLink="/bulk"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#3390EC] dark:bg-[#4EA4F6] text-white dark:text-[#0E1621] font-bold text-xs transition-colors whitespace-nowrap shadow-2xs"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
            <span>إضافة جماعية سريعة</span>
          </a>
          <a
            routerLink="/zaki"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-bold text-xs transition-colors whitespace-nowrap"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 8V4H8"></path>
              <rect width="16" height="12" x="4" y="8" rx="2"></rect>
              <path d="M2 14h2M20 14h2M15 13v2M9 13v2"></path>
            </svg>
            <span>اسأل زكي الذكي</span>
          </a>
          <button
            type="button"
            (click)="excel.exportFullWorkbook()"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border-subtle)] hover:border-[var(--color-primary)] text-xs font-bold transition-colors whitespace-nowrap"
          >
            <svg class="w-4 h-4 text-[#3390EC] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      <!-- Primary Financial & Attendance KPIs (1 col mobile, 2 cols tablet, 4 cols desktop) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 reveal-section">
        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-[var(--text-secondary)] text-xs font-bold mb-2">
            <span>إجمالي اليوميات والسهرات</span>
            <span class="w-9 h-9 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
          </div>
          <div class="text-2xl font-bold tabular-nums text-[var(--text-heading)]">
            {{ store.num(filteredSummary().totalDays) }} يومية
            <span class="text-sm font-medium text-[var(--text-secondary)]">· {{ store.num(filteredSummary().totalNights) }} سهرة</span>
          </div>
          <p class="text-xs text-[var(--text-secondary)] mt-2">
            أجور العمال والناش: <strong class="tabular-nums text-[var(--text-heading)]">{{ store.money(filteredSummary().totalWorkerWages) }}</strong>
          </p>
        </div>

        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-[var(--text-secondary)] text-xs font-bold mb-2">
            <span>المطلوب من الشركة (صافي)</span>
            <span class="w-9 h-9 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"></path>
              </svg>
            </span>
          </div>
          <div class="text-2xl font-bold tabular-nums text-[var(--text-heading)]">
            {{ store.money(filteredSummary().requiredFromCompany) }}
          </div>
          <p class="text-xs text-[var(--text-secondary)] mt-2">
            الواصل فعلياً: <strong class="tabular-nums text-[#3390EC] dark:text-[#4EA4F6]">{{ store.money(filteredSummary().totalCollected) }}</strong>
          </p>
        </div>

        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-[var(--text-secondary)] text-xs font-bold mb-2">
            <span>المتبقي طرف الشركة</span>
            <span class="w-9 h-9 rounded-full bg-[var(--color-secondary-soft)] text-amber-800 dark:text-[#E7C78F] flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
          </div>
          <div class="text-2xl font-bold tabular-nums text-amber-700 dark:text-[#E7C78F]">
            {{ store.money(filteredSummary().remainingFromCompany) }}
          </div>
          <p class="text-xs text-[var(--text-secondary)] mt-2">
            المصاريف الخارجية: <strong class="tabular-nums text-rose-600 dark:text-rose-400">{{ store.money(filteredSummary().totalExternalExpenses) }}</strong>
          </p>
        </div>

        <div class="ceramic-hero p-5 text-white">
          <div class="flex items-center justify-between text-slate-300 text-xs font-bold mb-2">
            <span>صافي الربح التقريبي</span>
            <span class="w-9 h-9 rounded-full bg-white/10 text-[#4EA4F6] flex items-center justify-center">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
                <polyline points="16 7 22 7 22 13"></polyline>
              </svg>
            </span>
          </div>
          <div
            class="text-2xl font-bold tabular-nums"
            [class.text-[#4EA4F6]]="filteredSummary().ApproximateNetProfit >= 0"
            [class.text-rose-400]="filteredSummary().ApproximateNetProfit < 0"
          >
            {{ store.money(filteredSummary().ApproximateNetProfit) }}
          </div>
          <p class="text-xs text-slate-300 mt-2">
            المطلوب − أجور العمال − المصاريف
          </p>
        </div>
      </div>

      <!-- Secondary Row: Smart Alerts with Navigation Buttons & Checks/Deductions Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 reveal-section">
        <!-- Smart Alerts Panel (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <h2 class="text-lg font-bold text-[var(--text-heading)] flex items-center gap-2">
              <svg class="w-5 h-5 text-[#3390EC]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
              </svg>
              <span>مركز التنبيهات الذكية السريعة (مع زر التحويل المباشر)</span>
            </h2>
            <span class="text-xs px-3 py-1 rounded-full bg-[var(--color-secondary-soft)] text-[var(--text-heading)] font-bold">
              {{ store.num(store.smartAlerts().length) }} تنبيهات
            </span>
          </div>

          <div class="space-y-2.5">
            @for (alert of store.smartAlerts(); track alert.id) {
              <div
                class="p-3.5 rounded-[16px] border flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-all"
                [class.bg-[var(--color-secondary-soft)]]="alert.severity === 'danger' || alert.severity === 'warning'"
                [class.border-[#E7C78F]]="alert.severity === 'danger' || alert.severity === 'warning'"
                [class.bg-[var(--bg-app)]]="alert.severity === 'info' || alert.severity === 'success'"
                [class.border-[var(--border-subtle)]]="alert.severity === 'info' || alert.severity === 'success'"
              >
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-full bg-[var(--bg-card)] flex items-center justify-center shrink-0 border border-[var(--border-subtle)]">
                    <mat-icon
                      class="!text-lg !w-5 !h-5"
                      [class.text-[#3390EC]]="alert.severity === 'info' || alert.severity === 'success'"
                      [class.text-amber-700]="alert.severity === 'warning' || alert.severity === 'danger'"
                    >
                      {{ alert.icon }}
                    </mat-icon>
                  </div>
                  <div>
                    <p class="text-xs font-bold text-[var(--text-heading)]">
                      {{ alert.title }}
                    </p>
                    <p class="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {{ alert.subtitle }}
                    </p>
                  </div>
                </div>

                <a
                  [routerLink]="alert.route"
                  class="px-4 py-2 rounded-full bg-[#3390EC] dark:bg-[#4EA4F6] text-white dark:text-[#0E1621] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>{{ alert.actionLabel }}</span>
                  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6"></path>
                  </svg>
                </a>
              </div>
            }
          </div>
        </div>

        <!-- Checks, Advances & Deductions Summary (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <h2 class="text-lg font-bold text-[var(--text-heading)]">
              موقف الشيكات والسلف والخصومات
            </h2>
            <a routerLink="/checks" class="text-xs text-[#3390EC] dark:text-[#4EA4F6] font-bold hover:underline">
              تحويل للشيكات
            </a>
          </div>

          <div class="divide-y divide-[var(--border-subtle)] text-sm">
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">شيكات واردة معلقة</span>
              <span class="font-bold tabular-nums px-2.5 py-0.5 rounded-full bg-[var(--color-secondary-soft)] text-[var(--text-heading)]">{{ store.money(filteredSummary().incomingChecksPending) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">شيكات واردة اتصرفت</span>
              <span class="font-bold tabular-nums text-[#3390EC] dark:text-[#4EA4F6]">{{ store.money(filteredSummary().incomingChecksCashed) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">شيكات صادرة معلقة</span>
              <span class="font-bold tabular-nums px-2.5 py-0.5 rounded-full bg-[var(--color-secondary-soft)] text-[var(--text-heading)]">{{ store.money(filteredSummary().outgoingChecksPending) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">إجمالي السلف المفتوحة</span>
              <span class="font-bold tabular-nums text-[var(--text-heading)]">{{ store.money(filteredSummary().totalAdvancesGiven) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-[var(--text-secondary)]">إجمالي الخصومات والجزاءات المفتوحة</span>
              <span class="font-bold tabular-nums text-rose-600">{{ store.money(store.totalOpenDeductions()) }}</span>
            </div>
          </div>

          <!-- Quick Jump Grid inside Card -->
          <div class="grid grid-cols-2 gap-2 pt-2">
            <a
              routerLink="/advances"
              class="p-2.5 px-4 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--color-primary)] text-xs font-bold flex items-center justify-between"
            >
              <span>تحويل للسلف</span>
              <svg class="w-3.5 h-3.5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </a>
            <a
              routerLink="/deductions"
              class="p-2.5 px-4 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-xs font-bold flex items-center justify-between"
            >
              <span>تحويل للخصومات</span>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </a>
          </div>
        </div>
      </div>

      <!-- NEW SECTION: Live Payday 15th Preview & Activity Stream -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 reveal-section">
        <!-- Live Payday 15th Payroll Sheet Preview (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 class="text-lg font-bold text-[var(--text-heading)] flex items-center gap-2">
                <svg class="w-5 h-5 text-[#3390EC]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span>معاينة كشف قبض يوم ١٥ المباشر ({{ store.digits(payday.from) }} ← {{ store.digits(payday.to) }})</span>
              </h2>
              <p class="text-xs text-[var(--text-secondary)]">حساب فوري لليوميات والسهرات مخصوماً منه السلف والجزاءات لكل عامل ونحّات</p>
            </div>
            <a routerLink="/settlements" class="px-4 py-2 rounded-full bg-[#3390EC] text-white text-xs font-bold">
              فتح كشف القبض الكامل
            </a>
          </div>

          @if (paydayPreviewRows().length > 0) {
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-right">
                <thead>
                  <tr class="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    <th class="py-2 px-2">العامل / النحّات</th>
                    <th class="py-2 px-2">اليوميات والسهرات</th>
                    <th class="py-2 px-2">السلف والخصومات</th>
                    <th class="py-2 px-2">صافي قبض ١٥</th>
                    <th class="py-2 px-2">كشف واتساب</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[var(--border-subtle)]">
                  @for (row of paydayPreviewRows(); track row.worker.id) {
                    <tr
                      (click)="store.openWorkerSheet(row.worker.id!)"
                      class="hover:bg-[var(--bg-app)] cursor-pointer transition-colors"
                    >
                      <td class="py-2.5 px-2 font-bold text-[var(--text-heading)]">
                        {{ row.worker.name }}
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] mr-1">{{ row.worker.role }}</span>
                      </td>
                      <td class="py-2.5 px-2 tabular-nums">
                        {{ store.num(row.calc.days) }} ي · {{ store.num(row.calc.nights) }} س
                      </td>
                      <td class="py-2.5 px-2 tabular-nums text-rose-600">
                        {{ store.money(row.calc.advancesDeducted + row.calc.deductionsDeducted) }}
                      </td>
                      <td class="py-2.5 px-2 font-bold tabular-nums text-[#3390EC] dark:text-[#4EA4F6]">
                        {{ store.money(row.calc.netPaid) }}
                      </td>
                      <td class="py-2.5 px-2" (click)="$event.stopPropagation()">
                        <button
                          type="button"
                          (click)="copyWorkerPaydaySlip(row.worker.name, row.worker.role, row.calc)"
                          class="px-3 py-1 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-emerald-500 text-[11px] font-bold cursor-pointer"
                        >
                          نسخ الكشف
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="p-6 rounded-2xl bg-[var(--bg-app)] border border-dashed border-[var(--border-subtle)] text-center space-y-2">
              <p class="text-xs font-bold text-[var(--text-heading)]">لا يوجد عمال أو نحاتية مسجلون حالياً في دورة قبض يوم ١٥</p>
              <p class="text-xs text-[var(--text-secondary)]">بمجرد إضافة العمال وتسجيل اليوميات أو الخصومات سيظهر كشف قبض يوم ١٥ هنا تلقائياً.</p>
            </div>
          }
        </div>

        <!-- Live Activity Stream with Quick Undo / Redo (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <h2 class="text-lg font-bold text-[var(--text-heading)]">
              سجل آخر الحركات والتراجع السريع
            </h2>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                (click)="store.undoLastOperation()"
                [disabled]="!store.lastUndo()"
                class="px-3 py-1 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] font-bold disabled:opacity-40"
              >
                تراجع
              </button>
              <button
                type="button"
                (click)="store.redoLastOperation()"
                [disabled]="!store.lastRedo()"
                class="px-3 py-1 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-[11px] font-bold disabled:opacity-40"
              >
                رد التراجع
              </button>
            </div>
          </div>

          <div class="space-y-2 max-h-56 overflow-y-auto">
            @for (log of store.auditLogs().slice(0, 6); track log.id || $index) {
              <div class="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-start justify-between gap-2 text-xs">
                <div>
                  <div class="font-bold text-[var(--text-heading)] flex flex-wrap items-center gap-1.5">
                    <span>{{ log.action }} — <span class="text-[#3390EC]">{{ log.entity }}</span></span>
                    @if (log.deviceName) {
                      <span class="px-2 py-0.5 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-[10px] font-bold">
                        📱 {{ log.deviceName }}
                      </span>
                    }
                  </div>
                  <p class="text-[11px] text-[var(--text-secondary)] mt-0.5">{{ log.details }}</p>
                </div>
                <span class="text-[10px] text-[var(--text-secondary)] tabular-nums shrink-0">{{ store.digits(log.timestamp.slice(11)) }}</span>
              </div>
            } @empty {
              <div class="p-5 rounded-2xl bg-[var(--bg-app)] border border-dashed border-[var(--border-subtle)] text-center">
                <p class="text-xs text-[var(--text-secondary)]">سجل الحركات فارغ حالياً — أي عملية تسجيل أو تراجع أو رد تراجع ستظهر هنا فوراً مع اسم الجهاز.</p>
              </div>
            }
          </div>

        </div>
      </div>

      <!-- Project Comparison & Quick Setup Section -->
      <div class="ceramic-card p-5 space-y-4 reveal-section">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-bold text-[var(--text-heading)]">حسابات المشاريع والأداء المالي (اضغط على أي مشروع للتفاصيل الكاملة)</h2>
            <p class="text-sm text-[var(--text-secondary)]">مقارنة اليوميات والمطلوب من الشركة والمنصرف وصافي الربح لكل مشروع</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              (click)="store.openPocketSheet(null, store.selectedProjectId())"
              class="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-extrabold cursor-pointer"
            >
              ما تم سحبه من شيك المشروع والمنصرف
            </button>
            <a routerLink="/my-ledger" class="px-4 py-2 rounded-full bg-[#3390EC] dark:bg-[#4EA4F6] text-white dark:text-[#0E1621] text-xs font-bold">
              الخزنة وحسابات المشاريع
            </a>
            <a routerLink="/settings" class="px-4 py-2 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5">
              <span>+ مشروع جديد</span>
            </a>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          @for (item of projectComparisons(); track item.project.id) {
            <div
              (click)="store.openProjectSheet(item.project.id!)"
              class="p-4 rounded-[18px] bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[#3390EC] cursor-pointer transition-all space-y-3"
            >
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-[var(--text-heading)] text-sm flex items-center gap-1.5">
                  <span>{{ item.project.name }}</span>
                  <span class="px-2 py-0.5 rounded-md bg-[#3390EC]/15 text-[#3390EC] text-[10px] font-extrabold">التفاصيل</span>
                </h3>
                <span class="text-xs px-2.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] font-bold text-[var(--text-secondary)] tabular-nums">
                  {{ store.num(item.summary.totalDays) }} يومية
                </span>
              </div>

              <div class="space-y-2 text-xs">
                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-[var(--text-secondary)]">المطلوب من الشركة</span>
                    <span class="font-bold tabular-nums">{{ store.money(item.summary.requiredFromCompany) }}</span>
                  </div>
                  <div class="h-2 w-full bg-[var(--border-subtle)] rounded-full overflow-hidden">
                    <div class="h-full bg-[#3390EC] rounded-full chart-bar-fill" [style.width.%]="item.reqPercent"></div>
                  </div>
                </div>

                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-[var(--text-secondary)]">التكلفة (أجور + مصاريف)</span>
                    <span class="font-bold tabular-nums">{{ store.money(item.summary.totalWorkerWages + item.summary.totalExternalExpenses) }}</span>
                  </div>
                  <div class="h-2 w-full bg-[var(--border-subtle)] rounded-full overflow-hidden">
                    <div class="h-full bg-[#E7C78F] rounded-full chart-bar-fill" [style.width.%]="item.costPercent"></div>
                  </div>
                </div>

                <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <span class="text-[var(--text-secondary)]">صافي الربح:</span>
                  <span
                    class="font-bold tabular-nums"
                    [class.text-[#3390EC]]="item.summary.ApproximateNetProfit >= 0"
                    [class.text-rose-600]="item.summary.ApproximateNetProfit < 0"
                  >
                    {{ store.money(item.summary.ApproximateNetProfit) }}
                  </span>
                </div>
              </div>
            </div>
          } @empty {
            <div class="md:col-span-3 p-8 rounded-[20px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)]/60 text-center space-y-3">
              <div class="w-12 h-12 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center mx-auto">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </div>
              <h3 class="text-base font-bold text-[var(--text-heading)]">
                الأرقام كلها صفر (٠) وجاهزة لتسجيل أعمالك الحقيقية!
              </h3>
              <p class="text-sm text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
                ابدأ بإضافة مشروعك الأول، ثم أضف العمال والنحاتية، وسجّل العدد اليومي الإجباري لمطابقة اليوميات والسهرات وحساب قبض يوم ١٥ تلقائياً.
              </p>
              <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a routerLink="/settings" class="px-4 py-2 rounded-full bg-[#3390EC] text-white text-xs font-bold">
                  ١. إضافة مشروع جديد
                </a>
                <a routerLink="/workers" class="px-4 py-2 rounded-full bg-[var(--color-secondary-soft)] border border-[#E7C78F] text-[var(--text-heading)] text-xs font-bold">
                  ٢. إضافة العمال والنحاتية
                </a>
                <button
                  type="button"
                  (click)="store.showQuickHeadcountModal.set(true)"
                  class="px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-bold"
                >
                  ٣. تسجيل العدد اليومي الإجباري
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly fromDate = signal<string>('2026-10-01');
  readonly toDate = signal<string>('2026-10-31');

  readonly filteredSummary = computed(() =>
    calculateDashboardSummary({
      attendances: this.store.attendances(),
      extractLines: this.store.extractLines(),
      advances: this.store.advances(),
      checks: this.store.checks(),
      expenses: this.store.expenses(),
      extras: this.store.extras(),
      extraCashes: this.store.extraCashes(),
      projectId: this.store.selectedProjectId(),
      fromDate: this.fromDate(),
      toDate: this.toDate(),
    })
  );

  readonly paydayPreviewRows = computed(() => {
    const cycle = this.store.payday15Info();
    const workers = this.store.activeWorkers();
    const att = this.store.attendances();
    const adv = this.store.advances();
    const ec = this.store.extraCashes();
    const ext = this.store.extras();
    const ded = this.store.deductions();
    return workers.slice(0, 8).map((worker) => ({
      worker,
      calc: calculateSettlement(worker, cycle.from, cycle.to, att, adv, ec, ext, ded),
    }));
  });

  readonly projectComparisons = computed(() => {
    const projects = this.store.projects();
    const items = projects.map((proj) => {
      const pExtracts = new Set(
        this.store
          .extracts()
          .filter((e) => e.projectId === proj.id)
          .map((e) => e.id!)
      );
      const pLines = this.store.extractLines().filter((l) => pExtracts.has(l.extractId));
      const summary = calculateDashboardSummary({
        attendances: this.store.attendances(),
        extractLines: pLines,
        advances: [],
        checks: this.store.checks(),
        expenses: this.store.expenses(),
        extras: this.store.extras(),
        extraCashes: this.store.extraCashes(),
        projectId: proj.id,
        fromDate: this.fromDate(),
        toDate: this.toDate(),
      });
      return { project: proj, summary };
    });

    const maxVal = Math.max(
      1,
      ...items.map((i) =>
        Math.max(
          i.summary.requiredFromCompany,
          i.summary.totalWorkerWages + i.summary.totalExternalExpenses
        )
      )
    );

    return items.map((i) => ({
      ...i,
      reqPercent: Math.min(100, Math.round((i.summary.requiredFromCompany / maxVal) * 100)),
      costPercent: Math.min(
        100,
        Math.round(
          ((i.summary.totalWorkerWages + i.summary.totalExternalExpenses) / maxVal) * 100
        )
      ),
    }));
  });

  onProjectFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.store.selectedProjectId.set(val ? Number(val) : null);
  }

  async copyWorkerPaydaySlip(
    name: string,
    role: string,
    calc: { days: number; nights: number; grossWages: number; advancesDeducted: number; deductionsDeducted: number; netPaid: number }
  ): Promise<void> {
    const cycle = this.store.payday15Info();
    const text = [
      `🧾 *كشف حساب قبض يوم ١٥ — ${name} (${role})*`,
      `📅 الفترة: من ${this.store.digits(cycle.from)} إلى ${this.store.digits(cycle.to)}`,
      `━━━━━━━━━━━━━━`,
      `☀️ اليوميات: ${this.store.num(calc.days)} يومية`,
      `🌙 السهرات: ${this.store.num(calc.nights)} سهرة`,
      `💰 إجمالي الاستحقاق: ${this.store.money(calc.grossWages)}`,
      `💵 السلف المخصومة: ${this.store.money(calc.advancesDeducted)}`,
      `📉 الخصومات والجزاءات: ${this.store.money(calc.deductionsDeducted)}`,
      `━━━━━━━━━━━━━━`,
      `✅ *صافي المبلغ المستحق للقبض:* ${this.store.money(calc.netPaid)}`,
    ].join('\n');

    if (isPlatformBrowser(this.platformId) && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      this.store.showToast(`تم نسخ كشف قبض "${name}" جاهزاً للواتساب`, 'success');
    }
  }

  readonly dashSmartCommand = signal<string>('');

  async runDashSmartCommand(): Promise<void> {
    const cmd = this.dashSmartCommand().trim();
    if (!cmd) return;
    const ok = await this.store.executeSmartCommand(cmd);
    if (ok) {
      this.dashSmartCommand.set('');
    }
  }
}
