import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { checkMonthlyCap, compareDailyHeadcount } from '../../core/calc/calculations';
import type { Worker } from '../../core/db/models';

@Component({
  selector: 'app-attendance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-5">
      <!-- Mandatory Daily Headcount & Matching Panel ("العدد كل يوم إجباري: عدد العمالة والنحاتية وعدد السهرة مع هل نفس العدد أم لا") -->
      @let match = selectedDateHeadcountMatch();
      <div
        class="ceramic-card p-5 space-y-4 border-2"
        [class.border-rose-300]="!match.hasMandatoryRecord"
        [class.dark:border-rose-800]="!match.hasMandatoryRecord"
        [class.border-amber-300]="match.hasMandatoryRecord && !match.isExactMatch"
        [class.dark:border-amber-800]="match.hasMandatoryRecord && !match.isExactMatch"
        [class.border-emerald-300]="match.isExactMatch"
        [class.dark:border-emerald-800]="match.isExactMatch"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div class="flex items-center gap-3">
            <div
              class="w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold shrink-0"
              [class.bg-rose-600]="!match.hasMandatoryRecord"
              [class.text-white]="!match.hasMandatoryRecord || match.isExactMatch"
              [class.bg-amber-500]="match.hasMandatoryRecord && !match.isExactMatch"
              [class.text-slate-950]="match.hasMandatoryRecord && !match.isExactMatch"
              [class.bg-emerald-600]="match.isExactMatch"
            >
              <mat-icon>fact_check</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-base font-extrabold text-slate-900 dark:text-white">
                  دفتر العدد اليومي الإجباري ومطابقة اليوميات والسهرات
                </h1>
                <span
                  class="px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold"
                  [class.bg-rose-100]="!match.hasMandatoryRecord"
                  [class.text-rose-700]="!match.hasMandatoryRecord"
                  [class.bg-amber-100]="match.hasMandatoryRecord && !match.isExactMatch"
                  [class.text-amber-800]="match.hasMandatoryRecord && !match.isExactMatch"
                  [class.bg-emerald-100]="match.isExactMatch"
                  [class.text-emerald-800]="match.isExactMatch"
                >
                  {{ match.statusLabel }}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                سجّل العدد الإجباري لليوم المختار (عدد العمال + عدد النحاتية + عدد السهرة) وتأكد هل المسجل بالأسماء نفس العدد أم لا
              </p>
            </div>
          </div>

          <a
            routerLink="/bulk"
            class="px-4 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5"
          >
            <mat-icon class="!text-sm !w-4 !h-4">playlist_add_check</mat-icon>
            <span>تحويل للإضافة الجماعية</span>
          </a>
        </div>

        <!-- Inline Daily Headcount Form & Live Comparison -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label for="hc-inline-date" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              اليوم المطلوب تسجيل عدده
            </label>
            <input
              id="hc-inline-date"
              type="date"
              [value]="selectedDateForCount()"
              (change)="onCountDateChange($any($event.target).value)"
              class="w-full px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums"
            />
          </div>

          <div>
            <label for="hc-inline-workers" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              عدد العمال والصنايعية (يومية)
            </label>
            <input
              id="hc-inline-workers"
              type="number"
              min="0"
              [value]="inlineWorkersCount()"
              (input)="inlineWorkersCount.set(+$any($event.target).value)"
              class="w-full px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-extrabold tabular-nums"
            />
          </div>

          <div>
            <label for="hc-inline-sculptors" class="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
              عدد النحّاتية (يومية نحات)
            </label>
            <input
              id="hc-inline-sculptors"
              type="number"
              min="0"
              [value]="inlineSculptorsCount()"
              (input)="inlineSculptorsCount.set(+$any($event.target).value)"
              class="w-full px-3 py-2 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-slate-800 text-sm font-extrabold tabular-nums"
            />
          </div>

          <div>
            <label for="hc-inline-nights" class="block text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">
              عدد السهرة الإجباري
            </label>
            <input
              id="hc-inline-nights"
              type="number"
              min="0"
              [value]="inlineNightsCount()"
              (input)="inlineNightsCount.set(+$any($event.target).value)"
              class="w-full px-3 py-2 rounded-2xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-slate-800 text-sm font-extrabold tabular-nums"
            />
          </div>

          <div>
            <span class="block text-xs font-bold text-slate-500 mb-1">المسجل فعلياً بالأسماء</span>
            <div class="px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold tabular-nums flex items-center justify-between">
              <span>{{ store.num(match.actualDays) }} يومية ({{ store.num(match.actualSculptors) }} نحات)</span>
              <span class="text-indigo-600 dark:text-indigo-400">{{ store.num(match.actualNights) }} سهرة</span>
            </div>
          </div>

          <div>
            <button
              type="button"
              (click)="saveInlineHeadcount()"
              class="w-full py-2.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs"
            >
              <mat-icon class="!text-base !w-4 !h-4">save</mat-icon>
              <span>حفظ العدد الإجباري ({{ store.num(inlineWorkersCount() + inlineSculptorsCount()) }} ي · {{ store.num(inlineNightsCount()) }} س)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Top Bar: Month Picker, Project Selector, Legend -->
      <div class="flex flex-wrap items-center justify-between gap-4 ceramic-card p-4">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <label for="att-month" class="block text-xs font-bold text-slate-500 mb-1">الشهر</label>
            <input
              id="att-month"
              type="month"
              [value]="store.selectedMonth()"
              (change)="store.selectedMonth.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold tabular-nums"
            />
          </div>

          <div>
            <label for="att-project" class="block text-xs font-bold text-slate-500 mb-1">المشروع للتسجيل</label>
            <select
              id="att-project"
              [value]="activeProjectId()"
              (change)="activeProjectId.set(+$any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold"
            >
              @if (store.projects().length === 0) {
                <option [value]="1">المشروع الرئيسي (افتراضي)</option>
              }
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }} (يومية الشركة: {{ store.money(p.companyDayRate) }})</option>
              }
            </select>
          </div>

          @if (store.isMonthLocked(store.selectedMonth())) {
            <div class="px-3 py-1.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5">
              <mat-icon class="!text-base !w-4 !h-4">lock</mat-icon>
              <span>هذا الشهر مؤرشف ومغلق ضد التعديل</span>
            </div>
          }
        </div>

        <!-- Color Legend -->
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <span class="text-slate-500 font-bold">ضغطة واحدة للتبديل:</span>
          <span class="inline-flex items-center gap-1.5 font-extrabold text-emerald-700 dark:text-emerald-400">
            <span class="w-3.5 h-3.5 rounded-md bg-emerald-500 inline-block"></span> يومية (ي)
          </span>
          <span class="inline-flex items-center gap-1.5 font-extrabold text-indigo-700 dark:text-indigo-400">
            <span class="w-3.5 h-3.5 rounded-md bg-indigo-500 inline-block"></span> سهرة (س)
          </span>
          <span class="inline-flex items-center gap-1.5 font-extrabold text-amber-700 dark:text-amber-400">
            <span class="w-3.5 h-3.5 rounded-md bg-amber-500 inline-block"></span> يومية + سهرة (ي+س)
          </span>
        </div>
      </div>

      <!-- Monthly Grid (Worker × Day) with Daily Headcount Match Row -->
      <div class="ceramic-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs border-collapse">
            <thead class="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800 py-3 px-3 min-w-[160px] font-extrabold border-l border-slate-200 dark:border-slate-700">
                  العامل / النحّات
                </th>
                <th class="py-3 px-2 text-center font-extrabold min-w-[72px] border-l border-slate-200 dark:border-slate-700">
                  الإجمالي
                </th>
                @for (dayNum of daysInMonth(); track dayNum) {
                  <th class="py-2 px-1.5 text-center font-bold min-w-[40px] tabular-nums border-l border-slate-100 dark:border-slate-800">
                    {{ store.num(dayNum) }}
                  </th>
                }
              </tr>

              <!-- Daily Headcount Match Row (صف مطابقة العدد اليومي الإجباري لكل يوم) -->
              <tr class="bg-amber-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <td class="sticky right-0 z-10 bg-amber-50 dark:bg-slate-800 py-2 px-3 font-extrabold text-[11px] text-slate-800 dark:text-amber-300 border-l border-slate-200 dark:border-slate-700">
                  العدد اليومي (فعلي / إجباري)
                </td>
                <td class="py-2 px-2 text-center font-extrabold text-[10px] text-slate-500 border-l border-slate-200 dark:border-slate-700">
                  هل نفس العدد؟
                </td>
                @for (dayNum of daysInMonth(); track dayNum) {
                  @let dMatch = dailyMatchMap()[dayNum];
                  <td class="p-1 text-center border-l border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      (click)="selectDayFromColumn(dayNum)"
                      class="w-full py-1 px-0.5 rounded-lg text-[10px] font-extrabold tabular-nums transition-colors"
                      [class.bg-emerald-100]="dMatch?.isExactMatch"
                      [class.text-emerald-800]="dMatch?.isExactMatch"
                      [class.bg-amber-200]="dMatch?.hasMandatoryRecord && !dMatch?.isExactMatch"
                      [class.text-slate-950]="dMatch?.hasMandatoryRecord && !dMatch?.isExactMatch"
                      [class.text-slate-400]="!dMatch?.hasMandatoryRecord && (dMatch?.actualDays || 0) === 0"
                      [class.bg-rose-100]="!dMatch?.hasMandatoryRecord && (dMatch?.actualDays || 0) > 0"
                      [class.text-rose-700]="!dMatch?.hasMandatoryRecord && (dMatch?.actualDays || 0) > 0"
                      [title]="dMatch?.statusLabel || ''"
                    >
                      {{ store.num(dMatch?.actualDays || 0) }}/{{ store.num(dMatch?.expectedDays || 0) }}
                    </button>
                  </td>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (row of gridRows(); track row.worker.id) {
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td class="sticky right-0 z-10 bg-white dark:bg-slate-900 py-2.5 px-3 font-bold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                    <div>{{ row.worker.name }}</div>
                    <div class="text-[11px] font-normal text-slate-500">{{ row.worker.role }}</div>
                  </td>

                  <td class="py-2 px-2 text-center tabular-nums border-l border-slate-200 dark:border-slate-700">
                    <div
                      class="font-extrabold"
                      [class.text-rose-600]="row.totalDays >= store.settings().monthlyDayCap"
                      [class.text-amber-600]="row.totalDays < store.settings().expectedMonthlyDays"
                      [class.text-emerald-600]="row.totalDays >= store.settings().expectedMonthlyDays && row.totalDays < store.settings().monthlyDayCap"
                    >
                      {{ store.num(row.totalDays) }} ي
                    </div>
                    @if (row.totalNights > 0) {
                      <div class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{{ store.num(row.totalNights) }} س</div>
                    }
                  </td>

                  @for (dayNum of daysInMonth(); track dayNum) {
                    @let cell = row.cells[dayNum];
                    <td class="p-1 text-center border-l border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        (click)="onCellClick(row.worker, dayNum)"
                        [attr.aria-label]="row.worker.name + ' يوم ' + dayNum"
                        class="w-8 h-8 rounded-xl font-extrabold text-[11px] transition-all flex items-center justify-center mx-auto"
                        [class.bg-emerald-500]="cell?.dayWorked === 1 && cell?.nightWorked === 0"
                        [class.text-white]="cell?.dayWorked === 1 || cell?.nightWorked === 1"
                        [class.bg-indigo-500]="cell?.dayWorked === 0 && cell?.nightWorked === 1"
                        [class.bg-amber-500]="cell?.dayWorked === 1 && cell?.nightWorked === 1"
                        [class.text-slate-950]="cell?.dayWorked === 1 && cell?.nightWorked === 1"
                        [class.bg-slate-100]="!cell"
                        [class.dark:bg-slate-800]="!cell"
                        [class.text-slate-400]="!cell"
                      >
                        @if (cell?.dayWorked === 1 && cell?.nightWorked === 1) {
                          ي+س
                        } @else if (cell?.dayWorked === 1) {
                          ي
                        } @else if (cell?.nightWorked === 1) {
                          س
                        } @else {
                          ·
                        }
                      </button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="daysInMonth().length + 2" class="py-12 text-center space-y-3">
                    <div class="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                      لا يوجد عمال أو نحاتية مسجلون حالياً (الأرقام صفر)
                    </div>
                    <p class="text-xs text-slate-400">
                      أضف العمال أو النحاتية أولاً لتسجيل حضورهم ومطابقته مع العدد اليومي الإجباري.
                    </p>
                    <div>
                      <a
                        routerLink="/workers"
                        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">person_add</mat-icon>
                        <span>تحويل لإضافة العمال والنحاتية</span>
                      </a>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Monthly Cap Confirmation Modal -->
      @if (capConfirmState(); as pending) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="ceramic-card bg-white dark:bg-slate-900 p-6 max-w-md w-full space-y-4">
            <div class="flex items-center gap-3 text-amber-600">
              <mat-icon class="!text-3xl !w-8 !h-8">warning</mat-icon>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">تنبيه تجاوز الحد الشهري</h3>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {{ pending.message }}
            </p>
            <div class="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                (click)="capConfirmState.set(null)"
                class="px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                (click)="confirmCapOverride()"
                class="px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 text-xs font-extrabold"
              >
                نعم، سجل رغم التجاوز
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AttendancePage {
  readonly store = inject(StoreService);

  readonly activeProjectId = signal<number>(1);
  readonly selectedDateForCount = signal<string>(this.store.todayIso());
  readonly inlineWorkersCount = signal<number>(0);
  readonly inlineSculptorsCount = signal<number>(0);
  readonly inlineNightsCount = signal<number>(0);

  readonly capConfirmState = signal<{
    worker: Worker;
    dateStr: string;
    dayWorked: 0 | 1;
    nightWorked: 0 | 1;
    message: string;
  } | null>(null);

  readonly selectedDateHeadcountMatch = computed(() =>
    compareDailyHeadcount({
      date: this.selectedDateForCount(),
      headcounts: this.store.dailyHeadcounts(),
      attendances: this.store.attendances(),
      workers: this.store.workers(),
    })
  );

  readonly daysInMonth = computed(() => {
    const [yearStr, monthStr] = this.store.selectedMonth().split('-');
    const year = Number(yearStr) || 2026;
    const month = Number(monthStr) || 10;
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  readonly dailyMatchMap = computed(() => {
    const month = this.store.selectedMonth();
    const map: Record<number, ReturnType<typeof compareDailyHeadcount>> = {};
    for (const d of this.daysInMonth()) {
      const dateIso = `${month}-${String(d).padStart(2, '0')}`;
      map[d] = compareDailyHeadcount({
        date: dateIso,
        headcounts: this.store.dailyHeadcounts(),
        attendances: this.store.attendances(),
        workers: this.store.workers(),
      });
    }
    return map;
  });

  readonly gridRows = computed(() => {
    const month = this.store.selectedMonth();
    const monthAtt = this.store
      .attendances()
      .filter((a) => a.date.startsWith(month));

    return this.store.activeWorkers().map((worker) => {
      const wAtt = monthAtt.filter((a) => a.workerId === worker.id);
      const cells: Record<number, { dayWorked: 0 | 1; nightWorked: 0 | 1 }> = {};
      let totalDays = 0;
      let totalNights = 0;

      for (const a of wAtt) {
        const dayNum = Number(a.date.slice(8, 10));
        const prev = cells[dayNum] || { dayWorked: 0, nightWorked: 0 };
        cells[dayNum] = {
          dayWorked: (prev.dayWorked || a.dayWorked ? 1 : 0) as 0 | 1,
          nightWorked: (prev.nightWorked || a.nightWorked ? 1 : 0) as 0 | 1,
        };
        if (a.dayWorked) totalDays += 1;
        if (a.nightWorked) totalNights += 1;
      }

      return {
        worker,
        cells,
        totalDays,
        totalNights,
      };
    });
  });

  onCountDateChange(dateIso: string): void {
    this.selectedDateForCount.set(dateIso);
    const existing = this.store.dailyHeadcounts().find((h) => h.date === dateIso);
    if (existing) {
      this.inlineWorkersCount.set(existing.workersCount || 0);
      this.inlineSculptorsCount.set(existing.sculptorsCount || 0);
      this.inlineNightsCount.set(existing.expectedNightCount || 0);
    } else {
      this.inlineWorkersCount.set(0);
      this.inlineSculptorsCount.set(0);
      this.inlineNightsCount.set(0);
    }
  }

  selectDayFromColumn(dayNum: number): void {
    const dateIso = `${this.store.selectedMonth()}-${String(dayNum).padStart(2, '0')}`;
    this.onCountDateChange(dateIso);
  }

  async saveInlineHeadcount(): Promise<void> {
    const wCount = Math.max(0, this.inlineWorkersCount() || 0);
    const sCount = Math.max(0, this.inlineSculptorsCount() || 0);
    const nCount = Math.max(0, this.inlineNightsCount() || 0);
    await this.store.saveDailyHeadcount({
      date: this.selectedDateForCount(),
      projectId: this.activeProjectId(),
      expectedDayCount: wCount + sCount,
      sculptorsCount: sCount,
      workersCount: wCount,
      expectedNightCount: nCount,
      supervisorName: '',
      notes: '',
    });
  }

  async onCellClick(worker: Worker, dayNum: number): Promise<void> {
    if (!worker.id) return;
    const month = this.store.selectedMonth();
    const dateStr = `${month}-${String(dayNum).padStart(2, '0')}`;

    const existing = this.store
      .attendances()
      .find((a) => a.workerId === worker.id && a.date === dateStr);

    let nextDay: 0 | 1 = 1;
    let nextNight: 0 | 1 = 0;

    if (!existing) {
      nextDay = 1;
      nextNight = 0;
    } else if (existing.dayWorked === 1 && existing.nightWorked === 0) {
      nextDay = 1;
      nextNight = 1;
    } else if (existing.dayWorked === 1 && existing.nightWorked === 1) {
      nextDay = 0;
      nextNight = 1;
    } else {
      nextDay = 0;
      nextNight = 0;
    }

    if (nextDay === 1 && (!existing || existing.dayWorked === 0)) {
      const monthAtt = this.store
        .attendances()
        .filter((a) => a.date.startsWith(month));
      const capCheck = checkMonthlyCap(
        monthAtt,
        worker.id,
        1,
        this.store.settings(),
        existing?.id
      );

      if (!capCheck.canProceed) {
        this.store.showToast(capCheck.message || 'تجاوز الحد الشهري المسموح', 'error');
        return;
      }

      if (capCheck.requiresConfirmation) {
        this.capConfirmState.set({
          worker,
          dateStr,
          dayWorked: nextDay,
          nightWorked: nextNight,
          message: capCheck.message || '',
        });
        return;
      }

      if (capCheck.message) {
        this.store.showToast(capCheck.message, 'warning');
      }
    }

    await this.store.recordAttendance({
      date: dateStr,
      workerId: worker.id,
      projectId: existing?.projectId || this.activeProjectId(),
      dayWorked: nextDay,
      nightWorked: nextNight,
      mode: 'replace',
    });
  }

  async confirmCapOverride(): Promise<void> {
    const pending = this.capConfirmState();
    if (!pending || !pending.worker.id) return;
    this.capConfirmState.set(null);

    await this.store.recordAttendance({
      date: pending.dateStr,
      workerId: pending.worker.id,
      projectId: this.activeProjectId(),
      dayWorked: pending.dayWorked,
      nightWorked: pending.nightWorked,
      mode: 'replace',
    });
  }
}
