import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { calculateSettlement } from '../../core/calc/calculations';
import type { Settlement, Worker } from '../../core/db/models';

@Component({
  selector: 'app-settlements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Payday 15th Ceramic Hero Banner ("أنا بقبض الناس كل يوم 15 وفي خصومات بخصمها مثل يوم أو نص أو فلوس") -->
      @let payday = store.payday15Info();
      <div class="ceramic-hero p-5 lg:p-6 text-white flex flex-wrap items-center justify-between gap-4 no-print">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold shrink-0 shadow-sm">
            <mat-icon class="!text-2xl !w-6 !h-6">event_repeat</mat-icon>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-extrabold">
                مركز قبض يوم {{ store.num(store.settings().paydayDayOfMonth || 15) }} والتسويات الشاملة
              </h1>
              <span class="px-2.5 py-0.5 rounded-xl bg-amber-500 text-slate-950 text-[11px] font-extrabold">
                {{ payday.label }}
              </span>
            </div>
            <p class="text-xs text-slate-300 mt-1">
              يحسب تلقائياً: (اليوميات + السهرات + الناش) − السلف المتبقية − الخصومات والجزاءات (يوم / نص يوم / فلوس) = الصافي للقبض
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            (click)="applyPayday15Cycle()"
            class="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
          >
            <mat-icon class="!text-base !w-4 !h-4">date_range</mat-icon>
            <span>ضبط فترة دورة يوم ١٥ ({{ store.digits(payday.from) }} ← {{ store.digits(payday.to) }})</span>
          </button>

          <a
            routerLink="/deductions"
            class="px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all"
          >
            <mat-icon class="!text-base !w-4 !h-4 text-rose-400">gavel</mat-icon>
            <span>تحويل للخصومات</span>
          </a>
        </div>
      </div>

      <!-- Payday 15th Collective Payroll Sheet for All Workers & Sculptors -->
      <div class="ceramic-card overflow-hidden no-print">
        <div class="p-4 lg:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <mat-icon class="text-emerald-600 !text-lg !w-5 !h-4">groups</mat-icon>
              <span>كشف قبض جماعي للفترة ({{ store.digits(fromDate()) }} إلى {{ store.digits(toDate()) }})</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              إجمالي الصافي المطلوب صرفه لكل العمال والنحّاتية: <strong class="text-emerald-600 dark:text-emerald-400 tabular-nums">{{ store.money(collectiveTotals().netPaid) }}</strong>
            </p>
          </div>

          @if (store.activeWorkers().length > 0) {
            <button
              type="button"
              (click)="settleAllWorkersForPeriod()"
              class="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs transition-all"
            >
              <mat-icon class="!text-base !w-4 !h-4">done_all</mat-icon>
              <span>اعتماد وصرف قبض الكل دفعة واحدة</span>
            </button>
          }
        </div>

        @if (store.activeWorkers().length === 0) {
          <div class="p-6 text-center space-y-3">
            <div class="text-sm font-bold text-slate-500">لا يوجد عمال أو نحّاتية مسجلون بعد (كل الأرقام تبدأ من صفر).</div>
            <a
              routerLink="/workers"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs"
            >
              <mat-icon class="!text-sm !w-4 !h-4">person_add</mat-icon>
              <span>تحويل لإضافة العمال والنحاتية</span>
            </a>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="py-3 px-4 font-bold">العامل / النحّات</th>
                  <th class="py-3 px-3 font-bold">أيام وسهرات</th>
                  <th class="py-3 px-3 font-bold">إجمالي الأجر</th>
                  <th class="py-3 px-3 font-bold text-rose-600">خصم السلف</th>
                  <th class="py-3 px-3 font-bold text-rose-600">الخصومات والجزاءات</th>
                  <th class="py-3 px-3 font-bold text-emerald-700 dark:text-emerald-400">الصافي للقبض</th>
                  <th class="py-3 px-4 font-bold">إجراء سريع</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (row of collectivePayrollRows(); track row.worker.id) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td class="py-3 px-4">
                      <div class="font-extrabold text-slate-900 dark:text-white">{{ row.worker.name }}</div>
                      <div class="text-[11px] text-slate-400">{{ row.worker.role }} · يومية {{ store.money(row.worker.workerDayRate) }}</div>
                    </td>
                    <td class="py-3 px-3 tabular-nums font-bold">
                      {{ store.num(row.calc.days) }} ي · {{ store.num(row.calc.nights) }} س
                    </td>
                    <td class="py-3 px-3 tabular-nums font-bold text-blue-600 dark:text-blue-400">
                      {{ store.money(row.calc.grossWages) }}
                    </td>
                    <td class="py-3 px-3 tabular-nums font-bold text-rose-600">
                      {{ store.money(row.calc.advancesDeducted) }}
                    </td>
                    <td class="py-3 px-3 tabular-nums font-bold text-rose-600">
                      <div>{{ store.money(row.calc.deductionsDeducted) }}</div>
                      @if (row.calc.deductionDays > 0) {
                        <div class="text-[10px] text-slate-400">({{ store.num(row.calc.deductionDays, 2) }} يوم خصم)</div>
                      }
                    </td>
                    <td class="py-3 px-3 tabular-nums font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                      {{ store.money(row.calc.netPaid) }}
                    </td>
                    <td class="py-3 px-4">
                      <button
                        type="button"
                        (click)="selectedWorkerId.set(row.worker.id!)"
                        class="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 font-bold text-xs transition-colors"
                      >
                        معاينة وصرف
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Individual Worker Settlement Calculator Card -->
      <div class="ceramic-card p-5 lg:p-6 space-y-5 no-print">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-extrabold text-slate-900 dark:text-white">حاسبة التسويات وتصفية حساب عامل مفرد</h2>
            <p class="text-xs text-slate-500">
              اختر العامل والفترة ليتم حساب (الأيام × سعر العامل) + (السهرات × سعر السهرة) − السلف المتبقية − الخصومات = الصافي تلقائياً
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label for="set-worker" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">اختر العامل / النحّات</label>
            <select
              id="set-worker"
              [value]="selectedWorkerId()"
              (change)="selectedWorkerId.set(+$any($event.target).value)"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            >
              @if (store.workers().length === 0) {
                <option [value]="0">لا يوجد عمال حالياً</option>
              }
              @for (w of store.workers(); track w.id) {
                <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
              }
            </select>
          </div>

          <div>
            <label for="set-from" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">من تاريخ</label>
            <input
              id="set-from"
              type="date"
              [value]="fromDate()"
              (change)="fromDate.set($any($event.target).value)"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="set-to" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">إلى تاريخ</label>
            <input
              id="set-to"
              type="date"
              [value]="toDate()"
              (change)="toDate.set($any($event.target).value)"
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
            />
          </div>

          <div>
            <label for="set-notes" class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">ملاحظات التسوية / القبض</label>
            <input
              id="set-notes"
              type="text"
              [value]="settlementNotes()"
              (input)="settlementNotes.set($any($event.target).value)"
              placeholder="مثال: قبض يوم 15 في الشهر..."
              class="w-full px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <!-- Auto-Calculated Breakdown -->
        @if (preview(); as calc) {
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-6 gap-4 items-center">
            <div>
              <div class="text-xs text-slate-500">اليوميات ({{ store.num(calc.days) }} يوم)</div>
              <div class="text-base font-extrabold tabular-nums">{{ store.money(calc.dayWages) }}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500">السهرات ({{ store.num(calc.nights) }} سهرة) + إضافي</div>
              <div class="text-base font-extrabold tabular-nums">{{ store.money(calc.nightWages + calc.extraWages) }}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500">إجمالي الأجر المستحق</div>
              <div class="text-base font-extrabold tabular-nums text-blue-600">{{ store.money(calc.grossWages) }}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500">يُخصم السلف ({{ store.num(calc.unsettledAdvanceIds.length) }})</div>
              <div class="text-base font-extrabold tabular-nums text-rose-600">- {{ store.money(calc.advancesDeducted) }}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500">يُخصم الجزاءات ({{ store.num(calc.unsettledDeductionIds.length) }})</div>
              <div class="text-base font-extrabold tabular-nums text-rose-600">- {{ store.money(calc.deductionsDeducted) }}</div>
            </div>
            <div class="bg-slate-900 text-white p-3 rounded-2xl text-center">
              <div class="text-xs text-slate-300">الصافي للقبض</div>
              <div class="text-xl font-extrabold tabular-nums text-amber-400">{{ store.money(calc.netPaid) }}</div>
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              (click)="saveAndCloseAdvances()"
              class="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm transition-colors shadow-xs"
            >
              <mat-icon>check_circle</mat-icon>
              <span>حفظ التسوية وقفل السلف والخصومات المخصومة</span>
            </button>
          </div>
        }
      </div>

      <!-- Saved Settlements List & Printable Receipt -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 ceramic-card overflow-hidden no-print">
          <div class="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 class="text-sm font-extrabold">سجل التسويات والقبض المحفوظ ({{ store.num(store.settlements().length) }})</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th class="py-3 px-4 font-semibold">العامل</th>
                  <th class="py-3 px-3 font-semibold">الفترة</th>
                  <th class="py-3 px-3 font-semibold">أيام / سهرات</th>
                  <th class="py-3 px-3 font-semibold">الإجمالي</th>
                  <th class="py-3 px-3 font-semibold">السلف والخصومات</th>
                  <th class="py-3 px-3 font-semibold">الصافي المدفوع</th>
                  <th class="py-3 px-4 font-semibold">إيصال</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (st of store.settlements(); track st.id) {
                  <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td class="py-3 px-4 font-bold">
                      <div>{{ store.workerName(st.workerId) }}</div>
                      @if (st.notes) {
                        <div class="text-xs font-normal text-slate-500">{{ st.notes }}</div>
                      }
                    </td>
                    <td class="py-3 px-3 text-xs tabular-nums">{{ store.digits(st.from) }} → {{ store.digits(st.to) }}</td>
                    <td class="py-3 px-3 text-xs tabular-nums">{{ store.num(st.days) }} ي · {{ store.num(st.nights) }} س</td>
                    <td class="py-3 px-3 tabular-nums">{{ store.money(st.grossWages) }}</td>
                    <td class="py-3 px-3 tabular-nums text-rose-600 text-xs">
                      <div>سلف: {{ store.money(st.advancesDeducted) }}</div>
                      @if (st.deductionsDeducted) {
                        <div>خصومات: {{ store.money(st.deductionsDeducted) }}</div>
                      }
                    </td>
                    <td class="py-3 px-3 tabular-nums font-extrabold text-emerald-600">{{ store.money(st.netPaid) }}</td>
                    <td class="py-3 px-4">
                      <button
                        type="button"
                        (click)="selectedReceipt.set(st)"
                        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">receipt_long</mat-icon>
                        <span>إيصال</span>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="py-8 text-center text-xs text-slate-400">
                      لا توجد تسويات محفوظة بعد.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Printable Settlement Receipt -->
        <div class="ceramic-card p-6 space-y-4">
          @let receipt = selectedReceipt() || store.settlements()[0];
          @if (receipt) {
            <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 class="text-base font-extrabold text-slate-900 dark:text-white">{{ store.settings().companyName }}</h3>
                <p class="text-xs text-slate-500">إيصال قبض وتسوية حساب عامل رقم #{{ store.num(receipt.id) }}</p>
              </div>
              <button
                type="button"
                (click)="printReceipt()"
                class="no-print inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                <mat-icon class="!text-sm !w-4 !h-4">print</mat-icon>
                <span>طباعة الإيصال</span>
              </button>
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">اسم العامل:</span>
                <span class="font-bold">{{ store.workerName(receipt.workerId) }}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">الفترة:</span>
                <span class="tabular-nums">{{ store.digits(receipt.from) }} إلى {{ store.digits(receipt.to) }}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">عدد الأيام والسهرات:</span>
                <span class="tabular-nums">{{ store.num(receipt.days) }} يومية · {{ store.num(receipt.nights) }} سهرة</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">إجمالي الأجور:</span>
                <span class="font-bold tabular-nums">{{ store.money(receipt.grossWages) }}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">السلف المخصومة:</span>
                <span class="font-bold tabular-nums text-rose-600">{{ store.money(receipt.advancesDeducted) }}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">الخصومات والجزاءات:</span>
                <span class="font-bold tabular-nums text-rose-600">{{ store.money(receipt.deductionsDeducted || 0) }}</span>
              </div>
              <div class="flex justify-between py-2.5 bg-slate-100 dark:bg-slate-800 px-3 rounded-xl">
                <span class="font-bold">الصافي المستلم:</span>
                <span class="font-extrabold tabular-nums text-emerald-600">{{ store.money(receipt.netPaid) }}</span>
              </div>
              @if (receipt.notes) {
                <p class="text-xs text-slate-500 pt-1">ملاحظات: {{ receipt.notes }}</p>
              }
            </div>

            <div class="pt-6 grid grid-cols-2 gap-4 text-center text-xs text-slate-400 border-t border-dashed border-slate-200 dark:border-slate-700">
              <div>توقيع المستلم (العامل)</div>
              <div>اعتماد {{ store.settings().companyName }}</div>
            </div>
          } @else {
            <div class="py-12 text-center text-xs text-slate-400">
              اختر تسوية محفوظة لمعاينة وطباعة إيصال القبض الرسمي.
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class SettlementsPage {
  readonly store = inject(StoreService);

  readonly selectedWorkerId = signal<number>(1);
  readonly fromDate = signal<string>(this.store.payday15Info().from);
  readonly toDate = signal<string>(this.store.payday15Info().to);
  readonly settlementNotes = signal<string>('قبض دورة يوم 15');
  readonly selectedReceipt = signal<Settlement | null>(null);

  readonly collectivePayrollRows = computed(() => {
    const from = this.fromDate();
    const to = this.toDate();
    const att = this.store.attendances();
    const adv = this.store.advances();
    const ec = this.store.extraCashes();
    const ex = this.store.extras();
    const ded = this.store.deductions();

    return this.store.activeWorkers().map((worker: Worker) => ({
      worker,
      calc: calculateSettlement(worker, from, to, att, adv, ec, ex, ded),
    }));
  });

  readonly collectiveTotals = computed(() => {
    const rows = this.collectivePayrollRows();
    return {
      grossWages: rows.reduce((s, r) => s + r.calc.grossWages, 0),
      advancesDeducted: rows.reduce((s, r) => s + r.calc.advancesDeducted, 0),
      deductionsDeducted: rows.reduce((s, r) => s + r.calc.deductionsDeducted, 0),
      netPaid: rows.reduce((s, r) => s + r.calc.netPaid, 0),
    };
  });

  readonly preview = computed(() => {
    const worker =
      this.store.workers().find((w) => w.id === this.selectedWorkerId()) ||
      this.store.workers()[0];
    if (!worker) return null;

    return calculateSettlement(
      worker,
      this.fromDate(),
      this.toDate(),
      this.store.attendances(),
      this.store.advances(),
      this.store.extraCashes(),
      this.store.extras(),
      this.store.deductions()
    );
  });

  applyPayday15Cycle(): void {
    const info = this.store.payday15Info();
    this.fromDate.set(info.from);
    this.toDate.set(info.to);
    this.settlementNotes.set('قبض دورة يوم 15 في الشهر');
    this.store.showToast(
      `تم ضبط الفترة على دورة قبض يوم 15 (${info.from} إلى ${info.to})`,
      'success'
    );
  }

  async settleAllWorkersForPeriod(): Promise<void> {
    const rows = this.collectivePayrollRows().filter(
      (r) =>
        r.calc.grossWages > 0 ||
        r.calc.unsettledAdvanceIds.length > 0 ||
        r.calc.unsettledDeductionIds.length > 0
    );
    if (rows.length === 0) {
      this.store.showToast('لا توجد مستحقات أو حركات مفتوحة لتسويتها في هذه الفترة', 'warning');
      return;
    }

    for (const row of rows) {
      await this.store.createSettlement(
        {
          workerId: row.worker.id!,
          from: this.fromDate(),
          to: this.toDate(),
          days: row.calc.days,
          nights: row.calc.nights,
          grossWages: row.calc.grossWages,
          advancesDeducted: row.calc.advancesDeducted,
          deductionsDeducted: row.calc.deductionsDeducted,
          netPaid: row.calc.netPaid,
          date: this.store.todayIso(),
          notes: this.settlementNotes() || 'قبض جماعي يوم 15',
        },
        row.calc.unsettledAdvanceIds,
        row.calc.unsettledDeductionIds
      );
    }
    this.store.showToast(`تم اعتماد وصرف قبض ${rows.length} عامل/نحات بنجاح`, 'success');
  }

  async saveAndCloseAdvances(): Promise<void> {
    const calc = this.preview();
    const worker =
      this.store.workers().find((w) => w.id === this.selectedWorkerId()) ||
      this.store.workers()[0];
    if (!calc || !worker?.id) return;

    const id = await this.store.createSettlement(
      {
        workerId: worker.id,
        from: this.fromDate(),
        to: this.toDate(),
        days: calc.days,
        nights: calc.nights,
        grossWages: calc.grossWages,
        advancesDeducted: calc.advancesDeducted,
        deductionsDeducted: calc.deductionsDeducted,
        netPaid: calc.netPaid,
        date: this.store.todayIso(),
        notes: this.settlementNotes(),
      },
      calc.unsettledAdvanceIds,
      calc.unsettledDeductionIds
    );

    const created = this.store.settlements().find((s) => s.id === id) || null;
    this.selectedReceipt.set(created);
    this.settlementNotes.set('');
  }

  printReceipt(): void {
    window.print();
  }
}
