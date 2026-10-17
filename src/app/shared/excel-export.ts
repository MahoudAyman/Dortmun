import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { StoreService } from '../core/db/store';
import {
  calculateExtractLineMetrics,
  calculateExtractTotals,
} from '../core/calc/calculations';

@Injectable({
  providedIn: 'root',
})
export class ExcelService {
  private readonly store = inject(StoreService);

  exportFullWorkbook(options: { separateSheetPerProject?: boolean } = {}): void {
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };

    // 1. ملخص عام (General Summary)
    const summary = this.store.dashboardSummary();
    const summaryRows = [
      { البند: 'اسم الشركة', القيمة: this.store.settings().companyName, ملاحظات: 'تقرير شامل' },
      { البند: 'تاريخ التقرير', القيمة: this.store.todayIso(), ملاحظات: '' },
      { البند: 'إجمالي اليوميات المسجلة', القيمة: summary.totalDays, ملاحظات: 'يوم عمل' },
      { البند: 'إجمالي السهرات المسجلة', القيمة: summary.totalNights, ملاحظات: 'سهرة' },
      { البند: 'المطلوب من الشركة (صافي المستخلصات)', القيمة: summary.requiredFromCompany, ملاحظات: 'ج.م' },
      { البند: 'الواصل الفعلي من الشركة', القيمة: summary.totalCollected, ملاحظات: 'ج.م' },
      { البند: 'المتبقي طرف الشركة', القيمة: summary.remainingFromCompany, ملاحظات: 'ج.م' },
      { البند: 'إجمالي أجور العمال والناش', القيمة: summary.totalWorkerWages, ملاحظات: 'ج.م' },
      { البند: 'إجمالي المصاريف الخارجية', القيمة: summary.totalExternalExpenses, ملاحظات: 'ج.م' },
      { البند: 'صافي الربح التقريبي', القيمة: summary.ApproximateNetProfit, ملاحظات: 'المطلوب − الأجور − المصاريف' },
    ];
    this.appendRtlSheet(wb, 'ملخص عام', summaryRows);

