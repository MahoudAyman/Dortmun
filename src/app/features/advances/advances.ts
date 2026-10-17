import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type { Advance } from '../../core/db/models';

@Component({
  selector: 'app-advances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Record New Advance Form -->
      <form
        [formGroup]="advanceForm"
        (ngSubmit)="saveAdvance()"
        class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">payments</mat-icon>
          <span>تسجيل سلفة جديدة</span>
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label for="adv-worker" class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">العامل *</label>
            <select id="adv-worker" formControlName="workerId" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
              @for (w of store.activeWorkers(); track w.id) {
                <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
              }
            </select>
          </div>

          <div>
            <label for="adv-amount" class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">المبلغ (ج.م) *</label>
            <input id="adv-amount" type="number" min="1" formControlName="amount" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" placeholder="300" />
          </div>

          <div>
            <label for="adv-date" class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">التاريخ *</label>
            <input id="adv-date" type="date" formControlName="date" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="adv-reason" class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">السبب</label>
            <input id="adv-reason" type="text" formControlName="reason" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" placeholder="مصاريف شخصية / أكل" />
          </div>

          <div>
            <label for="adv-notes" class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">ملاحظات حرة</label>
            <input id="adv-notes" type="text" formControlName="notes" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" placeholder="نقداً أو فودافون كاش..." />
          </div>
        </div>

        <div class="flex justify-end">
          <button
            type="submit"
            [disabled]="advanceForm.invalid"
            class="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm disabled:opacity-50"
          >
            <mat-icon class="!text-lg !w-5 !h-5">add_circle</mat-icon>
            <span>تسجيل السلفة</span>
          </button>
        </div>
      </form>

      <!-- Per-Worker Advances Summary & Full Log -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Per-Worker Totals -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">إجمالي السلف لكل عامل والمتبقي</h3>
          <div class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            @for (ws of workerAdvanceSummaries(); track ws.worker.id) {
              <div class="py-3 flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-900 dark:text-white">{{ ws.worker.name }}</div>
                  <div class="text-xs text-slate-500">
                    إجمالي السلف: {{ store.money(ws.totalAllTime) }} · المخصوم: {{ store.money(ws.settled) }}
                  </div>
                </div>
                <div class="text-left">
                  <div class="text-xs text-slate-400">المتبقي</div>
                  <div class="font-extrabold tabular-nums text-rose-600 dark:text-rose-400">{{ store.money(ws.remaining) }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Full Advances Log -->
        <div class="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">سجل السلف الكامل ({{ store.num(store.advances().length) }})</h3>
            <span class="text-xs font-bold text-rose-600 tabular-nums">
              إجمالي السلف المفتوحة: {{ store.money(totalOpenAdvances()) }}
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-right text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="py-3 px-4 font-semibold">التاريخ</th>
                  <th class="py-3 px-3 font-semibold">العامل</th>
                  <th class="py-3 px-3 font-semibold">المبلغ</th>
                  <th class="py-3 px-3 font-semibold">السبب والملاحظات</th>
                  <th class="py-3 px-3 font-semibold">الحالة</th>
                  <th class="py-3 px-4 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (adv of store.advances(); track adv.id) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td class="py-3 px-4 tabular-nums text-xs">{{ store.digits(adv.date) }}</td>
                    <td class="py-3 px-3 font-bold text-slate-900 dark:text-white">{{ store.workerName(adv.workerId) }}</td>
                    <td class="py-3 px-3 font-bold tabular-nums text-rose-600">{{ store.money(adv.amount) }}</td>
                    <td class="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {{ adv.reason }}
                      @if (adv.notes) {
                        <span class="text-slate-400"> · {{ adv.notes }}</span>
                      }
                    </td>
                    <td class="py-3 px-3 text-xs">
                      @if (adv.settlementId) {
                        <span class="text-emerald-600 font-semibold">اتخصمت (تسوية #{{ store.num(adv.settlementId) }})</span>
                      } @else {
                        <span class="text-amber-600 font-semibold">متبقية (مفتوحة)</span>
                      }
                    </td>
                    <td class="py-3 px-4">
                      <button
                        type="button"
                        (click)="confirmDelete(adv)"
                        class="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                        [attr.aria-label]="'حذف سلفة ' + store.workerName(adv.workerId)"
                      >
                        <mat-icon class="!text-base !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      @if (advanceToDelete(); as target) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 class="text-base font-bold">تأكيد حذف السلفة</h3>
            <p class="text-sm text-slate-600 dark:text-slate-300">
              هل تريد حذف سلفة <strong>{{ store.workerName(target.workerId) }}</strong> بمبلغ <strong>{{ store.money(target.amount) }}</strong>؟
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" (click)="advanceToDelete.set(null)" class="px-4 py-2 rounded-xl border border-slate-200 text-sm">إلغاء</button>
              <button type="button" (click)="executeDelete()" class="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-sm">حذف</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdvancesPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly advanceToDelete = signal<Advance | null>(null);

  readonly advanceForm = this.fb.nonNullable.group({
    workerId: [1, Validators.required],
    amount: [250, [Validators.required, Validators.min(1)]],
    date: [this.store.todayIso(), Validators.required],
    reason: ['مصاريف شخصية'],
    notes: [''],
  });

  readonly totalOpenAdvances = computed(() =>
    this.store
      .advances()
      .filter((a) => a.settlementId === null)
      .reduce((s, a) => s + a.amount, 0)
  );

  readonly workerAdvanceSummaries = computed(() => {
    const advances = this.store.advances();
    return this.store.workers().map((worker) => {
      const wAdv = advances.filter((a) => a.workerId === worker.id);
      const totalAllTime = wAdv.reduce((s, a) => s + a.amount, 0);
      const remaining = wAdv
        .filter((a) => a.settlementId === null)
        .reduce((s, a) => s + a.amount, 0);
      return {
        worker,
        totalAllTime,
        settled: totalAllTime - remaining,
        remaining,
      };
    });
  });

  async saveAdvance(): Promise<void> {
    if (this.advanceForm.invalid) return;
    const val = this.advanceForm.getRawValue();
    await this.store.addAdvance({
      workerId: Number(val.workerId),
      amount: Number(val.amount),
      date: val.date,
      reason: val.reason || 'سلفة نقدية',
      settlementId: null,
      notes: val.notes,
    });
    this.store.showToast('تم تسجيل السلفة بنجاح', 'success');
    this.advanceForm.patchValue({ amount: 200, notes: '' });
  }

  confirmDelete(adv: Advance): void {
    this.advanceToDelete.set(adv);
  }

  async executeDelete(): Promise<void> {
    const t = this.advanceToDelete();
    if (t?.id) {
      await this.store.deleteAdvance(t.id);
    }
    this.advanceToDelete.set(null);
  }
}
