import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import {
  calculateDeductionAmount,
  checkMonthlyCap,
  compareDailyHeadcount,
  findDuplicateAttendance,
} from '../../core/calc/calculations';
import type { DeductionMode } from '../../core/db/models';

interface BulkRowState {
  selected: boolean;
  dayWorked: 0 | 1;
  nightWorked: 0 | 1;
  advanceAmount: number;
  deductionMode: 'none' | DeductionMode;
  deductionMoney: number;
  deductionReason: string;
  note: string;
}

@Component({
  selector: 'app-bulk',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-5 pb-24">
      <!-- Mandatory Daily Headcount Gate & Live Matching Bar ("العدد كل يوم إجباري وبناءً عليه بسجل اليوميات والسهرات مع هل نفس العدد أم لا") -->
      @let hc = targetDateHeadcountMatch();
      <div
        class="ceramic-card p-5 space-y-4 border-2"
        [class.border-rose-300]="!hc.hasMandatoryRecord"
        [class.dark:border-rose-800]="!hc.hasMandatoryRecord"
        [class.border-amber-300]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
        [class.dark:border-amber-800]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
        [class.border-emerald-300]="hc.hasMandatoryRecord && projectedMatchesMandatory()"
        [class.dark:border-emerald-800]="hc.hasMandatoryRecord && projectedMatchesMandatory()"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div
              class="w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold shrink-0"
              [class.bg-rose-600]="!hc.hasMandatoryRecord"
              [class.text-white]="!hc.hasMandatoryRecord || (hc.hasMandatoryRecord && projectedMatchesMandatory())"
              [class.bg-amber-500]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
              [class.text-slate-950]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
              [class.bg-emerald-600]="hc.hasMandatoryRecord && projectedMatchesMandatory()"
            >
              <mat-icon>fact_check</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-base font-extrabold text-slate-900 dark:text-white">
                  العدد اليومي الإجباري ليوم ({{ store.digits(targetDate()) }}) — هل نفس العدد أم لا؟
                </h1>
                <span
                  class="px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold"
                  [class.bg-rose-100]="!hc.hasMandatoryRecord"
                  [class.text-rose-700]="!hc.hasMandatoryRecord"
                  [class.bg-amber-100]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
                  [class.text-amber-800]="hc.hasMandatoryRecord && !projectedMatchesMandatory()"
                  [class.bg-emerald-100]="hc.hasMandatoryRecord && projectedMatchesMandatory()"
                  [class.text-emerald-800]="hc.hasMandatoryRecord && projectedMatchesMandatory()"
                >
                  {{
                    !hc.hasMandatoryRecord
                      ? 'إجباري: سجّل العدد اليومي أولاً'
                      : projectedMatchesMandatory()
                        ? 'نعم، نفس العدد تماماً (مطابق ١٠٠٪) ✓'
                        : 'لا، العدد غير مطابق (يوجد فرق) !'
                  }}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                @if (!hc.hasMandatoryRecord) {
                  أدخل عدد العمالة والنحاتية وعدد السهرة الإجباري بالأسفل قبل حفظ اليوميات.
                } @else {
                  العدد الإجباري: <strong>{{ store.num(hc.expectedDays) }} يومية</strong> و <strong>{{ store.num(hc.expectedNights) }} سهرة</strong> · المختار للحفظ الآن: <strong>{{ store.num(selectedSummary().days) }} يومية</strong> و <strong>{{ store.num(selectedSummary().nights) }} سهرة</strong>
                }
              </p>
            </div>
          </div>

          <button
            type="button"
            (click)="store.showQuickHeadcountModal.set(true)"
            class="px-4 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5"
          >
            <mat-icon class="!text-sm !w-4 !h-4">edit_calendar</mat-icon>
            <span>{{ hc.hasMandatoryRecord ? 'تعديل العدد الإجباري' : 'تسجيل العدد الإجباري السريع' }}</span>
          </button>
        </div>
      </div>

      <!-- Top Controls: Date, Project, Role Filter (الكل / نحات / نجار / عامل...) -->
      <div class="ceramic-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <label for="bulk-date" class="block text-xs font-bold text-slate-500 mb-1">تاريخ التسجيل</label>
            <input
              id="bulk-date"
              type="date"
              [value]="targetDate()"
              (change)="targetDate.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold tabular-nums"
            />
          </div>

          <div>
            <label for="bulk-project" class="block text-xs font-bold text-slate-500 mb-1">المشروع</label>
            <select
              id="bulk-project"
              [value]="targetProjectId()"
              (change)="targetProjectId.set(+$any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold"
            >
              @if (store.projects().length === 0) {
                <option [value]="1">المشروع الرئيسي (افتراضي)</option>
              }
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="bulk-role" class="block text-xs font-bold text-slate-500 mb-1">فلترة حسب المهنة (العمال / النحاتية)</label>
            <select
              id="bulk-role"
              [value]="roleFilter()"
              (change)="roleFilter.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 text-sm font-bold"
            >
              <option value="all">كل المهن ({{ store.num(store.activeWorkers().length) }})</option>
              @for (role of availableRoles(); track role) {
                <option [value]="role">{{ role }}</option>
              }
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            (click)="selectAllVisible(true)"
            class="px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-extrabold"
          >
            تحديد الكل ({{ store.num(visibleWorkers().length) }})
          </button>
          <button
            type="button"
            (click)="selectAllVisible(false)"
            class="px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
          >
            إلغاء التحديد
          </button>
        </div>
      </div>

      <!-- Workers Bulk List with Day, Night, Advance, and Deduction controls -->
      <div class="space-y-3">
        @for (worker of visibleWorkers(); track worker.id) {
          @let st = getRowState(worker.id!);
          <div
            class="ceramic-card p-4 transition-all border-2"
            [class.border-amber-500]="st.selected"
            [class.border-transparent]="!st.selected"
          >
            <div class="flex flex-wrap items-center justify-between gap-4">
              <!-- Checkbox & Worker Identity -->
              <label class="flex items-center gap-3 cursor-pointer min-w-[180px]">
                <input
                  type="checkbox"
                  [checked]="st.selected"
                  (change)="toggleWorkerSelection(worker.id!, $any($event.target).checked)"
                  class="w-5 h-5 rounded accent-amber-500"
                />
                <div>
                  <div class="font-extrabold text-base text-slate-900 dark:text-white">{{ worker.name }}</div>
                  <div class="text-xs text-slate-500">
                    <span class="font-bold text-amber-600 dark:text-amber-400">{{ worker.role }}</span>
                    · يومية: {{ store.money(worker.workerDayRate) }} · سهرة: {{ store.money(worker.workerNightRate) }}
                  </div>
                </div>
              </label>

              <!-- Quick Action Toggles (Day, Night, Advance, Deduction, Note) -->
              <div class="flex flex-wrap items-center gap-2 flex-1 justify-end">
                <button
                  type="button"
                  (click)="toggleDay(worker.id!)"
                  class="min-h-[42px] px-3.5 py-2 rounded-2xl font-extrabold text-xs inline-flex items-center gap-1.5 transition-all"
                  [class.bg-emerald-600]="st.dayWorked === 1"
                  [class.text-white]="st.dayWorked === 1"
                  [class.bg-slate-100]="st.dayWorked === 0"
                  [class.dark:bg-slate-800]="st.dayWorked === 0"
                >
                  <mat-icon class="!text-base !w-4 !h-4">wb_sunny</mat-icon>
                  <span>يومية</span>
                </button>

                <button
                  type="button"
                  (click)="toggleNight(worker.id!)"
                  class="min-h-[42px] px-3.5 py-2 rounded-2xl font-extrabold text-xs inline-flex items-center gap-1.5 transition-all"
                  [class.bg-indigo-600]="st.nightWorked === 1"
                  [class.text-white]="st.nightWorked === 1"
                  [class.bg-slate-100]="st.nightWorked === 0"
                  [class.dark:bg-slate-800]="st.nightWorked === 0"
                >
                  <mat-icon class="!text-base !w-4 !h-4">nights_stay</mat-icon>
                  <span>سهرة</span>
                </button>

                <div class="w-24">
                  <input
                    type="number"
                    min="0"
                    [value]="st.advanceAmount || ''"
                    (input)="updateField(worker.id!, { advanceAmount: +$any($event.target).value, selected: true })"
                    placeholder="سلفة (ج.م)"
                    [attr.aria-label]="'سلفة ' + worker.name"
                    class="w-full min-h-[42px] px-2.5 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold tabular-nums"
                  />
                </div>

                <!-- Quick Deduction Selector (خصم يوم / نص يوم / فلوس) -->
                <div class="flex items-center gap-1">
                  <select
                    [value]="st.deductionMode"
                    (change)="updateField(worker.id!, { deductionMode: $any($event.target).value, selected: true })"
                    [attr.aria-label]="'خصم ' + worker.name"
                    class="min-h-[42px] px-2.5 py-1.5 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-slate-800 text-xs font-bold text-rose-700 dark:text-rose-300"
                  >
                    <option value="none">بدون خصم</option>
                    <option value="half_day">خصم نص يوم</option>
                    <option value="day">خصم يوم كامل</option>
                    <option value="quarter_day">خصم ربع يوم</option>
                    <option value="money">خصم فلوس</option>
                  </select>

                  @if (st.deductionMode === 'money') {
                    <input
                      type="number"
                      min="0"
                      [value]="st.deductionMoney || ''"
                      (input)="updateField(worker.id!, { deductionMoney: +$any($event.target).value })"
                      placeholder="مبلغ الخصم"
                      class="w-20 min-h-[42px] px-2 py-1.5 rounded-2xl border border-rose-300 bg-white dark:bg-slate-800 text-xs font-bold tabular-nums"
                    />
                  }
                </div>

                <div class="w-40 sm:w-44">
                  <input
                    type="text"
                    [value]="st.note"
                    (input)="updateField(worker.id!, { note: $any($event.target).value, selected: true })"
                    [placeholder]="st.deductionMode !== 'none' ? 'سبب الخصم / ملاحظة...' : 'ملاحظة اليوم...'"
                    [attr.aria-label]="'ملاحظة ' + worker.name"
                    class="w-full min-h-[42px] px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        } @empty {
          <div class="ceramic-card p-10 text-center space-y-3">
            <div class="text-sm font-extrabold text-slate-800 dark:text-white">
              لا يوجد عمال أو نحاتية مسجلون حالياً
            </div>
            <p class="text-xs text-slate-500">
              أضف العمال أو النحاتية أولاً لتسجيل اليوميات والسهرات والخصومات دفعة واحدة.
            </p>
            <a
              routerLink="/workers"
              class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs"
            >
              <mat-icon class="!text-base !w-4 !h-4">person_add</mat-icon>
              <span>تحويل لإضافة العمال والنحاتية</span>
            </a>
          </div>
        }
      </div>

      <!-- Sticky Save All Bar with Live Headcount Match Indicator -->
      <div class="fixed bottom-15 lg:bottom-4 left-4 right-4 lg:right-72 z-20 max-w-5xl mx-auto ceramic-hero text-white p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
          <span>المحددون: <strong class="text-amber-400">{{ store.num(selectedSummary().count) }}</strong></span>
          <span>يوميات: <strong class="text-emerald-400">{{ store.num(selectedSummary().days) }}</strong></span>
          <span>سهرات: <strong class="text-indigo-400">{{ store.num(selectedSummary().nights) }}</strong></span>
          @if (hc.hasMandatoryRecord) {
            <span
              class="px-2.5 py-1 rounded-xl text-xs font-extrabold"
              [class.bg-emerald-500/20]="projectedMatchesMandatory()"
              [class.text-emerald-300]="projectedMatchesMandatory()"
              [class.bg-amber-500/20]="!projectedMatchesMandatory()"
              [class.text-amber-300]="!projectedMatchesMandatory()"
            >
              {{ projectedMatchesMandatory() ? 'نفس العدد الإجباري ✓' : 'مختلف عن العدد الإجباري (' + store.num(hc.expectedDays) + ' ي · ' + store.num(hc.expectedNights) + ' س)' }}
            </span>
          }
        </div>

        <button
          type="button"
          [disabled]="selectedSummary().count === 0"
          (click)="initiateBatchSave()"
          class="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 transition-colors"
        >
          <mat-icon>done_all</mat-icon>
          <span>حفظ الكل دفعة واحدة</span>
        </button>
      </div>

      <!-- Duplicate Attendance Modal (Replace or Merge) -->
      @if (duplicateModalOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="ceramic-card bg-white dark:bg-slate-900 p-6 max-w-md w-full space-y-4">
            <div class="flex items-center gap-2 text-amber-600">
              <mat-icon class="!text-2xl">find_replace</mat-icon>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">تنبيه تكرار حضور لنفس اليوم</h3>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              يوجد {{ store.num(duplicateWorkersNames().length) }} عمال مسجل لهم حضور مسبق في تاريخ {{ store.digits(targetDate()) }}:
              <strong>{{ duplicateWorkersNames().join('، ') }}</strong>.
              هل تريد استبدال التسجيل القديم أم دمج اليومية والسهرة معاً؟
            </p>
            <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                (click)="duplicateModalOpen.set(false)"
                class="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                (click)="executeBatchSave('merge')"
                class="px-4 py-2 rounded-2xl bg-indigo-600 text-white text-xs font-extrabold"
              >
                دمج مع القديم
              </button>
              <button
                type="button"
                (click)="executeBatchSave('replace')"
                class="px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 text-xs font-extrabold"
              >
                استبدال القديم
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class BulkEntryPage {
  readonly store = inject(StoreService);

  readonly targetDate = signal<string>(this.store.todayIso());
  readonly targetProjectId = signal<number>(1);
  readonly roleFilter = signal<string>('all');

  readonly rowStates = signal<Record<number, BulkRowState>>({});
  readonly duplicateModalOpen = signal<boolean>(false);
  readonly duplicateWorkersNames = signal<string[]>([]);

  readonly targetDateHeadcountMatch = computed(() =>
    compareDailyHeadcount({
      date: this.targetDate(),
      headcounts: this.store.dailyHeadcounts(),
      attendances: this.store.attendances(),
      workers: this.store.workers(),
    })
  );

  readonly projectedMatchesMandatory = computed(() => {
    const hc = this.targetDateHeadcountMatch();
    if (!hc.hasMandatoryRecord) return false;
    const sel = this.selectedSummary();
    return (
      sel.days === hc.expectedDays && sel.nights === hc.expectedNights
    );
  });

  readonly availableRoles = computed(() => {
    const roles = new Set(this.store.activeWorkers().map((w) => w.role));
    return Array.from(roles);
  });

  readonly visibleWorkers = computed(() => {
    const role = this.roleFilter();
    return this.store
      .activeWorkers()
      .filter((w) => role === 'all' || w.role === role);
  });

  readonly selectedSummary = computed(() => {
    const states = this.rowStates();
    let count = 0;
    let days = 0;
    let nights = 0;
    let advances = 0;

    for (const w of this.store.activeWorkers()) {
      const st = states[w.id!];
      if (st?.selected) {
        count += 1;
        days += st.dayWorked;
        nights += st.nightWorked;
        advances += st.advanceAmount || 0;
      }
    }
    return { count, days, nights, advances };
  });

  getRowState(workerId: number): BulkRowState {
    return (
      this.rowStates()[workerId] || {
        selected: false,
        dayWorked: 1,
        nightWorked: 0,
        advanceAmount: 0,
        deductionMode: 'none',
        deductionMoney: 100,
        deductionReason: '',
        note: '',
      }
    );
  }

  updateField(workerId: number, partial: Partial<BulkRowState>): void {
    const current = this.getRowState(workerId);
    this.rowStates.update((map) => ({
      ...map,
      [workerId]: { ...current, ...partial },
    }));
  }

  toggleWorkerSelection(workerId: number, checked: boolean): void {
    this.updateField(workerId, { selected: checked });
  }

  toggleDay(workerId: number): void {
    const cur = this.getRowState(workerId);
    const nextDay: 0 | 1 = cur.dayWorked === 1 ? 0 : 1;
    this.updateField(workerId, { dayWorked: nextDay, selected: true });
  }

  toggleNight(workerId: number): void {
    const cur = this.getRowState(workerId);
    const nextNight: 0 | 1 = cur.nightWorked === 1 ? 0 : 1;
    this.updateField(workerId, { nightWorked: nextNight, selected: true });
  }

  selectAllVisible(select: boolean): void {
    const nextMap = { ...this.rowStates() };
    for (const w of this.visibleWorkers()) {
      if (!w.id) continue;
      const cur = this.getRowState(w.id);
      nextMap[w.id] = {
        ...cur,
        selected: select,
        dayWorked: select ? 1 : cur.dayWorked,
      };
    }
    this.rowStates.set(nextMap);
  }

  initiateBatchSave(): void {
    const date = this.targetDate();
    const projectId = this.targetProjectId();
    const states = this.rowStates();
    const dupNames: string[] = [];

    for (const w of this.store.activeWorkers()) {
      if (!w.id) continue;
      const st = states[w.id];
      if (!st?.selected) continue;
      if (st.dayWorked === 0 && st.nightWorked === 0) continue;

      const dup = findDuplicateAttendance(
        this.store.attendances(),
        w.id,
        date,
        projectId
      );
      if (dup) {
        dupNames.push(w.name);
      }
    }

    if (dupNames.length > 0) {
      this.duplicateWorkersNames.set(dupNames);
      this.duplicateModalOpen.set(true);
      return;
    }

    void this.executeBatchSave('replace');
  }

  async executeBatchSave(mode: 'replace' | 'merge'): Promise<void> {
    this.duplicateModalOpen.set(false);
    const date = this.targetDate();
    const month = date.slice(0, 7);
    const projectId = this.targetProjectId();
    const states = this.rowStates();

    let savedAttCount = 0;
    let savedAdvCount = 0;
    let savedDedCount = 0;

    for (const w of this.store.activeWorkers()) {
      if (!w.id) continue;
      const st = states[w.id];
      if (!st?.selected) continue;

      if (st.dayWorked === 1 || st.nightWorked === 1) {
        const monthAtt = this.store
          .attendances()
          .filter((a) => a.date.startsWith(month));
        const capCheck = checkMonthlyCap(
          monthAtt,
          w.id,
          st.dayWorked,
          this.store.settings()
        );

        if (!capCheck.canProceed) {
          this.store.showToast(
            `${w.name}: وصل الحد الشهري المسموح (${this.store.settings().monthlyDayCap} يوم)`,
            'error'
          );
          continue;
        }

        await this.store.recordAttendance({
          date,
          workerId: w.id,
          projectId,
          dayWorked: st.dayWorked,
          nightWorked: st.nightWorked,
          note: st.note,
          mode,
        });
        savedAttCount++;
      }

      if (st.advanceAmount > 0) {
        await this.store.addAdvance({
          date,
          workerId: w.id,
          amount: st.advanceAmount,
          reason: st.note || 'سلفة من الإضافة الجماعية',
          settlementId: null,
          notes: st.note,
        });
        savedAdvCount++;
      }

      if (st.deductionMode && st.deductionMode !== 'none') {
        const calc = calculateDeductionAmount(
          st.deductionMode,
          w.workerDayRate,
          st.deductionMoney || 0
        );
        if (calc.amount > 0) {
          await this.store.addDeduction({
            date,
            workerId: w.id,
            projectId,
            mode: st.deductionMode,
            daysDeducted: calc.daysDeducted,
            amount: calc.amount,
            reason: st.note || 'خصم من الإضافة الجماعية',
            notes: st.note,
            settlementId: null,
          });
          savedDedCount++;
        }
      }
    }

    await this.store.logAudit(
      'إضافة جماعية',
      'الحضور والسلف والخصومات',
      `تم تسجيل حضور لـ ${savedAttCount} عمال، و ${savedAdvCount} سلف، و ${savedDedCount} خصومات بتاريخ ${date}`
    );

    this.store.showToast(
      `تم حفظ ${savedAttCount} حضور، ${savedAdvCount} سلف، و ${savedDedCount} خصومات بنجاح`,
      'success'
    );
    this.rowStates.set({});
  }
}