    // 2. الحضور (Attendance)
    const attList = this.store.attendances();
    const attRows: Record<string, string | number>[] = attList.map((a) => ({
      التاريخ: a.date,
      العامل: this.store.workerName(a.workerId),
      المشروع: this.store.projectName(a.projectId),
      يومية: a.dayWorked,
      سهرة: a.nightWorked,
      'سعر يومية العامل (Snapshot)': a.workerDayRateSnapshot,
      'سعر سهرة العامل (Snapshot)': a.workerNightRateSnapshot,
      'إجمالي أجر العامل':
        (a.dayWorked ? a.workerDayRateSnapshot : 0) +
        (a.nightWorked ? a.workerNightRateSnapshot : 0),
      'سعر يومية الشركة (Snapshot)': a.companyDayRateSnapshot,
      'إجمالي مستحق الشركة':
        (a.dayWorked ? a.companyDayRateSnapshot : 0) +
        (a.nightWorked ? a.companyNightRateSnapshot : 0),
      ملاحظات: a.note || '',
    }));
    attRows.push({
      التاريخ: 'الإجمالي',
      العامل: `${attList.length} سجل`,
      المشروع: '',
      يومية: attList.reduce((s, a) => s + a.dayWorked, 0),
      سهرة: attList.reduce((s, a) => s + a.nightWorked, 0),
      'سعر يومية العامل (Snapshot)': '',
      'سعر سهرة العامل (Snapshot)': '',
      'إجمالي أجر العامل': attList.reduce(
        (s, a) =>
          s +
          (a.dayWorked ? a.workerDayRateSnapshot : 0) +
          (a.nightWorked ? a.workerNightRateSnapshot : 0),
        0
      ),
      'سعر يومية الشركة (Snapshot)': '',
      'إجمالي مستحق الشركة': attList.reduce(
        (s, a) =>
          s +
          (a.dayWorked ? a.companyDayRateSnapshot : 0) +
          (a.nightWorked ? a.companyNightRateSnapshot : 0),
        0
      ),
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'الحضور', attRows);

    // 3. السلف (Advances)
    const advList = this.store.advances();
    const advRows: Record<string, string | number>[] = advList.map((a) => ({
      التاريخ: a.date,
      العامل: this.store.workerName(a.workerId),
      المبلغ: a.amount,
      السبب: a.reason,
      الحالة: a.settlementId ? `مخصومة في تسوية #${a.settlementId}` : 'متبقية (مفتوحة)',
      ملاحظات: a.notes || '',
    }));
    advRows.push({
      التاريخ: 'الإجمالي',
      العامل: `${advList.length} سلفة`,
      المبلغ: advList.reduce((s, a) => s + a.amount, 0),
      السبب: '',
      الحالة: '',
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'السلف', advRows);

    // 4. التسويات (Settlements)
    const setList = this.store.settlements();
    const setRows: Record<string, string | number>[] = setList.map((st) => ({
      'تاريخ التسوية': st.date,
      العامل: this.store.workerName(st.workerId),
      'من تاريخ': st.from,
      'إلى تاريخ': st.to,
      الأيام: st.days,
      السهرات: st.nights,
      'إجمالي الأجر': st.grossWages,
      'السلف المخصومة': st.advancesDeducted,
      'الصافي المدفوع': st.netPaid,
      ملاحظات: st.notes || '',
    }));
    setRows.push({
      'تاريخ التسوية': 'الإجمالي',
      العامل: '',
      'من تاريخ': '',
      'إلى تاريخ': '',
      الأيام: setList.reduce((s, x) => s + x.days, 0),
      السهرات: setList.reduce((s, x) => s + x.nights, 0),
      'إجمالي الأجر': setList.reduce((s, x) => s + x.grossWages, 0),
      'السلف المخصومة': setList.reduce((s, x) => s + x.advancesDeducted, 0),
      'الصافي المدفوع': setList.reduce((s, x) => s + x.netPaid, 0),
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'التسويات', setRows);

    // 5. المستخلصات (Extracts per worker line)
    const extMap = new Map(this.store.extracts().map((e) => [e.id!, e]));
    const extLines = this.store.extractLines();
    const extTotals = calculateExtractTotals(extLines);
    const extRows: Record<string, string | number>[] = extLines.map((l) => {
      const m = calculateExtractLineMetrics(l);
      const parent = extMap.get(l.extractId);
      const chk = l.checkId
        ? this.store.checks().find((c) => c.id === l.checkId)?.number || ''
        : '';
      return {
        'رقم المستخلص': parent?.number || l.extractId,
        المشروع: this.store.projectName(parent?.projectId),
        الفترة: parent ? `${parent.from} إلى ${parent.to}` : '',
        العامل: this.store.workerName(l.workerId),
        المحسوب: m.calculated,
        'المطالب من الشركة': m.claimed,
        الفرق: m.difference,
        'نسبة الضريبة %': m.taxRate,
        'قيمة الضريبة': m.taxAmount,
        'الصافي المستحق': m.netDue,
        المحصّل: m.collected,
        'تاريخ التحصيل': m.collectedDate || '',
        'طريقة التحصيل': m.method,
        'رقم الشيك': chk,
        الحالة: m.status,
        المتبقي: m.remaining,
        ملاحظات: m.notes || '',
      };
    });
    extRows.push({
      'رقم المستخلص': 'الإجمالي',
      المشروع: '',
      الفترة: '',
      العامل: `${extLines.length} عامل`,
      المحسوب: extTotals.calculated,
      'المطالب من الشركة': extTotals.claimed,
      الفرق: extTotals.difference,
      'نسبة الضريبة %': '',
      'قيمة الضريبة': extTotals.taxAmount,
      'الصافي المستحق': extTotals.netDue,
      المحصّل: extTotals.collected,
      'تاريخ التحصيل': '',
      'طريقة التحصيل': '',
      'رقم الشيك': '',
      الحالة: '',
      المتبقي: extTotals.remaining,
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'المستخلصات', extRows);

    // 6. الإضافي (Extras)
    const extrasList = this.store.extras();
    const extraRows: Record<string, string | number>[] = extrasList.map((ex) => ({
      'رقم البند': ex.id || '',
      التاريخ: ex.date,
      المشروع: this.store.projectName(ex.projectId),
      النوع: ex.type,
      'بأمر من': ex.authorizedBy,
      التنفيذ: ex.performedBy === 'self' ? 'المقاول نفسه' : 'عمال المقاول',
      'عدد العمال': ex.workersCount,
      'طريقة القيمة':
        ex.valueMode === 'money'
          ? 'مبلغ مالي'
          : ex.valueMode === 'days'
            ? 'يوميات'
            : 'ملاحظة فقط',
      المبلغ: ex.amount,
      اليوميات: ex.days,
      ملاحظات: ex.notes || '',
    }));
    extraRows.push({
      'رقم البند': 'الإجمالي',
      التاريخ: '',
      المشروع: '',
      النوع: '',
      'بأمر من': '',
      التنفيذ: '',
      'عدد العمال': extrasList.reduce((s, e) => s + (e.workersCount || 0), 0),
      'طريقة القيمة': '',
      المبلغ: extrasList.reduce((s, e) => s + (e.amount || 0), 0),
      اليوميات: extrasList.reduce((s, e) => s + (e.days || 0), 0),
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'الإضافي', extraRows);

    // 7. قوائم الناش (ExtraCash)
    const extraMap = new Map(extrasList.map((e) => [e.id!, e]));
    const nashList = this.store.extraCashes();
    const nashRows: Record<string, string | number>[] = nashList.map((n) => {
      const parent = extraMap.get(n.extraId);
      const remaining = Math.max(0, (n.amount || 0) - (n.paidCash || 0));
      return {
        'رقم بند الإضافي': n.extraId,
        التاريخ: parent?.date || '',
        المشروع: this.store.projectName(parent?.projectId),
        'نوع الإضافي': parent?.type || '',
        العامل: this.store.workerName(n.workerId),
        المبلغ: n.amount,
        اليوميات: n.days,
        'المدفوع نقداً (ناش)': n.paidCash,
        المتبقي: remaining,
        ملاحظات: n.notes || '',
      };
    });
    nashRows.push({
      'رقم بند الإضافي': 'الإجمالي',
      التاريخ: '',
      المشروع: '',
      'نوع الإضافي': '',
      العامل: `${nashList.length} سجل`,
      المبلغ: nashList.reduce((s, n) => s + (n.amount || 0), 0),
      اليوميات: nashList.reduce((s, n) => s + (n.days || 0), 0),
      'المدفوع نقداً (ناش)': nashList.reduce((s, n) => s + (n.paidCash || 0), 0),
      المتبقي: nashList.reduce(
        (s, n) => s + Math.max(0, (n.amount || 0) - (n.paidCash || 0)),
        0
      ),
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'قوائم الناش', nashRows);

    // 8. الشيكات (Checks)
    const chkList = this.store.checks();
    const chkRows: Record<string, string | number>[] = chkList.map((c) => ({
      النوع: c.direction,
      'رقم الشيك': c.number,
      البنك: c.bank,
      المبلغ: c.amount,
      'تاريخ الاستحقاق': c.dueDate,
      الحالة: c.status,
      المشروع: this.store.projectName(c.projectId),
      'رقم المستخلص المرتبط': c.extractId || 'غير مرتبط',
      ملاحظات: c.notes || '',
    }));
    chkRows.push({
      النوع: 'الإجمالي',
      'رقم الشيك': `${chkList.length} شيك`,
      البنك: '',
      المبلغ: chkList.reduce((s, c) => s + c.amount, 0),
      'تاريخ الاستحقاق': '',
      الحالة: '',
      المشروع: '',
      'رقم المستخلص المرتبط': '',
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'الشيكات', chkRows);

    // 9. المصاريف (Expenses)
    const expList = this.store.expenses();
    const expRows: Record<string, string | number>[] = expList.map((e) => ({
      التاريخ: e.date,
      الفئة: e.category,
      المبلغ: e.amount,
      المشروع: this.store.projectName(e.projectId),
      ملاحظات: e.note || '',
    }));
    expRows.push({
      التاريخ: 'الإجمالي',
      الفئة: `${expList.length} بند`,
      المبلغ: expList.reduce((s, e) => s + e.amount, 0),
      المشروع: '',
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'المصاريف', expRows);

    // 10. الخصومات والجزاءات (Deductions)
    const dedList = this.store.deductions();
    const dedRows: Record<string, string | number>[] = dedList.map((d) => ({
      التاريخ: d.date,
      العامل: this.store.workerName(d.workerId),
      'نوع الخصم':
        d.mode === 'day'
          ? 'يوم كامل'
          : d.mode === 'half_day'
            ? 'نص يوم'
            : d.mode === 'quarter_day'
              ? 'ربع يوم'
              : 'مبلغ مالي',
      'معادل الأيام': d.daysDeducted,
      'مبلغ الخصم (ج.م)': d.amount,
      السبب: d.reason,
      الحالة: d.settlementId ? `مخصوم في تسوية #${d.settlementId}` : 'مفتوح (قيد الخصم)',
      ملاحظات: d.notes || '',
    }));
    dedRows.push({
      التاريخ: 'الإجمالي',
      العامل: `${dedList.length} خصم`,
      'نوع الخصم': '',
      'معادل الأيام': dedList.reduce((s, d) => s + d.daysDeducted, 0),
      'مبلغ الخصم (ج.م)': dedList.reduce((s, d) => s + d.amount, 0),
      السبب: '',
      الحالة: '',
      ملاحظات: '',
    });
    this.appendRtlSheet(wb, 'الخصومات والجزاءات', dedRows);

    // 11. العدد اليومي الإجباري (Daily Headcounts)
    const hcList = this.store.dailyHeadcounts();
    const hcRows: Record<string, string | number>[] = hcList.map((h) => ({
      التاريخ: h.date,
      المشروع: this.store.projectName(h.projectId),
      'عدد العمال الإجباري': h.workersCount,
      'عدد النحاتية الإجباري': h.sculptorsCount,
      'إجمالي اليوميات الإجباري': h.expectedDayCount,
      'عدد السهرة الإجباري': h.expectedNightCount,
      ملاحظات: h.notes || '',
    }));
    this.appendRtlSheet(wb, 'العدد اليومي الإجباري', hcRows);

    // Optional separate sheet per project
    if (options.separateSheetPerProject) {
      for (const proj of this.store.projects()) {
        const pAtt = attList.filter((a) => a.projectId === proj.id);
        const pRows = pAtt.map((a) => ({
          التاريخ: a.date,
          العامل: this.store.workerName(a.workerId),
          يومية: a.dayWorked,
          سهرة: a.nightWorked,
          'مستحق الشركة':
            (a.dayWorked ? a.companyDayRateSnapshot : 0) +
            (a.nightWorked ? a.companyNightRateSnapshot : 0),
          ملاحظات: a.note || '',
        }));
        const safeName = proj.name.slice(0, 28).replace(/[\\/?*[\]]/g, '');
        this.appendRtlSheet(wb, safeName, pRows);
      }
    }

    const fileName = `دورتمون_تقرير_المقاولات_${this.store.todayIso()}.xlsx`;
    XLSX.writeFile(wb, fileName);
    void this.store.updateSettings({ lastBackupDate: this.store.todayIso() });
    this.store.showToast('تم تصدير ملف الإكسل الشامل بنجاح', 'success');
  }

  downloadWorkersTemplate(): void {
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    const templateRows = [
      {
        الاسم: 'إبراهيم خليل',
        المهنة: 'نجار',
        'يومية العامل': 380,
        'سهرة العامل': 190,
        التليفون: '01099887766',
        ملاحظات: 'نجار مسلح',
      },
    ];
    this.appendRtlSheet(wb, 'قالب_العمال', templateRows);
    XLSX.writeFile(wb, 'قالب_استيراد_العمال_دورتمون.xlsx');
  }

  async importWorkersFromExcel(file: File): Promise<number> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
    let count = 0;

    for (const row of rows) {
      const name = String(row['الاسم'] || row['name'] || '').trim();
      if (!name) continue;
      const role = String(row['المهنة'] || row['role'] || 'عامل').trim();
      const workerDayRate =
        Number(row['يومية العامل'] || row['workerDayRate'] || this.store.settings().defaultWorkerDayRate) || 350;
      const workerNightRate =
        Number(row['سهرة العامل'] || row['workerNightRate'] || this.store.settings().defaultWorkerNightRate) || 180;
      const phone = String(row['التليفون'] || row['phone'] || '').trim();
      const notes = String(row['ملاحظات'] || row['notes'] || '').trim();

      await this.store.saveWorker({
        name,
        role,
        workerDayRate,
        workerNightRate,
        phone,
        active: true,
        notes,
      });
      count++;
    }

    if (count > 0) {
      this.store.showToast(`تم استيراد ${count} عمال من ملف الإكسل بنجاح`, 'success');
    }
    return count;
  }

  private appendRtlSheet(
    wb: XLSX.WorkBook,
    sheetName: string,
    rows: Record<string, unknown>[]
  ): void {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
}
