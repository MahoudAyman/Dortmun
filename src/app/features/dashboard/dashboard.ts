import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import { calculateDashboardSummary } from '../../core/calc/calculations';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Mandatory Daily Headcount & Payday 15 Ceramic Command Banner -->
      @let hc = store.todayHeadcountMatch();
      @let payday = store.payday15Info();
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- Mandatory Daily Headcount Card (7 cols) -->
        <div
          class="lg:col-span-7 ceramic-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2"
          [class.border-rose-300]="!hc.hasMandatoryRecord"
          [class.dark:border-rose-800]="!hc.hasMandatoryRecord"
          [class.border-amber-300]="hc.hasMandatoryRecord && !hc.isExactMatch"
          [class.dark:border-amber-800]="hc.hasMandatoryRecord && !hc.isExactMatch"
          [class.border-emerald-300]="hc.isExactMatch"
          [class.dark:border-emerald-800]="hc.isExactMatch"
        >
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <span
                class="px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold"
                [class.bg-rose-600]="!hc.hasMandatoryRecord"
                [class.text-white]="!hc.hasMandatoryRecord || hc.isExactMatch"
                [class.bg-amber-500]="hc.hasMandatoryRecord && !hc.isExactMatch"
                [class.text-slate-950]="hc.hasMandatoryRecord && !hc.isExactMatch"
                [class.bg-emerald-600]="hc.isExactMatch"
              >
                {{ !hc.hasMandatoryRecord ? 'إجباري كل يوم' : hc.isExactMatch ? 'نفس العدد ✓' : 'يوجد فرق في العدد!' }}
              </span>
              <h2 class="text-sm font-extrabold text-slate-900 dark:text-white">
                دفتر العدد اليومي الإجباري ({{ store.digits(store.todayIso()) }})
              </h2>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
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
              class="px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm"
            >
              <mat-icon class="!text-base !w-4 !h-4">fact_check</mat-icon>
              <span>{{ hc.hasMandatoryRecord ? 'تعديل العدد اليومي' : 'تسجيل العدد الإجباري الآن' }}</span>
            </button>
            <a
              routerLink="/bulk"
              class="px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold inline-flex items-center justify-center gap-1"
            >
              <span>تحويل لتسجيل الأسماء</span>
              <mat-icon class="!text-sm !w-4 !h-4">arrow_back</mat-icon>
            </a>
          </div>
        </div>

        <!-- Payday 15th & Deductions Card (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 flex flex-col justify-between gap-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                <mat-icon class="!text-base !w-4 !h-4">event_repeat</mat-icon>
                <span>دورة قبض يوم {{ store.num(store.settings().paydayDayOfMonth || 15) }} في الشهر</span>
              </div>
              <p class="text-[11px] text-slate-500 mt-1">
                {{ payday.label }} · الخصومات المفتوحة: <strong class="text-rose-600">{{ store.money(store.totalOpenDeductions()) }}</strong>
              </p>
            </div>
            <span class="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold">
              قبض يوم ١٥
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <a
              routerLink="/settlements"
              class="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
            >
              <mat-icon class="!text-sm !w-4 !h-4">payments</mat-icon>
              <span>تحويل لكشف قبض يوم ١٥</span>
            </a>
            <a
              routerLink="/deductions"
              class="py-2.5 px-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-extrabold text-xs inline-flex items-center justify-center gap-1"
            >
              <mat-icon class="!text-sm !w-4 !h-4">gavel</mat-icon>
              <span>تسجيل خصم</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Filter & Quick Action Bar -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 ceramic-card p-4 lg:p-5">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
          <div>
            <label for="dash-project-filter" class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">فلترة حسب المشروع</label>
            <select
              id="dash-project-filter"
              [value]="store.selectedProjectId() ?? ''"
              (change)="onProjectFilterChange($event)"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">كل المشاريع ({{ store.num(store.projects().length) }})</option>
              @for (proj of store.projects(); track proj.id) {
                <option [value]="proj.id">{{ proj.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="dash-period-from" class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">من تاريخ</label>
            <input
              id="dash-period-from"
              type="date"
              [value]="fromDate()"
              (change)="fromDate.set($any($event.target).value)"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="dash-period-to" class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">إلى تاريخ</label>
            <input
              id="dash-period-to"
              type="date"
              [value]="toDate()"
              (change)="toDate.set($any($event.target).value)"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm tabular-nums"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a
            routerLink="/bulk"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs transition-colors whitespace-nowrap shadow-xs"
          >
            <mat-icon class="!text-lg !w-5 !h-5">playlist_add_check</mat-icon>
            <span>إضافة جماعية سريعة</span>
          </a>
          <a
            routerLink="/zaki"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-extrabold text-xs transition-colors whitespace-nowrap"
          >
            <mat-icon class="!text-lg !w-5 !h-5 text-amber-400">smart_toy</mat-icon>
            <span>اسأل زكي الذكي</span>
          </a>
          <button
            type="button"
            (click)="excel.exportFullWorkbook()"
            class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <mat-icon class="!text-lg !w-5 !h-5 text-emerald-600">download</mat-icon>
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      <!-- Primary Financial & Attendance KPIs (All start at 0 until real data is recorded) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>إجمالي اليوميات والسهرات</span>
            <mat-icon class="!text-lg text-amber-500">engineering</mat-icon>
          </div>
          <div class="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {{ store.num(filteredSummary().totalDays) }} يومية
            <span class="text-sm font-semibold text-slate-500">· {{ store.num(filteredSummary().totalNights) }} سهرة</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            أجور العمال والناش: <strong class="tabular-nums text-slate-700 dark:text-slate-200">{{ store.money(filteredSummary().totalWorkerWages) }}</strong>
          </p>
        </div>

        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>المطلوب من الشركة (صافي)</span>
            <mat-icon class="!text-lg text-blue-600">request_quote</mat-icon>
          </div>
          <div class="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {{ store.money(filteredSummary().requiredFromCompany) }}
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            الواصل فعلياً: <strong class="tabular-nums text-emerald-600 dark:text-emerald-400">{{ store.money(filteredSummary().totalCollected) }}</strong>
          </p>
        </div>

        <div class="ceramic-card p-5">
          <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>المتبقي طرف الشركة</span>
            <mat-icon class="!text-lg text-amber-600">pending_actions</mat-icon>
          </div>
          <div class="text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
            {{ store.money(filteredSummary().remainingFromCompany) }}
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
            المصاريف الخارجية: <strong class="tabular-nums text-rose-600 dark:text-rose-400">{{ store.money(filteredSummary().totalExternalExpenses) }}</strong>
          </p>
        </div>

        <div class="ceramic-hero p-5 text-white">
          <div class="flex items-center justify-between text-slate-300 text-xs font-bold mb-2">
            <span>صافي الربح التقريبي</span>
            <mat-icon class="!text-lg text-emerald-400">trending_up</mat-icon>
          </div>
          <div
            class="text-2xl font-extrabold tabular-nums"
            [class.text-emerald-400]="filteredSummary().ApproximateNetProfit >= 0"
            [class.text-rose-400]="filteredSummary().ApproximateNetProfit < 0"
          >
            {{ store.money(filteredSummary().ApproximateNetProfit) }}
          </div>
          <p class="text-[11px] text-slate-400 mt-2">
            المطلوب − أجور العمال − المصاريف
          </p>
        </div>
      </div>

      <!-- Secondary Row: Smart Alerts with Navigation Buttons & Checks/Deductions Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Smart Alerts Panel with Direct Navigation Button ("تنبيهات مع زر التحويل") (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <mat-icon class="text-amber-500">notifications_active</mat-icon>
              <span>مركز التنبيهات الذكية السريعة (مع زر التحويل المباشر)</span>
            </h2>
            <span class="text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
              {{ store.num(store.smartAlerts().length) }} تنبيهات
            </span>
          </div>

          <div class="space-y-2.5">
            @for (alert of store.smartAlerts(); track alert.id) {
              <div
                class="p-3.5 rounded-2xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-all"
                [class.bg-rose-50/70]="alert.severity === 'danger'"
                [class.border-rose-200]="alert.severity === 'danger'"
                [class.dark:bg-rose-950/30]="alert.severity === 'danger'"
                [class.dark:border-rose-900]="alert.severity === 'danger'"
                [class.bg-amber-50/70]="alert.severity === 'warning'"
                [class.border-amber-200]="alert.severity === 'warning'"
                [class.dark:bg-amber-950/30]="alert.severity === 'warning'"
                [class.dark:border-amber-900]="alert.severity === 'warning'"
                [class.bg-slate-50/90]="alert.severity === 'info'"
                [class.border-slate-200]="alert.severity === 'info'"
                [class.dark:bg-slate-800/50]="alert.severity === 'info'"
                [class.dark:border-slate-700]="alert.severity === 'info'"
                [class.bg-emerald-50/70]="alert.severity === 'success'"
                [class.border-emerald-200]="alert.severity === 'success'"
                [class.dark:bg-emerald-950/30]="alert.severity === 'success'"
                [class.dark:border-emerald-900]="alert.severity === 'success'"
              >
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 shadow-2xs">
                    <mat-icon
                      class="!text-lg !w-5 !h-5"
                      [class.text-rose-600]="alert.severity === 'danger'"
                      [class.text-amber-600]="alert.severity === 'warning'"
                      [class.text-sky-600]="alert.severity === 'info'"
                      [class.text-emerald-600]="alert.severity === 'success'"
                    >
                      {{ alert.icon }}
                    </mat-icon>
                  </div>
                  <div>
                    <p class="text-xs font-extrabold text-slate-900 dark:text-white">
                      {{ alert.title }}
                    </p>
                    <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      {{ alert.subtitle }}
                    </p>
                  </div>
                </div>

                <a
                  [routerLink]="alert.route"
                  class="px-3.5 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 shadow-2xs hover:opacity-95"
                >
                  <span>{{ alert.actionLabel }}</span>
                  <mat-icon class="!text-sm !w-4 !h-4">arrow_back</mat-icon>
                </a>
              </div>
            }
          </div>
        </div>

        <!-- Checks, Advances & Deductions Summary (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 class="text-base font-extrabold text-slate-900 dark:text-white">
              موقف الشيكات والسلف والخصومات
            </h2>
            <a routerLink="/checks" class="text-xs text-amber-600 dark:text-amber-400 font-extrabold hover:underline">
              تحويل للشيكات
            </a>
          </div>

          <div class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-400">شيكات واردة معلقة</span>
              <span class="font-extrabold tabular-nums text-amber-600">{{ store.money(filteredSummary().incomingChecksPending) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-400">شيكات واردة اتصرفت</span>
              <span class="font-extrabold tabular-nums text-emerald-600">{{ store.money(filteredSummary().incomingChecksCashed) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-400">شيكات صادرة معلقة</span>
              <span class="font-extrabold tabular-nums text-rose-600">{{ store.money(filteredSummary().outgoingChecksPending) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-400">إجمالي السلف المفتوحة</span>
              <span class="font-extrabold tabular-nums text-slate-900 dark:text-white">{{ store.money(filteredSummary().totalAdvancesGiven) }}</span>
            </div>
            <div class="py-2.5 flex items-center justify-between">
              <span class="text-slate-600 dark:text-slate-400">إجمالي الخصومات والجزاءات المفتوحة</span>
              <span class="font-extrabold tabular-nums text-rose-600">{{ store.money(store.totalOpenDeductions()) }}</span>
            </div>
          </div>

          <!-- Quick Jump Grid inside Card -->
          <div class="grid grid-cols-2 gap-2 pt-2">
            <a
              routerLink="/advances"
              class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center justify-between"
            >
              <span>تحويل للسلف</span>
              <mat-icon class="!text-sm !w-4 !h-4 text-slate-400">arrow_back</mat-icon>
            </a>
            <a
              routerLink="/deductions"
              class="p-2.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center justify-between"
            >
              <span>تحويل للخصومات</span>
              <mat-icon class="!text-sm !w-4 !h-4">arrow_back</mat-icon>
            </a>
          </div>
        </div>
      </div>

      <!-- Project Comparison & Quick Setup Section -->
      <div class="ceramic-card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-extrabold text-slate-900 dark:text-white">مقارنة المشاريع والأداء المالي</h2>
            <p class="text-xs text-slate-500">مقارنة اليوميات والمطلوب من الشركة وأجور العمال وصافي الربح لكل مشروع</p>
          </div>
          <div class="flex items-center gap-2">
            <a routerLink="/settings" class="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold hover:bg-amber-500 hover:text-slate-950 transition-colors">
              + إضافة مشروع جديد
            </a>
            <a routerLink="/extracts" class="px-3.5 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold">
              تحويل للمستخلصات
            </a>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          @for (item of projectComparisons(); track item.project.id) {
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-extrabold text-slate-900 dark:text-white text-sm">{{ item.project.name }}</h3>
                <span class="text-xs px-2.5 py-0.5 rounded-xl bg-white dark:bg-slate-900 font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {{ store.num(item.summary.totalDays) }} يومية
                </span>
              </div>

              <div class="space-y-2 text-xs">
                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-slate-500">المطلوب من الشركة</span>
                    <span class="font-bold tabular-nums">{{ store.money(item.summary.requiredFromCompany) }}</span>
                  </div>
                  <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-600 rounded-full" [style.width.%]="item.reqPercent"></div>
                  </div>
                </div>

                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-slate-500">التكلفة (أجور + مصاريف)</span>
                    <span class="font-bold tabular-nums">{{ store.money(item.summary.totalWorkerWages + item.summary.totalExternalExpenses) }}</span>
                  </div>
                  <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" [style.width.%]="item.costPercent"></div>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700 flex items-center justify-between">
                  <span class="text-slate-500">صافي الربح:</span>
                  <span
                    class="font-extrabold tabular-nums"
                    [class.text-emerald-600]="item.summary.ApproximateNetProfit >= 0"
                    [class.text-rose-600]="item.summary.ApproximateNetProfit < 0"
                  >
                    {{ store.money(item.summary.ApproximateNetProfit) }}
                  </span>
                </div>
              </div>
            </div>
          } @empty {
            <div class="md:col-span-3 p-8 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
              <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                <mat-icon>rocket_launch</mat-icon>
              </div>
              <h3 class="text-sm font-extrabold text-slate-900 dark:text-white">
                الأرقام كلها صفر (٠) وجاهزة لتسجيل أعمالك الحقيقية!
              </h3>
              <p class="text-xs text-slate-500 max-w-xl mx-auto leading-relaxed">
                ابدأ بإضافة مشروعك الأول، ثم أضف العمال والنحاتية، وسجّل العدد اليومي الإجباري لمطابقة اليوميات والسهرات وحساب قبض يوم ١٥ تلقائياً.
              </p>
              <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a routerLink="/settings" class="px-4 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold">
                  ١. إضافة مشروع جديد
                </a>
                <a routerLink="/workers" class="px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 text-xs font-extrabold">
                  ٢. إضافة العمال والنحاتية
                </a>
                <button
                  type="button"
                  (click)="store.showQuickHeadcountModal.set(true)"
                  class="px-4 py-2 rounded-2xl border border-slate-300 dark:border-slate-700 text-xs font-extrabold"
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
}
