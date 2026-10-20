import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import {
  Attendance,
  Worker,
  Advance,
  Deduction,
  Expense,
  CheckItem,
  Extract,
  ExpenseCategory,
  CheckStatus,
  CheckDirection,
  DeductionMode,
} from '../../core/db/models';
import {
  formatCurrency,
  formatNumber,
  toArabicDigits,
} from '../../core/calc/calculations';

export type ExcelSheetTab =
  | 'attendance'
  | 'workers'
  | 'advances'
  | 'expenses'
  | 'checks'
  | 'extracts'
  | 'master';

@Component({
  selector: 'app-live-excel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="space-y-4">
      <!-- EXCEL TOP APPLICATION BAR & WORKBOOK BRANDING -->
      <div
        class="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden"
      >
        <!-- Microsoft Excel Styled Ribbon Header -->
        <div
          class="bg-[#107c41] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center font-bold text-xl shadow-inner shrink-0"
            >
              <mat-icon class="!text-2xl !w-6 !h-6">grid_on</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-base lg:text-lg font-black tracking-tight">
                  شيت إكسيل الموقع المباشر (Live Excel Studio)
                </h1>
                <span
                  class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/40 text-emerald-100 border border-emerald-300/30 flex items-center gap-1.5"
                >
                  <span
                    class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                  ></span>
                  <span>مزامنة مباشرة مع الداتا بيز والمشاريع</span>
                </span>
              </div>
              <p class="text-xs text-white/80 font-medium">
                سجل وعدّل كل تفاصيل الموقع (اليوميات، العمال، السلف، المصاريف،
                الشيكات) مباشرة وكأنك داخل إكسيل
              </p>
            </div>
          </div>

          <!-- Quick Action Buttons in Ribbon -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              (click)="downloadRealExcel()"
              class="px-3.5 py-1.5 rounded-xl bg-white text-[#107c41] hover:bg-emerald-50 text-xs font-black flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
              title="تصدير الشيت الحالي كملف إكسيل حقيقي .xlsx"
            >
              <mat-icon class="!text-base !w-4 !h-4">file_download</mat-icon>
              <span>تحميل Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              (click)="copySheetAsTsv()"
              class="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 cursor-pointer"
              title="نسخ بيانات الجدول الحالي لتلصقها مباشرة في برنامج إكسيل أو Google Sheets"
            >
              <mat-icon class="!text-base !w-4 !h-4">content_copy</mat-icon>
              <span>نسخ كـ Excel</span>
            </button>

            <button
              type="button"
              (click)="triggerPrint()"
              class="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 cursor-pointer"
              title="طباعة جدول الشيت الحالي"
            >
              <mat-icon class="!text-base !w-4 !h-4">print</mat-icon>
              <span>طباعة</span>
            </button>

            <button
              type="button"
              (click)="store.undoLastOperation()"
              class="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center border border-white/20 cursor-pointer"
              title="تراجع عن آخر حركة"
            >
              <mat-icon class="!text-base !w-4 !h-4">undo</mat-icon>
            </button>
          </div>
        </div>

        <!-- Toolbar & Filter Zone -->
        <div
          class="p-3 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <!-- Left: Search and Filters -->
          <div class="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
            <!-- Search Box -->
            <div class="relative flex-1 min-w-[180px] max-w-xs">
              <mat-icon
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] !text-base !w-4 !h-4 pointer-events-none"
              >
                search
              </mat-icon>
              <input
                type="text"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
                placeholder="بحث فوري في كل الخلايا..."
                class="w-full pr-8 pl-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-heading)] placeholder:text-[var(--text-secondary)]/70 focus:outline-none focus:ring-1 focus:ring-[#107c41]"
              />
              @if (searchQuery()) {
                <button
                  type="button"
                  (click)="searchQuery.set('')"
                  class="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-rose-500"
                >
                  <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                </button>
              }
            </div>

            <!-- Project Filter -->
            <div class="flex items-center gap-1.5">
              <span class="text-[var(--text-secondary)] font-bold">المشروع:</span>
              <select
                [value]="selectedProjectId() === null ? '' : selectedProjectId()"
                (change)="onProjectFilterChange($any($event.target).value)"
                class="px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-heading)] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#107c41]"
              >
                <option value="">كل المشاريع (الكل)</option>
                @for (p of store.projects(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>

            <!-- Date / Month Filter -->
            <div class="flex items-center gap-1.5">
              <span class="text-[var(--text-secondary)] font-bold">الشهر:</span>
              <input
                type="month"
                [value]="filterMonth()"
                (input)="filterMonth.set($any($event.target).value)"
                class="px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-heading)] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#107c41]"
              />
              @if (filterMonth()) {
                <button
                  type="button"
                  (click)="filterMonth.set('')"
                  class="text-[10px] text-rose-600 hover:underline font-bold"
                >
                  إلغاء
                </button>
              }
            </div>
          </div>

          <!-- Right: Add Row Button -->
          <div class="flex items-center gap-2">
            @if (activeTab() !== 'master') {
              <button
                type="button"
                (click)="addNewRowToActiveSheet()"
                class="px-3.5 py-1.5 rounded-xl bg-[#107c41] hover:bg-[#0c5c30] text-white font-extrabold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
              >
                <mat-icon class="!text-base !w-4 !h-4">add_circle</mat-icon>
                <span>➕ إضافة صف جديد مباشر</span>
              </button>
            }

            <span
              class="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono font-bold"
            >
              عدد الصفوف: {{ currentFilteredCount() }}
            </span>
          </div>
        </div>

        <!-- FORMULA BAR (شريط الدوال والمعادلات fx مثل إكسيل) -->
        <div
          class="px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] flex items-center gap-2.5 text-xs font-mono"
        >
          <div
            class="px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[#107c41] font-black min-w-[55px] text-center shrink-0"
          >
            {{ selectedCellLabel() }}
          </div>
          <div class="flex items-center gap-1 text-[var(--text-secondary)] font-bold italic shrink-0">
            <span class="text-sm font-serif font-black text-[#107c41]">fx</span>
          </div>
          <input
            type="text"
            [value]="activeFormulaValue()"
            (input)="onFormulaBarInput($any($event.target).value)"
            placeholder="محتوى الخلية المحددة أو اختر خلية للتعديل المباشر عليها..."
            class="flex-1 px-3 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-heading)] font-sans focus:outline-none focus:ring-1 focus:ring-[#107c41]"
          />

          <!-- Quick Math Formula Chips -->
          <div class="hidden sm:flex items-center gap-1.5 font-sans font-bold text-[11px] text-[var(--text-secondary)]">
            <span class="text-[10px] text-[var(--text-secondary)] font-normal">دوال سريعة:</span>
            <span
              class="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
              title="إجمالي المجموع"
            >
              SUM: {{ formatMoney(activeSheetSum()) }}
            </span>
            <span
              class="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
              title="المتوسط الحسابي"
            >
              AVG: {{ formatMoney(activeSheetAvg()) }}
            </span>
            <span
              class="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
              title="العدد الإجمالي"
            >
              COUNT: {{ currentFilteredCount() }}
            </span>
          </div>
        </div>

        <!-- WORKBOOK SHEET TABS (شريط التبويبات السفلي مثل شيتات إكسيل الحقيقية) -->
        <div
          class="px-3 pt-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            (click)="setActiveTab('attendance')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'attendance'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">fact_check</mat-icon>
            <span>📅 1. سجل اليوميات والحضور</span>
            <span class="excel-tab-badge">{{ store.attendances().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('workers')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'workers'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">groups</mat-icon>
            <span>👷 2. العمال والنحاتية واليوميات</span>
            <span class="excel-tab-badge">{{ store.workers().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('advances')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'advances'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">payments</mat-icon>
            <span>💸 3. السلف والخصومات</span>
            <span class="excel-tab-badge">{{ store.advances().length + store.deductions().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('expenses')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'expenses'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">receipt_long</mat-icon>
            <span>🏗️ 4. مصاريف الموقع والتشغيل</span>
            <span class="excel-tab-badge">{{ store.expenses().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('checks')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'checks'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">account_balance</mat-icon>
            <span>🏢 5. الشيكات وحسابات البنك</span>
            <span class="excel-tab-badge">{{ store.checks().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('extracts')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'extracts'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">receipt</mat-icon>
            <span>📑 6. مستخلصات المشاريع</span>
            <span class="excel-tab-badge">{{ store.extracts().length }}</span>
          </button>

          <button
            type="button"
            (click)="setActiveTab('master')"
            class="excel-tab-btn"
            [class.excel-tab-active]="activeTab() === 'master'"
          >
            <mat-icon class="!text-sm !w-4 !h-4">analytics</mat-icon>
            <span>📊 7. ميزان المراجعة والأرباح</span>
          </button>
        </div>

        <!-- LIVE EDITABLE SPREADSHEET GRID CONTAINER -->
        <div class="overflow-x-auto min-h-[420px] max-h-[700px] border-b border-[var(--border-subtle)] bg-white dark:bg-[#111827]">
          
          <!-- TAB 1: ATTENDANCE SHEET -->
          @if (activeTab() === 'attendance') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-32">A. التاريخ</th>
                  <th class="min-w-[150px]">B. اسم العامل / النحات</th>
                  <th class="w-28">C. المهنة</th>
                  <th class="min-w-[140px]">D. المشروع</th>
                  <th class="w-24 text-center">E. نهارية</th>
                  <th class="w-24 text-center">F. سهرة</th>
                  <th class="w-28 text-left">G. يومية نهار (ج.م)</th>
                  <th class="w-28 text-left">H. يومية سهرة (ج.م)</th>
                  <th class="w-28 text-left bg-emerald-50 dark:bg-emerald-950/20 text-[#107c41]">I. استحقاق العامل</th>
                  <th class="w-28 text-left bg-blue-50 dark:bg-blue-950/20 text-blue-600">J. استحقاق الشركة</th>
                  <th class="min-w-[150px]">K. ملاحظات</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (item of filteredAttendances(); track (item.id || $index); let idx = $index) {
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    [class.excel-row-selected]="selectedRowId() === item.id"
                    (click)="selectCell('A' + (idx + 1), item.date, item.id)"
                  >
                    <!-- Row Number -->
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">
                      {{ idx + 1 }}
                    </td>

                    <!-- A. Date -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="item.date"
                        (change)="updateAttendanceField(item, 'date', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- B. Worker -->
                    <td class="excel-cell">
                      <select
                        [value]="item.workerId"
                        (change)="updateAttendanceField(item, 'workerId', +$any($event.target).value)"
                        class="excel-select w-full font-bold text-[var(--text-heading)]"
                      >
                        @for (w of store.workers(); track w.id) {
                          <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
                        }
                      </select>
                    </td>

                    <!-- C. Role (Calculated snapshot) -->
                    <td class="excel-cell text-[var(--text-secondary)] font-medium">
                      {{ getWorkerRole(item.workerId) }}
                    </td>

                    <!-- D. Project -->
                    <td class="excel-cell">
                      <select
                        [value]="item.projectId"
                        (change)="updateAttendanceField(item, 'projectId', +$any($event.target).value)"
                        class="excel-select w-full"
                      >
                        @for (p of store.projects(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- E. Day Worked -->
                    <td class="excel-cell text-center">
                      <select
                        [value]="item.dayWorked"
                        (change)="updateAttendanceField(item, 'dayWorked', +$any($event.target).value)"
                        class="excel-select text-center font-bold"
                        [class.text-emerald-600]="item.dayWorked === 1"
                        [class.text-rose-500]="item.dayWorked === 0"
                      >
                        <option [value]="1">حاضر (1)</option>
                        <option [value]="0">غياب (0)</option>
                      </select>
                    </td>

                    <!-- F. Night Worked -->
                    <td class="excel-cell text-center">
                      <select
                        [value]="item.nightWorked"
                        (change)="updateAttendanceField(item, 'nightWorked', +$any($event.target).value)"
                        class="excel-select text-center font-bold"
                        [class.text-indigo-600]="item.nightWorked === 1"
                        [class.text-gray-400]="item.nightWorked === 0"
                      >
                        <option [value]="1">سهرة (1)</option>
                        <option [value]="0">بدون (0)</option>
                      </select>
                    </td>

                    <!-- G. Worker Day Rate Snapshot -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="item.workerDayRateSnapshot"
                        (blur)="updateAttendanceField(item, 'workerDayRateSnapshot', +$any($event.target).value)"
                        class="excel-input text-left font-mono w-full"
                      />
                    </td>

                    <!-- H. Worker Night Rate Snapshot -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="item.workerNightRateSnapshot"
                        (blur)="updateAttendanceField(item, 'workerNightRateSnapshot', +$any($event.target).value)"
                        class="excel-input text-left font-mono w-full"
                      />
                    </td>

                    <!-- I. Worker Gross Wages (Calculated Formula) -->
                    <td class="excel-cell text-left font-mono font-bold bg-emerald-50/50 dark:bg-emerald-950/20 text-[#107c41]">
                      {{ formatMoney(item.dayWorked * item.workerDayRateSnapshot + item.nightWorked * item.workerNightRateSnapshot) }}
                    </td>

                    <!-- J. Company Gross (Calculated Formula) -->
                    <td class="excel-cell text-left font-mono font-bold bg-blue-50/50 dark:bg-blue-950/20 text-blue-600">
                      {{ formatMoney(item.dayWorked * item.companyDayRateSnapshot + item.nightWorked * item.companyNightRateSnapshot) }}
                    </td>

                    <!-- K. Notes -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="item.note"
                        (blur)="updateAttendanceField(item, 'note', $any($event.target).value)"
                        placeholder="ملاحظات..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Actions -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteAttendanceRow(item)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="حذف هذا الصف من اليوميات"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="13" class="p-8 text-center text-[var(--text-secondary)]">
                      لا توجد يوميات مسجلة تطابق التصفية. اضغط على <b>➕ إضافة صف جديد</b> لتسجيل يومية مباشرة في الشيت.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 2: WORKERS SHEET -->
          @if (activeTab() === 'workers') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-20">A. كود</th>
                  <th class="min-w-[160px]">B. اسم العامل / النحات</th>
                  <th class="w-32">C. الصنعة / الدور</th>
                  <th class="w-28 text-left">D. يومية نهار (ج.م)</th>
                  <th class="w-28 text-left">E. يومية سهرة (ج.م)</th>
                  <th class="w-32">F. رقم التليفون</th>
                  <th class="w-24 text-center">G. الحالة</th>
                  <th class="w-28 text-left bg-emerald-50 dark:bg-emerald-950/20 text-[#107c41]">H. إجمالي الاستحقاق</th>
                  <th class="w-28 text-left bg-rose-50 dark:bg-rose-950/20 text-rose-600">I. إجمالي السلف</th>
                  <th class="w-28 text-left bg-blue-50 dark:bg-blue-950/20 text-blue-600">J. صافي المتبقي للقبض</th>
                  <th class="min-w-[150px]">K. ملاحظات</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (w of filteredWorkers(); track (w.id || $index); let idx = $index) {
                  @let stat = getWorkerSummary(w.id || 0);
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    [class.excel-row-selected]="selectedRowId() === w.id"
                    (click)="selectCell('B' + (idx + 1), w.name, w.id)"
                  >
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    
                    <!-- A. ID -->
                    <td class="excel-cell font-mono text-gray-400 font-bold">#{{ w.id }}</td>

                    <!-- B. Name -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="w.name"
                        (blur)="updateWorkerField(w, 'name', $any($event.target).value)"
                        class="excel-input font-bold text-[var(--text-heading)] w-full"
                      />
                    </td>

                    <!-- C. Role -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="w.role"
                        (blur)="updateWorkerField(w, 'role', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- D. Day Rate -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="w.workerDayRate"
                        (blur)="updateWorkerField(w, 'workerDayRate', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold w-full"
                      />
                    </td>

                    <!-- E. Night Rate -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="w.workerNightRate"
                        (blur)="updateWorkerField(w, 'workerNightRate', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold w-full"
                      />
                    </td>

                    <!-- F. Phone -->
                    <td class="excel-cell font-mono">
                      <input
                        type="text"
                        [value]="w.phone"
                        (blur)="updateWorkerField(w, 'phone', $any($event.target).value)"
                        placeholder="01xxxxxxxxx"
                        class="excel-input font-mono w-full"
                      />
                    </td>

                    <!-- G. Active -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="updateWorkerField(w, 'active', !w.active)"
                        class="px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                        [class.bg-emerald-100]="w.active"
                        [class.text-emerald-800]="w.active"
                        [class.bg-gray-100]="!w.active"
                        [class.text-gray-600]="!w.active"
                      >
                        {{ w.active ? 'نشط' : 'إجازة' }}
                      </button>
                    </td>

                    <!-- H. Gross -->
                    <td class="excel-cell text-left font-mono font-bold bg-emerald-50/50 dark:bg-emerald-950/20 text-[#107c41]">
                      {{ formatMoney(stat.gross) }}
                    </td>

                    <!-- I. Advances -->
                    <td class="excel-cell text-left font-mono font-bold bg-rose-50/50 dark:bg-rose-950/20 text-rose-600">
                      {{ formatMoney(stat.advances) }}
                    </td>

                    <!-- J. Net -->
                    <td class="excel-cell text-left font-mono font-black bg-blue-50/50 dark:bg-blue-950/20 text-blue-700">
                      {{ formatMoney(stat.net) }}
                    </td>

                    <!-- K. Notes -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="w.notes"
                        (blur)="updateWorkerField(w, 'notes', $any($event.target).value)"
                        placeholder="ملاحظات..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Action -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteWorkerRow(w)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف العامل"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 3: ADVANCES & DEDUCTIONS SHEET -->
          @if (activeTab() === 'advances') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-32">A. التاريخ</th>
                  <th class="min-w-[150px]">B. اسم العامل</th>
                  <th class="w-28 text-center">C. النوع</th>
                  <th class="w-32 text-left">D. المبلغ (ج.م)</th>
                  <th class="min-w-[140px]">E. المشروع</th>
                  <th class="min-w-[180px]">F. السبب والبيان</th>
                  <th class="w-28">G. الشيك المصروف منه</th>
                  <th class="min-w-[140px]">H. ملاحظات</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (adv of filteredAdvances(); track (adv.id || $index); let idx = $index) {
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    (click)="selectCell('D' + (idx + 1), adv.amount + '', adv.id)"
                  >
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    
                    <!-- A. Date -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="adv.date"
                        (change)="updateAdvanceField(adv, 'date', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- B. Worker -->
                    <td class="excel-cell">
                      <select
                        [value]="adv.workerId"
                        (change)="updateAdvanceField(adv, 'workerId', +$any($event.target).value)"
                        class="excel-select w-full font-bold text-[var(--text-heading)]"
                      >
                        @for (w of store.workers(); track w.id) {
                          <option [value]="w.id">{{ w.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- C. Type -->
                    <td class="excel-cell text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        سلفة نقدية
                      </span>
                    </td>

                    <!-- D. Amount -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="adv.amount"
                        (blur)="updateAdvanceField(adv, 'amount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold text-rose-600 w-full"
                      />
                    </td>

                    <!-- E. Project -->
                    <td class="excel-cell">
                      <select
                        [value]="adv.projectId || ''"
                        (change)="updateAdvanceField(adv, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                        class="excel-select w-full"
                      >
                        <option value="">بدون مشروع محدد</option>
                        @for (p of store.projects(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- F. Reason -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="adv.reason"
                        (blur)="updateAdvanceField(adv, 'reason', $any($event.target).value)"
                        placeholder="سبب السلفة..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- G. Check -->
                    <td class="excel-cell">
                      <select
                        [value]="adv.checkId || ''"
                        (change)="updateAdvanceField(adv, 'checkId', $any($event.target).value ? +$any($event.target).value : null)"
                        class="excel-select w-full text-[11px]"
                      >
                        <option value="">من الكاش الحر / الخزنة</option>
                        @for (c of store.checks(); track c.id) {
                          <option [value]="c.id">شيك {{ c.number }} ({{ formatMoney(c.amount) }})</option>
                        }
                      </select>
                    </td>

                    <!-- H. Notes -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="adv.notes"
                        (blur)="updateAdvanceField(adv, 'notes', $any($event.target).value)"
                        placeholder="ملاحظات..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Actions -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteAdvanceRow(adv)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف السلفة"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 4: SITE EXPENSES SHEET -->
          @if (activeTab() === 'expenses') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-32">A. التاريخ</th>
                  <th class="w-36">B. بند المصروف</th>
                  <th class="w-32 text-left">C. المبلغ (ج.م)</th>
                  <th class="min-w-[140px]">D. المشروع التابع له</th>
                  <th class="w-36">E. الشيك أو جهة الصرف</th>
                  <th class="min-w-[200px]">F. البيان والتفاصيل</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (exp of filteredExpenses(); track (exp.id || $index); let idx = $index) {
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    (click)="selectCell('C' + (idx + 1), exp.amount + '', exp.id)"
                  >
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    
                    <!-- A. Date -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="exp.date"
                        (change)="updateExpenseField(exp, 'date', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- B. Category -->
                    <td class="excel-cell">
                      <select
                        [value]="exp.category"
                        (change)="updateExpenseField(exp, 'category', $any($event.target).value)"
                        class="excel-select w-full font-bold"
                      >
                        <option value="مواصلات">مواصلات وانتقالات</option>
                        <option value="أكل">أكل وبوفيه</option>
                        <option value="أدوات">عدد وأدوات</option>
                        <option value="صيانة">صيانة وإصلاحات</option>
                        <option value="رسوم سحب شيك">رسوم سحب شيك بنكي</option>
                        <option value="أخرى">مصاريف أخرى</option>
                      </select>
                    </td>

                    <!-- C. Amount -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="exp.amount"
                        (blur)="updateExpenseField(exp, 'amount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold text-rose-600 w-full"
                      />
                    </td>

                    <!-- D. Project -->
                    <td class="excel-cell">
                      <select
                        [value]="exp.projectId || ''"
                        (change)="updateExpenseField(exp, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                        class="excel-select w-full"
                      >
                        <option value="">عام لكافة المشاريع</option>
                        @for (p of store.projects(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- E. Check ID -->
                    <td class="excel-cell">
                      <select
                        [value]="exp.checkId || ''"
                        (change)="updateExpenseField(exp, 'checkId', $any($event.target).value ? +$any($event.target).value : null)"
                        class="excel-select w-full text-[11px]"
                      >
                        <option value="">الخزنة / كاش شخصي</option>
                        @for (c of store.checks(); track c.id) {
                          <option [value]="c.id">شيك {{ c.number }} ({{ c.bank }})</option>
                        }
                      </select>
                    </td>

                    <!-- F. Note -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="exp.note"
                        (blur)="updateExpenseField(exp, 'note', $any($event.target).value)"
                        placeholder="تفاصيل المصروف..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Action -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteExpenseRow(exp)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف المصروف"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 5: CHECKS & BANK SHEET -->
          @if (activeTab() === 'checks') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-24 text-center">A. الاتجاه</th>
                  <th class="w-32">B. رقم الشيك</th>
                  <th class="w-36">C. البنك / الفرع</th>
                  <th class="w-32">D. تاريخ الاستحقاق</th>
                  <th class="w-32 text-left bg-emerald-50 dark:bg-emerald-950/20 text-[#107c41]">E. قيمة الشيك (ج.م)</th>
                  <th class="w-28 text-center">F. الحالة</th>
                  <th class="w-32 text-left bg-amber-50 dark:bg-amber-950/20 text-amber-700">G. المسحوب كاش (سلف)</th>
                  <th class="w-32 text-left bg-blue-50 dark:bg-blue-950/20 text-blue-700">H. باقي في حساب البنك</th>
                  <th class="w-32 text-left bg-purple-50 dark:bg-purple-950/20 text-purple-700">I. باقي كاش في الجيب</th>
                  <th class="min-w-[140px]">J. المشروع</th>
                  <th class="min-w-[150px]">K. ملاحظات</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (c of filteredChecks(); track (c.id || $index); let idx = $index) {
                  @let bankRem = (c.amount || 0) - (c.withdrawnAmount || 0);
                  @let pocketRem = getCheckPocketRemaining(c);
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    (click)="selectCell('E' + (idx + 1), c.amount + '', c.id)"
                  >
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    
                    <!-- A. Direction -->
                    <td class="excel-cell text-center">
                      <select
                        [value]="c.direction"
                        (change)="updateCheckField(c, 'direction', $any($event.target).value)"
                        class="excel-select text-center font-bold"
                      >
                        <option value="وارد">وارد (من شركة)</option>
                        <option value="صادر">صادر</option>
                      </select>
                    </td>

                    <!-- B. Number -->
                    <td class="excel-cell font-mono font-bold">
                      <input
                        type="text"
                        [value]="c.number"
                        (blur)="updateCheckField(c, 'number', $any($event.target).value)"
                        placeholder="رقم الشيك..."
                        class="excel-input font-mono font-bold w-full"
                      />
                    </td>

                    <!-- C. Bank -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="c.bank"
                        (blur)="updateCheckField(c, 'bank', $any($event.target).value)"
                        placeholder="اسم البنك..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- D. Due Date -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="c.dueDate"
                        (change)="updateCheckField(c, 'dueDate', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- E. Amount -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="c.amount"
                        (blur)="updateCheckField(c, 'amount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-black text-[#107c41] w-full"
                      />
                    </td>

                    <!-- F. Status -->
                    <td class="excel-cell text-center">
                      <select
                        [value]="c.status"
                        (change)="updateCheckField(c, 'status', $any($event.target).value)"
                        class="excel-select text-center font-bold"
                        [class.text-emerald-700]="c.status === 'اتصرف'"
                        [class.text-amber-600]="c.status === 'معلق'"
                        [class.text-rose-600]="c.status === 'مرتجع'"
                      >
                        <option value="اتصرف">اتصرف في البنك</option>
                        <option value="معلق">معلق</option>
                        <option value="مرتجع">مرتجع</option>
                      </select>
                    </td>

                    <!-- G. Withdrawn Cash -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="c.withdrawnAmount || 0"
                        (blur)="updateCheckField(c, 'withdrawnAmount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold text-amber-700 w-full"
                      />
                    </td>

                    <!-- H. Remaining in Bank (Formula E - G) -->
                    <td class="excel-cell text-left font-mono font-bold bg-blue-50/50 dark:bg-blue-950/20 text-blue-700">
                      {{ formatMoney(bankRem) }}
                    </td>

                    <!-- I. Remaining in Pocket (Formula G - advances - fees) -->
                    <td class="excel-cell text-left font-mono font-black bg-purple-50/50 dark:bg-purple-950/20 text-purple-700">
                      {{ formatMoney(pocketRem) }}
                    </td>

                    <!-- J. Project -->
                    <td class="excel-cell">
                      <select
                        [value]="c.projectId || ''"
                        (change)="updateCheckField(c, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                        class="excel-select w-full"
                      >
                        <option value="">عام للمقاول</option>
                        @for (p of store.projects(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- K. Notes -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="c.notes"
                        (blur)="updateCheckField(c, 'notes', $any($event.target).value)"
                        placeholder="ملاحظات..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Action -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteCheckRow(c)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف الشيك"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 6: EXTRACTS SHEET -->
          @if (activeTab() === 'extracts') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="w-24 font-mono">A. رقم المستخلص</th>
                  <th class="min-w-[150px]">B. المشروع</th>
                  <th class="w-32">C. الفترة من</th>
                  <th class="w-32">D. الفترة إلى</th>
                  <th class="w-32 text-left">E. إجمالي المطالبة (ج.م)</th>
                  <th class="w-32 text-left">F. الاستقطاعات (ج.م)</th>
                  <th class="w-32 text-left bg-emerald-50 dark:bg-emerald-950/20 text-[#107c41]">G. الصافي المحصل (ج.م)</th>
                  <th class="min-w-[160px]">H. ملاحظات</th>
                  <th class="w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                @for (ext of filteredExtracts(); track (ext.id || $index); let idx = $index) {
                  <tr
                    class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                    (click)="selectCell('E' + (idx + 1), (ext.claimedAmount || 0) + '', ext.id)"
                  >
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    
                    <!-- A. Number -->
                    <td class="excel-cell font-mono font-bold">
                      <input
                        type="number"
                        [value]="ext.number"
                        (blur)="updateExtractField(ext, 'number', +$any($event.target).value)"
                        class="excel-input font-mono font-bold w-full"
                      />
                    </td>

                    <!-- B. Project -->
                    <td class="excel-cell">
                      <select
                        [value]="ext.projectId"
                        (change)="updateExtractField(ext, 'projectId', +$any($event.target).value)"
                        class="excel-select w-full font-bold"
                      >
                        @for (p of store.projects(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>

                    <!-- C. From -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="ext.from"
                        (change)="updateExtractField(ext, 'from', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- D. To -->
                    <td class="excel-cell">
                      <input
                        type="date"
                        [value]="ext.to"
                        (change)="updateExtractField(ext, 'to', $any($event.target).value)"
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- E. Claimed -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="ext.claimedAmount || 0"
                        (blur)="updateExtractField(ext, 'claimedAmount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold w-full"
                      />
                    </td>

                    <!-- F. Deductions -->
                    <td class="excel-cell text-left font-mono">
                      <input
                        type="number"
                        [value]="ext.deductions || 0"
                        (blur)="updateExtractField(ext, 'deductions', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-bold text-rose-600 w-full"
                      />
                    </td>

                    <!-- G. Paid Net -->
                    <td class="excel-cell text-left font-mono font-black bg-emerald-50/50 dark:bg-emerald-950/20 text-[#107c41]">
                      <input
                        type="number"
                        [value]="ext.paidAmount || 0"
                        (blur)="updateExtractField(ext, 'paidAmount', +$any($event.target).value)"
                        class="excel-input text-left font-mono font-black text-[#107c41] w-full"
                      />
                    </td>

                    <!-- H. Notes -->
                    <td class="excel-cell">
                      <input
                        type="text"
                        [value]="ext.notes"
                        (blur)="updateExtractField(ext, 'notes', $any($event.target).value)"
                        placeholder="ملاحظات المستخلص..."
                        class="excel-input w-full"
                      />
                    </td>

                    <!-- Action -->
                    <td class="excel-cell text-center">
                      <button
                        type="button"
                        (click)="deleteExtractRow(ext)"
                        class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="حذف المستخلص"
                      >
                        <mat-icon class="!text-sm !w-4 !h-4">delete</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

          <!-- TAB 7: MASTER AUDIT & PROFIT SUMMARY SHEET -->
          @if (activeTab() === 'master') {
            <table class="excel-table w-full text-right text-xs border-collapse">
              <thead>
                <tr class="excel-col-header">
                  <th class="w-12 text-center">#</th>
                  <th class="min-w-[160px]">A. اسم المشروع</th>
                  <th class="w-32 text-left bg-blue-50 dark:bg-blue-950/20 text-blue-700">B. إجمالي المستخلصات (ج.م)</th>
                  <th class="w-32 text-left bg-emerald-50 dark:bg-emerald-950/20 text-[#107c41]">C. إجمالي يوميات العمالة (ج.م)</th>
                  <th class="w-32 text-left bg-amber-50 dark:bg-amber-950/20 text-amber-700">D. إجمالي السلف والخصومات</th>
                  <th class="w-32 text-left bg-rose-50 dark:bg-rose-950/20 text-rose-700">E. مصاريف الموقع (ج.م)</th>
                  <th class="w-36 text-left bg-purple-50 dark:bg-purple-950/20 text-purple-700 font-black">F. صافي أرباح المقاول (ج.م)</th>
                  <th class="w-28 text-center">G. نسبة الربح %</th>
                  <th class="w-28 text-center">H. حالة المشروع</th>
                </tr>
              </thead>
              <tbody>
                @for (m of masterSummaryRows(); track m.projectId; let idx = $index) {
                  <tr class="excel-row hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10">
                    <td class="excel-cell-row-num text-center font-mono text-gray-400 select-none">{{ idx + 1 }}</td>
                    <td class="excel-cell font-bold text-[var(--text-heading)]">{{ m.projectName }}</td>
                    <td class="excel-cell text-left font-mono font-bold text-blue-700">{{ formatMoney(m.totalRevenue) }}</td>
                    <td class="excel-cell text-left font-mono font-bold text-[#107c41]">{{ formatMoney(m.totalLaborCost) }}</td>
                    <td class="excel-cell text-left font-mono font-bold text-amber-700">{{ formatMoney(m.totalAdvances) }}</td>
                    <td class="excel-cell text-left font-mono font-bold text-rose-700">{{ formatMoney(m.totalExpenses) }}</td>
                    <td class="excel-cell text-left font-mono font-black text-purple-800 text-sm">
                      {{ formatMoney(m.netProfit) }}
                    </td>
                    <td class="excel-cell text-center font-mono font-bold" [class.text-emerald-600]="m.profitMargin >= 15" [class.text-amber-600]="m.profitMargin < 15">
                      {{ m.profitMargin.toFixed(1) }}%
                    </td>
                    <td class="excel-cell text-center">
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold" [class.bg-emerald-100]="m.active" [class.text-emerald-800]="m.active" [class.bg-gray-100]="!m.active" [class.text-gray-600]="!m.active">
                        {{ m.active ? 'مشروع نشط' : 'مغلق' }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }

        </div>

        <!-- EXCEL STATUS / FORMULA SUMMARY FOOTER (شريط الحالة والملخص الحسابي مثل إكسيل) -->
        <div
          class="bg-[var(--bg-subtle)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)] font-medium"
        >
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1.5 font-bold text-[#107c41]">
              <mat-icon class="!text-sm !w-4 !h-4">check_circle</mat-icon>
              <span>جاهز (جاهز للتعديل المباشر في أي خلية)</span>
            </span>
            <span class="text-gray-300 dark:text-gray-700">|</span>
            <span class="text-[11px]">
              اضغط على أي خلية للتعديل، يتم الحفظ فورياً في النظام وقاعدة البيانات
            </span>
          </div>

          <!-- Real-Time Column Aggregate Pills (SUM, AVERAGE, COUNT) -->
          <div class="flex items-center gap-3 font-mono font-bold">
            <div class="bg-[var(--bg-card)] px-3 py-1 rounded-md border border-[var(--border-subtle)] shadow-2xs">
              <span class="text-gray-400 font-sans text-[10px]">العدد (COUNT): </span>
              <span class="text-[var(--text-heading)]">{{ currentFilteredCount() }}</span>
            </div>
            <div class="bg-[var(--bg-card)] px-3 py-1 rounded-md border border-[var(--border-subtle)] shadow-2xs">
              <span class="text-gray-400 font-sans text-[10px]">المجموع (SUM): </span>
              <span class="text-[#107c41]">{{ formatMoney(activeSheetSum()) }}</span>
            </div>
            <div class="bg-[var(--bg-card)] px-3 py-1 rounded-md border border-[var(--border-subtle)] shadow-2xs">
              <span class="text-gray-400 font-sans text-[10px]">المتوسط (AVERAGE): </span>
              <span class="text-blue-600">{{ formatMoney(activeSheetAvg()) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .excel-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 0.875rem;
      border-top-left-radius: 0.5rem;
      border-top-right-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-secondary);
      background-color: transparent;
      border-top: 2px solid transparent;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .excel-tab-btn:hover {
      background-color: var(--bg-card);
      color: var(--text-heading);
    }
    .excel-tab-active {
      background-color: #ffffff;
      color: #107c41 !important;
      border-top: 3px solid #107c41 !important;
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
    }
    :host-context(.dark) .excel-tab-active {
      background-color: #111827;
      color: #34d399 !important;
      border-top: 3px solid #34d399 !important;
    }
    .excel-tab-badge {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      border-radius: 9999px;
      background-color: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
    }
    .excel-table {
      border: 1px solid #e5e7eb;
    }
    :host-context(.dark) .excel-table {
      border-color: #374151;
    }
    .excel-col-header th {
      background-color: #f3f4f6;
      color: #374151;
      font-weight: 800;
      padding: 0.5rem 0.625rem;
      border: 1px solid #e5e7eb;
      user-select: none;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    :host-context(.dark) .excel-col-header th {
      background-color: #1f2937;
      color: #e5e7eb;
      border-color: #374151;
    }
    .excel-cell {
      padding: 0.25rem 0.5rem;
      border: 1px solid #e5e7eb;
      vertical-align: middle;
    }
    :host-context(.dark) .excel-cell {
      border-color: #374151;
    }
    .excel-cell-row-num {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      font-size: 0.7rem;
    }
    :host-context(.dark) .excel-cell-row-num {
      background-color: #111827;
      border-color: #374151;
    }
    .excel-row-selected td {
      background-color: #ecfdf5 !important;
    }
    :host-context(.dark) .excel-row-selected td {
      background-color: #064e3b !important;
    }
    .excel-input {
      background: transparent;
      border: none;
      padding: 0.25rem 0.375rem;
      border-radius: 0.25rem;
      color: inherit;
      width: 100%;
      font-size: inherit;
    }
    .excel-input:focus {
      outline: 2px solid #107c41;
      background-color: #ffffff;
    }
    :host-context(.dark) .excel-input:focus {
      background-color: #1f2937;
    }
    .excel-select {
      background: transparent;
      border: none;
      padding: 0.25rem 0.25rem;
      border-radius: 0.25rem;
      color: inherit;
      font-size: inherit;
      cursor: pointer;
    }
    .excel-select:focus {
      outline: 2px solid #107c41;
      background-color: #ffffff;
    }
    :host-context(.dark) .excel-select:focus {
      background-color: #1f2937;
    }
  `,
})
export class LiveExcelPage {
  readonly store = inject(StoreService);
  private readonly excel = inject(ExcelService);

  readonly activeTab = signal<ExcelSheetTab>('attendance');
  readonly searchQuery = signal<string>('');
  readonly selectedProjectId = signal<number | null>(null);
  readonly filterMonth = signal<string>('');

  // Selected cell & Formula bar state
  readonly selectedCellLabel = signal<string>('A1');
  readonly activeFormulaValue = signal<string>('');
  readonly selectedRowId = signal<number | null>(null);

  setActiveTab(tab: ExcelSheetTab): void {
    this.activeTab.set(tab);
    this.selectedCellLabel.set('A1');
    this.activeFormulaValue.set('');
    this.selectedRowId.set(null);
  }

  onProjectFilterChange(val: string): void {
    this.selectedProjectId.set(val === '' ? null : +val);
  }

  selectCell(cellRef: string, val: string, rowId?: number): void {
    this.selectedCellLabel.set(cellRef);
    this.activeFormulaValue.set(val);
    if (rowId !== undefined) {
      this.selectedRowId.set(rowId);
    }
  }

  onFormulaBarInput(newVal: string): void {
    this.activeFormulaValue.set(newVal);
  }

  formatMoney(n: number): string {
    return formatCurrency(n, this.store.settings().numeralMode);
  }

  getWorkerRole(workerId: number): string {
    const w = this.store.workers().find((x) => x.id === workerId);
    return w ? w.role : '-';
  }

  getWorkerSummary(workerId: number): { gross: number; advances: number; net: number } {
    let gross = 0;
    for (const a of this.store.attendances()) {
      if (a.workerId === workerId) {
        gross += a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot;
      }
    }
    let adv = 0;
    for (const d of this.store.advances()) {
      if (d.workerId === workerId) {
        adv += d.amount;
      }
    }
    return { gross, advances: adv, net: gross - adv };
  }

  getCheckPocketRemaining(check: CheckItem): number {
    const withdrawn = check.withdrawnAmount || 0;
    if (withdrawn <= 0) return 0;
    let adv = 0;
    for (const a of this.store.advances()) {
      if (a.checkId === check.id) {
        adv += a.amount;
      }
    }
    let exp = 0;
    for (const e of this.store.expenses()) {
      if (e.checkId === check.id) {
        exp += e.amount;
      }
    }
    return Math.max(0, withdrawn - adv - exp);
  }

  // Filtered queries for each sheet
  readonly filteredAttendances = computed(() => {
    let list = [...this.store.attendances()];
    const pid = this.selectedProjectId();
    if (pid !== null) {
      list = list.filter((a) => a.projectId === pid);
    }
    const m = this.filterMonth();
    if (m) {
      list = list.filter((a) => a.date.startsWith(m));
    }
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const wName = this.store.workerName(a.workerId).toLowerCase();
        const pName = this.store.projectName(a.projectId).toLowerCase();
        return wName.includes(q) || pName.includes(q) || a.date.includes(q) || (a.note || '').toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredWorkers = computed(() => {
    let list = [...this.store.workers()];
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.role.toLowerCase().includes(q) || (w.phone || '').includes(q));
    }
    return list;
  });

  readonly filteredAdvances = computed(() => {
    let list = [...this.store.advances()];
    const pid = this.selectedProjectId();
    if (pid !== null) {
      list = list.filter((a) => a.projectId === pid);
    }
    const m = this.filterMonth();
    if (m) {
      list = list.filter((a) => a.date.startsWith(m));
    }
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const wName = this.store.workerName(a.workerId).toLowerCase();
        return wName.includes(q) || a.date.includes(q) || (a.reason || '').toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredExpenses = computed(() => {
    let list = [...this.store.expenses()];
    const pid = this.selectedProjectId();
    if (pid !== null) {
      list = list.filter((e) => e.projectId === pid);
    }
    const m = this.filterMonth();
    if (m) {
      list = list.filter((e) => e.date.startsWith(m));
    }
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((e) => e.category.toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q) || e.date.includes(q));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredChecks = computed(() => {
    let list = [...this.store.checks()];
    const pid = this.selectedProjectId();
    if (pid !== null) {
      list = list.filter((c) => c.projectId === pid);
    }
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.number.includes(q) || c.bank.toLowerCase().includes(q) || (c.notes || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
  });

  readonly filteredExtracts = computed(() => {
    let list = [...this.store.extracts()];
    const pid = this.selectedProjectId();
    if (pid !== null) {
      list = list.filter((e) => e.projectId === pid);
    }
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter((e) => (e.notes || '').toLowerCase().includes(q) || (e.number + '').includes(q));
    }
    return list.sort((a, b) => b.number - a.number);
  });

  readonly masterSummaryRows = computed(() => {
    return this.store.projects().map((p) => {
      let labor = 0;
      for (const a of this.store.attendances()) {
        if (a.projectId === p.id) {
          labor += a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot;
        }
      }
      let adv = 0;
      for (const d of this.store.advances()) {
        if (d.projectId === p.id) adv += d.amount;
      }
      let exp = 0;
      for (const e of this.store.expenses()) {
        if (e.projectId === p.id) exp += e.amount;
      }
      let rev = 0;
      for (const ex of this.store.extracts()) {
        if (ex.projectId === p.id) rev += ex.paidAmount || ex.claimedAmount || 0;
      }
      const profit = rev - labor - exp;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      return {
        projectId: p.id || 0,
        projectName: p.name,
        totalRevenue: rev,
        totalLaborCost: labor,
        totalAdvances: adv,
        totalExpenses: exp,
        netProfit: profit,
        profitMargin: margin,
        active: p.active,
      };
    });
  });

  readonly currentFilteredCount = computed(() => {
    switch (this.activeTab()) {
      case 'attendance':
        return this.filteredAttendances().length;
      case 'workers':
        return this.filteredWorkers().length;
      case 'advances':
        return this.filteredAdvances().length;
      case 'expenses':
        return this.filteredExpenses().length;
      case 'checks':
        return this.filteredChecks().length;
      case 'extracts':
        return this.filteredExtracts().length;
      case 'master':
        return this.masterSummaryRows().length;
    }
  });

  readonly activeSheetSum = computed(() => {
    switch (this.activeTab()) {
      case 'attendance':
        return this.filteredAttendances().reduce(
          (acc, a) => acc + (a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot),
          0
        );
      case 'workers':
        return this.filteredWorkers().reduce((acc, w) => acc + w.workerDayRate, 0);
      case 'advances':
        return this.filteredAdvances().reduce((acc, a) => acc + a.amount, 0);
      case 'expenses':
        return this.filteredExpenses().reduce((acc, e) => acc + e.amount, 0);
      case 'checks':
        return this.filteredChecks().reduce((acc, c) => acc + c.amount, 0);
      case 'extracts':
        return this.filteredExtracts().reduce((acc, e) => acc + (e.paidAmount || e.claimedAmount || 0), 0);
      case 'master':
        return this.masterSummaryRows().reduce((acc, m) => acc + m.netProfit, 0);
    }
  });

  readonly activeSheetAvg = computed(() => {
    const count = this.currentFilteredCount();
    if (count === 0) return 0;
    return this.activeSheetSum() / count;
  });

  // Direct Inline Updating Methods
  async updateAttendanceField(
    attendance: Attendance,
    field: keyof Attendance,
    val: unknown
  ): Promise<void> {
    const updated: Attendance = { ...attendance, [field]: val };
    // If workerId changed, auto-update rate snapshots if not manually overridden
    if (field === 'workerId') {
      const w = this.store.workers().find((x) => x.id === Number(val));
      if (w) {
        updated.workerDayRateSnapshot = w.workerDayRate;
        updated.workerNightRateSnapshot = w.workerNightRate;
      }
    }
    await this.store.saveAttendance(updated);
    this.store.showToast('تم حفظ التعديل في شيت الحضور بنجاح', 'success');
  }

  async deleteAttendanceRow(attendance: Attendance): Promise<void> {
    if (attendance.id) {
      await this.store.deleteAttendance(attendance.id);
    }
  }

  async updateWorkerField(
    worker: Worker,
    field: keyof Worker,
    val: unknown
  ): Promise<void> {
    const updated: Worker = { ...worker, [field]: val };
    await this.store.saveWorker(updated);
    this.store.showToast(`تم تحديث بيانات العامل ${worker.name}`, 'success');
  }

  async deleteWorkerRow(worker: Worker): Promise<void> {
    if (worker.id) {
      await this.store.deleteWorker(worker.id);
    }
  }

  async updateAdvanceField(
    advance: Advance,
    field: keyof Advance,
    val: unknown
  ): Promise<void> {
    const updated: Advance = { ...advance, [field]: val };
    await this.store.saveAdvance(updated);
    this.store.showToast('تم حفظ تعديل السلفة', 'success');
  }

  async deleteAdvanceRow(advance: Advance): Promise<void> {
    if (advance.id) {
      await this.store.deleteAdvance(advance.id);
    }
  }

  async updateExpenseField(
    expense: Expense,
    field: keyof Expense,
    val: unknown
  ): Promise<void> {
    const updated: Expense = { ...expense, [field]: val };
    await this.store.saveExpense(updated);
    this.store.showToast('تم حفظ تعديل المصروف', 'success');
  }

  async deleteExpenseRow(expense: Expense): Promise<void> {
    if (expense.id) {
      await this.store.deleteExpense(expense.id);
    }
  }

  async updateCheckField(
    check: CheckItem,
    field: keyof CheckItem,
    val: unknown
  ): Promise<void> {
    const updated: CheckItem = { ...check, [field]: val };
    await this.store.saveCheck(updated);
    this.store.showToast('تم حفظ تعديل الشيك', 'success');
  }

  async deleteCheckRow(check: CheckItem): Promise<void> {
    if (check.id) {
      await this.store.deleteCheck(check.id);
    }
  }

  async updateExtractField(
    extract: Extract,
    field: keyof Extract,
    val: unknown
  ): Promise<void> {
    const updated: Extract = { ...extract, [field]: val };
    await this.store.saveExtract(updated, []);
    this.store.showToast('تم حفظ تعديل المستخلص', 'success');
  }

  async deleteExtractRow(extract: Extract): Promise<void> {
    if (extract.id) {
      await this.store.deleteExtract(extract.id);
    }
  }

  // Quick Insert New Row into Active Sheet
  async addNewRowToActiveSheet(): Promise<void> {
    const today = this.store.todayIso();
    const defaultProjId = this.store.projects()[0]?.id || 1;
    const defaultWorker = this.store.workers()[0];

    switch (this.activeTab()) {
      case 'attendance': {
        if (!defaultWorker) {
          this.store.showToast('أضف عمالاً أولاً قبل تسجيل اليوميات', 'warning');
          return;
        }
        await this.store.recordAttendance({
          date: today,
          workerId: defaultWorker.id || 1,
          projectId: this.selectedProjectId() || defaultProjId,
          dayWorked: 1,
          nightWorked: 0,
          note: 'سجل جديد من شيت إكسيل',
        });
        this.store.showToast('تمت إضافة صف يومية جديد للشيت بنجاح', 'success');
        break;
      }
      case 'workers': {
        const newWorker: Worker = {
          name: 'صنايعي جديد ' + (this.store.workers().length + 1),
          role: 'نحات',
          workerDayRate: this.store.settings().defaultWorkerDayRate || 500,
          workerNightRate: this.store.settings().defaultWorkerNightRate || 250,
          phone: '',
          active: true,
          notes: 'أضيف من شيت إكسيل المباشر',
        };
        await this.store.saveWorker(newWorker);
        this.store.showToast('تمت إضافة عامل جديد في الشيت', 'success');
        break;
      }
      case 'advances': {
        if (!defaultWorker) {
          this.store.showToast('لا يوجد عمال لتسجيل سلفة لهم', 'warning');
          return;
        }
        await this.store.addAdvance({
          date: today,
          workerId: defaultWorker.id || 1,
          amount: 500,
          reason: 'سلفة موقع جديدة',
          settlementId: null,
          projectId: this.selectedProjectId() || defaultProjId,
          notes: '',
        });
        this.store.showToast('تمت إضافة سلفة جديدة في الشيت', 'success');
        break;
      }
      case 'expenses': {
        await this.store.saveExpense({
          date: today,
          category: 'مواصلات',
          amount: 100,
          projectId: this.selectedProjectId() || defaultProjId,
          note: 'مصروف موقع جديد',
        });
        this.store.showToast('تمت إضافة بند مصروف جديد في الشيت', 'success');
        break;
      }
      case 'checks': {
        await this.store.saveCheck({
          direction: 'وارد',
          number: 'CHK-' + Math.floor(1000 + Math.random() * 9000),
          bank: 'البنك الأهلي المصري',
          amount: 50000,
          dueDate: today,
          status: 'معلق',
          projectId: this.selectedProjectId() || defaultProjId,
          extractId: null,
          withdrawnAmount: 0,
          notes: '',
        });
        this.store.showToast('تمت إضافة شيك جديد في الشيت', 'success');
        break;
      }
      case 'extracts': {
        await this.store.saveExtract(
          {
            projectId: this.selectedProjectId() || defaultProjId,
            number: this.store.extracts().length + 1,
            from: today,
            to: today,
            claimedAmount: 0,
            deductions: 0,
            paidAmount: 0,
            notes: 'مستخلص جديد',
          },
          []
        );
        this.store.showToast('تمت إضافة مستخلص جديد في الشيت', 'success');
        break;
      }
      case 'master':
        break;
    }
  }

  // Real Excel Download (.xlsx)
  downloadRealExcel(): void {
    const tab = this.activeTab();
    const projName = this.selectedProjectId()
      ? this.store.projectName(this.selectedProjectId()!)
      : 'كافة المشاريع';

    switch (tab) {
      case 'attendance': {
        const rows = this.filteredAttendances().map((a, i) => ({
          'م': i + 1,
          'التاريخ': a.date,
          'اسم العامل': this.store.workerName(a.workerId),
          'الصنعة': this.getWorkerRole(a.workerId),
          'المشروع': this.store.projectName(a.projectId),
          'نهارية': a.dayWorked === 1 ? 'حاضر (1)' : 'غياب (0)',
          'سهرة': a.nightWorked === 1 ? 'سهرة (1)' : 'بدون (0)',
          'يومية نهار (ج.م)': a.workerDayRateSnapshot,
          'يومية سهرة (ج.م)': a.workerNightRateSnapshot,
          'إجمالي استحقاق العامل (ج.م)': a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot,
          'حساب الشركة المقابل (ج.م)': a.dayWorked * a.companyDayRateSnapshot + a.nightWorked * a.companyNightRateSnapshot,
          'ملاحظات': a.note || '',
        }));
        this.excel.exportFilteredReport({
          title: `شيت_يوميات_الموقع_${projName}`,
          attendanceRows: rows,
        });
        break;
      }
      case 'workers': {
        const rows = this.filteredWorkers().map((w, i) => {
          const s = this.getWorkerSummary(w.id || 0);
          return {
            'م': i + 1,
            'كود': w.id,
            'الاسم بالكامل': w.name,
            'الصنعة / الدور': w.role,
            'يومية نهار (ج.م)': w.workerDayRate,
            'يومية سهرة (ج.م)': w.workerNightRate,
            'رقم الهاتف': w.phone || '',
            'الحالة': w.active ? 'نشط' : 'إجازة',
            'إجمالي المستحق (ج.م)': s.gross,
            'إجمالي السلف (ج.م)': s.advances,
            'صافي للقبض (ج.م)': s.net,
            'ملاحظات': w.notes || '',
          };
        });
        this.excel.exportFilteredReport({
          title: `شيت_دليل_العمال_والصناع_${projName}`,
          summaryRows: rows,
        });
        break;
      }
      case 'advances': {
        const rows = this.filteredAdvances().map((a, i) => ({
          'م': i + 1,
          'التاريخ': a.date,
          'اسم العامل': this.store.workerName(a.workerId),
          'المبلغ (ج.م)': a.amount,
          'المشروع': this.store.projectName(a.projectId ?? null),
          'السبب': a.reason,
          'ملاحظات': a.notes || '',
        }));
        this.excel.exportFilteredReport({
          title: `شيت_سلف_العمال_${projName}`,
          advancesRows: rows,
        });
        break;
      }
      case 'expenses': {
        const rows = this.filteredExpenses().map((e, i) => ({
          'م': i + 1,
          'التاريخ': e.date,
          'البند': e.category,
          'المبلغ (ج.م)': e.amount,
          'المشروع': this.store.projectName(e.projectId ?? null),
          'البيان': e.note,
        }));
        this.excel.exportFilteredReport({
          title: `شيت_مصاريف_الموقع_${projName}`,
          expensesRows: rows,
        });
        break;
      }
      case 'checks': {
        const rows = this.filteredChecks().map((c, i) => ({
          'م': i + 1,
          'الاتجاه': c.direction,
          'رقم الشيك': c.number,
          'البنك': c.bank,
          'تاريخ الاستحقاق': c.dueDate,
          'قيمة الشيك (ج.م)': c.amount,
          'الحالة': c.status,
          'المسحوب كاش (سلف)': c.withdrawnAmount || 0,
          'المتبقي في حساب البنك': (c.amount || 0) - (c.withdrawnAmount || 0),
          'المتبقي كاش في الجيب': this.getCheckPocketRemaining(c),
          'المشروع': this.store.projectName(c.projectId ?? null),
          'ملاحظات': c.notes || '',
        }));
        this.excel.exportFilteredReport({
          title: `شيت_حساب_الشيكات_والبنك`,
          checksRows: rows,
        });
        break;
      }
      case 'extracts': {
        const rows = this.filteredExtracts().map((e, i) => ({
          'م': i + 1,
          'رقم المستخلص': e.number,
          'المشروع': this.store.projectName(e.projectId),
          'الفترة من': e.from,
          'الفترة إلى': e.to,
          'إجمالي المطالبة': e.claimedAmount || 0,
          'الاستقطاعات': e.deductions || 0,
          'الصافي المقبوض': e.paidAmount || 0,
          'ملاحظات': e.notes || '',
        }));
        this.excel.exportFilteredReport({
          title: `شيت_مستخلصات_المشاريع_${projName}`,
          extractsRows: rows,
        });
        break;
      }
      case 'master': {
        const rows = this.masterSummaryRows().map((m, i) => ({
          'م': i + 1,
          'المشروع': m.projectName,
          'إيرادات ومستخلصات': m.totalRevenue,
          'تكلفة عمالة': m.totalLaborCost,
          'سلف منصرفة': m.totalAdvances,
          'مصاريف تشغيل': m.totalExpenses,
          'صافي الربح': m.netProfit,
          'هامش الربح %': m.profitMargin.toFixed(1) + '%',
        }));
        this.excel.exportFilteredReport({
          title: `شيت_ميزان_الأرباح_الشامل`,
          summaryRows: rows,
        });
        break;
      }
    }
  }

  // Copy Sheet Data as TSV (Tab-Separated Values) for direct paste into Excel / Google Sheets
  async copySheetAsTsv(): Promise<void> {
    let tsv = '';
    const tab = this.activeTab();

    if (tab === 'attendance') {
      tsv = 'التاريخ\tاسم العامل\tالصنعة\tالمشروع\tنهارية\tسهرة\tيومية نهار\tيومية سهرة\tاستحقاق العامل\tاستحقاق الشركة\tملاحظات\n';
      for (const a of this.filteredAttendances()) {
        tsv += `${a.date}\t${this.store.workerName(a.workerId)}\t${this.getWorkerRole(a.workerId)}\t${this.store.projectName(a.projectId)}\t${a.dayWorked}\t${a.nightWorked}\t${a.workerDayRateSnapshot}\t${a.workerNightRateSnapshot}\t${a.dayWorked * a.workerDayRateSnapshot + a.nightWorked * a.workerNightRateSnapshot}\t${a.dayWorked * a.companyDayRateSnapshot + a.nightWorked * a.companyNightRateSnapshot}\t${a.note || ''}\n`;
      }
    } else if (tab === 'workers') {
      tsv = 'كود\tالاسم بالكامل\tالصنعة\tيومية نهار\tيومية سهرة\tرقم الهاتف\tالحالة\tالمستحق\tالسلف\tالصافي\n';
      for (const w of this.filteredWorkers()) {
        const s = this.getWorkerSummary(w.id || 0);
        tsv += `${w.id}\t${w.name}\t${w.role}\t${w.workerDayRate}\t${w.workerNightRate}\t${w.phone || ''}\t${w.active ? 'نشط' : 'إجازة'}\t${s.gross}\t${s.advances}\t${s.net}\n`;
      }
    } else if (tab === 'advances') {
      tsv = 'التاريخ\tاسم العامل\tالمبلغ\tالمشروع\tالسبب\tملاحظات\n';
      for (const a of this.filteredAdvances()) {
        tsv += `${a.date}\t${this.store.workerName(a.workerId)}\t${a.amount}\t${this.store.projectName(a.projectId ?? null)}\t${a.reason}\t${a.notes || ''}\n`;
      }
    } else if (tab === 'expenses') {
      tsv = 'التاريخ\tالبند\tالمبلغ\tالمشروع\tالبيان\n';
      for (const e of this.filteredExpenses()) {
        tsv += `${e.date}\t${e.category}\t${e.amount}\t${this.store.projectName(e.projectId ?? null)}\t${e.note}\n`;
      }
    } else if (tab === 'checks') {
      tsv = 'الاتجاه\tرقم الشيك\tالبنك\tتاريخ الاستحقاق\tالقيمة\tالحالة\tالمسحوب كاش\tباقي البنك\tباقي الجيب\n';
      for (const c of this.filteredChecks()) {
        tsv += `${c.direction}\t${c.number}\t${c.bank}\t${c.dueDate}\t${c.amount}\t${c.status}\t${c.withdrawnAmount || 0}\t${(c.amount || 0) - (c.withdrawnAmount || 0)}\t${this.getCheckPocketRemaining(c)}\n`;
      }
    } else if (tab === 'extracts') {
      tsv = 'رقم المستخلص\tالمشروع\tمن\tإلى\tالمطالبة\tالاستقطاعات\tالمحصل\n';
      for (const e of this.filteredExtracts()) {
        tsv += `${e.number}\t${this.store.projectName(e.projectId)}\t${e.from}\t${e.to}\t${e.claimedAmount || 0}\t${e.deductions || 0}\t${e.paidAmount || 0}\n`;
      }
    } else if (tab === 'master') {
      tsv = 'المشروع\tإيرادات\tتكلفة عمالة\tسلف\tمصاريف\tصافي الربح\tالهامش %\n';
      for (const m of this.masterSummaryRows()) {
        tsv += `${m.projectName}\t${m.totalRevenue}\t${m.totalLaborCost}\t${m.totalAdvances}\t${m.totalExpenses}\t${m.netProfit}\t${m.profitMargin.toFixed(1)}%\n`;
      }
    }

    try {
      await navigator.clipboard.writeText(tsv);
      this.store.showToast('تم نسخ جدول الإكسيل! يمكنك لصقه (Ctrl+V) الآن مباشرة في برنامج Excel', 'success');
    } catch {
      this.store.showToast('تعذر النسخ التلقائي، يرجى تكرار المحاولة', 'error');
    }
  }

  triggerPrint(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}
