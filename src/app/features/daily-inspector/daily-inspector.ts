import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import type { DailyDateWorkerRow } from '../../core/calc/calculations';
import type { ExpenseCategory } from '../../core/db/models';

@Component({
  selector: 'app-daily-inspector-page',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6 pb-16">
      <!-- Header & Date Picker Hero Banner -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-xs space-y-5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2 text-xs font-bold text-[#3390EC]">
              <mat-icon class="!w-4 !h-4 !text-[16px]">event_note</mat-icon>
              <span>كشف حساب وتفاصيل اليوم الشامل (بالساعة والتاريخ)</span>
            </div>
            <h1 class="text-xl sm:text-2xl font-extrabold text-[var(--text-heading)]">
              كشف يوم {{ store.digits(selectedDate()) }} — كان معايا كام واتصرف كام ومين اشتغل والمكسب
            </h1>
            <p class="text-xs sm:text-sm text-[var(--text-secondary)]">
              حدد أي يوم (مثل ٢٠-١٠) لمعرفة السيولة المتاحة، إجمالي المنصرف، عدد العمال والنحاتية، المكسب الصافي، وكشف العمال بالسلف التي أخذوها في هذا اليوم ومن لم يأخذ سلف.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <a
              routerLink="/live-excel"
              class="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">grid_on</mat-icon>
              <span>فتح في شيت الإكسيل المباشر</span>
            </a>

            <button
              type="button"
              (click)="applyDateAsGlobalWorkingDate()"
              class="px-3.5 py-2 rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:bg-[#3390EC] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">edit_calendar</mat-icon>
              <span>اعتماد {{ store.digits(selectedDate()) }} للتسجيل في الموقع</span>
            </button>

            <button
              type="button"
              (click)="exportDayExcel()"
              class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">table_view</mat-icon>
              <span>تصدير كشف اليوم Excel</span>
            </button>

            <button
              type="button"
              (click)="copyDayWhatsAppSummary()"
              class="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-emerald-500 text-[var(--text-heading)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600">share</mat-icon>
              <span>نسخ تقرير اليوم للواتساب</span>
            </button>
          </div>
        </div>

        <!-- Date Navigation & Project Selector Controls -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <!-- Date Picker + Prev/Next Day -->
          <div class="md:col-span-5 flex items-center gap-2">
            <button
              type="button"
              (click)="shiftDate(-1)"
              title="اليوم السابق"
              aria-label="اليوم السابق"
              class="px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[#3390EC] text-xs font-bold text-[var(--text-heading)] inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">chevron_right</mat-icon>
              <span>السابق</span>
            </button>

            <div class="relative flex-1">
              <label for="inspector-date-input" class="sr-only">اختر تاريخ اليوم</label>
              <input
                id="inspector-date-input"
                type="date"
                [value]="selectedDate()"
                (input)="setDate($any($event.target).value)"
                class="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#3390EC] bg-[var(--bg-app)] text-sm font-extrabold text-[var(--text-heading)] focus:outline-none tabular-nums"
              />
            </div>

            <button
              type="button"
              (click)="shiftDate(1)"
              title="اليوم التالي"
              aria-label="اليوم التالي"
              class="px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-[#3390EC] text-xs font-bold text-[var(--text-heading)] inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>التالي</span>
              <mat-icon class="!w-4 !h-4 !text-[16px]">chevron_left</mat-icon>
            </button>
          </div>

          <!-- Project Filter -->
          <div class="md:col-span-3">
            <label for="inspector-project-select" class="sr-only">فلتر المشروع</label>
            <select
              id="inspector-project-select"
              [value]="selectedProjectId() ?? ''"
              (change)="onProjectChange($any($event.target).value)"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)] focus:border-[#3390EC] focus:outline-none"
            >
              <option value="">جميع المشاريع (كشف شامل لليوم)</option>
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <!-- Search Worker in Day -->
          <div class="md:col-span-4 relative">
            <label for="inspector-worker-search" class="sr-only">بحث باسم العامل في هذا اليوم</label>
            <input
              id="inspector-worker-search"
              type="text"
              [value]="searchQuery()"
              (input)="searchQuery.set($any($event.target).value)"
              placeholder="ابحث باسم العامل أو المهنة أو سبب السلفة..."
              class="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs text-[var(--text-heading)] placeholder:text-[var(--text-secondary)] focus:border-[#3390EC] focus:outline-none"
            />
          </div>
        </div>

        <!-- Quick Date Shortcuts (اليوم، أمس، ٢٠-١٠، والأيام المسجلة فعلياً) -->
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="text-xs font-bold text-[var(--text-secondary)] ml-1">اختصارات الأيام السريعة:</span>
          <button
            type="button"
            (click)="setDate(store.systemActualToday())"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            [class.bg-[#3390EC]]="selectedDate() === store.systemActualToday()"
            [class.text-white]="selectedDate() === store.systemActualToday()"
            [class.bg-[var(--bg-app)]]="selectedDate() !== store.systemActualToday()"
            [class.text-[var(--text-heading)]]="selectedDate() !== store.systemActualToday()"
          >
            اليوم ({{ store.digits(store.systemActualToday()) }})
          </button>

          <button
            type="button"
            (click)="setDate(store.getYesterdayIso())"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            [class.bg-[#3390EC]]="selectedDate() === store.getYesterdayIso()"
            [class.text-white]="selectedDate() === store.getYesterdayIso()"
            [class.bg-[var(--bg-app)]]="selectedDate() !== store.getYesterdayIso()"
            [class.text-[var(--text-heading)]]="selectedDate() !== store.getYesterdayIso()"
          >
            أمس ({{ store.digits(store.getYesterdayIso()) }})
          </button>

          <button
            type="button"
            (click)="setDate('2026-10-20')"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-emerald-500/40"
            [class.bg-emerald-600]="selectedDate() === '2026-10-20'"
            [class.text-white]="selectedDate() === '2026-10-20'"
            [class.bg-emerald-500/10]="selectedDate() !== '2026-10-20'"
            [class.text-emerald-700]="selectedDate() !== '2026-10-20'"
          >
            يوم ٢٠-١٠ (2026-10-20)
          </button>

          @for (d of activeRecordedDates(); track d) {
            @if (d !== store.systemActualToday() && d !== store.getYesterdayIso() && d !== '2026-10-20') {
              <button
                type="button"
                (click)="setDate(d)"
                class="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-[var(--border-subtle)]"
                [class.bg-[#3390EC]]="selectedDate() === d"
                [class.text-white]="selectedDate() === d"
                [class.bg-[var(--bg-app)]]="selectedDate() !== d"
                [class.text-[var(--text-heading)]]="selectedDate() !== d"
              >
                {{ store.digits(d) }}
              </button>
            }
          }
        </div>
      </div>

      <!-- 4 Primary Financial & Workforce Pillars for the Selected Day -->
      @let rep = report();
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <!-- Card 1: كان معايا كام (السيولة المتاحة في هذا اليوم) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--text-secondary)]">١. كان معايا كام في هذا اليوم</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-[#3390EC]">account_balance_wallet</mat-icon>
          </div>
          <div class="text-2xl font-extrabold text-[var(--text-heading)] tabular-nums">
            {{ store.money(effectiveCashAvailableToday()) }}
          </div>
          <div class="space-y-1 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <div class="flex justify-between">
              <span>رصيد مرحّل قبل {{ store.digits(rep.date) }}:</span>
              <span class="font-bold text-[var(--text-heading)] tabular-nums">{{ store.money(rep.openingCashBeforeDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>وارد / مسحوب في نفس اليوم:</span>
              <span class="font-bold text-emerald-600 tabular-nums">+{{ store.money(rep.incomingOnDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>الباقي آخر اليوم بعد الصرف:</span>
              <span class="font-extrabold text-[#3390EC] tabular-nums">{{ store.money(effectiveCashRemainingEndOfDay()) }}</span>
            </div>
          </div>
        </div>

        <!-- Card 2: اتصرف كام (إجمالي المنصرف في هذا اليوم) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--text-secondary)]">٢. اتصرف كام في هذا اليوم</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-500">payments</mat-icon>
          </div>
          <div class="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
            {{ store.money(rep.totalSpentOnDay) }}
          </div>
          <div class="space-y-1 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <div class="flex justify-between">
              <span>سلف العمال في هذا اليوم ({{ store.num(rep.advancesOnDayList.length) }}):</span>
              <span class="font-bold text-amber-600 tabular-nums">{{ store.money(rep.advancesSpentOnDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>مصاريف الموقع الخارجية ({{ store.num(rep.expensesOnDayList.length) }}):</span>
              <span class="font-bold text-rose-600 tabular-nums">{{ store.money(rep.expensesSpentOnDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>تسويات وقبض منصرف اليوم:</span>
              <span class="font-bold text-[var(--text-heading)] tabular-nums">{{ store.money(rep.settlementsPaidOnDay) }}</span>
            </div>
          </div>
        </div>

        <!-- Card 3: كام واحد اشتغل (العمالة والسلف في هذا اليوم) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--text-secondary)]">٣. كام واحد اشتغل اليوم</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-emerald-600">groups</mat-icon>
          </div>
          <div class="text-2xl font-extrabold text-[var(--text-heading)] tabular-nums">
            {{ store.num(rep.totalWorkersWhoWorked) }} فرد اشتغلوا
          </div>
          <div class="space-y-1 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <div class="flex justify-between">
              <span>التفصيل ({{ store.num(rep.regularWorkersWhoWorked) }} عامل · {{ store.num(rep.sculptorsWhoWorked) }} نحات):</span>
              <span class="font-bold text-[var(--text-heading)] tabular-nums">{{ store.num(rep.totalDayUnits) }} يومية · {{ store.num(rep.totalNightUnits) }} سهرة</span>
            </div>
            <div class="flex justify-between">
              <span>اشتغلوا وأخدوا سلف اليوم:</span>
              <span class="font-bold text-amber-600 tabular-nums">{{ store.num(rep.workersWhoWorkedWithAdvanceCount) }} عامل</span>
            </div>
            <div class="flex justify-between">
              <span>اشتغلوا وماخدوش سلف اليوم:</span>
              <span class="font-bold text-emerald-600 tabular-nums">{{ store.num(rep.workersWhoWorkedWithoutAdvanceCount) }} عامل</span>
            </div>
          </div>
        </div>

        <!-- Card 4: المكسب وكل حاجة (صافي ربح اليوم) -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--text-secondary)]">٤. المكسب وصافي ربح اليوم</span>
            <mat-icon class="!w-5 !h-5 !text-[20px] text-emerald-600">trending_up</mat-icon>
          </div>
          <div
            class="text-2xl font-extrabold tabular-nums"
            [class.text-emerald-600]="rep.netProfitOnDay >= 0"
            [class.text-rose-600]="rep.netProfitOnDay < 0"
          >
            {{ store.money(rep.netProfitOnDay) }}
          </div>
          <div class="space-y-1 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            <div class="flex justify-between">
              <span>مستحق الشركة عن شغل اليوم:</span>
              <span class="font-bold text-[var(--text-heading)] tabular-nums">{{ store.money(rep.companyEntitlementOnDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>إجمالي يوميات العمال اليوم:</span>
              <span class="font-bold text-[var(--text-heading)] tabular-nums">{{ store.money(rep.workerGrossWagesOnDay) }}</span>
            </div>
            <div class="flex justify-between">
              <span>مكسب المصنعيات قبل المصاريف:</span>
              <span class="font-bold text-emerald-600 tabular-nums">{{ store.money(rep.grossLaborMarginOnDay) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Action Bar to Record Attendance / Advance / Expense Directly on this Selected Date -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <mat-icon class="!w-5 !h-5 !text-[20px] text-[#3390EC]">bolt</mat-icon>
            <h2 class="text-sm font-extrabold text-[var(--text-heading)]">
              تسجيل سريع مباشر في يوم {{ store.digits(selectedDate()) }} (سلفة / حضور / مصروف)
            </h2>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              (click)="activeQuickTab.set('advance')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-[#3390EC]]="activeQuickTab() === 'advance'"
              [class.text-white]="activeQuickTab() === 'advance'"
              [class.bg-[var(--bg-app)]]="activeQuickTab() !== 'advance'"
              [class.text-[var(--text-heading)]]="activeQuickTab() !== 'advance'"
            >
              + سلفة عامل في هذا اليوم
            </button>
            <button
              type="button"
              (click)="activeQuickTab.set('attendance')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-[#3390EC]]="activeQuickTab() === 'attendance'"
              [class.text-white]="activeQuickTab() === 'attendance'"
              [class.bg-[var(--bg-app)]]="activeQuickTab() !== 'attendance'"
              [class.text-[var(--text-heading)]]="activeQuickTab() !== 'attendance'"
            >
              + تحضير عامل في هذا اليوم
            </button>
            <button
              type="button"
              (click)="activeQuickTab.set('expense')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-[#3390EC]]="activeQuickTab() === 'expense'"
              [class.text-white]="activeQuickTab() === 'expense'"
              [class.bg-[var(--bg-app)]]="activeQuickTab() !== 'expense'"
              [class.text-[var(--text-heading)]]="activeQuickTab() !== 'expense'"
            >
              + مصروف موقع في هذا اليوم
            </button>
          </div>
        </div>

        @if (activeQuickTab() === 'advance') {
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label for="qa-worker" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">العامل / النحات</label>
              <select
                id="qa-worker"
                [value]="quickWorkerId() ?? ''"
                (change)="quickWorkerId.set(+$any($event.target).value || null)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                <option value="">اختر العامل...</option>
                @for (w of store.workers(); track w.id) {
                  <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
                }
              </select>
            </div>
            <div>
              <label for="qa-amount" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">مبلغ السلفة (ج.م)</label>
              <input
                id="qa-amount"
                type="number"
                min="1"
                [value]="quickAmount() || ''"
                (input)="quickAmount.set(+$any($event.target).value || 0)"
                placeholder="مثلاً 200"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)] tabular-nums"
              />
            </div>
            <div>
              <label for="qa-reason" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">البيان / سبب السلفة</label>
              <input
                id="qa-reason"
                type="text"
                [value]="quickNote()"
                (input)="quickNote.set($any($event.target).value)"
                placeholder="سلفة نقدية / مصاريف..."
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs text-[var(--text-heading)]"
              />
            </div>
            <div class="flex items-end">
              <button
                type="button"
                (click)="submitQuickAdvance()"
                class="w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">add_card</mat-icon>
                <span>تسجيل السلفة في {{ store.digits(selectedDate()) }}</span>
              </button>
            </div>
          </div>
        } @else if (activeQuickTab() === 'attendance') {
          <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label for="qatt-worker" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">العامل / النحات</label>
              <select
                id="qatt-worker"
                [value]="quickWorkerId() ?? ''"
                (change)="quickWorkerId.set(+$any($event.target).value || null)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                <option value="">اختر العامل...</option>
                @for (w of store.workers(); track w.id) {
                  <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
                }
              </select>
            </div>
            <div>
              <label for="qatt-proj" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">المشروع</label>
              <select
                id="qatt-proj"
                [value]="quickProjectId() ?? ''"
                (change)="quickProjectId.set(+$any($event.target).value || null)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                @for (p of store.projects(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>
            <div>
              <label for="qatt-day" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">اليومية</label>
              <select
                id="qatt-day"
                [value]="quickDayUnits()"
                (change)="quickDayUnits.set(+$any($event.target).value)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                <option [value]="1">يومية كاملة (1)</option>
                <option [value]="0.5">نصف يومية (0.5)</option>
                <option [value]="1.5">يومية ونصف (1.5)</option>
                <option [value]="0">بدون نهار (0)</option>
              </select>
            </div>
            <div>
              <label for="qatt-night" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">السهرة</label>
              <select
                id="qatt-night"
                [value]="quickNightUnits()"
                (change)="quickNightUnits.set(+$any($event.target).value)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                <option [value]="0">بدون سهرة (0)</option>
                <option [value]="1">سهرة كاملة (1)</option>
                <option [value]="0.5">نصف سهرة (0.5)</option>
                <option [value]="2">سهرتين (2)</option>
              </select>
            </div>
            <div class="flex items-end">
              <button
                type="button"
                (click)="submitQuickAttendance()"
                class="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">how_to_reg</mat-icon>
                <span>تسجيل حضور {{ store.digits(selectedDate()) }}</span>
              </button>
            </div>
          </div>
        } @else {
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label for="qexp-cat" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">بند المصروف</label>
              <select
                id="qexp-cat"
                [value]="quickExpenseCategory()"
                (change)="quickExpenseCategory.set($any($event.target).value)"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)]"
              >
                <option value="مواصلات">مواصلات وانتقالات</option>
                <option value="بوفيه وضيافة">بوفيه وضيافة وشاي</option>
                <option value="عدد وأدوات">عدد وأدوات وخامات</option>
                <option value="رسوم سحب شيك">رسوم سحب شيك</option>
                <option value="مصاريف أخرى">مصاريف موقع أخرى</option>
              </select>
            </div>
            <div>
              <label for="qexp-amount" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">المبلغ (ج.م)</label>
              <input
                id="qexp-amount"
                type="number"
                min="1"
                [value]="quickAmount() || ''"
                (input)="quickAmount.set(+$any($event.target).value || 0)"
                placeholder="مثلاً 150"
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs font-bold text-[var(--text-heading)] tabular-nums"
              />
            </div>
            <div>
              <label for="qexp-note" class="block text-xs font-bold text-[var(--text-secondary)] mb-1">تفاصيل المصروف</label>
              <input
                id="qexp-note"
                type="text"
                [value]="quickNote()"
                (input)="quickNote.set($any($event.target).value)"
                placeholder="تفاصيل المصروف..."
                class="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs text-[var(--text-heading)]"
              />
            </div>
            <div class="flex items-end">
              <button
                type="button"
                (click)="submitQuickExpense()"
                class="w-full py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px]">receipt_long</mat-icon>
                <span>تسجيل المصروف في {{ store.digits(selectedDate()) }}</span>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Segmented Worker Filter Tabs (العمال اللي اشتغلوا بالسلف واللي ماخدوش سلف) -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-extrabold text-[var(--text-heading)]">
              كشف جميع العمال والنحاتية ليوم {{ store.digits(selectedDate()) }} (بالسلف ومن بدون سلف)
            </h2>
            <p class="text-xs text-[var(--text-secondary)]">
              اضغط على أي تصنيف لفرز العمال الذين اشتغلوا وأخذوا سلفة في هذا اليوم، أو الذين اشتغلوا ولم يأخذوا سلفة، أو الغائبين.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--bg-app)] rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              (click)="workerFilter.set('worked_all')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-[#3390EC]]="workerFilter() === 'worked_all'"
              [class.text-white]="workerFilter() === 'worked_all'"
              [class.text-[var(--text-heading)]]="workerFilter() !== 'worked_all'"
            >
              كل من اشتغلوا ({{ store.num(rep.totalWorkersWhoWorked) }})
            </button>

            <button
              type="button"
              (click)="workerFilter.set('worked_with_advance')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-amber-600]="workerFilter() === 'worked_with_advance'"
              [class.text-white]="workerFilter() === 'worked_with_advance'"
              [class.text-[var(--text-heading)]]="workerFilter() !== 'worked_with_advance'"
            >
              اشتغلوا وأخدوا سلف ({{ store.num(rep.workersWhoWorkedWithAdvanceCount) }})
            </button>

            <button
              type="button"
              (click)="workerFilter.set('worked_without_advance')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-emerald-600]="workerFilter() === 'worked_without_advance'"
              [class.text-white]="workerFilter() === 'worked_without_advance'"
              [class.text-[var(--text-heading)]]="workerFilter() !== 'worked_without_advance'"
            >
              اشتغلوا بدون سلف ({{ store.num(rep.workersWhoWorkedWithoutAdvanceCount) }})
            </button>

            @if (rep.workersWithAdvanceOnlyCount > 0) {
              <button
                type="button"
                (click)="workerFilter.set('advance_without_work')"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                [class.bg-rose-600]="workerFilter() === 'advance_without_work'"
                [class.text-white]="workerFilter() === 'advance_without_work'"
                [class.text-[var(--text-heading)]]="workerFilter() !== 'advance_without_work'"
              >
                سلف بدون حضور ({{ store.num(rep.workersWithAdvanceOnlyCount) }})
              </button>
            }

            <button
              type="button"
              (click)="workerFilter.set('absent')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-slate-700]="workerFilter() === 'absent'"
              [class.text-white]="workerFilter() === 'absent'"
              [class.text-[var(--text-heading)]]="workerFilter() !== 'absent'"
            >
              لم يشتغلوا اليوم ({{ store.num(rep.absentWorkersCount) }})
            </button>

            <button
              type="button"
              (click)="workerFilter.set('all')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              [class.bg-[#3390EC]]="workerFilter() === 'all'"
              [class.text-white]="workerFilter() === 'all'"
              [class.text-[var(--text-heading)]]="workerFilter() !== 'all'"
            >
              الجميع ({{ store.num(rep.workerRows.length) }})
            </button>
          </div>
        </div>

        <!-- Detailed Workers Table for the Chosen Date -->
        <div class="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
          <table class="w-full text-right text-xs border-collapse">
            <thead>
              <tr class="bg-[var(--bg-app)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-bold">
                <th class="py-3 px-3">#</th>
                <th class="py-3 px-3">اسم العامل / المهنة</th>
                <th class="py-3 px-3">المشروع</th>
                <th class="py-3 px-3">الحضور اليوم (نهار / سهرة)</th>
                <th class="py-3 px-3">أجر العامل اليوم</th>
                <th class="py-3 px-3">مستحق الشركة اليوم</th>
                <th class="py-3 px-3">مكسبك منه اليوم</th>
                <th class="py-3 px-3">السلفة المسحوبة في هذا اليوم</th>
                <th class="py-3 px-3">صافي باقي للعامل عن اليوم</th>
                <th class="py-3 px-3">إجراء سريع في {{ store.digits(selectedDate()) }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--border-subtle)]">
              @for (row of filteredWorkerRows(); track row.workerId; let i = $index) {
                <tr class="hover:bg-[var(--bg-app)]/60 transition-colors">
                  <td class="py-3 px-3 font-mono tabular-nums text-[var(--text-secondary)]">
                    {{ store.num(i + 1) }}
                  </td>
                  <td class="py-3 px-3">
                    <button
                      type="button"
                      (click)="store.openHalfSheet('worker', row.workerId)"
                      class="font-extrabold text-[var(--text-heading)] hover:text-[#3390EC] text-right block cursor-pointer"
                    >
                      {{ row.workerName }}
                    </button>
                    <span class="text-[11px] text-[var(--text-secondary)]">
                      {{ row.role }}
                      @if (row.attendanceNote) {
                        · {{ row.attendanceNote }}
                      }
                    </span>
                  </td>
                  <td class="py-3 px-3 font-semibold text-[var(--text-heading)]">
                    {{ row.workedToday ? row.projectName : '—' }}
                  </td>
                  <td class="py-3 px-3 tabular-nums">
                    @if (row.workedToday) {
                      <span class="font-bold text-emerald-600 dark:text-emerald-400">
                        {{ store.num(row.dayWorked) }} يومية
                        @if (row.nightWorked > 0) {
                          + {{ store.num(row.nightWorked) }} سهرة
                        }
                      </span>
                    } @else {
                      <span class="text-[var(--text-secondary)]">غائب / لم يحضر</span>
                    }
                  </td>
                  <td class="py-3 px-3 font-bold text-[var(--text-heading)] tabular-nums">
                    {{ store.money(row.workerGrossToday) }}
                  </td>
                  <td class="py-3 px-3 font-bold text-[#3390EC] tabular-nums">
                    {{ store.money(row.companyEntitlementToday) }}
                  </td>
                  <td class="py-3 px-3 font-extrabold text-emerald-600 tabular-nums">
                    {{ store.money(row.contractorProfitFromWorkerToday) }}
                  </td>
                  <td class="py-3 px-3 tabular-nums">
                    @if (row.tookAdvanceToday) {
                      <div class="font-extrabold text-amber-600 dark:text-amber-400">
                        أخذ سلفة: {{ store.money(row.advanceAmountToday) }}
                      </div>
                      <div class="text-[11px] text-[var(--text-secondary)]">
                        {{ row.advanceReasonsToday }}
                      </div>
                    } @else {
                      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                        لم يأخذ سلفة اليوم (٠ ج.م)
                      </span>
                    }
                  </td>
                  <td
                    class="py-3 px-3 font-extrabold tabular-nums"
                    [class.text-emerald-600]="row.netRemainingForWorkerToday > 0"
                    [class.text-rose-600]="row.netRemainingForWorkerToday < 0"
                    [class.text-[var(--text-secondary)]]="row.netRemainingForWorkerToday === 0"
                  >
                    {{ store.money(row.netRemainingForWorkerToday) }}
                  </td>
                  <td class="py-3 px-3">
                    <div class="flex items-center gap-1.5">
                      @if (!row.workedToday) {
                        <button
                          type="button"
                          (click)="quickMarkPresentOnDate(row.workerId, 1, 0)"
                          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                        >
                          + يومية
                        </button>
                      }
                      <button
                        type="button"
                        (click)="prefillQuickAdvanceForWorker(row.workerId)"
                        class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-600 text-amber-700 dark:text-amber-300 hover:text-white text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                      >
                        + سلفة اليوم
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="10" class="py-10 text-center text-sm text-[var(--text-secondary)]">
                    لا توجد سجلات مطابقة لهذا الفلتر في يوم {{ store.digits(selectedDate()) }} — يمكنك تسجيل حضور أو سلفة مباشرة من الشريط أعلاه.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Side-by-Side Summary Lists: 1) Advances Taken on This Day, 2) Site Expenses on This Day -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Advances on This Day -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-extrabold text-[var(--text-heading)]">
              كشف السلف المسحوبة في يوم {{ store.digits(selectedDate()) }} ({{ store.num(rep.advancesOnDayList.length) }})
            </h3>
            <span class="text-sm font-extrabold text-amber-600 tabular-nums">
              {{ store.money(rep.advancesSpentOnDay) }}
            </span>
          </div>
          <div class="divide-y divide-[var(--border-subtle)]">
            @for (adv of rep.advancesOnDayList; track $index) {
              <div class="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold text-[var(--text-heading)]">{{ adv.workerName }}</span>
                  <span class="text-[var(--text-secondary)]"> · {{ adv.role }} · {{ adv.reason }}</span>
                </div>
                <span class="font-extrabold text-amber-600 tabular-nums">{{ store.money(adv.amount) }}</span>
              </div>
            } @empty {
              <p class="py-6 text-center text-xs text-[var(--text-secondary)]">
                لم يتم سحب أي سلف في يوم {{ store.digits(selectedDate()) }}.
              </p>
            }
          </div>
        </div>

        <!-- Site Expenses on This Day -->
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-extrabold text-[var(--text-heading)]">
              مصاريف الموقع الخارجية في يوم {{ store.digits(selectedDate()) }} ({{ store.num(rep.expensesOnDayList.length) }})
            </h3>
            <span class="text-sm font-extrabold text-rose-600 tabular-nums">
              {{ store.money(rep.expensesSpentOnDay) }}
            </span>
          </div>
          <div class="divide-y divide-[var(--border-subtle)]">
            @for (exp of rep.expensesOnDayList; track $index) {
              <div class="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold text-[var(--text-heading)]">{{ exp.category }}</span>
                  @if (exp.note) {
                    <span class="text-[var(--text-secondary)]"> · {{ exp.note }}</span>
                  }
                </div>
                <span class="font-extrabold text-rose-600 tabular-nums">{{ store.money(exp.amount) }}</span>
              </div>
            } @empty {
              <p class="py-6 text-center text-xs text-[var(--text-secondary)]">
                لا توجد مصاريف موقع مسجلة في يوم {{ store.digits(selectedDate()) }}.
              </p>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DailyInspectorPage {
  readonly store = inject(StoreService);
  private readonly excel = inject(ExcelService);

  readonly selectedDate = this.store.selectedInspectorDate;
  readonly selectedProjectId = this.store.selectedInspectorProjectId;
  readonly searchQuery = signal<string>('');
  readonly workerFilter = signal<
    | 'worked_all'
    | 'worked_with_advance'
    | 'worked_without_advance'
    | 'advance_without_work'
    | 'absent'
    | 'all'
  >('all');

  // Quick Entry State for Selected Date
  readonly activeQuickTab = signal<'advance' | 'attendance' | 'expense'>('advance');
  readonly quickWorkerId = signal<number | null>(null);
  readonly quickProjectId = signal<number | null>(null);
  readonly quickAmount = signal<number>(0);
  readonly quickNote = signal<string>('');
  readonly quickDayUnits = signal<number>(1);
  readonly quickNightUnits = signal<number>(0);
  readonly quickExpenseCategory = signal<string>('مواصلات');

  readonly report = computed(() =>
    this.store.getDailyDateReport(this.selectedDate(), this.selectedProjectId())
  );

  // If no check has a dueDate strictly <= selectedDate, fall back to dailyPocketSummary withdrawn amount so "كان معايا كام" is always helpful
  readonly effectiveCashAvailableToday = computed(() => {
    const rep = this.report();
    if (rep.totalAvailableOnDay > 0) return rep.totalAvailableOnDay;
    const pocket = this.store.dailyPocketSummary();
    return pocket.withdrawnAmount > 0 ? pocket.withdrawnAmount : rep.totalAvailableOnDay;
  });

  readonly effectiveCashRemainingEndOfDay = computed(() => {
    const avail = this.effectiveCashAvailableToday();
    return avail - this.report().totalSpentOnDay;
  });

  readonly activeRecordedDates = computed(() => {
    const dates = new Set<string>();
    for (const a of this.store.attendances()) if (a.date) dates.add(a.date);
    for (const adv of this.store.advances()) if (adv.date) dates.add(adv.date);
    for (const exp of this.store.expenses()) if (exp.date) dates.add(exp.date);
    return Array.from(dates).sort((a, b) => b.localeCompare(a)).slice(0, 10);
  });

  readonly filteredWorkerRows = computed<DailyDateWorkerRow[]>(() => {
    const rep = this.report();
    const f = this.workerFilter();
    let list: DailyDateWorkerRow[] = rep.workerRows;

    if (f === 'worked_all') list = rep.workersWhoWorkedRows;
    else if (f === 'worked_with_advance') list = rep.workersWhoWorkedWithAdvanceRows;
    else if (f === 'worked_without_advance') list = rep.workersWhoWorkedWithoutAdvanceRows;
    else if (f === 'advance_without_work') list = rep.workersWithAdvanceOnlyRows;
    else if (f === 'absent') list = rep.absentWorkerRows;

    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (r) =>
        r.workerName.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.advanceReasonsToday.toLowerCase().includes(q)
    );
  });

  setDate(dateIso: string): void {
    if (!dateIso) return;
    this.selectedDate.set(dateIso);
  }

  shiftDate(deltaDays: number): void {
    const cur = new Date(this.selectedDate() + 'T12:00:00Z');
    if (isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() + deltaDays);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    this.selectedDate.set(`${y}-${m}-${d}`);
  }

  onProjectChange(val: string): void {
    this.selectedProjectId.set(val ? Number(val) : null);
  }

  applyDateAsGlobalWorkingDate(): void {
    this.store.setWorkingDate(this.selectedDate());
  }

  prefillQuickAdvanceForWorker(workerId: number): void {
    this.activeQuickTab.set('advance');
    this.quickWorkerId.set(workerId);
    const el = document.getElementById('qa-amount');
    if (el) el.focus();
  }

  async quickMarkPresentOnDate(workerId: number, dayUnits: number, nightUnits: number): Promise<void> {
    const pid = this.selectedProjectId() || this.store.projects()[0]?.id || 1;
    await this.store.recordAttendance({
      date: this.selectedDate(),
      workerId,
      projectId: pid,
      dayWorked: (dayUnits > 0 ? 1 : 0) as 0 | 1,
      nightWorked: (nightUnits > 0 ? 1 : 0) as 0 | 1,
      note: `تحضير من كشف يوم ${this.selectedDate()}`,
    });
  }

  async submitQuickAdvance(): Promise<void> {
    const wid = this.quickWorkerId();
    const amt = this.quickAmount();
    if (!wid || amt <= 0) {
      this.store.showToast('يرجى اختيار العامل وإدخال مبلغ السلفة', 'warning');
      return;
    }
    await this.store.addAdvance({
      date: this.selectedDate(),
      workerId: wid,
      amount: amt,
      reason: this.quickNote().trim() || `سلفة يوم ${this.selectedDate()}`,
      settlementId: null,
      projectId: this.selectedProjectId() ?? this.store.projects()[0]?.id ?? null,
      notes: this.quickNote().trim(),
    });
    this.quickAmount.set(0);
    this.quickNote.set('');
  }

  async submitQuickAttendance(): Promise<void> {
    const wid = this.quickWorkerId();
    const pid = this.quickProjectId() || this.selectedProjectId() || this.store.projects()[0]?.id || 1;
    if (!wid) {
      this.store.showToast('يرجى اختيار العامل أولاً', 'warning');
      return;
    }
    await this.store.recordAttendance({
      date: this.selectedDate(),
      workerId: wid,
      projectId: pid,
      dayWorked: (this.quickDayUnits() > 0 ? 1 : 0) as 0 | 1,
      nightWorked: (this.quickNightUnits() > 0 ? 1 : 0) as 0 | 1,
      note: this.quickNote().trim(),
    });
    this.quickNote.set('');
  }

  async submitQuickExpense(): Promise<void> {
    const amt = this.quickAmount();
    if (amt <= 0) {
      this.store.showToast('يرجى إدخال مبلغ المصروف', 'warning');
      return;
    }
    await this.store.saveExpense({
      date: this.selectedDate(),
      category: (this.quickExpenseCategory() || 'أخرى') as ExpenseCategory,
      amount: amt,
      projectId: this.selectedProjectId() ?? this.store.projects()[0]?.id ?? null,
      note: this.quickNote().trim() || `مصروف يوم ${this.selectedDate()}`,
    });
    this.quickAmount.set(0);
    this.quickNote.set('');
  }

  exportDayExcel(): void {
    const rep = this.report();
    this.excel.exportFilteredReport({
      title: `كشف_تفاصيل_يوم_${rep.date}`,
      attendanceRows: rep.workerRows.map((r, idx) => ({
        '#': idx + 1,
        'التاريخ': rep.date,
        'العامل': r.workerName,
        'المهنة': r.role,
        'المشروع': r.projectName,
        'اليوميات': r.dayWorked,
        'السهرات': r.nightWorked,
        'أجر العامل اليوم': r.workerGrossToday,
        'مستحق الشركة اليوم': r.companyEntitlementToday,
        'مكسب المقاول اليوم': r.contractorProfitFromWorkerToday,
        'سلفة اليوم': r.advanceAmountToday,
        'سبب السلفة': r.advanceReasonsToday || 'بدون سلفة',
        'صافي باقي للعامل عن اليوم': r.netRemainingForWorkerToday,
      })),
    });
  }

  copyDayWhatsAppSummary(): void {
    const rep = this.report();
    const lines: string[] = [
      `📅 *كشف حساب وتفاصيل يوم ${rep.date}* (${rep.projectName})`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💰 *كان معايا أول اليوم:* ${this.store.money(this.effectiveCashAvailableToday())}`,
      `💸 *إجمالي اللي اتصرف اليوم:* ${this.store.money(rep.totalSpentOnDay)} (سلف: ${this.store.money(rep.advancesSpentOnDay)} + مصاريف: ${this.store.money(rep.expensesSpentOnDay)})`,
      `💵 *الباقي آخر اليوم:* ${this.store.money(this.effectiveCashRemainingEndOfDay())}`,
      `👷 *عدد من اشتغلوا اليوم:* ${rep.totalWorkersWhoWorked} (${rep.regularWorkersWhoWorked} عامل + ${rep.sculptorsWhoWorked} نحات)`,
      `📈 *صافي مكسب اليوم:* ${this.store.money(rep.netProfitOnDay)}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ *العمال اللي اشتغلوا وأخدوا سلف اليوم (${rep.workersWhoWorkedWithAdvanceCount}):*`,
      ...(rep.workersWhoWorkedWithAdvanceRows.length
        ? rep.workersWhoWorkedWithAdvanceRows.map(
            (r) =>
              `• ${r.workerName} (${r.role}): شغل ${this.store.money(r.workerGrossToday)} | سلفة اليوم: ${this.store.money(r.advanceAmountToday)} (${r.advanceReasonsToday})`
          )
        : ['• لا يوجد']),
      `━━━━━━━━━━━━━━━━━━━━`,
      `👷 *العمال اللي اشتغلوا وماخدوش سلف اليوم (${rep.workersWhoWorkedWithoutAdvanceCount}):*`,
      ...(rep.workersWhoWorkedWithoutAdvanceRows.length
        ? rep.workersWhoWorkedWithoutAdvanceRows.map(
            (r) => `• ${r.workerName} (${r.role}): شغل ${this.store.money(r.workerGrossToday)} (بدون سلفة)`
          )
        : ['• لا يوجد']),
      `━━━━━━━━━━━━━━━━━━━━`,
      `المطور: م/ ${this.store.developerName} (${this.store.developerPhone})`,
    ];

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(lines.join('\n'));
      this.store.showToast('تم نسخ تقرير اليوم المنسق للواتساب بنجاح!', 'success');
    }
  }
}
