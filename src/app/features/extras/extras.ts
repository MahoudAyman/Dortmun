import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type {
  ExtraCash,
  ExtraItem,
  ExtraPerformedBy,
  ExtraType,
  ExtraValueMode,
} from '../../core/db/models';

@Component({
  selector: 'app-extras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Filter & Action Bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <label for="ex-filter-proj" class="block text-xs text-slate-500 mb-1">فلترة بالمشروع</label>
            <select
              id="ex-filter-proj"
              [value]="filterProjectId()"
              (change)="filterProjectId.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">كل المشاريع</option>
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="ex-filter-auth" class="block text-xs text-slate-500 mb-1">فلترة بالمهندس / المشرف</label>
            <select
              id="ex-filter-auth"
              [value]="filterAuth()"
              (change)="filterAuth.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">الكل</option>
              @for (name of allAuthorizers(); track name) {
                <option [value]="name">{{ name }}</option>
              }
            </select>
          </div>

          <div>
            <label for="ex-filter-date" class="block text-xs text-slate-500 mb-1">فلترة بالتاريخ</label>
            <input
              id="ex-filter-date"
              type="date"
              [value]="filterDate()"
              (change)="filterDate.set($any($event.target).value)"
              class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm tabular-nums"
            />
          </div>
        </div>

        <button
          type="button"
          (click)="openNewExtraForm()"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm"
        >
          <mat-icon class="!text-lg !w-5 !h-5">add_task</mat-icon>
          <span>تسجيل بند إضافي جديد</span>
        </button>
      </div>

      <!-- Create / Edit Extra Form -->
      @if (showExtraForm()) {
        <form
          [formGroup]="extraForm"
          (ngSubmit)="saveExtraHeader()"
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-amber-400 space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold">تسجيل بند إضافي جديد</h3>
            <button type="button" (click)="showExtraForm.set(false)" class="text-slate-400 hover:text-slate-600">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label for="ex-date" class="block text-xs font-medium mb-1">التاريخ *</label>
              <input id="ex-date" type="date" formControlName="date" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>

            <div>
              <label for="ex-proj" class="block text-xs font-medium mb-1">المشروع *</label>
              <select id="ex-proj" formControlName="projectId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                @for (p of store.projects(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>

            <div>
              <label for="ex-type" class="block text-xs font-medium mb-1">نوع الإضافي *</label>
              <select id="ex-type" formControlName="type" (change)="onTypeChange()" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                <option value="يوم إضافي">يوم إضافي</option>
                <option value="نص إضافي">نص إضافي</option>
                <option value="10 أيام">10 أيام</option>
                <option value="مخصص">مخصص</option>
              </select>
            </div>

            <div>
              <label for="ex-auth" class="block text-xs font-medium mb-1">الأمر من (المهندس / المشرف) *</label>
              <div class="flex gap-1.5">
                <select id="ex-auth" formControlName="authorizedBy" class="flex-1 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                  @for (name of allAuthorizers(); track name) {
                    <option [value]="name">{{ name }}</option>
                  }
                </select>
                <input
                  type="text"
                  [value]="customAuthorizer()"
                  (input)="customAuthorizer.set($any($event.target).value)"
                  placeholder="أو اكتب اسم جديد"
                  aria-label="إضافة اسم مهندس أو مشرف جديد"
                  class="w-32 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label for="ex-perf" class="block text-xs font-medium mb-1">التنفيذ</label>
              <select id="ex-perf" formControlName="performedBy" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                <option value="workers">عمال المقاول</option>
                <option value="self">المقاول نفسه</option>
              </select>
            </div>

            <div>
              <label for="ex-wcount" class="block text-xs font-medium mb-1">عدد العمال المشاركين</label>
              <input id="ex-wcount" type="number" min="1" formControlName="workersCount" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>

            <div>
              <label for="ex-vmode" class="block text-xs font-medium mb-1">طريقة القيمة</label>
              <select id="ex-vmode" formControlName="valueMode" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                <option value="money">فلوس (مبلغ)</option>
                <option value="days">يوميات (عدد)</option>
                <option value="note">ملاحظة فقط</option>
              </select>
            </div>

            <div>
              <label for="ex-amount" class="block text-xs font-medium mb-1">القيمة المالية (ج.م)</label>
              <input id="ex-amount" type="number" min="0" formControlName="amount" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>

            <div>
              <label for="ex-days" class="block text-xs font-medium mb-1">عدد اليوميات</label>
              <input id="ex-days" type="number" step="0.5" min="0" formControlName="days" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-4">
            <input
              type="text"
              formControlName="notes"
              placeholder="ملاحظات البند الإضافي (يدخل في محسوب العامل داخل فترة المستخلص مرة واحدة)..."
              class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <button type="submit" class="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">
              حفظ البند وفتح قائمة الناش
            </button>
          </div>
        </form>
      }

      <!-- Master-Detail: Extras List + Selected Extra's Nash Table -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left/Right: Extras List (5 cols) -->
        <div class="lg:col-span-5 space-y-3">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">
            قائمة البنود الإضافية ({{ store.num(filteredExtras().length) }})
          </h3>

          @for (item of filteredExtras(); track item.id) {
            <div
              role="button"
              tabindex="0"
              (click)="selectExtra(item)"
              (keydown.enter)="selectExtra(item)"
              class="p-4 rounded-2xl border transition-colors cursor-pointer bg-white dark:bg-slate-900 space-y-2"
              [class.border-amber-500]="selectedExtraId() === item.id"
              [class.border-slate-200]="selectedExtraId() !== item.id"
              [class.dark:border-slate-800]="selectedExtraId() !== item.id"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-900 dark:text-white">
                  {{ item.type }} — {{ store.projectName(item.projectId) }}
                </span>
                <span class="text-xs text-slate-500 tabular-nums">{{ store.digits(item.date) }}</span>
              </div>
              <div class="text-xs text-slate-600 dark:text-slate-300">
                بأمر: <strong>{{ item.authorizedBy }}</strong> · التنفيذ: {{ item.performedBy === 'self' ? 'المقاول نفسه' : 'عمال المقاول' }} ({{ store.num(item.workersCount) }} عمال)
              </div>
              @if (item.notes) {
                <p class="text-xs text-slate-500">{{ item.notes }}</p>
              }
              <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span class="font-bold text-amber-600 tabular-nums">
                  القيمة: {{ store.money(item.amount) }} ({{ store.num(item.days, 1) }} يوم)
                </span>
                <button
                  type="button"
                  (click)="$event.stopPropagation(); deleteExtraItem(item.id!)"
                  class="text-rose-600 hover:underline"
                >
                  حذف
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Nash Table for Selected Extra (7 cols) -->
        <div class="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          @if (selectedExtra(); as curExtra) {
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 class="text-base font-extrabold text-slate-900 dark:text-white">
                  قائمة الناش — {{ curExtra.type }} ({{ store.digits(curExtra.date) }})
                </h3>
                <p class="text-xs text-slate-500">
                  {{ store.projectName(curExtra.projectId) }} · بأمر {{ curExtra.authorizedBy }}
                </p>
              </div>
              <button
                type="button"
                (click)="addNashWorkerRow()"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold"
              >
                <mat-icon class="!text-sm !w-4 !h-4">person_add</mat-icon>
                <span>إضافة عامل لقائمة الناش</span>
              </button>
            </div>

            <!-- Extra Item Totals Strip -->
            @let nTotals = selectedNashTotals();
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">القيمة الكلية للبند</div>
                <div class="text-sm font-bold tabular-nums mt-0.5">{{ store.money(nTotals.totalValue) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">عدد العمال المشاركين</div>
                <div class="text-sm font-bold tabular-nums mt-0.5">{{ store.num(nTotals.workersCount) }} عامل</div>
              </div>
              <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30">
                <div class="text-emerald-700 dark:text-emerald-400">إجمالي المدفوع نقداً (ناش)</div>
                <div class="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{{ store.money(nTotals.totalPaidCash) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30">
                <div class="text-amber-800 dark:text-amber-300">المتبقي للعمال</div>
                <div class="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">{{ store.money(nTotals.remaining) }}</div>
              </div>
            </div>

            <!-- Nash Workers Table -->
            <div class="overflow-x-auto">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th class="py-2.5 px-3 font-bold">العامل المشارك</th>
                    <th class="py-2.5 px-2 font-bold">المبلغ (ج.م)</th>
                    <th class="py-2.5 px-2 font-bold">اليوميات</th>
                    <th class="py-2.5 px-2 font-bold">المدفوع نقداً (ناش)</th>
                    <th class="py-2.5 px-2 font-bold">المتبقي</th>
                    <th class="py-2.5 px-3 font-bold">ملاحظة</th>
                    <th class="py-2.5 px-2"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  @for (row of editableNashRows(); track $index; let idx = $index) {
                    <tr>
                      <td class="py-2 px-2">
                        <select
                          [value]="row.workerId"
                          (change)="updateNashRow(idx, { workerId: +$any($event.target).value })"
                          [attr.aria-label]="'عامل الناش رقم ' + (idx + 1)"
                          class="px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[11px]"
                        >
                          @for (w of store.workers(); track w.id) {
                            <option [value]="w.id" [selected]="w.id === row.workerId">{{ w.name }}</option>
                          }
                        </select>
                      </td>
                      <td class="py-2 px-1.5">
                        <input
                          type="number"
                          [value]="row.amount"
                          (change)="updateNashRow(idx, { amount: +$any($event.target).value })"
                          [attr.aria-label]="'مبلغ الإضافي للعامل ' + store.workerName(row.workerId)"
                          class="w-16 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 tabular-nums font-semibold"
                        />
                      </td>
                      <td class="py-2 px-1.5">
                        <input
                          type="number"
                          step="0.5"
                          [value]="row.days"
                          (change)="updateNashRow(idx, { days: +$any($event.target).value })"
                          [attr.aria-label]="'يوميات الإضافي للعامل ' + store.workerName(row.workerId)"
                          class="w-12 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 tabular-nums"
                        />
                      </td>
                      <td class="py-2 px-1.5">
                        <input
                          type="number"
                          [value]="row.paidCash"
                          (change)="updateNashRow(idx, { paidCash: +$any($event.target).value })"
                          [attr.aria-label]="'المدفوع ناش للعامل ' + store.workerName(row.workerId)"
                          class="w-16 px-1.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-slate-800 tabular-nums font-bold text-emerald-700 dark:text-emerald-400"
                        />
                      </td>
                      <td class="py-2 px-1.5 tabular-nums font-bold text-amber-600 whitespace-nowrap">
                        {{ store.money(Math.max(0, row.amount - row.paidCash)) }}
                      </td>
                      <td class="py-2 px-1.5">
                        <input
                          type="text"
                          [value]="row.notes"
                          (change)="updateNashRow(idx, { notes: $any($event.target).value })"
                          placeholder="ملاحظة..."
                          [attr.aria-label]="'ملاحظة الناش للعامل ' + store.workerName(row.workerId)"
                          class="w-24 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        />
                      </td>
                      <td class="py-2 px-1">
                        <button
                          type="button"
                          (click)="removeNashRow(idx)"
                          class="text-rose-500 hover:text-rose-700"
                          [attr.aria-label]="'حذف سطر الناش ' + (idx + 1)"
                        >
                          <mat-icon class="!text-base !w-4 !h-4">close</mat-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                (click)="saveNashChanges()"
                class="min-h-[44px] inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-sm"
              >
                <mat-icon class="!text-base !w-4 !h-4">save</mat-icon>
                <span>حفظ قائمة الناش للبند</span>
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ExtrasPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);
  protected readonly Math = Math;

  readonly filterProjectId = signal<string>('all');
  readonly filterAuth = signal<string>('all');
  readonly filterDate = signal<string>('');
  readonly showExtraForm = signal<boolean>(false);
  readonly customAuthorizer = signal<string>('');
  readonly selectedExtraId = signal<number>(1);
  readonly editableNashRows = signal<ExtraCash[]>([]);

  readonly extraForm = this.fb.nonNullable.group({
    date: [this.store.todayIso(), Validators.required],
    projectId: [1, Validators.required],
    type: ['يوم إضافي' as ExtraType, Validators.required],
    authorizedBy: ['المهندس أحمد', Validators.required],
    performedBy: ['workers' as ExtraPerformedBy],
    workersCount: [2, [Validators.required, Validators.min(1)]],
    valueMode: ['money' as ExtraValueMode],
    amount: [600],
    days: [1],
    notes: [''],
  });

  readonly allAuthorizers = computed(() => {
    const s = this.store.settings();
    return Array.from(new Set([...s.engineers, ...s.supervisors]));
  });

  readonly filteredExtras = computed(() => {
    const p = this.filterProjectId();
    const auth = this.filterAuth();
    const d = this.filterDate();

    return this.store.extras().filter((ex) => {
      if (p !== 'all' && ex.projectId !== Number(p)) return false;
      if (auth !== 'all' && ex.authorizedBy !== auth) return false;
      if (d && ex.date !== d) return false;
      return true;
    });
  });

  readonly selectedExtra = computed(() => {
    const id = this.selectedExtraId();
    return (
      this.store.extras().find((e) => e.id === id) ||
      this.filteredExtras()[0] ||
      null
    );
  });

  readonly selectedNashTotals = computed(() => {
    const rows = this.editableNashRows();
    const totalValue = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const totalPaidCash = rows.reduce((s, r) => s + (r.paidCash || 0), 0);
    return {
      totalValue,
      workersCount: rows.length,
      totalPaidCash,
      remaining: Math.max(0, totalValue - totalPaidCash),
    };
  });

  constructor() {
    this.loadNashRowsForExtra(1);
  }

  selectExtra(item: ExtraItem): void {
    if (!item.id) return;
    this.selectedExtraId.set(item.id);
    this.loadNashRowsForExtra(item.id);
  }

  private loadNashRowsForExtra(extraId: number): void {
    const rows = this.store
      .extraCashes()
      .filter((ec) => ec.extraId === extraId)
      .map((r) => ({ ...r }));
    this.editableNashRows.set(rows);
  }

  openNewExtraForm(): void {
    this.showExtraForm.set(true);
  }

  onTypeChange(): void {
    const t = this.extraForm.controls.type.value;
    if (t === 'يوم إضافي') {
      this.extraForm.patchValue({ days: 1, amount: 500 });
    } else if (t === 'نص إضافي') {
      this.extraForm.patchValue({ days: 0.5, amount: 250 });
    } else if (t === '10 أيام') {
      this.extraForm.patchValue({ days: 10, amount: 5000 });
    }
  }

  async saveExtraHeader(): Promise<void> {
    if (this.extraForm.invalid) return;
    const val = this.extraForm.getRawValue();
    const auth = this.customAuthorizer().trim() || val.authorizedBy;

    const count = Number(val.workersCount) || 1;
    const perWorkerAmt = Math.round((Number(val.amount) || 0) / count);
    const perWorkerDays = Number(val.days) || 0.5;

    const defaultWorkers = this.store.activeWorkers().slice(0, count);
    const initialNash: ExtraCash[] = defaultWorkers.map((w) => ({
      extraId: 0,
      workerId: w.id!,
      amount: perWorkerAmt || w.workerDayRate * perWorkerDays,
      days: perWorkerDays,
      paidCash: 0,
      notes: '',
    }));

    const newId = await this.store.saveExtraWithNash(
      {
        date: val.date,
        projectId: Number(val.projectId),
        type: val.type,
        authorizedBy: auth,
        performedBy: val.performedBy,
        workersCount: count,
        valueMode: val.valueMode,
        amount: Number(val.amount),
        days: Number(val.days),
        notes: val.notes,
      },
      initialNash
    );

    this.customAuthorizer.set('');
    this.showExtraForm.set(false);
    this.selectedExtraId.set(newId);
    this.loadNashRowsForExtra(newId);
    this.store.showToast('تم حفظ البند الإضافي وفتح قائمة الناش', 'success');
  }

  addNashWorkerRow(): void {
    const ext = this.selectedExtra();
    if (!ext) return;
    const firstWorker = this.store.activeWorkers()[0];
    if (!firstWorker) return;

    this.editableNashRows.update((rows) => [
      ...rows,
      {
        extraId: ext.id!,
        workerId: firstWorker.id!,
        amount: 250,
        days: 0.5,
        paidCash: 250,
        notes: '',
      },
    ]);
  }

  updateNashRow(index: number, changes: Partial<ExtraCash>): void {
    this.editableNashRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...changes } : r))
    );
  }

  removeNashRow(index: number): void {
    this.editableNashRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  async saveNashChanges(): Promise<void> {
    const ext = this.selectedExtra();
    if (!ext) return;
    const rows = this.editableNashRows();
    const totalAmt = rows.reduce((s, r) => s + (r.amount || 0), 0);

    await this.store.saveExtraWithNash(
      {
        ...ext,
        workersCount: rows.length,
        amount: totalAmt > 0 ? totalAmt : ext.amount,
      },
      rows
    );
    this.loadNashRowsForExtra(ext.id!);
    this.store.showToast('تم حفظ قائمة الناش وتحديث إجماليات البند بنجاح', 'success');
  }

  async deleteExtraItem(id: number): Promise<void> {
    await this.store.deleteExtra(id);
    const first = this.store.extras()[0];
    if (first?.id) {
      this.selectExtra(first);
    }
  }
}
