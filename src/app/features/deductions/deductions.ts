import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { calculateDeductionAmount } from '../../core/calc/calculations';
import type { DeductionMode } from '../../core/db/models';

@Component({
  selector: 'app-deductions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Ceramic Header Banner -->
      <div class="ceramic-card p-5 lg:p-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <mat-icon class="!text-2xl !w-6 !h-6">gavel</mat-icon>
          </div>
          <div>
            <h1 class="text-lg font-extrabold text-slate-900 dark:text-white">
              الخصومات والجزاءات (يوم · نص يوم · ربع يوم · فلوس)
            </h1>
            <p class="text-xs text-slate-500 mt-0.5">
              سجّل خصومات العمال والنحاتية مع سبب الخصم، وتُخصم تلقائياً عند صرف قبض يوم ١٥
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <a
            routerLink="/settlements"
            class="px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
          >
            <mat-icon class="!text-base !w-4 !h-4">event_repeat</mat-icon>
            <span>تحويل لكشف قبض يوم ١٥</span>
          </a>
        </div>
      </div>

      <!-- KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="ceramic-card p-5">
          <div class="text-xs font-semibold text-slate-500">إجمالي الخصومات المسجلة</div>
          <div class="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {{ store.money(totalAllDeductions()) }}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">
            {{ store.num(store.deductions().length) }} حركة خصم مسجلة
          </p>
        </div>

        <div class="ceramic-card p-5 border-rose-200/80 dark:border-rose-900/50">
          <div class="text-xs font-semibold text-rose-600 dark:text-rose-400">
            الخصومات المفتوحة (تُخصم في قبض يوم ١٥)
          </div>
          <div class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 tabular-nums">
            {{ store.money(store.totalOpenDeductions()) }}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">
            إجمالي أيام الخصم المفتوحة: {{ store.num(totalOpenDeductionDays(), 2) }} يومية
          </p>
        </div>

        <div class="ceramic-card p-5 border-emerald-200/80 dark:border-emerald-900/50">
          <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            الخصومات التي تم خصمها في التسويات
          </div>
          <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {{ store.money(totalSettledDeductions()) }}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">مقفولة ومخصومة رسمياً</p>
        </div>
      </div>

      <!-- Add New Deduction Form -->
      <form
        [formGroup]="deductionForm"
        (ngSubmit)="submitDeduction()"
        class="ceramic-card p-6 space-y-5"
      >
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <mat-icon class="text-rose-500 !text-lg !w-5 !h-5">remove_circle</mat-icon>
            <span>تسجيل خصم أو جزاء جديد</span>
          </h2>
          @if (previewAmount() > 0) {
            <span class="px-3 py-1 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-xs font-extrabold tabular-nums">
              قيمة الخصم المحسوبة: {{ store.money(previewAmount()) }}
            </span>
          }
        </div>

        @if (store.activeWorkers().length === 0) {
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
            <div class="text-xs text-amber-900 dark:text-amber-200 font-bold">
              لا يوجد عمال أو نحاتية مسجلون حالياً. أضف العمال أولاً لتسجيل الخصومات عليهم.
            </div>
            <a
              routerLink="/workers"
              class="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs shrink-0 inline-flex items-center gap-1"
            >
              <mat-icon class="!text-sm !w-4 !h-4">person_add</mat-icon>
              <span>تحويل لإضافة العمال</span>
            </a>
          </div>
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label for="ded-worker" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              العامل / النحّات *
            </label>
            <select
              id="ded-worker"
              formControlName="workerId"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            >
              <option [ngValue]="null">اختر العامل...</option>
              @for (w of store.activeWorkers(); track w.id) {
                <option [ngValue]="w.id">{{ w.name }} ({{ w.role }} - {{ store.money(w.workerDayRate) }})</option>
              }
            </select>
          </div>

          <div>
            <label for="ded-mode" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              نوع الخصم *
            </label>
            <select
              id="ded-mode"
              formControlName="mode"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            >
              <option value="half_day">خصم نص يوم (٠.٥ يومية)</option>
              <option value="day">خصم يوم كامل (١ يومية)</option>
              <option value="quarter_day">خصم ربع يوم (٠.٢٥ يومية)</option>
              <option value="money">خصم مبلغ مالي محدد (فلوس)</option>
            </select>
          </div>

          @if (deductionForm.controls.mode.value === 'money') {
            <div>
              <label for="ded-money" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                مبلغ الخصم (ج.م) *
              </label>
              <input
                id="ded-money"
                type="number"
                formControlName="customMoney"
                placeholder="مثلاً: 200"
                class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums"
              />
            </div>
          } @else {
            <div>
              <span class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                القيمة التلقائية من يومية العامل
              </span>
              <div class="w-full px-3 py-2.5 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                {{ store.money(previewAmount()) }}
              </div>
            </div>
          }

          <div>
            <label for="ded-reason" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              سبب الخصم *
            </label>
            <select
              id="ded-reason"
              formControlName="reasonPreset"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="تأخير عن مواعيد العمل">تأخير عن مواعيد العمل</option>
              <option value="غياب بدون إذن مسبق">غياب بدون إذن مسبق</option>
              <option value="إتلاف عدة أو خامات بالموقع">إتلاف عدة أو خامات بالموقع</option>
              <option value="ملاحظات على جودة الشغل / النحت">ملاحظات على جودة الشغل / النحت</option>
              <option value="انصراف مبكر قبل انتهاء اليومية">انصراف مبكر قبل انتهاء اليومية</option>
              <option value="خصم إداري آخر">خصم إداري آخر</option>
            </select>
          </div>

          <div>
            <label for="ded-date" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              التاريخ
            </label>
            <input
              id="ded-date"
              type="date"
              formControlName="date"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="ded-notes" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              ملاحظات السبب التفصيلية
            </label>
            <input
              id="ded-notes"
              type="text"
              formControlName="notes"
              placeholder="تفاصيل إضافية للسبب..."
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <div class="flex justify-end">
          <button
            type="submit"
            [disabled]="!deductionForm.value.workerId || previewAmount() <= 0"
            class="px-6 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center gap-2 disabled:opacity-40 shadow-sm transition-all"
          >
            <mat-icon class="!text-base !w-4 !h-4">gavel</mat-icon>
            <span>حفظ الخصم وتطبيقه</span>
          </button>
        </div>
      </form>

      <!-- Per-Worker Deductions Summary & Log -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-4 ceramic-card p-5 space-y-3">
          <h3 class="text-sm font-extrabold text-slate-900 dark:text-white">
            ملخص الخصومات لكل عامل / نحّات
          </h3>

          <div class="space-y-2.5">
            @for (row of workerDeductionSummaries(); track row.worker.id) {
              <div class="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
                <div>
                  <div class="font-bold text-sm text-slate-900 dark:text-white">
                    {{ row.worker.name }}
                    <span class="text-[11px] text-slate-400 font-normal">({{ row.worker.role }})</span>
                  </div>
                  <div class="text-[11px] text-slate-500 mt-0.5">
                    إجمالي الأيام المخصومة: {{ store.num(row.openDays, 2) }} يوم
                  </div>
                </div>
                <div class="text-left">
                  <div
                    class="text-sm font-extrabold tabular-nums"
                    [class.text-rose-600]="row.openAmount > 0"
                    [class.text-emerald-600]="row.openAmount === 0"
                  >
                    {{ store.money(row.openAmount) }}
                  </div>
                  <div class="text-[10px] text-slate-400">قيد الخصم</div>
                </div>
              </div>
            } @empty {
              <p class="text-xs text-slate-400 text-center py-6">
                لا يوجد عمال مسجلون بعد.
              </p>
            }
          </div>
        </div>

        <div class="lg:col-span-8 ceramic-card overflow-hidden">
          <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 class="text-sm font-extrabold text-slate-900 dark:text-white">
              سجل حركات الخصومات والجزاءات الكامل
            </h3>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="py-3 px-4 font-bold">التاريخ</th>
                  <th class="py-3 px-4 font-bold">العامل / النحّات</th>
                  <th class="py-3 px-4 font-bold">نوع الخصم</th>
                  <th class="py-3 px-4 font-bold">قيمة الخصم</th>
                  <th class="py-3 px-4 font-bold">السبب والملاحظات</th>
                  <th class="py-3 px-4 font-bold">الحالة</th>
                  <th class="py-3 px-4 font-bold"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (ded of store.deductions(); track ded.id) {
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td class="py-3 px-4 tabular-nums">{{ store.digits(ded.date) }}</td>
                    <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {{ store.workerName(ded.workerId) }}
                    </td>
                    <td class="py-3 px-4">
                      <span class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                        {{
                          ded.mode === 'day'
                            ? 'يوم كامل (١ يوم)'
                            : ded.mode === 'half_day'
                              ? 'نص يوم (٠.٥ يوم)'
                              : ded.mode === 'quarter_day'
                                ? 'ربع يوم (٠.٢٥ يوم)'
                                : 'مبلغ مالي (فلوس)'
                        }}
                      </span>
                    </td>
                    <td class="py-3 px-4 tabular-nums font-extrabold text-rose-600 dark:text-rose-400">
                      {{ store.money(ded.amount) }}
                    </td>
                    <td class="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div class="font-bold">{{ ded.reason }}</div>
                      @if (ded.notes) {
                        <div class="text-[11px] text-slate-400">{{ ded.notes }}</div>
                      }
                    </td>
                    <td class="py-3 px-4">
                      @if (ded.settlementId) {
                        <span class="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          اتخصمت في تسوية #{{ store.num(ded.settlementId) }}
                        </span>
                      } @else {
                        <span class="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          مفتوحة (تُخصم يوم ١٥)
                        </span>
                      }
                    </td>
                    <td class="py-3 px-4">
                      <button
                        type="button"
                        (click)="store.deleteDeduction(ded.id!)"
                        class="text-rose-500 hover:text-rose-700 p-1"
                        title="حذف الخصم"
                      >
                        <mat-icon class="!text-base !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="py-10 text-center text-slate-400">
                      لا توجد خصومات مسجلة حالياً — كل الأرقام صفر وجاهزة لتسجيلك الفعلي.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DeductionsPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly formSignalTick = signal<number>(0);

  readonly deductionForm = this.fb.group({
    workerId: [null as number | null, Validators.required],
    mode: ['half_day' as DeductionMode, Validators.required],
    customMoney: [100],
    reasonPreset: ['تأخير عن مواعيد العمل', Validators.required],
    date: [this.store.todayIso(), Validators.required],
    notes: [''],
  });

  constructor() {
    this.deductionForm.valueChanges.subscribe(() => {
      this.formSignalTick.update((x) => x + 1);
    });
  }

  readonly previewAmount = computed(() => {
    this.formSignalTick();
    const val = this.deductionForm.getRawValue();
    const w = this.store.workers().find((x) => x.id === val.workerId);
    if (!w) return 0;
    const mode = (val.mode || 'half_day') as DeductionMode;
    return calculateDeductionAmount(mode, w.workerDayRate, Number(val.customMoney) || 0).amount;
  });

  readonly totalAllDeductions = computed(() =>
    this.store.deductions().reduce((s, d) => s + d.amount, 0)
  );

  readonly totalOpenDeductionDays = computed(() =>
    this.store
      .deductions()
      .filter((d) => d.settlementId === null)
      .reduce((s, d) => s + (d.daysDeducted || 0), 0)
  );

  readonly totalSettledDeductions = computed(() =>
    this.store
      .deductions()
      .filter((d) => d.settlementId !== null)
      .reduce((s, d) => s + d.amount, 0)
  );

  readonly workerDeductionSummaries = computed(() => {
    return this.store.workers().map((w) => {
      const openList = this.store
        .deductions()
        .filter((d) => d.workerId === w.id && d.settlementId === null);
      const openAmount = openList.reduce((s, d) => s + d.amount, 0);
      const openDays = openList.reduce((s, d) => s + (d.daysDeducted || 0), 0);
      return { worker: w, openAmount, openDays };
    });
  });

  async submitDeduction(): Promise<void> {
    const val = this.deductionForm.getRawValue();
    if (!val.workerId) return;
    const worker = this.store.workers().find((w) => w.id === val.workerId);
    if (!worker) return;

    const mode = (val.mode || 'half_day') as DeductionMode;
    const calc = calculateDeductionAmount(mode, worker.workerDayRate, Number(val.customMoney) || 0);

    await this.store.addDeduction({
      date: val.date || this.store.todayIso(),
      workerId: val.workerId,
      projectId: this.store.selectedProjectId(),
      mode,
      daysDeducted: calc.daysDeducted,
      amount: calc.amount,
      reason: val.reasonPreset || 'خصم إداري',
      notes: val.notes || '',
      settlementId: null,
    });

    this.deductionForm.patchValue({ notes: '' });
  }
}
