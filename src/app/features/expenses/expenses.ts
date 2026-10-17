import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type { ExpenseCategory } from '../../core/db/models';

@Component({
  selector: 'app-expenses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Add Expense Form -->
      <form
        [formGroup]="expenseForm"
        (ngSubmit)="saveExpense()"
        class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-amber-500">receipt_long</mat-icon>
          <span>تسجيل مصروف خارجي جديد</span>
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label for="exp-cat" class="block text-xs font-medium mb-1">الفئة *</label>
            <select id="exp-cat" formControlName="category" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              @for (c of categories; track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>

          <div>
            <label for="exp-amt" class="block text-xs font-medium mb-1">المبلغ (ج.م) *</label>
            <input id="exp-amt" type="number" min="1" formControlName="amount" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="exp-proj" class="block text-xs font-medium mb-1">المشروع</label>
            <select id="exp-proj" formControlName="projectId" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
              <option [ngValue]="null">مصروف عام</option>
              @for (p of store.projects(); track p.id) {
                <option [ngValue]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="exp-date" class="block text-xs font-medium mb-1">التاريخ *</label>
            <input id="exp-date" type="date" formControlName="date" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
          </div>

          <div>
            <label for="exp-note" class="block text-xs font-medium mb-1">ملاحظة</label>
            <input id="exp-note" type="text" formControlName="note" placeholder="تفاصيل المصروف..." class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
          </div>
        </div>

        <div class="flex justify-end">
          <button type="submit" [disabled]="expenseForm.invalid" class="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">
            <mat-icon class="!text-lg !w-5 !h-5">add</mat-icon>
            <span>حفظ المصروف</span>
          </button>
        </div>
      </form>

      <!-- Category Totals Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-6 gap-3">
        @for (catStat of categoryTotals(); track catStat.category) {
          <button
            type="button"
            (click)="selectedCategory.set(selectedCategory() === catStat.category ? 'all' : catStat.category)"
            class="p-3.5 rounded-2xl border text-right transition-colors bg-white dark:bg-slate-900"
            [class.border-amber-500]="selectedCategory() === catStat.category"
            [class.border-slate-200]="selectedCategory() !== catStat.category"
            [class.dark:border-slate-800]="selectedCategory() !== catStat.category"
          >
            <div class="text-xs text-slate-500">{{ catStat.category }}</div>
            <div class="text-base font-extrabold tabular-nums mt-1">{{ store.money(catStat.total) }}</div>
          </button>
        }
        <div class="p-3.5 rounded-2xl bg-slate-900 text-white">
          <div class="text-xs text-slate-300">إجمالي كل المصاريف</div>
          <div class="text-base font-extrabold tabular-nums text-amber-400 mt-1">{{ store.money(grandTotal()) }}</div>
        </div>
      </div>

      <!-- Expenses Table -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-right text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-3 px-4 font-semibold">التاريخ</th>
                <th class="py-3 px-3 font-semibold">الفئة</th>
                <th class="py-3 px-3 font-semibold">المشروع</th>
                <th class="py-3 px-3 font-semibold">المبلغ</th>
                <th class="py-3 px-3 font-semibold">ملاحظات</th>
                <th class="py-3 px-4 font-semibold">حذف</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (exp of filteredExpenses(); track exp.id) {
                <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td class="py-3 px-4 tabular-nums text-xs">{{ store.digits(exp.date) }}</td>
                  <td class="py-3 px-3 font-bold">{{ exp.category }}</td>
                  <td class="py-3 px-3 text-xs">{{ store.projectName(exp.projectId) }}</td>
                  <td class="py-3 px-3 font-bold tabular-nums text-rose-600">{{ store.money(exp.amount) }}</td>
                  <td class="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">{{ exp.note }}</td>
                  <td class="py-3 px-4">
                    <button
                      type="button"
                      (click)="store.deleteExpense(exp.id!)"
                      class="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                      [attr.aria-label]="'حذف مصروف ' + exp.category"
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
export class ExpensesPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly categories: ExpenseCategory[] = ['مواصلات', 'أكل', 'أدوات', 'صيانة', 'أخرى'];
  readonly selectedCategory = signal<string>('all');

  readonly expenseForm = this.fb.group({
    category: ['مواصلات' as ExpenseCategory, Validators.required],
    amount: [350, [Validators.required, Validators.min(1)]],
    projectId: [1 as number | null],
    date: [this.store.todayIso(), Validators.required],
    note: [''],
  });

  readonly filteredExpenses = computed(() => {
    const cat = this.selectedCategory();
    const projId = this.store.selectedProjectId();
    return this.store.expenses().filter((e) => {
      if (cat !== 'all' && e.category !== cat) return false;
      if (projId && e.projectId && e.projectId !== projId) return false;
      return true;
    });
  });

  readonly categoryTotals = computed(() => {
    const all = this.store.expenses();
    return this.categories.map((category) => ({
      category,
      total: all
        .filter((e) => e.category === category)
        .reduce((s, e) => s + e.amount, 0),
    }));
  });

  readonly grandTotal = computed(() =>
    this.store.expenses().reduce((s, e) => s + e.amount, 0)
  );

  async saveExpense(): Promise<void> {
    if (this.expenseForm.invalid) return;
    const v = this.expenseForm.getRawValue();
    await this.store.saveExpense({
      category: (v.category || 'أخرى') as ExpenseCategory,
      amount: Number(v.amount),
      projectId: v.projectId ? Number(v.projectId) : null,
      date: v.date || this.store.todayIso(),
      note: v.note || '',
    });
    this.store.showToast('تم تسجيل المصروف بنجاح', 'success');
    this.expenseForm.patchValue({ note: '' });
  }
}
