import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'prev_month' | 'all' | 'custom';
type ReportTab = 'summary' | 'attendance' | 'advances' | 'expenses' | 'extracts' | 'ledger' | 'worker_statement';

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in print:p-0 print:m-0 print:max-w-none">
      <!-- Formal Printable Header (Visible ONLY on Print) -->
      <div class="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-black text-slate-950">{{ store.settings().companyName }}</h1>
            <p class="text-xs text-slate-600 mt-1">إدارة المشروعات والتشييد والمقاولات العامة</p>
          </div>
          <div class="text-left text-xs text-slate-700 space-y-0.5">
            <div><strong>تاريخ استخراج التقرير:</strong> {{ store.digits(store.systemActualToday()) }}</div>
            <div><strong>الفترة المحددة:</strong> من {{ store.digits(effectiveDateRange().from || 'البداية') }} إلى {{ store.digits(effectiveDateRange().to || store.todayIso()) }}</div>
            <div><strong>المشروع:</strong> {{ selectedProjectName() }}</div>
          </div>
        </div>
        <div class="mt-3 py-1.5 px-3 bg-slate-100 rounded text-center text-sm font-bold text-slate-900">
          {{ currentTabTitle() }} — {{ datePresetLabel() }}
        </div>
      </div>

      <!-- Screen-Only Header and Quick Actions Bar -->
      <div class="bg-gradient-to-l from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-lg border border-slate-700/60 no-print flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div class="flex items-start sm:items-center gap-4">
          <div class="w-13 h-13 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
            <mat-icon class="!w-7 !h-7 !text-[28px]">assessment</mat-icon>
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-lg sm:text-2xl font-black">لوحة التقارير الشاملة والتصدير والطباعة</h1>
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                تصفية دقيقة لكل المشاريع والتواريخ
              </span>
            </div>
            <p class="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
              تحكم كامل في ميعاد وفترة التقرير (اليوم، أمس، أسبوع، شهر، أو من كذا إلى كذا)، مع كشف حساب للعمال والمشاريع والشيكات والبنك.
            </p>
          </div>
        </div>

        <!-- Master Print & Export Actions -->
        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            (click)="printReport()"
            class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            title="طباعة التقرير أو حفظه كـ PDF رسمي"
          >
            <mat-icon class="!w-4 !h-4 !text-[18px] text-blue-600">print</mat-icon>
            <span>طباعة تقرير رسمي (A4)</span>
          </button>

          <button
            type="button"
            (click)="exportFilteredExcel()"
            class="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            title="تنزيل إكسل مخصص للفترة والمشروع المحددين"
          >
            <mat-icon class="!w-4 !h-4 !text-[18px]">table_view</mat-icon>
            <span>تصدير Excel المخصص (.xlsx)</span>
          </button>

          <button
            type="button"
            (click)="copyFormattedWhatsAppReport()"
            class="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            title="نسخ تقرير ملخص بصيغة الواتساب"
          >
            <mat-icon class="!w-4 !h-4 !text-[18px] text-emerald-400">share</mat-icon>
            <span>نسخ تقرير واتساب</span>
          </button>
        </div>
      </div>

      <!-- ACTIVE DATE WARNING BANNER (IF WORKING DATE IS DIFFERENT FROM TODAY) -->
      @if (store.isCustomDateActive()) {
        <div class="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-slate-900 dark:text-amber-100 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold no-print animate-fade-in">
          <div class="flex items-center gap-2.5 min-w-0">
            <mat-icon class="text-amber-600 dark:text-amber-400 !w-5 !h-5 !text-[20px] shrink-0">warning_amber</mat-icon>
            <div>
              <strong class="font-black text-amber-950 dark:text-amber-300">خلي بالك وركّز:</strong>
              <span> التاريخ النشط في النظام مضبوط على <strong>{{ store.dateDifferenceLabel() }} ({{ store.digits(store.todayIso()) }})</strong> وليس تاريخ اليوم الفعلي ({{ store.digits(store.systemActualToday()) }})!</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="store.resetToSystemToday()"
              class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">restart_alt</mat-icon>
              <span>العودة لتاريخ اليوم ({{ store.digits(store.systemActualToday()) }})</span>
            </button>
          </div>
        </div>
      }

      <!-- Comprehensive Filters Control Hub (فلترة دقيقة وتحديد المدى من كذا إلى كذا) -->
      <div class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 no-print">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div class="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
            <mat-icon class="text-amber-500">tune</mat-icon>
            <span>تحديد نطاق التقرير والفترة الزمنية والمشاريع</span>
          </div>
          <div class="text-xs text-slate-500">
            النطاق المطبق حالياً: <strong class="text-slate-800 dark:text-slate-200">{{ datePresetLabel() }}</strong>
            (من <span class="font-mono">{{ store.digits(effectiveDateRange().from || 'الأول') }}</span> إلى <span class="font-mono">{{ store.digits(effectiveDateRange().to || store.todayIso()) }}</span>)
          </div>
        </div>

        <!-- 1. Quick Date Presets -->
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span class="text-xs font-bold text-slate-500 ml-1">فترات سريعة:</span>
          
          <button
            type="button"
            (click)="setDatePreset('today')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'today' ? 'bg-[#3390EC] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            اليوم ({{ store.digits(store.systemActualToday()) }})
          </button>

          <button
            type="button"
            (click)="setDatePreset('yesterday')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'yesterday' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            أمس ({{ store.digits(store.getYesterdayIso()) }})
          </button>

          <button
            type="button"
            (click)="setDatePreset('week')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'week' ? 'bg-[#3390EC] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            آخر 7 أيام
          </button>

          <button
            type="button"
            (click)="setDatePreset('month')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'month' ? 'bg-[#3390EC] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            هذا الشهر ({{ store.digits(currentMonthLabel()) }})
          </button>

          <button
            type="button"
            (click)="setDatePreset('prev_month')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'prev_month' ? 'bg-[#3390EC] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            الشهر السابق
          </button>

          <button
            type="button"
            (click)="setDatePreset('all')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            [class]="datePreset() === 'all' ? 'bg-[#3390EC] text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
          >
            جميع الأوقات (شامل)
          </button>

          <button
            type="button"
            (click)="setDatePreset('custom')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            [class]="datePreset() === 'custom' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100'"
          >
            <mat-icon class="!w-3.5 !h-3.5 !text-[16px]">date_range</mat-icon>
            <span>مخصص (من كذا إلى كذا)</span>
          </button>
        </div>

        <!-- 2. Detailed Input Filter Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <!-- From Date -->
          <div>
            <label for="filter-from-date" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              من تاريخ:
            </label>
            <input
              id="filter-from-date"
              type="date"
              [value]="customFromDate()"
              (change)="onCustomFromChange($any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3390EC]"
            />
          </div>

          <!-- To Date -->
          <div>
            <label for="filter-to-date" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              إلى تاريخ:
            </label>
            <input
              id="filter-to-date"
              type="date"
              [value]="customToDate()"
              (change)="onCustomToChange($any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3390EC]"
            />
          </div>

          <!-- Project Filter Dropdown -->
          <div>
            <label for="filter-project-select" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              المشروع:
            </label>
            <select
              id="filter-project-select"
              [value]="selectedProjectId() === null ? '' : selectedProjectId()"
              (change)="onProjectFilterChange($any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3390EC]"
            >
              <option value="">جميع المشاريع (شامل الحساب بالكامل)</option>
              @for (proj of store.projects(); track proj.id) {
                <option [value]="proj.id">{{ proj.name }}</option>
              }
            </select>
          </div>

          <!-- Worker Filter Dropdown -->
          <div>
            <label for="filter-worker-select" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              العامل / النحات:
            </label>
            <select
              id="filter-worker-select"
              [value]="selectedWorkerId() === null ? '' : selectedWorkerId()"
              (change)="onWorkerFilterChange($any($event.target).value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3390EC]"
            >
              <option value="">جميع العمال والصنايعية</option>
              @for (w of store.workers(); track w.id) {
                <option [value]="w.id">{{ w.name }} ({{ w.role || 'عامل' }})</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- Live KPI Scorecard for the Filtered Date Range & Scope -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
        <!-- 1. Checks & Incoming Total -->
        <div class="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">account_balance</mat-icon>
            <span>شيكات ومقبوضات</span>
          </div>
          <div class="text-sm sm:text-base font-black text-blue-950 dark:text-blue-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().totalChecks) }}
          </div>
          <div class="text-[10px] text-blue-600/80 dark:text-blue-400 mt-0.5 truncate">
            {{ store.num(filteredChecks().length) }} شيك مسجل
          </div>
        </div>

        <!-- 2. Cash Withdrawn from Bank -->
        <div class="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">atm</mat-icon>
            <span>مسحوب من البنك</span>
          </div>
          <div class="text-sm sm:text-base font-black text-cyan-950 dark:text-cyan-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().withdrawnCashFromBank) }}
          </div>
          <div class="text-[10px] text-cyan-600/80 dark:text-cyan-400 mt-0.5 truncate">
            كاش نزل الخزينة
          </div>
        </div>

        <!-- 3. Remaining in Bank -->
        <div class="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">savings</mat-icon>
            <span>متبقي في البنك</span>
          </div>
          <div class="text-sm sm:text-base font-black text-indigo-950 dark:text-indigo-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().remainingInBank) }}
          </div>
          <div class="text-[10px] text-indigo-600/80 dark:text-indigo-400 mt-0.5 truncate">
            رصيد شيكات غير مسحوبة
          </div>
        </div>

        <!-- 4. Worker Advances in Period -->
        <div class="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">payments</mat-icon>
            <span>سلف العمال</span>
          </div>
          <div class="text-sm sm:text-base font-black text-amber-950 dark:text-amber-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().advancesTotal) }}
          </div>
          <div class="text-[10px] text-amber-600/80 dark:text-amber-400 mt-0.5 truncate">
            {{ store.num(filteredAdvances().length) }} سلفة منصرفة
          </div>
        </div>

        <!-- 5. Wages Earned in Period -->
        <div class="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">badge</mat-icon>
            <span>أجور اليوميات</span>
          </div>
          <div class="text-sm sm:text-base font-black text-purple-950 dark:text-purple-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().wagesTotal) }}
          </div>
          <div class="text-[10px] text-purple-600/80 dark:text-purple-400 mt-0.5 truncate">
            {{ store.num(kpiMetrics().daysWorkedSum) }} يومية · {{ store.num(kpiMetrics().nightsWorkedSum) }} سهرة
          </div>
        </div>

        <!-- 6. Site & External Expenses -->
        <div class="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">receipt_long</mat-icon>
            <span>مصاريف خارجية</span>
          </div>
          <div class="text-sm sm:text-base font-black text-rose-950 dark:text-rose-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().expensesTotal) }}
          </div>
          <div class="text-[10px] text-rose-600/80 dark:text-rose-400 mt-0.5 truncate">
            {{ store.num(filteredExpenses().length) }} بند مصروف
          </div>
        </div>

        <!-- 7. Net Pocket Cash Balance -->
        <div class="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
          <div class="text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
            <mat-icon class="!w-3.5 !h-3.5 !text-[15px]">wallet</mat-icon>
            <span>باقي الكاش في الجيب</span>
          </div>
          <div class="text-sm sm:text-base font-black text-emerald-950 dark:text-emerald-100 mt-1 tabular-nums">
            {{ store.money(kpiMetrics().netPocketCash) }}
          </div>
          <div class="text-[10px] text-emerald-600/80 dark:text-emerald-400 mt-0.5 truncate">
            صافي العهدة الفعلي
          </div>
        </div>
      </div>

      <!-- Navigation Tabs for Detailed Reports -->
      <div class="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar no-print">
        <button
          type="button"
          (click)="selectedTab.set('summary')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'summary' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">dashboard</mat-icon>
          <span>الملخص المالي والبنكي الشامل</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('attendance')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'attendance' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">fact_check</mat-icon>
          <span>كشف اليوميات والحضور ({{ store.num(filteredAttendances().length) }})</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('advances')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'advances' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">payments</mat-icon>
          <span>كشف السلف والخصومات ({{ store.num(filteredAdvances().length) }})</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('expenses')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'expenses' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">receipt_long</mat-icon>
          <span>المصاريف الخارجية والموقع ({{ store.num(filteredExpenses().length) }})</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('extracts')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'extracts' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">request_quote</mat-icon>
          <span>مستخلصات وبنود التنفيذ ({{ store.num(filteredExtracts().length) }})</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('ledger')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'ledger' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">account_balance_wallet</mat-icon>
          <span>كشف أرباح المشاريع والمقاول</span>
        </button>

        <button
          type="button"
          (click)="selectedTab.set('worker_statement')"
          class="px-4 py-2.5 border-b-2 text-xs font-extrabold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
          [class]="selectedTab() === 'worker_statement' ? 'border-[#3390EC] text-[#3390EC]' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">person_search</mat-icon>
          <span>كشف حساب تفصيلي لعامل محدد</span>
        </button>
      </div>

      <!-- TAB 1: الملخص المالي والبنكي الشامل (Systematic Dual-Tier Bank Check vs Pocket Cash) -->
      @if (selectedTab() === 'summary') {
        <div class="space-y-6">
          <!-- Two Systematic Account Cards: البنك وشيكات الشركة vs كاش الجيب وسلف العمال -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Account 1: Bank Account & Company Checks -->
            <div class="p-5 rounded-3xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
                    <mat-icon>account_balance</mat-icon>
                  </div>
                  <div>
                    <h3 class="font-black text-sm text-blue-950 dark:text-blue-100">المستوى الأول: حساب البنك وشيكات المشاريع</h3>
                    <p class="text-[11px] text-blue-700/80 dark:text-blue-300">متابعة قيمة الشيكات الواردة وما تم سحبه وما تبقى بالبنك</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-200 text-xs font-bold">
                  {{ store.num(filteredChecks().length) }} شيك
                </span>
              </div>

              <div class="space-y-2.5 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-600 dark:text-slate-300">إجمالي قيمة الشيكات المودعة:</span>
                  <span class="font-black text-sm text-blue-900 dark:text-blue-200 tabular-nums">{{ store.money(kpiMetrics().totalChecks) }}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-600 dark:text-slate-300">المسحوب نقداً من البنك (كاش سلف ومصاريف):</span>
                  <span class="font-black text-sm text-cyan-600 dark:text-cyan-400 tabular-nums">− {{ store.money(kpiMetrics().withdrawnCashFromBank) }}</span>
                </div>
                <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span class="font-bold text-slate-900 dark:text-white">المتبقي الصافي في حساب البنك:</span>
                  <span class="font-black text-base text-emerald-600 dark:text-emerald-400 tabular-nums">{{ store.money(kpiMetrics().remainingInBank) }}</span>
                </div>
              </div>

              <p class="text-[11px] text-slate-500 leading-relaxed">
                💡 <strong>قاعدة المحاسبة:</strong> فلوس الشيك لا تنقص إلا بما يتم سحبه فعلياً من ماكينة البنك (ATM/صرف)، ولا تختلط بالمصاريف اليومية إلا بعد سحبها.
              </p>
            </div>

            <!-- Account 2: Pocket Cash & Worker Advances -->
            <div class="p-5 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black">
                    <mat-icon>payments</mat-icon>
                  </div>
                  <div>
                    <h3 class="font-black text-sm text-emerald-950 dark:text-emerald-100">المستوى الثاني: فلوس العهدة وسلف الجيب</h3>
                    <p class="text-[11px] text-emerald-700/80 dark:text-emerald-300">ما صرفته للعمال وسجلته سلف أو مصاريف خارج الجيب</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 text-xs font-bold">
                  عهدة نقدية
                </span>
              </div>

              <div class="space-y-2.5 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-600 dark:text-slate-300">الكاش المسحوب في يدك من البنك:</span>
                  <span class="font-black text-sm text-slate-900 dark:text-white tabular-nums">{{ store.money(kpiMetrics().withdrawnCashFromBank) }}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-600 dark:text-slate-300">ما تم صرفه سلف للعمال:</span>
                  <span class="font-black text-sm text-amber-600 dark:text-amber-400 tabular-nums">− {{ store.money(kpiMetrics().advancesTotal) }}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-slate-600 dark:text-slate-300">ما تم صرفه مصاريف خارجية ونثريات:</span>
                  <span class="font-black text-sm text-rose-600 dark:text-rose-400 tabular-nums">− {{ store.money(kpiMetrics().expensesTotal) }}</span>
                </div>
                <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span class="font-bold text-slate-900 dark:text-white">المتبقي الصافي في جيبك (العهدة المتبقية):</span>
                  <span class="font-black text-base text-emerald-600 dark:text-emerald-400 tabular-nums">{{ store.money(kpiMetrics().netPocketCash) }}</span>
                </div>
              </div>

              <p class="text-[11px] text-slate-500 leading-relaxed">
                💡 <strong>وضوح كامل:</strong> الآن حساب الشيك في البنك منفصل تماماً عن حساب الكاش والسلف في جيبك، وتعرف مليم بمليم أين ذهبت أموالك!
              </p>
            </div>
          </div>

          <!-- Project By Project Financial Breakdown Table -->
          <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <mat-icon class="text-[#3390EC]">apartment</mat-icon>
                <span>موقف حسابات المشاريع للفترة المحددة</span>
              </h3>
              <span class="text-xs text-slate-500">
                {{ store.num(projectSummaryRows().length) }} مشاريع
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th class="p-3">المشروع</th>
                    <th class="p-3">شيكات ودفعات واردة</th>
                    <th class="p-3">مسحوب كاش</th>
                    <th class="p-3">سلف عمال</th>
                    <th class="p-3">مصاريف موقع</th>
                    <th class="p-3">أجور يوميات مسجلة</th>
                    <th class="p-3">متبقي في البنك</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  @for (row of projectSummaryRows(); track row.projectName) {
                    <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td class="p-3 font-bold text-slate-900 dark:text-white">{{ row.projectName }}</td>
                      <td class="p-3 tabular-nums font-semibold">{{ store.money(row.checksTotal) }}</td>
                      <td class="p-3 tabular-nums font-semibold text-cyan-700 dark:text-cyan-300">{{ store.money(row.withdrawnCash) }}</td>
                      <td class="p-3 tabular-nums font-semibold text-amber-700 dark:text-amber-300">{{ store.money(row.advancesTotal) }}</td>
                      <td class="p-3 tabular-nums font-semibold text-rose-700 dark:text-rose-300">{{ store.money(row.expensesTotal) }}</td>
                      <td class="p-3 tabular-nums font-semibold text-purple-700 dark:text-purple-300">{{ store.money(row.wagesTotal) }}</td>
                      <td class="p-3 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{{ store.money(row.remainingInBank) }}</td>
                    </tr>
                  }
                  @if (projectSummaryRows().length === 0) {
                    <tr>
                      <td colspan="7" class="p-8 text-center text-slate-400">
                        لا توجد بيانات مسجلة في هذا النطاق الزمني أو المشروع.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- TAB 2: كشف يوميات وحضور العمالة -->
      @if (selectedTab() === 'attendance') {
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-0">
          <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <mat-icon class="text-purple-500">fact_check</mat-icon>
                <span>كشف تفصيلي ليوميات وحضور وسهرات العمالة</span>
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                موضح به أسماء العمال وتاريخ اليومية وسعر اليومية الفعلي المسجل ومستحق العامل ومستحق الشركة
              </p>
            </div>
            <div class="text-xs font-bold text-slate-600 dark:text-slate-300">
              إجمالي السجلات: <span class="text-purple-600 font-black">{{ store.num(filteredAttendances().length) }}</span>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="p-3">التاريخ</th>
                  <th class="p-3">اسم العامل</th>
                  <th class="p-3">المشروع</th>
                  <th class="p-3 text-center">يومية</th>
                  <th class="p-3 text-center">سهرة</th>
                  <th class="p-3">سعر يومية العامل</th>
                  <th class="p-3">إجمالي أجر العامل</th>
                  <th class="p-3">سعر يومية الشركة</th>
                  <th class="p-3">مستحق الشركة</th>
                  <th class="p-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                @for (att of filteredAttendances(); track (att.id || $index)) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="p-3 font-mono font-bold">{{ store.digits(att.date) }}</td>
                    <td class="p-3 font-bold text-slate-900 dark:text-white">{{ store.workerName(att.workerId) }}</td>
                    <td class="p-3 text-slate-600 dark:text-slate-400">{{ store.projectName(att.projectId) }}</td>
                    <td class="p-3 text-center">
                      @if (att.dayWorked) {
                        <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black">١</span>
                      } @else {
                        <span class="text-slate-400 font-bold">٠</span>
                      }
                    </td>
                    <td class="p-3 text-center">
                      @if (att.nightWorked) {
                        <span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-black">١</span>
                      } @else {
                        <span class="text-slate-400 font-bold">٠</span>
                      }
                    </td>
                    <td class="p-3 tabular-nums">{{ store.money(att.workerDayRateSnapshot) }}</td>
                    <td class="p-3 tabular-nums font-black text-purple-700 dark:text-purple-300">
                      {{ store.money((att.dayWorked ? att.workerDayRateSnapshot : 0) + (att.nightWorked ? att.workerNightRateSnapshot : 0)) }}
                    </td>
                    <td class="p-3 tabular-nums">{{ store.money(att.companyDayRateSnapshot) }}</td>
                    <td class="p-3 tabular-nums font-black text-blue-700 dark:text-blue-300">
                      {{ store.money((att.dayWorked ? att.companyDayRateSnapshot : 0) + (att.nightWorked ? att.companyNightRateSnapshot : 0)) }}
                    </td>
                    <td class="p-3 text-slate-500">{{ att.note || '—' }}</td>
                  </tr>
                }
                @if (filteredAttendances().length === 0) {
                  <tr>
                    <td colspan="10" class="p-8 text-center text-slate-400">
                      لا توجد سجلات حضور مسجلة في هذا النطاق.
                    </td>
                  </tr>
                }
              </tbody>
              @if (filteredAttendances().length > 0) {
                <tfoot class="bg-slate-100 dark:bg-slate-800 font-black border-t-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <td colspan="3" class="p-3 text-left">الإجمالي:</td>
                    <td class="p-3 text-center tabular-nums text-emerald-600">{{ store.num(kpiMetrics().daysWorkedSum) }}</td>
                    <td class="p-3 text-center tabular-nums text-amber-600">{{ store.num(kpiMetrics().nightsWorkedSum) }}</td>
                    <td class="p-3"></td>
                    <td class="p-3 tabular-nums text-purple-600">{{ store.money(kpiMetrics().wagesTotal) }}</td>
                    <td class="p-3"></td>
                    <td class="p-3 tabular-nums text-blue-600">{{ store.money(kpiMetrics().companyWagesTotal) }}</td>
                    <td class="p-3"></td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>
        </div>
      }

      <!-- TAB 3: كشف السلف والخصومات -->
      @if (selectedTab() === 'advances') {
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <mat-icon class="text-amber-500">payments</mat-icon>
              <span>كشف السلف النقدية المنصرفة للعمال</span>
            </h3>
            <span class="text-xs font-bold text-amber-600">
              إجمالي السلف: {{ store.money(kpiMetrics().advancesTotal) }}
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="p-3">التاريخ</th>
                  <th class="p-3">اسم العامل</th>
                  <th class="p-3">المشروع</th>
                  <th class="p-3">مبلغ السلفة</th>
                  <th class="p-3">السبب / البيان</th>
                  <th class="p-3">حالة الخصم</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                @for (adv of filteredAdvances(); track (adv.id || $index)) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="p-3 font-mono font-bold">{{ store.digits(adv.date) }}</td>
                    <td class="p-3 font-bold text-slate-900 dark:text-white">{{ store.workerName(adv.workerId) }}</td>
                    <td class="p-3 text-slate-600 dark:text-slate-400">{{ store.projectName(adv.projectId) }}</td>
                    <td class="p-3 tabular-nums font-black text-amber-600 dark:text-amber-400">{{ store.money(adv.amount) }}</td>
                    <td class="p-3 text-slate-600 dark:text-slate-300">{{ adv.reason || 'سلفة نقدية' }}</td>
                    <td class="p-3">
                      @if (adv.settlementId) {
                        <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          تم تسويتها وخصمها (تسوية #{{ adv.settlementId }})
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                          معلقة — لم تُخصم بعد
                        </span>
                      }
                    </td>
                  </tr>
                }
                @if (filteredAdvances().length === 0) {
                  <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400">
                      لا توجد سلف مسجلة في هذا النطاق.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- TAB 4: كشف المصاريف الخارجية والموقع -->
      @if (selectedTab() === 'expenses') {
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <mat-icon class="text-rose-500">receipt_long</mat-icon>
              <span>كشف المصاريف الخارجية والموقع والنثريات</span>
            </h3>
            <span class="text-xs font-bold text-rose-600">
              إجمالي المصاريف: {{ store.money(kpiMetrics().expensesTotal) }}
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="p-3">التاريخ</th>
                  <th class="p-3">بند المصروف</th>
                  <th class="p-3">المشروع</th>
                  <th class="p-3">المبلغ</th>
                  <th class="p-3">البيان / ملاحظات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                @for (exp of filteredExpenses(); track (exp.id || $index)) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="p-3 font-mono font-bold">{{ store.digits(exp.date) }}</td>
                    <td class="p-3 font-bold text-slate-900 dark:text-white">
                      <span class="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-extrabold">
                        {{ exp.category }}
                      </span>
                    </td>
                    <td class="p-3 text-slate-600 dark:text-slate-400">{{ store.projectName(exp.projectId) }}</td>
                    <td class="p-3 tabular-nums font-black text-rose-600 dark:text-rose-400">{{ store.money(exp.amount) }}</td>
                    <td class="p-3 text-slate-500">{{ exp.note || '—' }}</td>
                  </tr>
                }
                @if (filteredExpenses().length === 0) {
                  <tr>
                    <td colspan="5" class="p-8 text-center text-slate-400">
                      لا توجد مصاريف مسجلة في هذا النطاق.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- TAB 5: كشف مستخلصات وبنود التنفيذ -->
      @if (selectedTab() === 'extracts') {
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <mat-icon class="text-blue-500">request_quote</mat-icon>
              <span>مستخلصات المشاريع وبنود التنفيذ المنفذة</span>
            </h3>
            <span class="text-xs text-slate-500">
              {{ store.num(filteredExtracts().length) }} مستخلصات
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="p-3">رقم المستخلص</th>
                  <th class="p-3">المشروع</th>
                  <th class="p-3">الفترة من - إلى</th>
                  <th class="p-3">إجمالي الأعمال</th>
                  <th class="p-3">المحصل الفعلي</th>
                  <th class="p-3">المتبقي طرف الشركة</th>
                  <th class="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                @for (ext of filteredExtracts(); track (ext.id || $index)) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="p-3 font-bold text-slate-900 dark:text-white">مستخلص #{{ ext.number }}</td>
                    <td class="p-3 text-slate-600 dark:text-slate-400">{{ store.projectName(ext.projectId) }}</td>
                    <td class="p-3 font-mono text-[11px] text-slate-500">{{ store.digits(ext.from) }} → {{ store.digits(ext.to) }}</td>
                    <td class="p-3 tabular-nums font-bold">{{ store.money(ext.claimedAmount || 0) }}</td>
                    <td class="p-3 tabular-nums font-black text-emerald-600 dark:text-emerald-400">{{ store.money(ext.paidAmount || 0) }}</td>
                    <td class="p-3 tabular-nums font-black text-amber-600 dark:text-amber-400">
                      {{ store.money(Math.max(0, (ext.claimedAmount || 0) - (ext.paidAmount || 0))) }}
                    </td>
                    <td class="p-3">
                      @if ((ext.paidAmount || 0) >= (ext.claimedAmount || 0) && (ext.claimedAmount || 0) > 0) {
                        <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          محصل بالكامل
                        </span>
                      } @else {
                        <span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                          متبقي تحصيل
                        </span>
                      }
                    </td>
                  </tr>
                }
                @if (filteredExtracts().length === 0) {
                  <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                      لا توجد مستخلصات مسجلة في هذا النطاق.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- TAB 6: كشف حساب فردي تفصيلي لعامل محدد -->
      @if (selectedTab() === 'worker_statement') {
        <div class="space-y-4">
          <!-- Worker Picker Dropdown inside this tab -->
          <div class="p-4 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 no-print">
            <div class="flex items-center gap-2">
              <mat-icon class="text-blue-500">person_search</mat-icon>
              <span class="font-extrabold text-sm text-slate-900 dark:text-white">اختر العامل لعرض كشف حسابه المفصل:</span>
            </div>
            <select
              [value]="selectedWorkerId() || ''"
              (change)="onWorkerFilterChange($any($event.target).value)"
              class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#3390EC]"
            >
              <option value="">-- اضغط لاختيار عامل --</option>
              @for (w of store.workers(); track w.id) {
                <option [value]="w.id">{{ w.name }} ({{ w.role || 'عامل' }})</option>
              }
            </select>
          </div>

          @if (activeWorkerStatement(); as ws) {
            <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6 shadow-sm">
              <!-- Worker Profile Summary -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <div class="flex items-center gap-3.5">
                  <div class="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#3390EC] to-blue-700 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                    {{ ws.worker.name.charAt(0) }}
                  </div>
                  <div>
                    <h2 class="text-lg font-black text-slate-900 dark:text-white">{{ ws.worker.name }}</h2>
                    <p class="text-xs text-slate-500 mt-0.5">
                      المهنة: <strong class="text-slate-700 dark:text-slate-300">{{ ws.worker.role || 'عامل' }}</strong> · 
                      سعر اليومية: <strong class="text-slate-700 dark:text-slate-300">{{ store.money(ws.worker.workerDayRate) }}</strong> · 
                      سعر السهرة: <strong class="text-slate-700 dark:text-slate-300">{{ store.money(ws.worker.workerNightRate) }}</strong>
                    </p>
                  </div>
                </div>

                <div class="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-left">
                  <div class="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">صافي المستحق للعامل حالياً:</div>
                  <div class="text-xl font-black text-emerald-950 dark:text-emerald-100 mt-0.5 tabular-nums">
                    {{ store.money(ws.netDueNow) }}
                  </div>
                </div>
              </div>

              <!-- Metric Cards for this worker -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div class="text-[11px] text-slate-500">إجمالي الأيام والسهرات:</div>
                  <div class="text-sm font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                    {{ store.num(ws.days) }} يومية · {{ store.num(ws.nights) }} سهرة
                  </div>
                </div>

                <div class="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                  <div class="text-[11px] text-purple-700 dark:text-purple-300">إجمالي الأجر المستحق:</div>
                  <div class="text-sm font-black text-purple-950 dark:text-purple-100 mt-1 tabular-nums">
                    {{ store.money(ws.grossWages) }}
                  </div>
                </div>

                <div class="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  <div class="text-[11px] text-amber-700 dark:text-amber-300">إجمالي السلف والخصومات:</div>
                  <div class="text-sm font-black text-amber-950 dark:text-amber-100 mt-1 tabular-nums">
                    {{ store.money(ws.totalAdvances + ws.totalDeductions) }}
                  </div>
                </div>

                <div class="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <div class="text-[11px] text-blue-700 dark:text-blue-300">المدفوع في تسويات سابقة:</div>
                  <div class="text-sm font-black text-blue-950 dark:text-blue-100 mt-1 tabular-nums">
                    {{ store.money(ws.totalSettledPaid) }}
                  </div>
                </div>
              </div>

              <!-- Detailed Timeline of Attendance & Advances for this worker -->
              <div>
                <h4 class="font-extrabold text-xs text-slate-700 dark:text-slate-300 mb-2">سجل الأيام والسلف للفترة:</h4>
                <div class="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <table class="w-full text-right text-xs">
                    <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th class="p-2.5">التاريخ</th>
                        <th class="p-2.5">النوع</th>
                        <th class="p-2.5">المشروع</th>
                        <th class="p-2.5">البيان</th>
                        <th class="p-2.5">له (أجر)</th>
                        <th class="p-2.5">عليه (سلفة / خصم)</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (item of ws.timeline; track (item.id || $index)) {
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td class="p-2.5 font-mono font-bold">{{ store.digits(item.date) }}</td>
                          <td class="p-2.5">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold"
                              [class]="item.type === 'حضور' ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'"
                            >
                              {{ item.type }}
                            </span>
                          </td>
                          <td class="p-2.5 text-slate-500">{{ item.projectName }}</td>
                          <td class="p-2.5">{{ item.details }}</td>
                          <td class="p-2.5 font-bold text-emerald-600 tabular-nums">
                            {{ item.credit ? store.money(item.credit) : '—' }}
                          </td>
                          <td class="p-2.5 font-bold text-rose-600 tabular-nums">
                            {{ item.debit ? store.money(item.debit) : '—' }}
                          </td>
                        </tr>
                      }
                      @if (ws.timeline.length === 0) {
                        <tr>
                          <td colspan="6" class="p-6 text-center text-slate-400">لا توجد عمليات مسجلة لهذا العامل في هذه الفترة.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          } @else {
            <div class="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <mat-icon class="!w-7 !h-7 !text-[28px]">person_outline</mat-icon>
              </div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white">لم تقم باختيار عامل بعد</h3>
              <p class="text-xs text-slate-500 max-w-sm mx-auto">
                اختر عاملاً من القائمة بالأعلى لعرض تفاصيل حسابه بالكامل، وسجل يومياته وسلفه والصافي المستحق له.
              </p>
            </div>
          }
        </div>
      }

      <!-- TAB 7: كشف أرباح المشاريع والمقاول -->
      @if (selectedTab() === 'ledger') {
        <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-5 shadow-xs">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <mat-icon class="text-emerald-500">trending_up</mat-icon>
                <span>كشف أرباح المقاول وصافي ربحية كل مشروع</span>
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                محسوب من: (المقبوض من الشيكات والشركات) − (أجور العمال + سلف + مصاريف خارجية)
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <div class="text-xs font-bold text-emerald-800 dark:text-emerald-300">إجمالي الأرباح الصافية للمشاريع:</div>
              <div class="text-xl font-black text-emerald-950 dark:text-emerald-100 mt-1 tabular-nums">
                {{ store.money(kpiMetrics().totalNetProfit) }}
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
              <div class="text-xs font-bold text-blue-800 dark:text-blue-300">إجمالي الوارد من كل المشاريع:</div>
              <div class="text-xl font-black text-blue-950 dark:text-blue-100 mt-1 tabular-nums">
                {{ store.money(kpiMetrics().totalIncoming) }}
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
              <div class="text-xs font-bold text-rose-800 dark:text-rose-300">إجمالي المنصرف (أجور ومصاريف):</div>
              <div class="text-xl font-black text-rose-950 dark:text-rose-100 mt-1 tabular-nums">
                {{ store.money(kpiMetrics().wagesTotal + kpiMetrics().expensesTotal) }}
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Formal A4 Printable Signature Blocks (Visible ONLY on Print) -->
      <div class="hidden print:block pt-12 mt-12 border-t-2 border-slate-900">
        <div class="grid grid-cols-3 gap-6 text-center text-xs">
          <div class="space-y-12">
            <div class="font-bold text-slate-900">مهندس الموقع المسؤول</div>
            <div class="border-b border-dashed border-slate-400 pb-1 text-slate-400">التوقيع / التاريخ: .........................</div>
          </div>

          <div class="space-y-12">
            <div class="font-bold text-slate-900">المحاسب المالي للشركة</div>
            <div class="border-b border-dashed border-slate-400 pb-1 text-slate-400">التوقيع / التاريخ: .........................</div>
          </div>

          <div class="space-y-12">
            <div class="font-bold text-slate-900">المقاول العام / الإدارة العامة</div>
            <div class="border-b border-dashed border-slate-400 pb-1 text-slate-400">الاعتماد والختم: .........................</div>
          </div>
        </div>
      </div>

      <!-- JSON Backup & Restore and SheetJS Full Export Section (Footer Section) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 no-print pt-4">
        <!-- SheetJS Full Multi-Tab Workbook -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-black">
              <mat-icon>table_view</mat-icon>
            </div>
            <div>
              <h4 class="text-sm font-black text-slate-900 dark:text-white">ملف Excel الكامل الشامل (كل أوراق العمل)</h4>
              <p class="text-xs text-slate-500">تنزيل مصنف إكسل عربي متكامل يحتوي على 9 أوراق عمل وإجماليات كل صفحة.</p>
            </div>
          </div>

          <button
            type="button"
            (click)="excel.exportFullWorkbook({ separateSheetPerProject: true })"
            class="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
          >
            <mat-icon>download</mat-icon>
            <span>تنزيل ملف Excel الكامل (9 أوراق عمل)</span>
          </button>
        </div>

        <!-- JSON Full Backup / Restore -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-black">
              <mat-icon>save_alt</mat-icon>
            </div>
            <div>
              <h4 class="text-sm font-black text-slate-900 dark:text-white">النسخة الاحتياطية الكاملة (JSON)</h4>
              <p class="text-xs text-slate-500">حفظ واستعادة قاعدة البيانات بالكامل لنقلها لأي موبايل أو حفظها على جوجل درايف.</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              (click)="downloadJsonBackup()"
              class="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">download</mat-icon>
              <span>تصدير JSON</span>
            </button>

            <label class="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer text-slate-800 dark:text-slate-200">
              <mat-icon class="!w-4 !h-4 !text-[18px] text-blue-600">restore</mat-icon>
              <span>استعادة ملف</span>
              <input type="file" accept=".json" class="hidden" (change)="onRestoreJson($event)" />
            </label>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ReportsPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);

  readonly Math = Math;

  // Filter signals
  readonly datePreset = signal<DatePreset>('all');
  readonly customFromDate = signal<string>('');
  readonly customToDate = signal<string>('');
  readonly selectedProjectId = signal<number | null>(null);
  readonly selectedWorkerId = signal<number | null>(null);
  readonly selectedTab = signal<ReportTab>('summary');

  // Computed Date Range
  readonly effectiveDateRange = computed(() => {
    const preset = this.datePreset();
    const actualToday = this.store.systemActualToday();

    switch (preset) {
      case 'today':
        return { from: actualToday, to: actualToday };
      case 'yesterday': {
        const yest = this.store.getYesterdayIso();
        return { from: yest, to: yest };
      }
      case 'week': {
        const d = new Date(actualToday + 'T12:00:00Z');
        d.setDate(d.getDate() - 7);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return { from: `${y}-${m}-${day}`, to: actualToday };
      }
      case 'month': {
        const ym = actualToday.slice(0, 7);
        return { from: `${ym}-01`, to: actualToday };
      }
      case 'prev_month': {
        const d = new Date(actualToday + 'T12:00:00Z');
        d.setMonth(d.getMonth() - 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
      }
      case 'custom': {
        return { from: this.customFromDate(), to: this.customToDate() };
      }
      case 'all':
      default:
        return { from: '', to: '' };
    }
  });

  readonly datePresetLabel = computed(() => {
    const p = this.datePreset();
    switch (p) {
      case 'today':
        return 'اليوم';
      case 'yesterday':
        return 'أمس';
      case 'week':
        return 'آخر 7 أيام';
      case 'month':
        return 'هذا الشهر';
      case 'prev_month':
        return 'الشهر السابق';
      case 'custom':
        return 'نطاق مخصص';
      case 'all':
      default:
        return 'جميع الفترات';
    }
  });

  readonly currentMonthLabel = computed(() => {
    return this.store.systemActualToday().slice(0, 7);
  });

  readonly selectedProjectName = computed(() => {
    const id = this.selectedProjectId();
    if (!id) return 'جميع المشاريع';
    return this.store.projectName(id);
  });

  readonly currentTabTitle = computed(() => {
    const t = this.selectedTab();
    switch (t) {
      case 'summary':
        return 'تقرير الملخص المالي والبنكي الشامل';
      case 'attendance':
        return 'كشف حضور ويوميات وسهرات العمال';
      case 'advances':
        return 'كشف سلف وخصومات العمال';
      case 'expenses':
        return 'كشف المصاريف الخارجية والموقع';
      case 'extracts':
        return 'كشف مستخلصات وبنود التنفيذ';
      case 'ledger':
        return 'كشف حساب وأرباح المقاول';
      case 'worker_statement':
        return 'كشف حساب تفصيلي لعامل';
      default:
        return 'تقرير شامل';
    }
  });

  // Filtered Collections
  readonly filteredAttendances = computed(() => {
    const { from, to } = this.effectiveDateRange();
    const projId = this.selectedProjectId();
    const workerId = this.selectedWorkerId();

    return this.store.attendances().filter((a) => {
      if (from && a.date < from) return false;
      if (to && a.date > to) return false;
      if (projId !== null && a.projectId !== projId) return false;
      if (workerId !== null && a.workerId !== workerId) return false;
      return true;
    });
  });

  readonly filteredAdvances = computed(() => {
    const { from, to } = this.effectiveDateRange();
    const projId = this.selectedProjectId();
    const workerId = this.selectedWorkerId();

    return this.store.advances().filter((adv) => {
      if (from && adv.date < from) return false;
      if (to && adv.date > to) return false;
      if (projId !== null && adv.projectId !== projId) return false;
      if (workerId !== null && adv.workerId !== workerId) return false;
      return true;
    });
  });

  readonly filteredExpenses = computed(() => {
    const { from, to } = this.effectiveDateRange();
    const projId = this.selectedProjectId();

    return this.store.expenses().filter((exp) => {
      if (from && exp.date < from) return false;
      if (to && exp.date > to) return false;
      if (projId !== null && exp.projectId !== projId) return false;
      return true;
    });
  });

  readonly filteredChecks = computed(() => {
    const { from, to } = this.effectiveDateRange();
    const projId = this.selectedProjectId();

    return this.store.checks().filter((chk) => {
      const d = chk.dueDate || '';
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (projId !== null && chk.projectId !== projId) return false;
      return true;
    });
  });

  readonly filteredExtracts = computed(() => {
    const { from, to } = this.effectiveDateRange();
    const projId = this.selectedProjectId();

    return this.store.extracts().filter((ext) => {
      if (projId !== null && ext.projectId !== projId) return false;
      if (from && ext.to && ext.to < from) return false;
      if (to && ext.from && ext.from > to) return false;
      return true;
    });
  });

  // KPI Metrics for the filtered slice
  readonly kpiMetrics = computed(() => {
    const atts = this.filteredAttendances();
    const advs = this.filteredAdvances();
    const exps = this.filteredExpenses();
    const chks = this.filteredChecks();

    const daysWorkedSum = atts.reduce((s, a) => s + (a.dayWorked || 0), 0);
    const nightsWorkedSum = atts.reduce((s, a) => s + (a.nightWorked || 0), 0);

    const wagesTotal = atts.reduce(
      (s, a) =>
        s +
        (a.dayWorked ? a.workerDayRateSnapshot : 0) +
        (a.nightWorked ? a.workerNightRateSnapshot : 0),
      0
    );

    const companyWagesTotal = atts.reduce(
      (s, a) =>
        s +
        (a.dayWorked ? a.companyDayRateSnapshot : 0) +
        (a.nightWorked ? a.companyNightRateSnapshot : 0),
      0
    );

    const advancesTotal = advs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const expensesTotal = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalChecks = chks.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const withdrawnCashFromBank = chks.reduce((s, c) => {
      const w = c.withdrawnAmount !== undefined && c.withdrawnAmount !== null && c.withdrawnAmount > 0
        ? Number(c.withdrawnAmount)
        : (c.status === 'اتصرف' ? Number(c.amount) || 0 : 0);
      return s + w;
    }, 0);

    const remainingInBank = Math.max(0, totalChecks - withdrawnCashFromBank);

    // Pocket Cash: Cash withdrawn minus what was paid as advances or site expenses
    const netPocketCash = Math.max(0, withdrawnCashFromBank - advancesTotal - expensesTotal);

    // Total Net Profit
    const totalIncoming = totalChecks;
    const totalOutgoing = wagesTotal + expensesTotal;
    const totalNetProfit = totalIncoming - totalOutgoing;

    return {
      daysWorkedSum,
      nightsWorkedSum,
      wagesTotal,
      companyWagesTotal,
      advancesTotal,
      expensesTotal,
      totalChecks,
      withdrawnCashFromBank,
      remainingInBank,
      netPocketCash,
      totalIncoming,
      totalOutgoing,
      totalNetProfit,
    };
  });

  // Project Summary Rows
  readonly projectSummaryRows = computed(() => {
    const projects = this.store.projects();
    const atts = this.filteredAttendances();
    const advs = this.filteredAdvances();
    const exps = this.filteredExpenses();
    const chks = this.filteredChecks();

    const selectedId = this.selectedProjectId();
    const targetProjects = selectedId !== null
      ? projects.filter((p) => p.id === selectedId)
      : projects;

    return targetProjects.map((proj) => {
      const pAtts = atts.filter((a) => a.projectId === proj.id);
      const pAdvs = advs.filter((a) => a.projectId === proj.id);
      const pExps = exps.filter((e) => e.projectId === proj.id);
      const pChks = chks.filter((c) => c.projectId === proj.id);

      const checksTotal = pChks.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const withdrawnCash = pChks.reduce((s, c) => {
        const w = c.withdrawnAmount !== undefined && c.withdrawnAmount !== null && c.withdrawnAmount > 0
          ? Number(c.withdrawnAmount)
          : (c.status === 'اتصرف' ? Number(c.amount) || 0 : 0);
        return s + w;
      }, 0);
      const remainingInBank = Math.max(0, checksTotal - withdrawnCash);
      const advancesTotal = pAdvs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const expensesTotal = pExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const wagesTotal = pAtts.reduce(
        (s, a) =>
          s +
          (a.dayWorked ? a.workerDayRateSnapshot : 0) +
          (a.nightWorked ? a.workerNightRateSnapshot : 0),
        0
      );

      return {
        projectName: proj.name,
        checksTotal,
        withdrawnCash,
        remainingInBank,
        advancesTotal,
        expensesTotal,
        wagesTotal,
      };
    });
  });

  // Worker Statement for Tab 6
  readonly activeWorkerStatement = computed(() => {
    const workerId = this.selectedWorkerId();
    if (!workerId) return null;

    const worker = this.store.workers().find((w) => w.id === workerId);
    if (!worker) return null;

    const atts = this.filteredAttendances().filter((a) => a.workerId === workerId);
    const advs = this.filteredAdvances().filter((a) => a.workerId === workerId);
    const deds = this.store.deductions().filter((d) => d.workerId === workerId);
    const sets = this.store.settlements().filter((s) => s.workerId === workerId);

    const days = atts.reduce((s, a) => s + (a.dayWorked || 0), 0);
    const nights = atts.reduce((s, a) => s + (a.nightWorked || 0), 0);

    const grossWages = atts.reduce(
      (s, a) =>
        s +
        (a.dayWorked ? a.workerDayRateSnapshot : 0) +
        (a.nightWorked ? a.workerNightRateSnapshot : 0),
      0
    );

    const totalAdvances = advs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const totalDeductions = deds.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const totalSettledPaid = sets.reduce((s, set) => s + (Number(set.netPaid) || 0), 0);

    const netDueNow = Math.max(0, grossWages - totalAdvances - totalDeductions - totalSettledPaid);

    // Build timeline
    const timeline: {
      date: string;
      type: 'حضور' | 'سلفة' | 'خصم' | 'تسوية';
      projectName: string;
      details: string;
      credit?: number;
      debit?: number;
      id?: number;
    }[] = [];

    for (const a of atts) {
      const earned =
        (a.dayWorked ? a.workerDayRateSnapshot : 0) +
        (a.nightWorked ? a.workerNightRateSnapshot : 0);
      timeline.push({
        date: a.date,
        type: 'حضور',
        projectName: this.store.projectName(a.projectId),
        details: `${a.dayWorked ? 'يومية' : ''} ${a.nightWorked ? 'سهرة' : ''} ${a.note ? '(' + a.note + ')' : ''}`,
        credit: earned,
        id: a.id,
      });
    }

    for (const adv of advs) {
      timeline.push({
        date: adv.date,
        type: 'سلفة',
        projectName: this.store.projectName(adv.projectId),
        details: adv.reason || 'سلفة نقدية',
        debit: adv.amount,
        id: adv.id,
      });
    }

    timeline.sort((x, y) => x.date.localeCompare(y.date));

    return {
      worker,
      days,
      nights,
      grossWages,
      totalAdvances,
      totalDeductions,
      totalSettledPaid,
      netDueNow,
      timeline,
    };
  });

  setDatePreset(preset: DatePreset): void {
    this.datePreset.set(preset);
  }

  onCustomFromChange(val: string): void {
    this.customFromDate.set(val);
    this.datePreset.set('custom');
  }

  onCustomToChange(val: string): void {
    this.customToDate.set(val);
    this.datePreset.set('custom');
  }

  onProjectFilterChange(val: string): void {
    this.selectedProjectId.set(val ? Number(val) : null);
  }

  onWorkerFilterChange(val: string): void {
    this.selectedWorkerId.set(val ? Number(val) : null);
  }

  printReport(): void {
    window.print();
  }

  exportFilteredExcel(): void {
    const kpi = this.kpiMetrics();
    const title = `تقرير_${this.selectedProjectName()}_${this.datePresetLabel()}`;

    // Summary Rows
    const summaryRows = [
      { البند: 'اسم الشركة', القيمة: this.store.settings().companyName },
      { البند: 'المشروع', القيمة: this.selectedProjectName() },
      { البند: 'فترة التقرير', القيمة: this.datePresetLabel() },
      { البند: 'من تاريخ', القيمة: this.effectiveDateRange().from || 'البداية' },
      { البند: 'إلى تاريخ', القيمة: this.effectiveDateRange().to || this.store.todayIso() },
      { البند: 'إجمالي شيكات المشاريع', القيمة: kpi.totalChecks },
      { البند: 'المسحوب كاش من البنك', القيمة: kpi.withdrawnCashFromBank },
      { البند: 'المتبقي في البنك من الشيكات', القيمة: kpi.remainingInBank },
      { البند: 'إجمالي سلف العمال', القيمة: kpi.advancesTotal },
      { البند: 'إجمالي أجور اليوميات', القيمة: kpi.wagesTotal },
      { البند: 'إجمالي المصاريف الخارجية', القيمة: kpi.expensesTotal },
      { البند: 'صافي باقي الكاش في الجيب (العهدة)', القيمة: kpi.netPocketCash },
    ];

    // Attendance Rows
    const attendanceRows = this.filteredAttendances().map((a) => ({
      التاريخ: a.date,
      العامل: this.store.workerName(a.workerId),
      المشروع: this.store.projectName(a.projectId),
      يومية: a.dayWorked,
      سهرة: a.nightWorked,
      'سعر يومية العامل': a.workerDayRateSnapshot,
      'إجمالي أجر العامل': (a.dayWorked ? a.workerDayRateSnapshot : 0) + (a.nightWorked ? a.workerNightRateSnapshot : 0),
      'سعر يومية الشركة': a.companyDayRateSnapshot,
      'مستحق الشركة': (a.dayWorked ? a.companyDayRateSnapshot : 0) + (a.nightWorked ? a.companyNightRateSnapshot : 0),
      ملاحظات: a.note || '',
    }));

    // Advances Rows
    const advancesRows = this.filteredAdvances().map((adv) => ({
      التاريخ: adv.date,
      العامل: this.store.workerName(adv.workerId),
      المشروع: this.store.projectName(adv.projectId),
      المبلغ: adv.amount,
      السبب: adv.reason || 'سلفة نقدية',
      'حالة الخصم': adv.settlementId ? `مخصومة بتسوية #${adv.settlementId}` : 'معلقة',
    }));

    // Expenses Rows
    const expensesRows = this.filteredExpenses().map((e) => ({
      التاريخ: e.date,
      البند: e.category,
      المشروع: this.store.projectName(e.projectId),
      المبلغ: e.amount,
      ملاحظات: e.note || '',
    }));

    this.excel.exportFilteredReport({
      title,
      summaryRows,
      attendanceRows,
      advancesRows,
      expensesRows,
    });
  }

  async copyFormattedWhatsAppReport(): Promise<void> {
    const kpi = this.kpiMetrics();
    const text = `📊 *تقرير مالي وميداني — ${this.store.settings().companyName}*
📅 *الفترة:* ${this.datePresetLabel()} (من ${this.store.digits(this.effectiveDateRange().from || 'البداية')} إلى ${this.store.digits(this.effectiveDateRange().to || this.store.todayIso())})
🏗️ *المشروع:* ${this.selectedProjectName()}
─────────────────────
💰 *شيكات ودفعات واردة:* ${this.store.money(kpi.totalChecks)}
🏧 *المسحوب كاش من البنك:* ${this.store.money(kpi.withdrawnCashFromBank)}
🏦 *المتبقي في البنك من الشيك:* ${this.store.money(kpi.remainingInBank)}
─────────────────────
👷 *إجمالي سلف العمال:* ${this.store.money(kpi.advancesTotal)}
🧾 *المصاريف الخارجية والموقع:* ${this.store.money(kpi.expensesTotal)}
💵 *باقي الكاش في الجيب (العهدة):* ${this.store.money(kpi.netPocketCash)}
─────────────────────
📋 *أجور اليوميات والعمال:* ${this.store.money(kpi.wagesTotal)} (${this.store.num(kpi.daysWorkedSum)} يومية و ${this.store.num(kpi.nightsWorkedSum)} سهرة)
✨ *صافي الربح التقديري:* ${this.store.money(kpi.totalNetProfit)}
─────────────────────
تم الاستخراج من نظام دورتمون لإدارة المقاولات`;

    try {
      await navigator.clipboard.writeText(text);
      this.store.showToast('تم نسخ التقرير الشامل بتنسيق الواتساب بنجاح 📋', 'success');
    } catch {
      this.store.showToast('تعذر النسخ التلقائي للحافظة', 'warning');
    }
  }

  async downloadJsonBackup(): Promise<void> {
    const json = await this.store.exportJsonBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `دورتمون_نسخة_احتياطية_${this.store.todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.store.showToast('تم تصدير النسخة الاحتياطية JSON بنجاح', 'success');
  }

  async onRestoreJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    await this.store.importJsonBackup(text);
    input.value = '';
  }
}
