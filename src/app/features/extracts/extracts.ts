import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import {
  calculateExtractLineMetrics,
  calculateExtractTotals,
  calculateWorkerExtractBase,
} from '../../core/calc/calculations';
import type { CollectionMethod, Extract, ExtractLine } from '../../core/db/models';

@Component({
  selector: 'app-extracts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Top Bar: Extracts List & Create New Extract -->
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          @for (ext of store.extracts(); track ext.id) {
            <button
              type="button"
              (click)="selectExtract(ext.id!)"
              class="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
              [class.bg-slate-900]="activeExtractId() === ext.id"
              [class.text-white]="activeExtractId() === ext.id"
              [class.dark:bg-amber-500]="activeExtractId() === ext.id"
              [class.dark:text-slate-950]="activeExtractId() === ext.id"
              [class.bg-slate-100]="activeExtractId() !== ext.id"
              [class.dark:bg-slate-800]="activeExtractId() !== ext.id"
            >
              <mat-icon class="!text-base !w-4 !h-4">receipt</mat-icon>
              <span>مستخلص #{{ store.num(ext.number) }} - {{ store.projectName(ext.projectId) }}</span>
            </button>
          }
        </div>

        <button
          type="button"
          (click)="showNewModal.set(true)"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm"
        >
          <mat-icon class="!text-lg !w-5 !h-5">add</mat-icon>
          <span>مستخلص جديد للمشروع</span>
        </button>
      </div>

      <!-- Create New Extract Modal -->
      @if (showNewModal()) {
        <form
          [formGroup]="newExtractForm"
          (ngSubmit)="createNewExtract()"
          class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-amber-400 space-y-4"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold">إنشاء مستخلص جديد (يحسب تلقائياً من الحضور والإضافي بأسعار الـ Snapshot)</h3>
            <button type="button" (click)="showNewModal.set(false)" class="text-slate-400 hover:text-slate-600">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label for="ext-proj" class="block text-xs font-medium mb-1">المشروع *</label>
              <select id="ext-proj" formControlName="projectId" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm">
                @for (p of store.projects(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>
            <div>
              <label for="ext-num" class="block text-xs font-medium mb-1">رقم المستخلص *</label>
              <input id="ext-num" type="number" formControlName="number" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>
            <div>
              <label for="ext-from" class="block text-xs font-medium mb-1">من تاريخ *</label>
              <input id="ext-from" type="date" formControlName="from" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>
            <div>
              <label for="ext-to" class="block text-xs font-medium mb-1">إلى تاريخ *</label>
              <input id="ext-to" type="date" formControlName="to" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums" />
            </div>
          </div>

          <div class="flex items-center justify-between gap-4">
            <input
              type="text"
              formControlName="notes"
              placeholder="ملاحظات المستخلص..."
              class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <button type="submit" class="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">
              توليد جدول العمال وحفظ المستخلص
            </button>
          </div>
        </form>
      }

      <!-- Active Extract Details & Per-Worker Table (Section 8) -->
      @if (activeExtract(); as currentExt) {
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-4">
          <!-- Extract Header & Totals Strip -->
          <div class="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-extrabold text-slate-900 dark:text-white">
                  مستخلص رقم {{ store.num(currentExt.number) }} — {{ store.projectName(currentExt.projectId) }}
                </h2>
                <p class="text-xs text-slate-500 mt-0.5">
                  الفترة من {{ store.digits(currentExt.from) }} إلى {{ store.digits(currentExt.to) }}
                  @if (currentExt.notes) {
                    <span> · {{ currentExt.notes }}</span>
                  }
                </p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="recalculateFromAttendance(currentExt)"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
                >
                  <mat-icon class="!text-base !w-4 !h-4 text-blue-600">sync</mat-icon>
                  <span>تحديث المحسوب من الحضور والإضافي</span>
                </button>
                <button
                  type="button"
                  (click)="saveAllLines(currentExt)"
                  class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <mat-icon class="!text-base !w-4 !h-4">save</mat-icon>
                  <span>حفظ وتثبيت نسب المستخلص</span>
                </button>
              </div>
            </div>

            <!-- Totals Bar -->
            @let tot = extractTotals();
            <div class="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">إجمالي المحسوب</div>
                <div class="text-sm font-bold tabular-nums mt-0.5">{{ store.money(tot.calculated) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">إجمالي المطالب</div>
                <div class="text-sm font-bold tabular-nums text-blue-600 mt-0.5">{{ store.money(tot.claimed) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">إجمالي الضرائب</div>
                <div class="text-sm font-bold tabular-nums text-rose-600 mt-0.5">{{ store.money(tot.taxAmount) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div class="text-slate-500">الصافي المستحق</div>
                <div class="text-sm font-extrabold tabular-nums mt-0.5">{{ store.money(tot.netDue) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30">
                <div class="text-emerald-700 dark:text-emerald-400">إجمالي المحصّل</div>
                <div class="text-sm font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{{ store.money(tot.collected) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30">
                <div class="text-amber-800 dark:text-amber-300">إجمالي المتبقي</div>
                <div class="text-sm font-extrabold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">{{ store.money(tot.remaining) }}</div>
              </div>
            </div>
          </div>

          <!-- Per-Worker Lines Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="py-3 px-3 font-bold">العامل</th>
                  <th class="py-3 px-2 font-bold">المحسوب (تلقائي)</th>
                  <th class="py-3 px-2 font-bold">المطالب من الشركة</th>
                  <th class="py-3 px-2 font-bold">الفرق</th>
                  <th class="py-3 px-2 font-bold">نسبة الضريبة</th>
                  <th class="py-3 px-2 font-bold">قيمة الضريبة</th>
                  <th class="py-3 px-2 font-bold">الصافي المستحق</th>
                  <th class="py-3 px-2 font-bold">المحصّل</th>
                  <th class="py-3 px-2 font-bold">تاريخ ونوع التحصيل</th>
                  <th class="py-3 px-2 font-bold">الحالة</th>
                  <th class="py-3 px-2 font-bold">المتبقي</th>
                  <th class="py-3 px-3 font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (row of computedLines(); track row.id) {
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td class="py-2 px-2 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {{ store.workerName(row.workerId) }}
                    </td>

                    <!-- المحسوب تلقائي وغير قابل للتعديل -->
                    <td class="py-2 px-1.5 tabular-nums font-semibold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/30 whitespace-nowrap">
                      {{ store.money(row.calculated) }}
                    </td>

                    <!-- المطالب من الشركة قابل للتعديل -->
                    <td class="py-2 px-1.5">
                      <input
                        type="number"
                        [value]="row.claimed"
                        (change)="updateLineField(row, { claimed: +$any($event.target).value })"
                        [attr.aria-label]="'المطالب للعامل ' + store.workerName(row.workerId)"
                        class="w-20 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold tabular-nums"
                      />
                    </td>

                    <!-- الفرق بلون مميز -->
                    <td class="py-2 px-1.5 tabular-nums font-bold whitespace-nowrap">
                      <span
                        [class.text-emerald-600]="row.difference > 0"
                        [class.text-rose-600]="row.difference < 0"
                        [class.text-slate-400]="row.difference === 0"
                      >
                        {{ row.difference > 0 ? '+' : '' }}{{ store.money(row.difference) }}
                      </span>
                    </td>

                    <!-- نسبة الضريبة من الإعدادات -->
                    <td class="py-2 px-1.5">
                      <select
                        [value]="row.taxRate"
                        (change)="updateLineField(row, { taxRate: +$any($event.target).value })"
                        [attr.aria-label]="'نسبة الضريبة للعامل ' + store.workerName(row.workerId)"
                        class="w-28 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 tabular-nums text-[11px]"
                      >
                        @for (tr of store.settings().taxRates; track tr.name) {
                          <option [value]="tr.rate" [selected]="tr.rate === row.taxRate">{{ tr.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- قيمة الضريبة تلقائي -->
                    <td class="py-2 px-1.5 tabular-nums text-rose-600 font-medium whitespace-nowrap">
                      {{ store.money(row.taxAmount) }}
                    </td>

                    <!-- الصافي المستحق = المطالب - الضريبة -->
                    <td class="py-2 px-1.5 tabular-nums font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                      {{ store.money(row.netDue) }}
                    </td>

                    <!-- المحصّل -->
                    <td class="py-2 px-1.5">
                      <input
                        type="number"
                        [value]="row.collected"
                        (change)="updateLineField(row, { collected: +$any($event.target).value })"
                        [attr.aria-label]="'المحصل للعامل ' + store.workerName(row.workerId)"
                        class="w-16 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-emerald-700 dark:text-emerald-400 tabular-nums"
                      />
                    </td>

                    <!-- تاريخ ونوع التحصيل + ربط الشيك -->
                    <td class="py-2 px-1.5 space-y-1">
                      <div class="flex items-center gap-1">
                        <select
                          [value]="row.method"
                          (change)="updateLineField(row, { method: $any($event.target).value })"
                          [attr.aria-label]="'طريقة التحصيل للعامل ' + store.workerName(row.workerId)"
                          class="px-1 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        >
                          <option value="نقدي" [selected]="row.method === 'نقدي'">نقدي</option>
                          <option value="تحويل" [selected]="row.method === 'تحويل'">تحويل</option>
                          <option value="شيك" [selected]="row.method === 'شيك'">شيك</option>
                        </select>
                        <input
                          type="date"
                          [value]="row.collectedDate"
                          (change)="updateLineField(row, { collectedDate: $any($event.target).value })"
                          [attr.aria-label]="'تاريخ التحصيل للعامل ' + store.workerName(row.workerId)"
                          class="w-28 px-1 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 tabular-nums text-[11px]"
                        />
                      </div>
                      @if (row.method === 'شيك') {
                        <select
                          [value]="row.checkId ?? ''"
                          (change)="updateLineField(row, { checkId: $any($event.target).value ? +$any($event.target).value : null })"
                          [attr.aria-label]="'ربط الشيك للعامل ' + store.workerName(row.workerId)"
                          class="w-full px-1 py-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-slate-800 text-[10px]"
                        >
                          <option value="" [selected]="!row.checkId">اختر رقم الشيك...</option>
                          @for (chk of store.checks(); track chk.id) {
                            <option [value]="chk.id" [selected]="chk.id === row.checkId">شيك #{{ chk.number }} ({{ store.money(chk.amount) }})</option>
                          }
                        </select>
                      }
                    </td>

                    <!-- الحالة -->
                    <td class="py-2 px-1.5 whitespace-nowrap font-bold">
                      <span
                        [class.text-emerald-600]="row.status === 'محصّل بالكامل'"
                        [class.text-amber-600]="row.status === 'جزئي'"
                        [class.text-rose-600]="row.status === 'لم يُحصّل'"
                      >
                        {{ row.status }}
                      </span>
                    </td>

                    <!-- المتبقي -->
                    <td class="py-2 px-1.5 tabular-nums font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                      {{ store.money(row.remaining) }}
                    </td>

                    <!-- ملاحظات حرة -->
                    <td class="py-2 px-2">
                      <input
                        type="text"
                        [value]="row.notes"
                        (change)="updateLineField(row, { notes: $any($event.target).value })"
                        placeholder="ملاحظة..."
                        [attr.aria-label]="'ملاحظة سطر المستخلص للعامل ' + store.workerName(row.workerId)"
                        class="w-24 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class ExtractsPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly activeExtractId = signal<number>(1);
  readonly showNewModal = signal<boolean>(false);

  readonly newExtractForm = this.fb.nonNullable.group({
    projectId: [1, Validators.required],
    number: [2, [Validators.required, Validators.min(1)]],
    from: ['2026-10-01', Validators.required],
    to: ['2026-10-31', Validators.required],
    notes: [''],
  });

  readonly activeExtract = computed(() => {
    const id = this.activeExtractId();
    return (
      this.store.extracts().find((e) => e.id === id) ||
      this.store.extracts()[0] ||
      null
    );
  });

  readonly rawLinesForActive = computed(() => {
    const ext = this.activeExtract();
    if (!ext) return [];
    return this.store.extractLines().filter((l) => l.extractId === ext.id);
  });

  readonly computedLines = computed(() =>
    this.rawLinesForActive().map(calculateExtractLineMetrics)
  );

  readonly extractTotals = computed(() =>
    calculateExtractTotals(this.rawLinesForActive())
  );

  selectExtract(id: number): void {
    this.activeExtractId.set(id);
  }

  async updateLineField(
    line: ExtractLine,
    changes: Partial<{
      claimed: number;
      taxRate: number;
      collected: number;
      collectedDate: string;
      method: CollectionMethod;
      checkId: number | null;
      notes: string;
    }>
  ): Promise<void> {
    const merged: ExtractLine = { ...line, ...changes, isSaved: false };
    const computedMetrics = calculateExtractLineMetrics(merged);
    await this.store.saveExtractLine(
      {
        ...merged,
        taxAmount: computedMetrics.taxAmount,
        status: computedMetrics.status,
      },
      false
    );
  }

  async recalculateFromAttendance(ext: Extract): Promise<void> {
    const project = this.store.projects().find((p) => p.id === ext.projectId);
    if (!project) return;

    const defaultRate = this.store.settings().taxRates[3]?.rate ?? 5;
    for (const worker of this.store.activeWorkers()) {
      const base = calculateWorkerExtractBase(
        worker.id!,
        ext.projectId,
        ext.from,
        ext.to,
        this.store.attendances(),
        this.store.extras(),
        this.store.extraCashes(),
        project.companyDayRate,
        project.companyNightRate
      );

      const existing = this.rawLinesForActive().find(
        (l) => l.workerId === worker.id
      );

      if (existing) {
        const nextClaimed =
          existing.claimed === existing.calculated
            ? base.calculatedTotal
            : existing.claimed;
        const m = calculateExtractLineMetrics({
          ...existing,
          calculated: base.calculatedTotal,
          claimed: nextClaimed,
        });
        await this.store.saveExtractLine(m, false);
      } else if (base.calculatedTotal > 0) {
        const m = calculateExtractLineMetrics({
          extractId: ext.id!,
          workerId: worker.id!,
          calculated: base.calculatedTotal,
          claimed: base.calculatedTotal,
          taxRate: defaultRate,
          taxAmount: 0,
          collected: 0,
          collectedDate: '',
          method: 'نقدي',
          checkId: null,
          isSaved: false,
          notes: '',
        });
        await this.store.saveExtractLine(m, false);
      }
    }

    this.store.showToast(
      'تم تحديث المحسوب تلقائياً من الحضور والإضافي داخل الفترة',
      'success'
    );
  }

  async saveAllLines(ext: Extract): Promise<void> {
    const lines = this.computedLines();
    await this.store.saveExtract(ext, lines);
    this.store.showToast('تم حفظ وتثبيت سطور المستخلص بنجاح', 'success');
  }

  async createNewExtract(): Promise<void> {
    if (this.newExtractForm.invalid) return;
    const val = this.newExtractForm.getRawValue();
    const projId = Number(val.projectId);
    const project = this.store.projects().find((p) => p.id === projId);
    if (!project) return;

    const defaultTaxRate = this.store.settings().taxRates[3]?.rate ?? 5;
    const initialLines: ExtractLine[] = [];

    for (const worker of this.store.activeWorkers()) {
      const base = calculateWorkerExtractBase(
        worker.id!,
        projId,
        val.from,
        val.to,
        this.store.attendances(),
        this.store.extras(),
        this.store.extraCashes(),
        project.companyDayRate,
        project.companyNightRate
      );

      const m = calculateExtractLineMetrics({
        extractId: 0,
        workerId: worker.id!,
        calculated: base.calculatedTotal,
        claimed: base.calculatedTotal,
        taxRate: defaultTaxRate,
        taxAmount: 0,
        collected: 0,
        collectedDate: '',
        method: 'نقدي',
        checkId: null,
        isSaved: false,
        notes: '',
      });
      initialLines.push(m);
    }

    const newId = await this.store.saveExtract(
      {
        projectId: projId,
        number: Number(val.number),
        from: val.from,
        to: val.to,
        notes: val.notes,
      },
      initialLines
    );

    this.activeExtractId.set(newId);
    this.showNewModal.set(false);
    this.store.showToast('تم إنشاء المستخلص وتوليد أسطر العمال تلقائياً', 'success');
  }
}
