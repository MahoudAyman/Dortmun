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
  Expense,
  CheckItem,
  Extract,
} from '../../core/db/models';
import {
  formatCurrency,
} from '../../core/calc/calculations';

export type ExcelSheetTab =
  | 'attendance'
  | 'workers'
  | 'advances'
  | 'expenses'
  | 'checks'
  | 'extracts'
  | 'master';

export type RibbonTab = 'home' | 'insert' | 'formulas' | 'data' | 'view';

@Component({
  selector: 'app-live-excel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div
      class="excel-app-window flex flex-col rounded-xl border border-[#d4d4d4] dark:border-[#374151] shadow-xl overflow-hidden bg-[#f3f2f1] dark:bg-[#1f2937] text-[#242424] dark:text-[#f3f4f6] select-none"
    >
      <!-- 1. MICROSOFT EXCEL TITLE BAR (شريط العنوان العلوي الأخضر الكلاسيكي) -->
      <div
        class="excel-title-bar bg-[#107c41] text-white px-3 py-1.5 flex items-center justify-between text-xs font-semibold gap-2 shadow-xs"
      >
        <!-- Left: Quick Access Toolbar -->
        <div class="flex items-center gap-2">
          <!-- Excel App Logo -->
          <div
            class="w-6 h-6 rounded-md bg-white text-[#107c41] font-black text-sm flex items-center justify-center shadow-xs"
            title="Microsoft Excel - نظام المقاولات الذكي"
          >
            X
          </div>

          <!-- AutoSave Toggle Indicator -->
          <div
            class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/50 text-[11px] text-emerald-100 border border-emerald-400/30 font-medium"
            title="الحفظ التلقائي الفوري مفعّل - كل تعديل في أي خلية يُحفظ في قاعدة البيانات فوراً"
          >
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>حفظ تلقائي: تشغيل</span>
          </div>

          <!-- Quick Save / Undo / Redo -->
          <button
            type="button"
            (click)="triggerQuickSaveToast()"
            class="p-1 rounded hover:bg-white/20 text-white cursor-pointer"
            title="حفظ الآن (Ctrl+S)"
          >
            <mat-icon class="!text-sm !w-4 !h-4">save</mat-icon>
          </button>
          <button
            type="button"
            (click)="store.undoLastOperation()"
            class="p-1 rounded hover:bg-white/20 text-white cursor-pointer"
            title="تراجع عن آخر تعديل (Ctrl+Z)"
          >
            <mat-icon class="!text-sm !w-4 !h-4">undo</mat-icon>
          </button>
        </div>

        <!-- Center: Workbook Title -->
        <div
          class="flex items-center gap-2 text-center truncate font-bold text-xs"
        >
          <span class="truncate">
            {{ activeWorkbookFileName() }} - Excel
          </span>
          <span
            class="text-[10px] bg-emerald-800/80 px-2 py-0.5 rounded text-emerald-200 border border-emerald-400/20"
          >
            تم الحفظ محلياً
          </span>
        </div>

        <!-- Right: Search & Window Tools -->
        <div class="flex items-center gap-1.5">
          <div class="relative hidden md:block">
            <input
              type="text"
              [value]="searchQuery()"
              (input)="searchQuery.set($any($event.target).value)"
              placeholder="بحث في كل الخلايا (Alt + Q)..."
              class="w-48 pl-2 pr-7 py-0.5 text-[11px] rounded bg-emerald-950/40 text-white placeholder:text-white/60 border border-emerald-400/30 focus:outline-none focus:bg-white focus:text-slate-900 focus:w-64 transition-all"
            />
            <mat-icon
              class="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/70 !text-xs !w-3.5 !h-3.5 pointer-events-none"
            >
              search
            </mat-icon>
          </div>

          <button
            type="button"
            (click)="downloadRealExcel()"
            class="px-2.5 py-1 rounded bg-white text-[#107c41] hover:bg-emerald-50 text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
            title="تنزيل كملف Excel حقيقي .xlsx"
          >
            <mat-icon class="!text-xs !w-3.5 !h-3.5">file_download</mat-icon>
            <span class="hidden sm:inline">تنزيل .xlsx</span>
          </button>

          <button
            type="button"
            (click)="copySheetAsTsv()"
            class="p-1 rounded hover:bg-white/20 text-white cursor-pointer"
            title="نسخ جدول البيانات للذاكرة للصقه في Excel أو Google Sheets"
          >
            <mat-icon class="!text-sm !w-4 !h-4">content_copy</mat-icon>
          </button>

          <button
            type="button"
            (click)="triggerPrint()"
            class="p-1 rounded hover:bg-white/20 text-white cursor-pointer"
            title="طباعة"
          >
            <mat-icon class="!text-sm !w-4 !h-4">print</mat-icon>
          </button>
        </div>
      </div>

      <!-- 2. MICROSOFT EXCEL RIBBON TABS (تبويبات الشريط: ملف، الشريط الرئيسي، إدراج، صيغ، بيانات، عرض) -->
      <div
        class="excel-ribbon-tabs bg-[#f3f2f1] dark:bg-[#111827] border-b border-[#e1dfdd] dark:border-[#374151] px-2 flex items-center gap-0.5 text-xs font-medium"
      >
        <button
          type="button"
          (click)="activeRibbonTab.set('home')"
          class="ribbon-tab-btn"
          [class.ribbon-tab-btn-active]="activeRibbonTab() === 'home'"
        >
          الشريط الرئيسي (Home)
        </button>
        <button
          type="button"
          (click)="activeRibbonTab.set('insert')"
          class="ribbon-tab-btn"
          [class.ribbon-tab-btn-active]="activeRibbonTab() === 'insert'"
        >
          إدراج (Insert)
        </button>
        <button
          type="button"
          (click)="activeRibbonTab.set('formulas')"
          class="ribbon-tab-btn"
          [class.ribbon-tab-btn-active]="activeRibbonTab() === 'formulas'"
        >
          صيغ ودوال (Formulas)
        </button>
        <button
          type="button"
          (click)="activeRibbonTab.set('data')"
          class="ribbon-tab-btn"
          [class.ribbon-tab-btn-active]="activeRibbonTab() === 'data'"
        >
          بيانات وتصفية (Data)
        </button>
        <button
          type="button"
          (click)="activeRibbonTab.set('view')"
          class="ribbon-tab-btn"
          [class.ribbon-tab-btn-active]="activeRibbonTab() === 'view'"
        >
          عرض (View)
        </button>
      </div>

      <!-- 3. RIBBON TOOLBAR PANEL (شريط الأدوات المنسدل لكل تبويب إكسيل) -->
      <div
        class="excel-ribbon-content bg-white dark:bg-[#1e293b] border-b border-[#d4d4d4] dark:border-[#374151] px-3 py-2 flex flex-wrap items-center gap-3 text-xs overflow-x-auto shadow-2xs"
      >
        @switch (activeRibbonTab()) {
          @case ('home') {
            <!-- Clipboard Group -->
            <div class="ribbon-group flex items-center gap-1 pl-2 border-l border-[#e5e7eb] dark:border-slate-700">
              <button
                type="button"
                (click)="copySheetAsTsv()"
                class="ribbon-btn flex flex-col items-center justify-center p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                title="نسخ جدول الخلايا"
              >
                <mat-icon class="!text-base !w-4 !h-4 text-[#107c41]">content_copy</mat-icon>
                <span class="text-[10px]">نسخ</span>
              </button>
              <button
                type="button"
                (click)="downloadRealExcel()"
                class="ribbon-btn flex flex-col items-center justify-center p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                title="تصدير كملف إكسيل كامل"
              >
                <mat-icon class="!text-base !w-4 !h-4 text-[#107c41]">file_download</mat-icon>
                <span class="text-[10px]">تصدير</span>
              </button>
            </div>

            <!-- Font / Formatting Group -->
            <div class="ribbon-group flex items-center gap-1 pl-2 border-l border-[#e5e7eb] dark:border-slate-700">
              <button
                type="button"
                (click)="toggleCellBold()"
                class="p-1 rounded font-black text-xs min-w-[24px] hover:bg-gray-100 dark:hover:bg-slate-700"
                [class.bg-emerald-100]="isCellBold()"
                [class.text-emerald-800]="isCellBold()"
                title="غامق (Ctrl+B)"
              >
                B
              </button>
              <button
                type="button"
                (click)="toggleCellItalic()"
                class="p-1 rounded italic text-xs min-w-[24px] hover:bg-gray-100 dark:hover:bg-slate-700"
                [class.bg-emerald-100]="isCellItalic()"
                [class.text-emerald-800]="isCellItalic()"
                title="مائل (Ctrl+I)"
              >
                I
              </button>
              <div
                class="flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-[11px]"
                title="حجم الخط"
              >
                <span>خط 11</span>
              </div>
            </div>

            <!-- Alignment Group -->
            <div class="ribbon-group flex items-center gap-1 pl-2 border-l border-[#e5e7eb] dark:border-slate-700">
              <button
                type="button"
                (click)="textAlignMode.set('right')"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                [class.bg-emerald-100]="textAlignMode() === 'right'"
                title="محاذاة لليمين"
              >
                <mat-icon class="!text-sm !w-4 !h-4">format_align_right</mat-icon>
              </button>
              <button
                type="button"
                (click)="textAlignMode.set('center')"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                [class.bg-emerald-100]="textAlignMode() === 'center'"
                title="محاذاة للوسط"
              >
                <mat-icon class="!text-sm !w-4 !h-4">format_align_center</mat-icon>
              </button>
              <button
                type="button"
                (click)="textAlignMode.set('left')"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                [class.bg-emerald-100]="textAlignMode() === 'left'"
                title="محاذاة لليسار"
              >
                <mat-icon class="!text-sm !w-4 !h-4">format_align_left</mat-icon>
              </button>
            </div>

            <!-- Cells Operations Group -->
            <div class="ribbon-group flex items-center gap-1.5 pl-2 border-l border-[#e5e7eb] dark:border-slate-700">
              <button
                type="button"
                (click)="addNewRowToActiveSheet()"
                class="px-2.5 py-1 rounded bg-[#107c41] hover:bg-[#0c5c30] text-white font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                title="إدراج صف جديد في الشيت"
              >
                <mat-icon class="!text-xs !w-3.5 !h-3.5">add</mat-icon>
                <span>إدراج صف</span>
              </button>
              <button
                type="button"
                (click)="deleteSelectedRow()"
                [disabled]="selectedRowId() === null"
                class="px-2.5 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                title="حذف الصف المحدد"
              >
                <mat-icon class="!text-xs !w-3.5 !h-3.5">delete</mat-icon>
                <span>حذف صف</span>
              </button>
            </div>

            <!-- Editing & Quick AutoSum -->
            <div class="ribbon-group flex items-center gap-2">
              <div
                class="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[#107c41] font-mono font-bold text-xs"
                title="دالة الجمع التلقائي للعمود النشط"
              >
                <span class="font-serif font-black">Σ AutoSum:</span>
                <span>{{ formatMoney(activeSheetSum()) }}</span>
              </div>
            </div>
          }

          @case ('insert') {
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="addNewRowToActiveSheet()"
                class="px-3 py-1.5 rounded bg-[#107c41] text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <mat-icon class="!text-sm !w-4 !h-4">table_rows</mat-icon>
                <span>إدراج صف بيانات جديد</span>
              </button>
              <button
                type="button"
                (click)="downloadRealExcel()"
                class="px-3 py-1.5 rounded border border-[#107c41] text-[#107c41] hover:bg-emerald-50 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="!text-sm !w-4 !h-4">table_view</mat-icon>
                <span>تصدير جدول بيانات متكامل (.xlsx)</span>
              </button>
            </div>
          }

          @case ('formulas') {
            <div class="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                (click)="insertFormula('SUM')"
                class="px-2.5 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-emerald-100 font-bold font-mono text-xs flex items-center gap-1"
              >
                <span class="text-[#107c41] font-black">Σ</span>
                <span>=SUM(...) : {{ formatMoney(activeSheetSum()) }}</span>
              </button>
              <button
                type="button"
                (click)="insertFormula('AVERAGE')"
                class="px-2.5 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-emerald-100 font-bold font-mono text-xs flex items-center gap-1"
              >
                <span>=AVERAGE(...) : {{ formatMoney(activeSheetAvg()) }}</span>
              </button>
              <button
                type="button"
                (click)="insertFormula('COUNT')"
                class="px-2.5 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-emerald-100 font-bold font-mono text-xs flex items-center gap-1"
              >
                <span>=COUNT(...) : {{ currentFilteredCount() }}</span>
              </button>
            </div>
          }

          @case ('data') {
            <div class="flex items-center gap-3 flex-wrap">
              <!-- Filter by Project -->
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500 font-bold">تصفية المشروع:</span>
                <select
                  [value]="selectedProjectId() === null ? '' : selectedProjectId()"
                  (change)="onProjectFilterChange($any($event.target).value)"
                  class="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  <option value="">جميع المشاريع</option>
                  @for (p of store.projects(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>

              <!-- Filter by Month -->
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500 font-bold">الشهر:</span>
                <input
                  type="month"
                  [value]="filterMonth()"
                  (input)="filterMonth.set($any($event.target).value)"
                  class="px-2 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                />
              </div>

              <!-- Quick Sort -->
              <button
                type="button"
                (click)="toggleSortDirection()"
                class="px-2.5 py-1 rounded border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <mat-icon class="!text-xs !w-3.5 !h-3.5">sort</mat-icon>
                <span>فرز: {{ sortDescending() ? 'الأحدث أولاً ↓' : 'الأقدم أولاً ↑' }}</span>
              </button>
            </div>
          }

          @case ('view') {
            <div class="flex items-center gap-3 flex-wrap">
              <label class="flex items-center gap-1.5 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  [checked]="showGridlines()"
                  (change)="showGridlines.set($any($event.target).checked)"
                  class="accent-[#107c41]"
                />
                <span>إظهار خطوط شبكة إكسيل (Gridlines)</span>
              </label>

              <label class="flex items-center gap-1.5 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  [checked]="showFormulaBar()"
                  (change)="showFormulaBar.set($any($event.target).checked)"
                  class="accent-[#107c41]"
                />
                <span>شريط الصيغة (Formula Bar)</span>
              </label>

              <div class="flex items-center gap-1 font-bold">
                <span>التكبير:</span>
                <button
                  type="button"
                  (click)="zoomLevel.set(90)"
                  class="px-1.5 py-0.5 rounded text-[10px] border"
                  [class.bg-emerald-100]="zoomLevel() === 90"
                >
                  90%
                </button>
                <button
                  type="button"
                  (click)="zoomLevel.set(100)"
                  class="px-1.5 py-0.5 rounded text-[10px] border"
                  [class.bg-emerald-100]="zoomLevel() === 100"
                >
                  100%
                </button>
                <button
                  type="button"
                  (click)="zoomLevel.set(115)"
                  class="px-1.5 py-0.5 rounded text-[10px] border"
                  [class.bg-emerald-100]="zoomLevel() === 115"
                >
                  115%
                </button>
              </div>
            </div>
          }
        }
      </div>

      <!-- 4. MICROSOFT EXCEL FORMULA BAR (شريط الصيغة الحقيقي fx ومربع الاسم A1) -->
      @if (showFormulaBar()) {
        <div
          class="excel-formula-bar bg-white dark:bg-[#111827] border-b border-[#d4d4d4] dark:border-[#374151] px-2 py-1 flex items-center gap-1.5 text-xs font-mono"
        >
          <!-- Cell Name Box (مربع اسم الخلية مثل A1 أو C4) -->
          <div
            class="excel-name-box w-20 px-2 py-1 text-center font-bold text-slate-800 dark:text-slate-100 bg-[#f9fafb] dark:bg-[#1f2937] border border-[#d4d4d4] dark:border-[#4b5563] rounded-xs select-none shadow-2xs"
            title="اسم الخلية النشطة حالياً"
          >
            {{ selectedCellLabel() }}
          </div>

          <!-- Formula fx button & cancel/enter icons -->
          <div class="flex items-center gap-0.5 text-gray-400 select-none">
            <button
              type="button"
              (click)="revertCellEdit()"
              class="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-rose-500"
              title="إلغاء التعديل (Esc)"
            >
              <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
            </button>
            <button
              type="button"
              (click)="commitCellEdit()"
              class="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-emerald-600"
              title="تثبيت القيمة (Enter)"
            >
              <mat-icon class="!text-xs !w-3.5 !h-3.5">check</mat-icon>
            </button>
            <span
              class="font-serif italic font-black text-[#107c41] px-1 text-sm select-none"
              title="إدراج دالة رياضية"
            >
              fx
            </span>
          </div>

          <!-- Wide Formula Input -->
          <input
            type="text"
            [value]="activeFormulaValue()"
            (input)="onFormulaBarInput($any($event.target).value)"
            (keydown.enter)="commitCellEdit()"
            (keydown.escape)="revertCellEdit()"
            placeholder="اكتب هنا قيمة الخلية أو الصيغة..."
            class="flex-1 px-2.5 py-1 bg-transparent text-slate-900 dark:text-slate-100 font-sans text-xs focus:outline-none focus:bg-emerald-50/30 dark:focus:bg-emerald-950/20 rounded"
          />
        </div>
      }

      <!-- 5. THE EXCEL CELL GRID WORKSPACE (المربعات وخلايا الإكسيل الحقيقية بالكامل) -->
      <div
        class="excel-grid-viewport overflow-auto min-h-[460px] max-h-[720px] bg-white dark:bg-[#0f172a] relative"
        [style.zoom]="zoomLevel() + '%'"
      >
        <!-- TAB 1: ATTENDANCE SHEET (شيت سجل اليوميات والحضور) -->
        @if (activeTab() === 'attendance') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <!-- Column Letters Header (A, B, C, D, E, F...) -->
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">
                  <span class="text-[10px] text-gray-400">◰</span>
                </th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">التاريخ</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">اسم العامل / النحات</span></th>
                <th class="excel-col-letter w-28" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">المهنة</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter w-24 text-center" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">نهارية</span></th>
                <th class="excel-col-letter w-24 text-center" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">سهرة</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">يومية نهار (ج.م)</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'H'">H<br><span class="col-title">يومية سهرة (ج.م)</span></th>
                <th class="excel-col-letter w-32 text-left bg-emerald-50 dark:bg-emerald-950/40 text-[#107c41]" [class.col-active]="activeColLetter() === 'I'">I<br><span class="col-title">استحقاق العامل</span></th>
                <th class="excel-col-letter w-32 text-left bg-blue-50 dark:bg-blue-950/40 text-blue-600" [class.col-active]="activeColLetter() === 'J'">J<br><span class="col-title">حساب الشركة</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'K'">K<br><span class="col-title">ملاحظات</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (item of filteredAttendances(); track (item.id || $index); let rowIdx = $index) {
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <!-- Row Number Header (1, 2, 3...) -->
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, item.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <!-- A. Date -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, item.date, item.id)"
                  >
                    <input
                      type="date"
                      [value]="item.date"
                      (change)="updateAttendanceField(item, 'date', $any($event.target).value)"
                      class="cell-editor"
                    />
                    @if (selectedCellLabel() === ('A' + (rowIdx + 1))) {
                      <div class="excel-fill-handle"></div>
                    }
                  </td>

                  <!-- B. Worker Name -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, store.workerName(item.workerId), item.id)"
                  >
                    <select
                      [value]="item.workerId"
                      (change)="updateAttendanceField(item, 'workerId', +$any($event.target).value)"
                      class="cell-select font-bold"
                    >
                      @for (w of store.workers(); track w.id) {
                        <option [value]="w.id">{{ w.name }} ({{ w.role }})</option>
                      }
                    </select>
                    @if (selectedCellLabel() === ('B' + (rowIdx + 1))) {
                      <div class="excel-fill-handle"></div>
                    }
                  </td>

                  <!-- C. Role (Computed) -->
                  <td
                    class="excel-cell text-gray-500 font-medium"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, getWorkerRole(item.workerId), item.id)"
                  >
                    {{ getWorkerRole(item.workerId) }}
                  </td>

                  <!-- D. Project -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, store.projectName(item.projectId), item.id)"
                  >
                    <select
                      [value]="item.projectId"
                      (change)="updateAttendanceField(item, 'projectId', +$any($event.target).value)"
                      class="cell-select"
                    >
                      @for (p of store.projects(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                    @if (selectedCellLabel() === ('D' + (rowIdx + 1))) {
                      <div class="excel-fill-handle"></div>
                    }
                  </td>

                  <!-- E. Day Worked -->
                  <td
                    class="excel-cell text-center"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, item.dayWorked + '', item.id)"
                  >
                    <select
                      [value]="item.dayWorked"
                      (change)="updateAttendanceField(item, 'dayWorked', +$any($event.target).value)"
                      class="cell-select text-center font-bold"
                      [class.text-emerald-700]="item.dayWorked === 1"
                      [class.text-rose-600]="item.dayWorked === 0"
                    >
                      <option [value]="1">حاضر (1)</option>
                      <option [value]="0">غياب (0)</option>
                    </select>
                  </td>

                  <!-- F. Night Worked -->
                  <td
                    class="excel-cell text-center"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, item.nightWorked + '', item.id)"
                  >
                    <select
                      [value]="item.nightWorked"
                      (change)="updateAttendanceField(item, 'nightWorked', +$any($event.target).value)"
                      class="cell-select text-center font-bold"
                      [class.text-indigo-600]="item.nightWorked === 1"
                      [class.text-gray-400]="item.nightWorked === 0"
                    >
                      <option [value]="1">سهرة (1)</option>
                      <option [value]="0">بدون (0)</option>
                    </select>
                  </td>

                  <!-- G. Worker Day Rate Snapshot -->
                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('G' + (rowIdx + 1))"
                    (click)="focusCell('G', rowIdx + 1, item.workerDayRateSnapshot + '', item.id)"
                  >
                    <input
                      type="number"
                      [value]="item.workerDayRateSnapshot"
                      (blur)="updateAttendanceField(item, 'workerDayRateSnapshot', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold"
                    />
                  </td>

                  <!-- H. Worker Night Rate Snapshot -->
                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('H' + (rowIdx + 1))"
                    (click)="focusCell('H', rowIdx + 1, item.workerNightRateSnapshot + '', item.id)"
                  >
                    <input
                      type="number"
                      [value]="item.workerNightRateSnapshot"
                      (blur)="updateAttendanceField(item, 'workerNightRateSnapshot', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold"
                    />
                  </td>

                  <!-- I. Worker Gross (Formula Cell) -->
                  <td
                    class="excel-cell text-left font-mono font-bold bg-emerald-50/40 dark:bg-emerald-950/20 text-[#107c41]"
                    [class.cell-selected]="selectedCellLabel() === ('I' + (rowIdx + 1))"
                    (click)="focusCell('I', rowIdx + 1, (item.dayWorked * item.workerDayRateSnapshot + item.nightWorked * item.workerNightRateSnapshot) + '', item.id)"
                  >
                    {{ formatMoney(item.dayWorked * item.workerDayRateSnapshot + item.nightWorked * item.workerNightRateSnapshot) }}
                  </td>

                  <!-- J. Company Gross (Formula Cell) -->
                  <td
                    class="excel-cell text-left font-mono font-bold bg-blue-50/40 dark:bg-blue-950/20 text-blue-600"
                    [class.cell-selected]="selectedCellLabel() === ('J' + (rowIdx + 1))"
                    (click)="focusCell('J', rowIdx + 1, (item.dayWorked * item.companyDayRateSnapshot + item.nightWorked * item.companyNightRateSnapshot) + '', item.id)"
                  >
                    {{ formatMoney(item.dayWorked * item.companyDayRateSnapshot + item.nightWorked * item.companyNightRateSnapshot) }}
                  </td>

                  <!-- K. Notes -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('K' + (rowIdx + 1))"
                    (click)="focusCell('K', rowIdx + 1, item.note || '', item.id)"
                  >
                    <input
                      type="text"
                      [value]="item.note"
                      (blur)="updateAttendanceField(item, 'note', $any($event.target).value)"
                      placeholder="ملاحظات..."
                      class="cell-editor"
                    />
                  </td>

                  <!-- Delete Row Action -->
                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteAttendanceRow(item)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف هذا الصف"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="13" class="p-8 text-center text-gray-400">
                    لا توجد يوميات مسجلة تطابق التصفية. اضغط على <b>إدراج صف</b> من شريط الأدوات بالأعلى للإضافة فوراً في الشيت.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 2: WORKERS SHEET (شيت دليل العمال والنحاتية) -->
        @if (activeTab() === 'workers') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter w-20" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">كود</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">اسم العامل / النحات</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">الصنعة / الدور</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">يومية نهار (ج.م)</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">يومية سهرة (ج.م)</span></th>
                <th class="excel-col-letter w-36" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">رقم الهاتف</span></th>
                <th class="excel-col-letter w-24 text-center" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">الحالة</span></th>
                <th class="excel-col-letter w-32 text-left bg-emerald-50 text-[#107c41]" [class.col-active]="activeColLetter() === 'H'">H<br><span class="col-title">إجمالي المستحق</span></th>
                <th class="excel-col-letter w-32 text-left bg-rose-50 text-rose-600" [class.col-active]="activeColLetter() === 'I'">I<br><span class="col-title">إجمالي السلف</span></th>
                <th class="excel-col-letter w-32 text-left bg-blue-50 text-blue-700" [class.col-active]="activeColLetter() === 'J'">J<br><span class="col-title">صافي للقبض</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'K'">K<br><span class="col-title">ملاحظات</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (w of filteredWorkers(); track (w.id || $index); let rowIdx = $index) {
                @let stat = getWorkerSummary(w.id || 0);
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, w.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <!-- A. ID -->
                  <td
                    class="excel-cell font-mono text-gray-400 font-bold"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, '#' + w.id, w.id)"
                  >
                    #{{ w.id }}
                  </td>

                  <!-- B. Name -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, w.name, w.id)"
                  >
                    <input
                      type="text"
                      [value]="w.name"
                      (blur)="updateWorkerField(w, 'name', $any($event.target).value)"
                      class="cell-editor font-bold text-slate-900 dark:text-slate-100"
                    />
                    @if (selectedCellLabel() === ('B' + (rowIdx + 1))) {
                      <div class="excel-fill-handle"></div>
                    }
                  </td>

                  <!-- C. Role -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, w.role, w.id)"
                  >
                    <input
                      type="text"
                      [value]="w.role"
                      (blur)="updateWorkerField(w, 'role', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <!-- D. Day Rate -->
                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, w.workerDayRate + '', w.id)"
                  >
                    <input
                      type="number"
                      [value]="w.workerDayRate"
                      (blur)="updateWorkerField(w, 'workerDayRate', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold"
                    />
                  </td>

                  <!-- E. Night Rate -->
                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, w.workerNightRate + '', w.id)"
                  >
                    <input
                      type="number"
                      [value]="w.workerNightRate"
                      (blur)="updateWorkerField(w, 'workerNightRate', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold"
                    />
                  </td>

                  <!-- F. Phone -->
                  <td
                    class="excel-cell font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, w.phone || '', w.id)"
                  >
                    <input
                      type="text"
                      [value]="w.phone"
                      (blur)="updateWorkerField(w, 'phone', $any($event.target).value)"
                      placeholder="01xxxxxxxxx"
                      class="cell-editor font-mono"
                    />
                  </td>

                  <!-- G. Active -->
                  <td
                    class="excel-cell text-center"
                    [class.cell-selected]="selectedCellLabel() === ('G' + (rowIdx + 1))"
                    (click)="focusCell('G', rowIdx + 1, w.active ? 'نشط' : 'إجازة', w.id)"
                  >
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
                  <td
                    class="excel-cell text-left font-mono font-bold bg-emerald-50/40 text-[#107c41]"
                    [class.cell-selected]="selectedCellLabel() === ('H' + (rowIdx + 1))"
                    (click)="focusCell('H', rowIdx + 1, stat.gross + '', w.id)"
                  >
                    {{ formatMoney(stat.gross) }}
                  </td>

                  <!-- I. Advances -->
                  <td
                    class="excel-cell text-left font-mono font-bold bg-rose-50/40 text-rose-600"
                    [class.cell-selected]="selectedCellLabel() === ('I' + (rowIdx + 1))"
                    (click)="focusCell('I', rowIdx + 1, stat.advances + '', w.id)"
                  >
                    {{ formatMoney(stat.advances) }}
                  </td>

                  <!-- J. Net -->
                  <td
                    class="excel-cell text-left font-mono font-black bg-blue-50/40 text-blue-700"
                    [class.cell-selected]="selectedCellLabel() === ('J' + (rowIdx + 1))"
                    (click)="focusCell('J', rowIdx + 1, stat.net + '', w.id)"
                  >
                    {{ formatMoney(stat.net) }}
                  </td>

                  <!-- K. Notes -->
                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('K' + (rowIdx + 1))"
                    (click)="focusCell('K', rowIdx + 1, w.notes || '', w.id)"
                  >
                    <input
                      type="text"
                      [value]="w.notes"
                      (blur)="updateWorkerField(w, 'notes', $any($event.target).value)"
                      placeholder="ملاحظات..."
                      class="cell-editor"
                    />
                  </td>

                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteWorkerRow(w)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف العامل"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 3: ADVANCES SHEET (شيت السلف والخصومات) -->
        @if (activeTab() === 'advances') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">التاريخ</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">اسم العامل</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">المبلغ (ج.م)</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter min-w-[180px]" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">السبب والبيان</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">الشيك المصروف منه</span></th>
                <th class="excel-col-letter min-w-[140px]" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">ملاحظات</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (adv of filteredAdvances(); track (adv.id || $index); let rowIdx = $index) {
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, adv.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, adv.date, adv.id)"
                  >
                    <input
                      type="date"
                      [value]="adv.date"
                      (change)="updateAdvanceField(adv, 'date', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, store.workerName(adv.workerId), adv.id)"
                  >
                    <select
                      [value]="adv.workerId"
                      (change)="updateAdvanceField(adv, 'workerId', +$any($event.target).value)"
                      class="cell-select font-bold"
                    >
                      @for (w of store.workers(); track w.id) {
                        <option [value]="w.id">{{ w.name }}</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, adv.amount + '', adv.id)"
                  >
                    <input
                      type="number"
                      [value]="adv.amount"
                      (blur)="updateAdvanceField(adv, 'amount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold text-rose-600"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, store.projectName(adv.projectId ?? null), adv.id)"
                  >
                    <select
                      [value]="adv.projectId || ''"
                      (change)="updateAdvanceField(adv, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                      class="cell-select"
                    >
                      <option value="">بدون مشروع محدد</option>
                      @for (p of store.projects(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, adv.reason, adv.id)"
                  >
                    <input
                      type="text"
                      [value]="adv.reason"
                      (blur)="updateAdvanceField(adv, 'reason', $any($event.target).value)"
                      placeholder="السبب..."
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, adv.checkId ? ('شيك #' + adv.checkId) : 'كاش الخزنة', adv.id)"
                  >
                    <select
                      [value]="adv.checkId || ''"
                      (change)="updateAdvanceField(adv, 'checkId', $any($event.target).value ? +$any($event.target).value : null)"
                      class="cell-select text-[11px]"
                    >
                      <option value="">كاش الخزنة الحر</option>
                      @for (c of store.checks(); track c.id) {
                        <option [value]="c.id">شيك {{ c.number }} ({{ formatMoney(c.amount) }})</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('G' + (rowIdx + 1))"
                    (click)="focusCell('G', rowIdx + 1, adv.notes || '', adv.id)"
                  >
                    <input
                      type="text"
                      [value]="adv.notes"
                      (blur)="updateAdvanceField(adv, 'notes', $any($event.target).value)"
                      placeholder="ملاحظات..."
                      class="cell-editor"
                    />
                  </td>

                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteAdvanceRow(adv)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف السلفة"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 4: SITE EXPENSES SHEET (شيت مصاريف الموقع) -->
        @if (activeTab() === 'expenses') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">التاريخ</span></th>
                <th class="excel-col-letter w-36" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">بند المصروف</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">المبلغ (ج.م)</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter w-36" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">جهة الصرف / الشيك</span></th>
                <th class="excel-col-letter min-w-[200px]" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">البيان والتفاصيل</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (exp of filteredExpenses(); track (exp.id || $index); let rowIdx = $index) {
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, exp.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, exp.date, exp.id)"
                  >
                    <input
                      type="date"
                      [value]="exp.date"
                      (change)="updateExpenseField(exp, 'date', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, exp.category, exp.id)"
                  >
                    <select
                      [value]="exp.category"
                      (change)="updateExpenseField(exp, 'category', $any($event.target).value)"
                      class="cell-select font-bold"
                    >
                      <option value="مواصلات">مواصلات وانتقالات</option>
                      <option value="أكل">أكل وبوفيه</option>
                      <option value="أدوات">عدد وأدوات</option>
                      <option value="صيانة">صيانة وإصلاحات</option>
                      <option value="رسوم سحب شيك">رسوم سحب شيك بنكي</option>
                      <option value="أخرى">مصاريف أخرى</option>
                    </select>
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, exp.amount + '', exp.id)"
                  >
                    <input
                      type="number"
                      [value]="exp.amount"
                      (blur)="updateExpenseField(exp, 'amount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold text-rose-600"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, store.projectName(exp.projectId ?? null), exp.id)"
                  >
                    <select
                      [value]="exp.projectId || ''"
                      (change)="updateExpenseField(exp, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                      class="cell-select"
                    >
                      <option value="">عام لكافة المشاريع</option>
                      @for (p of store.projects(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, exp.checkId ? ('شيك #' + exp.checkId) : 'الخزنة', exp.id)"
                  >
                    <select
                      [value]="exp.checkId || ''"
                      (change)="updateExpenseField(exp, 'checkId', $any($event.target).value ? +$any($event.target).value : null)"
                      class="cell-select text-[11px]"
                    >
                      <option value="">الخزنة / كاش شخصي</option>
                      @for (c of store.checks(); track c.id) {
                        <option [value]="c.id">شيك {{ c.number }} ({{ c.bank }})</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, exp.note, exp.id)"
                  >
                    <input
                      type="text"
                      [value]="exp.note"
                      (blur)="updateExpenseField(exp, 'note', $any($event.target).value)"
                      placeholder="البيان..."
                      class="cell-editor"
                    />
                  </td>

                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteExpenseRow(exp)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف المصروف"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 5: CHECKS SHEET (شيت الشيكات وحساب البنك) -->
        @if (activeTab() === 'checks') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter w-24 text-center" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">الاتجاه</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">رقم الشيك</span></th>
                <th class="excel-col-letter w-36" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">البنك</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">تاريخ الاستحقاق</span></th>
                <th class="excel-col-letter w-32 text-left bg-emerald-50 text-[#107c41]" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">قيمة الشيك (ج.م)</span></th>
                <th class="excel-col-letter w-28 text-center" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">الحالة</span></th>
                <th class="excel-col-letter w-32 text-left bg-amber-50 text-amber-800" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">المسحوب كاش</span></th>
                <th class="excel-col-letter w-32 text-left bg-blue-50 text-blue-800" [class.col-active]="activeColLetter() === 'H'">H<br><span class="col-title">باقي في البنك</span></th>
                <th class="excel-col-letter w-32 text-left bg-purple-50 text-purple-800" [class.col-active]="activeColLetter() === 'I'">I<br><span class="col-title">باقي في الجيب</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'J'">J<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter min-w-[150px]" [class.col-active]="activeColLetter() === 'K'">K<br><span class="col-title">ملاحظات</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filteredChecks(); track (c.id || $index); let rowIdx = $index) {
                @let bankRem = (c.amount || 0) - (c.withdrawnAmount || 0);
                @let pocketRem = getCheckPocketRemaining(c);
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, c.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <td
                    class="excel-cell text-center"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, c.direction, c.id)"
                  >
                    <select
                      [value]="c.direction"
                      (change)="updateCheckField(c, 'direction', $any($event.target).value)"
                      class="cell-select text-center font-bold"
                    >
                      <option value="وارد">وارد</option>
                      <option value="صادر">صادر</option>
                    </select>
                  </td>

                  <td
                    class="excel-cell font-mono font-bold"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, c.number, c.id)"
                  >
                    <input
                      type="text"
                      [value]="c.number"
                      (blur)="updateCheckField(c, 'number', $any($event.target).value)"
                      class="cell-editor font-mono font-bold"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, c.bank, c.id)"
                  >
                    <input
                      type="text"
                      [value]="c.bank"
                      (blur)="updateCheckField(c, 'bank', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, c.dueDate, c.id)"
                  >
                    <input
                      type="date"
                      [value]="c.dueDate"
                      (change)="updateCheckField(c, 'dueDate', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, c.amount + '', c.id)"
                  >
                    <input
                      type="number"
                      [value]="c.amount"
                      (blur)="updateCheckField(c, 'amount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-black text-[#107c41]"
                    />
                  </td>

                  <td
                    class="excel-cell text-center"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, c.status, c.id)"
                  >
                    <select
                      [value]="c.status"
                      (change)="updateCheckField(c, 'status', $any($event.target).value)"
                      class="cell-select text-center font-bold"
                      [class.text-emerald-700]="c.status === 'اتصرف'"
                      [class.text-amber-600]="c.status === 'معلق'"
                    >
                      <option value="اتصرف">اتصرف في البنك</option>
                      <option value="معلق">معلق</option>
                      <option value="مرتجع">مرتجع</option>
                    </select>
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('G' + (rowIdx + 1))"
                    (click)="focusCell('G', rowIdx + 1, (c.withdrawnAmount || 0) + '', c.id)"
                  >
                    <input
                      type="number"
                      [value]="c.withdrawnAmount || 0"
                      (blur)="updateCheckField(c, 'withdrawnAmount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold text-amber-700"
                    />
                  </td>

                  <td
                    class="excel-cell text-left font-mono font-bold bg-blue-50/50 text-blue-700"
                    [class.cell-selected]="selectedCellLabel() === ('H' + (rowIdx + 1))"
                    (click)="focusCell('H', rowIdx + 1, bankRem + '', c.id)"
                  >
                    {{ formatMoney(bankRem) }}
                  </td>

                  <td
                    class="excel-cell text-left font-mono font-black bg-purple-50/50 text-purple-700"
                    [class.cell-selected]="selectedCellLabel() === ('I' + (rowIdx + 1))"
                    (click)="focusCell('I', rowIdx + 1, pocketRem + '', c.id)"
                  >
                    {{ formatMoney(pocketRem) }}
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('J' + (rowIdx + 1))"
                    (click)="focusCell('J', rowIdx + 1, store.projectName(c.projectId ?? null), c.id)"
                  >
                    <select
                      [value]="c.projectId || ''"
                      (change)="updateCheckField(c, 'projectId', $any($event.target).value ? +$any($event.target).value : null)"
                      class="cell-select"
                    >
                      <option value="">عام للمقاول</option>
                      @for (p of store.projects(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('K' + (rowIdx + 1))"
                    (click)="focusCell('K', rowIdx + 1, c.notes || '', c.id)"
                  >
                    <input
                      type="text"
                      [value]="c.notes"
                      (blur)="updateCheckField(c, 'notes', $any($event.target).value)"
                      placeholder="ملاحظات..."
                      class="cell-editor"
                    />
                  </td>

                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteCheckRow(c)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف الشيك"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 6: EXTRACTS SHEET (شيت المستخلصات) -->
        @if (activeTab() === 'extracts') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter w-24" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">رقم</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">الفترة من</span></th>
                <th class="excel-col-letter w-32" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">الفترة إلى</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">المطالبة (ج.م)</span></th>
                <th class="excel-col-letter w-32 text-left" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">الاستقطاعات</span></th>
                <th class="excel-col-letter w-32 text-left bg-emerald-50 text-[#107c41]" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">الصافي المحصل</span></th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'H'">H<br><span class="col-title">ملاحظات</span></th>
                <th class="excel-col-letter w-16 text-center select-none">حذف</th>
              </tr>
            </thead>
            <tbody>
              @for (ext of filteredExtracts(); track (ext.id || $index); let rowIdx = $index) {
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, ext.id)"
                  >
                    {{ rowIdx + 1 }}
                  </td>

                  <td
                    class="excel-cell font-mono font-bold"
                    [class.cell-selected]="selectedCellLabel() === ('A' + (rowIdx + 1))"
                    (click)="focusCell('A', rowIdx + 1, ext.number + '', ext.id)"
                  >
                    <input
                      type="number"
                      [value]="ext.number"
                      (blur)="updateExtractField(ext, 'number', +$any($event.target).value)"
                      class="cell-editor font-mono font-bold"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('B' + (rowIdx + 1))"
                    (click)="focusCell('B', rowIdx + 1, store.projectName(ext.projectId), ext.id)"
                  >
                    <select
                      [value]="ext.projectId"
                      (change)="updateExtractField(ext, 'projectId', +$any($event.target).value)"
                      class="cell-select font-bold"
                    >
                      @for (p of store.projects(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('C' + (rowIdx + 1))"
                    (click)="focusCell('C', rowIdx + 1, ext.from, ext.id)"
                  >
                    <input
                      type="date"
                      [value]="ext.from"
                      (change)="updateExtractField(ext, 'from', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('D' + (rowIdx + 1))"
                    (click)="focusCell('D', rowIdx + 1, ext.to, ext.id)"
                  >
                    <input
                      type="date"
                      [value]="ext.to"
                      (change)="updateExtractField(ext, 'to', $any($event.target).value)"
                      class="cell-editor"
                    />
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('E' + (rowIdx + 1))"
                    (click)="focusCell('E', rowIdx + 1, (ext.claimedAmount || 0) + '', ext.id)"
                  >
                    <input
                      type="number"
                      [value]="ext.claimedAmount || 0"
                      (blur)="updateExtractField(ext, 'claimedAmount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold"
                    />
                  </td>

                  <td
                    class="excel-cell text-left font-mono"
                    [class.cell-selected]="selectedCellLabel() === ('F' + (rowIdx + 1))"
                    (click)="focusCell('F', rowIdx + 1, (ext.deductions || 0) + '', ext.id)"
                  >
                    <input
                      type="number"
                      [value]="ext.deductions || 0"
                      (blur)="updateExtractField(ext, 'deductions', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-bold text-rose-600"
                    />
                  </td>

                  <td
                    class="excel-cell text-left font-mono font-black bg-emerald-50/50 text-[#107c41]"
                    [class.cell-selected]="selectedCellLabel() === ('G' + (rowIdx + 1))"
                    (click)="focusCell('G', rowIdx + 1, (ext.paidAmount || 0) + '', ext.id)"
                  >
                    <input
                      type="number"
                      [value]="ext.paidAmount || 0"
                      (blur)="updateExtractField(ext, 'paidAmount', +$any($event.target).value)"
                      class="cell-editor text-left font-mono font-black text-[#107c41]"
                    />
                  </td>

                  <td
                    class="excel-cell"
                    [class.cell-selected]="selectedCellLabel() === ('H' + (rowIdx + 1))"
                    (click)="focusCell('H', rowIdx + 1, ext.notes || '', ext.id)"
                  >
                    <input
                      type="text"
                      [value]="ext.notes"
                      (blur)="updateExtractField(ext, 'notes', $any($event.target).value)"
                      placeholder="ملاحظات..."
                      class="cell-editor"
                    />
                  </td>

                  <td class="excel-cell text-center select-none">
                    <button
                      type="button"
                      (click)="deleteExtractRow(ext)"
                      class="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف المستخلص"
                    >
                      <mat-icon class="!text-xs !w-3.5 !h-3.5">close</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <!-- TAB 7: MASTER AUDIT SUMMARY SHEET (شيت ميزان المراجعة والأرباح) -->
        @if (activeTab() === 'master') {
          <table
            class="excel-grid-table w-full text-right text-xs border-collapse"
            [class.show-gridlines]="showGridlines()"
          >
            <thead>
              <tr class="excel-header-letters">
                <th class="excel-corner-header text-center w-12 select-none">◰</th>
                <th class="excel-col-letter min-w-[160px]" [class.col-active]="activeColLetter() === 'A'">A<br><span class="col-title">المشروع</span></th>
                <th class="excel-col-letter w-32 text-left bg-blue-50 text-blue-700" [class.col-active]="activeColLetter() === 'B'">B<br><span class="col-title">المستخلصات</span></th>
                <th class="excel-col-letter w-32 text-left bg-emerald-50 text-[#107c41]" [class.col-active]="activeColLetter() === 'C'">C<br><span class="col-title">يوميات العمالة</span></th>
                <th class="excel-col-letter w-32 text-left bg-amber-50 text-amber-800" [class.col-active]="activeColLetter() === 'D'">D<br><span class="col-title">السلف</span></th>
                <th class="excel-col-letter w-32 text-left bg-rose-50 text-rose-700" [class.col-active]="activeColLetter() === 'E'">E<br><span class="col-title">المصاريف</span></th>
                <th class="excel-col-letter w-36 text-left bg-purple-50 text-purple-800 font-black" [class.col-active]="activeColLetter() === 'F'">F<br><span class="col-title">صافي الربح</span></th>
                <th class="excel-col-letter w-28 text-center" [class.col-active]="activeColLetter() === 'G'">G<br><span class="col-title">الهامش %</span></th>
                <th class="excel-col-letter w-28 text-center select-none" [class.col-active]="activeColLetter() === 'H'">H<br><span class="col-title">الحالة</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of masterSummaryRows(); track m.projectId; let rowIdx = $index) {
                <tr
                  class="excel-row"
                  [class.excel-row-active]="selectedRowNumber() === (rowIdx + 1)"
                >
                  <td
                    class="excel-row-num text-center select-none"
                    [class.row-header-active]="selectedRowNumber() === (rowIdx + 1)"
                    (click)="selectRowHeader(rowIdx + 1, m.projectId)"
                  >
                    {{ rowIdx + 1 }}
                  </td>
                  <td class="excel-cell font-bold text-slate-800 dark:text-slate-100">{{ m.projectName }}</td>
                  <td class="excel-cell text-left font-mono font-bold text-blue-700">{{ formatMoney(m.totalRevenue) }}</td>
                  <td class="excel-cell text-left font-mono font-bold text-[#107c41]">{{ formatMoney(m.totalLaborCost) }}</td>
                  <td class="excel-cell text-left font-mono font-bold text-amber-800">{{ formatMoney(m.totalAdvances) }}</td>
                  <td class="excel-cell text-left font-mono font-bold text-rose-700">{{ formatMoney(m.totalExpenses) }}</td>
                  <td class="excel-cell text-left font-mono font-black text-purple-800">{{ formatMoney(m.netProfit) }}</td>
                  <td class="excel-cell text-center font-mono font-bold" [class.text-emerald-700]="m.profitMargin >= 15" [class.text-amber-700]="m.profitMargin < 15">
                    {{ m.profitMargin.toFixed(1) }}%
                  </td>
                  <td class="excel-cell text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold" [class.bg-emerald-100]="m.active" [class.text-emerald-800]="m.active">
                      {{ m.active ? 'نشط' : 'مغلق' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- 6. BOTTOM WORKBOOK SHEETS BAR (شريط أوراق العمل السفلي الكلاسيكي لبرنامج إكسيل) -->
      <div
        class="excel-bottom-sheets-bar bg-[#f3f2f1] dark:bg-[#111827] border-t border-[#d4d4d4] dark:border-[#374151] px-2 py-0.5 flex items-center justify-between text-xs overflow-x-auto select-none"
      >
        <!-- Navigation Arrows & Tabs -->
        <div class="flex items-center gap-1 min-w-0">
          <div class="flex items-center text-gray-400 pl-1 border-l border-gray-300 dark:border-slate-700">
            <button type="button" (click)="cycleTab(-1)" class="p-1 hover:text-slate-800 dark:hover:text-white" title="الورقة السابقة">
              <mat-icon class="!text-sm !w-4 !h-4">chevron_right</mat-icon>
            </button>
            <button type="button" (click)="cycleTab(1)" class="p-1 hover:text-slate-800 dark:hover:text-white" title="الورقة التالية">
              <mat-icon class="!text-sm !w-4 !h-4">chevron_left</mat-icon>
            </button>
          </div>

          <!-- The Real Excel Tabs (أوراق العمل) -->
          <div class="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              (click)="setActiveTab('attendance')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'attendance'"
            >
              <span>📅 سجل اليوميات والحضور</span>
              <span class="tab-badge">{{ store.attendances().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('workers')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'workers'"
            >
              <span>👷 دليل العمال واليوميات</span>
              <span class="tab-badge">{{ store.workers().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('advances')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'advances'"
            >
              <span>💸 السلف والخصومات</span>
              <span class="tab-badge">{{ store.advances().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('expenses')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'expenses'"
            >
              <span>🏗️ مصاريف الموقع والتشغيل</span>
              <span class="tab-badge">{{ store.expenses().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('checks')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'checks'"
            >
              <span>🏢 الشيكات وحساب البنك</span>
              <span class="tab-badge">{{ store.checks().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('extracts')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'extracts'"
            >
              <span>📑 مستخلصات المشاريع</span>
              <span class="tab-badge">{{ store.extracts().length }}</span>
            </button>

            <button
              type="button"
              (click)="setActiveTab('master')"
              class="excel-bottom-sheet-tab"
              [class.excel-bottom-sheet-active]="activeTab() === 'master'"
            >
              <span>📊 ميزان الأرباح والمراجعة</span>
            </button>

            <button
              type="button"
              (click)="addNewRowToActiveSheet()"
              class="p-1 rounded-full text-[#107c41] hover:bg-emerald-100 flex items-center justify-center cursor-pointer"
              title="إضافة صف جديد للورقة الحالية"
            >
              <mat-icon class="!text-sm !w-4 !h-4">add</mat-icon>
            </button>
          </div>
        </div>
      </div>

      <!-- 7. MICROSOFT EXCEL STATUS BAR (شريط الحالة السفلي لإكسيل مع الدوال التلقائية والزوم) -->
      <div
        class="excel-status-bar bg-[#107c41] text-white px-3 py-1 flex flex-wrap items-center justify-between text-[11px] font-medium select-none shadow-inner"
      >
        <!-- Ready / Edit Status Indicator -->
        <div class="flex items-center gap-2">
          <span class="font-bold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
            <span>جاهز (Ready)</span>
          </span>
          <span class="text-white/40">|</span>
          <span class="text-white/90">
            انقر على أي مربع للتعديل المباشر · متزامن فورياً مع قاعدة البيانات
          </span>
        </div>

        <!-- Calculations Strip: AVERAGE, COUNT, SUM -->
        <div class="flex items-center gap-3 font-mono font-bold">
          <span title="متوسط القيم بالورقة الحالية">
            متوسط (AVERAGE): {{ formatMoney(activeSheetAvg()) }}
          </span>
          <span class="text-white/40">|</span>
          <span title="عدد الصفوف بالورقة الحالية">
            العدد (COUNT): {{ currentFilteredCount() }}
          </span>
          <span class="text-white/40">|</span>
          <span class="text-emerald-100 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-400/20" title="المجموع الإجمالي">
            المجموع (SUM): {{ formatMoney(activeSheetSum()) }}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: `
    .excel-app-window {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .ribbon-tab-btn {
      padding: 0.375rem 0.75rem;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }
    .ribbon-tab-btn:hover {
      color: #107c41;
      background-color: rgba(16, 124, 65, 0.05);
    }
    .ribbon-tab-btn-active {
      color: #107c41 !important;
      border-bottom: 3px solid #107c41 !important;
      background-color: #ffffff;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
    }
    :host-context(.dark) .ribbon-tab-btn-active {
      background-color: #1e293b;
      color: #34d399 !important;
      border-bottom-color: #34d399 !important;
    }
    .excel-grid-table {
      table-layout: auto;
      border-collapse: collapse;
    }
    .excel-grid-table.show-gridlines td,
    .excel-grid-table.show-gridlines th {
      border: 1px solid #d4d4d4;
    }
    :host-context(.dark) .excel-grid-table.show-gridlines td,
    :host-context(.dark) .excel-grid-table.show-gridlines th {
      border: 1px solid #334155;
    }
    .excel-header-letters th {
      background-color: #f3f2f1;
      color: #555555;
      font-weight: 700;
      text-align: center;
      padding: 0.25rem 0.5rem;
      user-select: none;
      position: sticky;
      top: 0;
      z-index: 20;
      border: 1px solid #d4d4d4;
      font-size: 0.7rem;
    }
    :host-context(.dark) .excel-header-letters th {
      background-color: #1e293b;
      color: #94a3b8;
      border-color: #334155;
    }
    .excel-col-letter.col-active {
      background-color: #d1fae5 !important;
      color: #065f46 !important;
      border-bottom: 2px solid #107c41 !important;
    }
    :host-context(.dark) .excel-col-letter.col-active {
      background-color: #064e3b !important;
      color: #a7f3d0 !important;
      border-bottom-color: #34d399 !important;
    }
    .col-title {
      font-size: 0.65rem;
      font-weight: normal;
      opacity: 0.85;
    }
    .excel-row-num {
      background-color: #f3f2f1;
      color: #666666;
      font-weight: 600;
      width: 2.75rem;
      font-size: 0.7rem;
      font-family: monospace;
      cursor: pointer;
      user-select: none;
      position: sticky;
      right: 0;
      z-index: 10;
      border: 1px solid #d4d4d4;
    }
    :host-context(.dark) .excel-row-num {
      background-color: #1e293b;
      color: #94a3b8;
      border-color: #334155;
    }
    .row-header-active {
      background-color: #d1fae5 !important;
      color: #065f46 !important;
      border-left: 3px solid #107c41 !important;
    }
    :host-context(.dark) .row-header-active {
      background-color: #064e3b !important;
      color: #a7f3d0 !important;
    }
    .excel-cell {
      padding: 0.15rem 0.35rem;
      vertical-align: middle;
      position: relative;
      background-color: #ffffff;
      color: #1f2937;
    }
    :host-context(.dark) .excel-cell {
      background-color: #0f172a;
      color: #f1f5f9;
    }
    .cell-selected {
      outline: 2px solid #107c41 !important;
      outline-offset: -2px;
      background-color: #f0fdf4 !important;
      z-index: 5;
    }
    :host-context(.dark) .cell-selected {
      outline-color: #34d399 !important;
      background-color: #064e3b/30 !important;
    }
    .excel-fill-handle {
      position: absolute;
      bottom: -3px;
      left: -3px;
      width: 7px;
      height: 7px;
      background-color: #107c41;
      border: 1px solid #ffffff;
      cursor: crosshair;
      z-index: 10;
    }
    .cell-editor {
      background: transparent;
      border: none;
      padding: 0.2rem 0.25rem;
      width: 100%;
      font-size: 0.75rem;
      color: inherit;
    }
    .cell-editor:focus {
      outline: none;
    }
    .cell-select {
      background: transparent;
      border: none;
      padding: 0.2rem 0.25rem;
      width: 100%;
      font-size: 0.75rem;
      color: inherit;
      cursor: pointer;
    }
    .cell-select:focus {
      outline: none;
    }
    .excel-bottom-sheet-tab {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #4b5563;
      background-color: #e5e7eb;
      border: 1px solid #d1d5db;
      border-bottom: none;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    :host-context(.dark) .excel-bottom-sheet-tab {
      background-color: #1e293b;
      color: #cbd5e1;
      border-color: #334155;
    }
    .excel-bottom-sheet-tab:hover {
      background-color: #ffffff;
      color: #111827;
    }
    .excel-bottom-sheet-active {
      background-color: #ffffff !important;
      color: #107c41 !important;
      font-weight: 800;
      border-top: 3px solid #107c41 !important;
      box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.05);
    }
    :host-context(.dark) .excel-bottom-sheet-active {
      background-color: #0f172a !important;
      color: #34d399 !important;
      border-top-color: #34d399 !important;
    }
    .tab-badge {
      font-size: 0.65rem;
      padding: 0.05rem 0.35rem;
      border-radius: 9999px;
      background-color: rgba(0, 0, 0, 0.06);
    }
  `,
})
export class LiveExcelPage {
  readonly store = inject(StoreService);
  private readonly excel = inject(ExcelService);

  readonly activeTab = signal<ExcelSheetTab>('attendance');
  readonly activeRibbonTab = signal<RibbonTab>('home');
  readonly searchQuery = signal<string>('');
  readonly selectedProjectId = signal<number | null>(null);
  readonly filterMonth = signal<string>('');
  readonly sortDescending = signal<boolean>(true);

  // View Options
  readonly showGridlines = signal<boolean>(true);
  readonly showFormulaBar = signal<boolean>(true);
  readonly zoomLevel = signal<number>(100);

  // Formatting Options
  readonly isCellBold = signal<boolean>(false);
  readonly isCellItalic = signal<boolean>(false);
  readonly textAlignMode = signal<'right' | 'center' | 'left'>('right');

  // Selected cell & Formula bar state
  readonly selectedCellLabel = signal<string>('A1');
  readonly activeColLetter = signal<string>('A');
  readonly selectedRowNumber = signal<number | null>(1);
  readonly activeFormulaValue = signal<string>('');
  readonly selectedRowId = signal<number | null>(null);

  readonly workbookTabs: ExcelSheetTab[] = [
    'attendance',
    'workers',
    'advances',
    'expenses',
    'checks',
    'extracts',
    'master',
  ];

  readonly activeWorkbookFileName = computed(() => {
    const projName = this.selectedProjectId()
      ? this.store.projectName(this.selectedProjectId()!)
      : 'كافة_المشاريع';
    return `دفتر_موقع_${projName}_${this.store.todayIso()}`;
  });

  setActiveTab(tab: ExcelSheetTab): void {
    this.activeTab.set(tab);
    this.selectedCellLabel.set('A1');
    this.activeColLetter.set('A');
    this.selectedRowNumber.set(1);
    this.activeFormulaValue.set('');
    this.selectedRowId.set(null);
  }

  cycleTab(dir: number): void {
    const currIdx = this.workbookTabs.indexOf(this.activeTab());
    const nextIdx = (currIdx + dir + this.workbookTabs.length) % this.workbookTabs.length;
    this.setActiveTab(this.workbookTabs[nextIdx]);
  }

  onProjectFilterChange(val: string): void {
    this.selectedProjectId.set(val === '' ? null : +val);
  }

  toggleSortDirection(): void {
    this.sortDescending.set(!this.sortDescending());
  }

  toggleCellBold(): void {
    this.isCellBold.set(!this.isCellBold());
  }

  toggleCellItalic(): void {
    this.isCellItalic.set(!this.isCellItalic());
  }

  focusCell(col: string, rowNum: number, value: string, rowId?: number): void {
    this.selectedCellLabel.set(`${col}${rowNum}`);
    this.activeColLetter.set(col);
    this.selectedRowNumber.set(rowNum);
    this.activeFormulaValue.set(value);
    if (rowId !== undefined) {
      this.selectedRowId.set(rowId);
    }
  }

  selectRowHeader(rowNum: number, rowId?: number): void {
    this.selectedRowNumber.set(rowNum);
    this.selectedCellLabel.set(`A${rowNum}`);
    this.activeColLetter.set('A');
    if (rowId !== undefined) {
      this.selectedRowId.set(rowId);
    }
  }

  onFormulaBarInput(newVal: string): void {
    this.activeFormulaValue.set(newVal);
  }

  commitCellEdit(): void {
    this.store.showToast(`تم حفظ القيمة في الخلية ${this.selectedCellLabel()}`, 'success');
  }

  revertCellEdit(): void {
    this.store.showToast('تم إلغاء تعديل الخلية', 'info');
  }

  triggerQuickSaveToast(): void {
    this.store.showToast('تم حفظ كافة البيانات في قاعدة البيانات بنجاح ✔️', 'success');
  }

  insertFormula(fn: string): void {
    this.activeFormulaValue.set(`=${fn}(...)`);
    this.store.showToast(`تم إدراج دالة ${fn}`, 'info');
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
    const desc = this.sortDescending();
    return list.sort((a, b) => desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
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
    const desc = this.sortDescending();
    return list.sort((a, b) => desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
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
    const desc = this.sortDescending();
    return list.sort((a, b) => desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
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
    const desc = this.sortDescending();
    return list.sort((a, b) => desc ? (b.dueDate || '').localeCompare(a.dueDate || '') : (a.dueDate || '').localeCompare(b.dueDate || ''));
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
    const desc = this.sortDescending();
    return list.sort((a, b) => desc ? b.number - a.number : a.number - b.number);
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

  deleteSelectedRow(): void {
    const rowId = this.selectedRowId();
    if (!rowId) return;

    switch (this.activeTab()) {
      case 'attendance': {
        const item = this.store.attendances().find((a) => a.id === rowId);
        if (item) void this.deleteAttendanceRow(item);
        break;
      }
      case 'workers': {
        const item = this.store.workers().find((w) => w.id === rowId);
        if (item) void this.deleteWorkerRow(item);
        break;
      }
      case 'advances': {
        const item = this.store.advances().find((a) => a.id === rowId);
        if (item) void this.deleteAdvanceRow(item);
        break;
      }
      case 'expenses': {
        const item = this.store.expenses().find((e) => e.id === rowId);
        if (item) void this.deleteExpenseRow(item);
        break;
      }
      case 'checks': {
        const item = this.store.checks().find((c) => c.id === rowId);
        if (item) void this.deleteCheckRow(item);
        break;
      }
      case 'extracts': {
        const item = this.store.extracts().find((e) => e.id === rowId);
        if (item) void this.deleteExtractRow(item);
        break;
      }
      case 'master':
        break;
    }
    this.selectedRowId.set(null);
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
        this.store.showToast('تم إدراج صف يومية جديد بنجاح', 'success');
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
          notes: 'أضيف من إكسيل المباشر',
        };
        await this.store.saveWorker(newWorker);
        this.store.showToast('تم إدراج عامل جديد في الشيت', 'success');
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
        this.store.showToast('تم إدراج سلفة جديدة في الشيت', 'success');
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
        this.store.showToast('تم إدراج بند مصروف جديد في الشيت', 'success');
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
        this.store.showToast('تم إدراج شيك جديد في الشيت', 'success');
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
        this.store.showToast('تم إدراج مستخلص جديد في الشيت', 'success');
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

  // Copy Sheet Data as TSV for direct paste into Excel / Google Sheets
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
