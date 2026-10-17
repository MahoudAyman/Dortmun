import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type { CheckDirection, CheckItem, CheckStatus } from '../../core/db/models';

@Component({
  selector: 'app-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- 3-Day Due Date Alert Banner -->
      @if (store.dueChecksAlerts().length > 0) {
        <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 text-sm">
            <mat-icon>notifications_active</mat-icon>
            <span>تنبيه استحقاق الشيكات (خلال 3 أيام أو أقل)</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            @for (al of store.dueChecksAlerts(); track al.check.id) {
              <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/50 flex items-center justify-between text-xs">
                <div>
                  <span class="font-bold">شيك {{ al.check.direction }} #{{ al.check.number }} ({{ al.check.bank }})</span>
                  <div class="text-slate-500 mt-0.5">
                    تاريخ الاستحقاق: {{ store.digits(al.check.dueDate) }} (باقي {{ store.num(al.daysRemaining) }} يوم)
                  </div>
                </div>
                <span class="font-extrabold text-rose-600 tabular-nums">{{ store.money(al.check.amount) }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Add Check Form -->
      <form
        [formGroup]="checkForm"
        (ngSubmit)="saveCheck()"
        class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">account_balance</mat-icon>
          <span>تسجيل شيك جديد (وارد / صادر)</span>
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label for="chk-dir" class="block text-xs font-medium mb-1">اتجاه الشيك *</label>
            <select id="chk-dir" formControlName="direction" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              <option value="وارد">وارد (من الشركة)</option>
              <option value="صادر">صادر (لمورد / مقاول باطن)</option>
            </select>
          </div>

          <div>
            <label for="chk-num" class="block text-xs font-medium mb-1">رقم الشيك *</label>
            <input id="chk-num" type="text" formControlName="number" placeholder="CHK-90210" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="chk-bank" class="block text-xs font-medium mb-1">البنك *</label>
            <input id="chk-bank" type="text" formControlName="bank" placeholder="البنك الأهلي المصري" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
          </div>

          <div>
            <label for="chk-amt" class="block text-xs font-medium mb-1">المبلغ (ج.م) *</label>
            <input id="chk-amt" type="number" min="1" formControlName="amount" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label for="chk-due" class="block text-xs font-medium mb-1">تاريخ الاستحقاق *</label>
            <input id="chk-due" type="date" formControlName="dueDate" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="chk-status" class="block text-xs font-medium mb-1">الحالة *</label>
            <select id="chk-status" formControlName="status" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
              <option value="معلق">معلق</option>
              <option value="اتصرف">اتصرف</option>
              <option value="مرتجع">مرتجع</option>
            </select>
          </div>

          <div>
            <label for="chk-ext" class="block text-xs font-medium mb-1">ربط بمستخلص</label>
            <select id="chk-ext" formControlName="extractId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
              <option [ngValue]="null">بدون ربط بمستخلص</option>
              @for (ext of store.extracts(); track ext.id) {
                <option [ngValue]="ext.id">مستخلص #{{ store.num(ext.number) }} - {{ store.projectName(ext.projectId) }}</option>
              }
            </select>
          </div>

          <div>
            <label for="chk-notes" class="block text-xs font-medium mb-1">ملاحظات</label>
            <input id="chk-notes" type="text" formControlName="notes" placeholder="ملاحظة حرة..." class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
          </div>
        </div>

        <div class="flex justify-end">
          <button type="submit" [disabled]="checkForm.invalid" class="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm disabled:opacity-50">
            <mat-icon class="!text-lg !w-5 !h-5">add_card</mat-icon>
            <span>حفظ الشيك</span>
          </button>
        </div>
      </form>

      <!-- Checks Filter & Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button type="button" (click)="directionFilter.set('all')" class="px-3 py-1.5 rounded-lg text-xs font-bold" [class.bg-white]="directionFilter() === 'all'" [class.dark:bg-slate-900]="directionFilter() === 'all'">الكل</button>
            <button type="button" (click)="directionFilter.set('وارد')" class="px-3 py-1.5 rounded-lg text-xs font-bold" [class.bg-white]="directionFilter() === 'وارد'" [class.dark:bg-slate-900]="directionFilter() === 'وارد'">الواردة</button>
            <button type="button" (click)="directionFilter.set('صادر')" class="px-3 py-1.5 rounded-lg text-xs font-bold" [class.bg-white]="directionFilter() === 'صادر'" [class.dark:bg-slate-900]="directionFilter() === 'صادر'">الصادرة</button>
          </div>

          <div class="text-xs font-bold tabular-nums">
            إجمالي المعروض: <span class="text-amber-600">{{ store.money(filteredTotal()) }}</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4 font-semibold">النوع</th>
                <th class="py-3 px-3 font-semibold">رقم الشيك والبنك</th>
                <th class="py-3 px-3 font-semibold">المبلغ</th>
                <th class="py-3 px-3 font-semibold">تاريخ الاستحقاق</th>
                <th class="py-3 px-3 font-semibold">المستخلص المرتبط</th>
                <th class="py-3 px-3 font-semibold">الحالة</th>
                <th class="py-3 px-3 font-semibold">ملاحظات</th>
                <th class="py-3 px-4 font-semibold">إجراء</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (chk of filteredChecks(); track chk.id) {
                <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td class="py-3 px-4 font-bold">
                    <span [class.text-emerald-600]="chk.direction === 'وارد'" [class.text-rose-600]="chk.direction === 'صادر'">
                      {{ chk.direction }}
                    </span>
                  </td>
                  <td class="py-3 px-3">
                    <div class="font-bold tabular-nums">{{ chk.number }}</div>
                    <div class="text-xs text-slate-500">{{ chk.bank }}</div>
                  </td>
                  <td class="py-3 px-3 font-extrabold tabular-nums">{{ store.money(chk.amount) }}</td>
                  <td class="py-3 px-3 tabular-nums text-xs">{{ store.digits(chk.dueDate) }}</td>
                  <td class="py-3 px-3 text-xs">
                    @if (chk.extractId) {
                      <span class="font-semibold text-blue-600">مستخلص #{{ store.num(chk.extractId) }}</span>
                    } @else {
                      <span class="text-slate-400">غير مرتبط</span>
                    }
                  </td>
                  <td class="py-3 px-3">
                    <select
                      [value]="chk.status"
                      (change)="changeStatus(chk, $any($event.target).value)"
                      [attr.aria-label]="'تغيير حالة الشيك ' + chk.number"
                      class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                      [class.text-amber-600]="chk.status === 'معلق'"
                      [class.text-emerald-600]="chk.status === 'اتصرف'"
                      [class.text-rose-600]="chk.status === 'مرتجع'"
                    >
                      <option value="معلق">معلق</option>
                      <option value="اتصرف">اتصرف</option>
                      <option value="مرتجع">مرتجع</option>
                    </select>
                  </td>
                  <td class="py-3 px-3 text-xs text-slate-500">{{ chk.notes }}</td>
                  <td class="py-3 px-4">
                    <button
                      type="button"
                      (click)="store.deleteCheck(chk.id!)"
                      class="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                      [attr.aria-label]="'حذف شيك ' + chk.number"
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
  `,
})
export class ChecksPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly directionFilter = signal<'all' | CheckDirection>('all');

  readonly checkForm = this.fb.group({
    direction: ['وارد' as CheckDirection, Validators.required],
    number: ['', Validators.required],
    bank: ['البنك الأهلي المصري', Validators.required],
    amount: [15000, [Validators.required, Validators.min(1)]],
    dueDate: ['2026-10-19', Validators.required],
    status: ['معلق' as CheckStatus, Validators.required],
    extractId: [1 as number | null],
    notes: [''],
  });

  readonly filteredChecks = computed(() => {
    const dir = this.directionFilter();
    return this.store
      .checks()
      .filter((c) => dir === 'all' || c.direction === dir);
  });

  readonly filteredTotal = computed(() =>
    this.filteredChecks().reduce((s, c) => s + c.amount, 0)
  );

  async saveCheck(): Promise<void> {
    if (this.checkForm.invalid) return;
    const v = this.checkForm.getRawValue();
    await this.store.saveCheck({
      direction: (v.direction || 'وارد') as CheckDirection,
      number: v.number || '',
      bank: v.bank || '',
      amount: Number(v.amount),
      dueDate: v.dueDate || this.store.todayIso(),
      status: (v.status || 'معلق') as CheckStatus,
      projectId: 1,
      extractId: v.extractId ? Number(v.extractId) : null,
      notes: v.notes || '',
    });
    this.store.showToast('تم حفظ الشيك بنجاح', 'success');
    this.checkForm.patchValue({ number: '', notes: '' });
  }

  async changeStatus(chk: CheckItem, status: CheckStatus): Promise<void> {
    await this.store.saveCheck({ ...chk, status });
    this.store.showToast(`تم تحديث حالة الشيك ${chk.number} إلى ${status}`, 'success');
  }
}
