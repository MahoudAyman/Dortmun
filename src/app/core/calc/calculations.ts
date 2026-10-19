import type {
  Advance,
  AppSettings,
  Attendance,
  CheckItem,
  DailyHeadcount,
  Deduction,
  DeductionMode,
  Expense,
  ExtraCash,
  ExtraItem,
  Extract,
  ExtractLine,
  ExtractLineStatus,
  IncomingPayment,
  NumeralMode,
  Project,
  Settlement,
  Worker,
} from '../db/models';

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

export function toEnglishDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function formatNumber(
  value: number | undefined | null,
  mode: NumeralMode = 'ar',
  decimals = 0
): string {
  const safeVal = Number.isFinite(value) ? Number(value) : 0;
  const formatted = safeVal.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return mode === 'ar' ? toArabicDigits(formatted) : formatted;
}

export function formatCurrency(
  value: number | undefined | null,
  mode: NumeralMode = 'ar'
): string {
  const hasFraction = Math.abs((value ?? 0) % 1) > 0.001;
  return `${formatNumber(value, mode, hasFraction ? 2 : 0)} ج.م`;
}

export interface MonthlyCapCheckResult {
  currentDays: number;
  projectedDays: number;
  cap: number;
  reachedCap: boolean;
  exceedsCap: boolean;
  canProceed: boolean;
  requiresConfirmation: boolean;
  message: string | null;
}

export function checkMonthlyCap(
  attendancesInMonth: Attendance[],
  workerId: number,
  additionalDays: number,
  settings: Pick<AppSettings, 'monthlyDayCap' | 'capMode'>,
  excludeAttendanceId?: number
): MonthlyCapCheckResult {
  const currentDays = attendancesInMonth
    .filter((a) => a.workerId === workerId && a.id !== excludeAttendanceId)
    .reduce((sum, a) => sum + (a.dayWorked ? 1 : 0), 0);

  const projectedDays = currentDays + additionalDays;
  const cap = settings.monthlyDayCap || 30;
  const reachedCap = currentDays >= cap;
  const exceedsCap = projectedDays > cap && additionalDays > 0;

  if (!exceedsCap) {
    if (projectedDays === cap && additionalDays > 0) {
      return {
        currentDays,
        projectedDays,
        cap,
        reachedCap: true,
        exceedsCap: false,
        canProceed: true,
        requiresConfirmation: false,
        message: `تنبيه: العامل ده وصل الحد الشهري ${cap} يومية بالظبط.`,
      };
    }
    return {
      currentDays,
      projectedDays,
      cap,
      reachedCap,
      exceedsCap: false,
      canProceed: true,
      requiresConfirmation: false,
      message: null,
    };
  }

  if (settings.capMode === 'block') {
    return {
      currentDays,
      projectedDays,
      cap,
      reachedCap: true,
      exceedsCap: true,
      canProceed: false,
      requiresConfirmation: false,
      message: `العامل ده وصل الحد الشهري ${cap} يومية (مسجل ليه ${currentDays} يومية). الإضافة ممنوعة حسب الإعدادات.`,
    };
  }

  return {
    currentDays,
    projectedDays,
    cap,
    reachedCap: true,
    exceedsCap: true,
    canProceed: true,
    requiresConfirmation: true,
    message: `اعمل حسابك! العامل ده وصل الحد الشهري ${cap} يومية (إجمالي بعد الإضافة: ${projectedDays} يومية). هل متأكد من التجاوز؟`,
  };
}

export function findDuplicateAttendance(
  attendances: Attendance[],
  workerId: number,
  date: string,
  projectId: number
): Attendance | undefined {
  return attendances.find(
    (a) => a.workerId === workerId && a.date === date && a.projectId === projectId
  );
}

export function calculateDeductionAmount(
  mode: DeductionMode,
  workerDayRate: number,
  customMoneyAmount = 0
): { daysDeducted: number; amount: number } {
  if (mode === 'day') {
    return { daysDeducted: 1, amount: Math.round(workerDayRate) };
  }
  if (mode === 'half_day') {
    return { daysDeducted: 0.5, amount: Math.round(workerDayRate * 0.5) };
  }
  if (mode === 'quarter_day') {
    return { daysDeducted: 0.25, amount: Math.round(workerDayRate * 0.25) };
  }
  return { daysDeducted: 0, amount: Math.max(0, Math.round(customMoneyAmount)) };
}

export interface SettlementCalculation {
  workerId: number;
  from: string;
  to: string;
  days: number;
  nights: number;
  dayWages: number;
  nightWages: number;
  extraWages: number;
  grossWages: number;
  advancesDeducted: number;
  unsettledAdvanceIds: number[];
  deductionsDeducted: number;
  deductionDays: number;
  unsettledDeductionIds: number[];
  netPaid: number;
}

export function calculateSettlement(
  worker: Worker,
  from: string,
  to: string,
  attendances: Attendance[],
  advances: Advance[],
  extraCashes: ExtraCash[] = [],
  extras: ExtraItem[] = [],
  deductions: Deduction[] = []
): SettlementCalculation {
  const periodAttendances = attendances.filter(
    (a) => a.workerId === worker.id && a.date >= from && a.date <= to
  );

  let days = 0;
  let nights = 0;
  let dayWages = 0;
  let nightWages = 0;

  for (const att of periodAttendances) {
    if (att.dayWorked) {
      days += 1;
      dayWages += att.workerDayRateSnapshot ?? worker.workerDayRate;
    }
    if (att.nightWorked) {
      nights += 1;
      nightWages += att.workerNightRateSnapshot ?? worker.workerNightRate;
    }
  }

  // Extra cash remaining for worker in period
  const extraIdsInPeriod = new Set(
    extras.filter((e) => e.date >= from && e.date <= to && e.id !== undefined).map((e) => e.id!)
  );
  let extraWages = 0;
  for (const ec of extraCashes) {
    if (ec.workerId === worker.id && extraIdsInPeriod.has(ec.extraId)) {
      const val = ec.amount > 0 ? ec.amount : ec.days * worker.workerDayRate;
      const unpaid = Math.max(0, val - (ec.paidCash || 0));
      extraWages += unpaid;
    }
  }

  const grossWages = dayWages + nightWages + extraWages;

  const unsettledAdvances = advances.filter(
    (adv) =>
      adv.workerId === worker.id &&
      adv.settlementId === null &&
      adv.date <= to
  );

  const advancesDeducted = unsettledAdvances.reduce((s, a) => s + a.amount, 0);
  const unsettledAdvanceIds = unsettledAdvances
    .map((a) => a.id!)
    .filter((id) => id !== undefined);

  const unsettledDeductions = deductions.filter(
    (ded) =>
      ded.workerId === worker.id &&
      ded.settlementId === null &&
      ded.date <= to
  );
  const deductionsDeducted = unsettledDeductions.reduce((s, d) => s + d.amount, 0);
  const deductionDays = unsettledDeductions.reduce((s, d) => s + (d.daysDeducted || 0), 0);
  const unsettledDeductionIds = unsettledDeductions
    .map((d) => d.id!)
    .filter((id) => id !== undefined);

  const netPaid = grossWages - advancesDeducted - deductionsDeducted;

  return {
    workerId: worker.id!,
    from,
    to,
    days,
    nights,
    dayWages,
    nightWages,
    extraWages,
    grossWages,
    advancesDeducted,
    unsettledAdvanceIds,
    deductionsDeducted,
    deductionDays,
    unsettledDeductionIds,
    netPaid,
  };
}

export interface ExtraCalculatedTotals {
  totalValue: number;
  totalDays: number;
  workersCount: number;
  totalPaidCash: number;
  remaining: number;
}

export function calculateExtraSingleValue(
  extra: Pick<ExtraItem, 'valueMode' | 'amount' | 'days'>,
  companyDayRate: number
): number {
  // Rule: "طريقة القيمة: فلوس (مبلغ) أو يوميات (عدد) أو ملاحظة فقط. ولو اتسجل بالاتنين يتحسب مرة واحدة."
  if (extra.valueMode === 'note') {
    return 0;
  }
  if (extra.valueMode === 'money' || extra.amount > 0) {
    return extra.amount;
  }
  if (extra.valueMode === 'days' || extra.days > 0) {
    return extra.days * companyDayRate;
  }
  return 0;
}

export function calculateExtraTotals(
  extra: ExtraItem,
  nashRows: ExtraCash[],
  companyDayRate: number,
  workersMap: Map<number, Worker>
): ExtraCalculatedTotals {
  let totalValue = 0;
  let totalDays = 0;
  let totalPaidCash = 0;

  if (nashRows.length > 0) {
    for (const row of nashRows) {
      const workerRate = workersMap.get(row.workerId)?.workerDayRate || companyDayRate;
      // Count once even if both amount and days are filled
      const rowValue = row.amount > 0 ? row.amount : row.days * workerRate;
      totalValue += rowValue;
      totalDays += row.days || 0;
      totalPaidCash += row.paidCash || 0;
    }
  } else {
    totalValue = calculateExtraSingleValue(extra, companyDayRate);
    totalDays = extra.days || 0;
  }

  return {
    totalValue,
    totalDays,
    workersCount: nashRows.length > 0 ? nashRows.length : extra.workersCount || 0,
    totalPaidCash,
    remaining: Math.max(0, totalValue - totalPaidCash),
  };
}

export function calculateWorkerExtractBase(
  workerId: number,
  projectId: number,
  from: string,
  to: string,
  attendances: Attendance[],
  extras: ExtraItem[],
  extraCashes: ExtraCash[],
  companyDayRate: number,
  companyNightRate: number
): {
  days: number;
  nights: number;
  attendanceValue: number;
  extrasValue: number;
  calculatedTotal: number;
} {
  const workerAtt = attendances.filter(
    (a) =>
      a.workerId === workerId &&
      a.projectId === projectId &&
      a.date >= from &&
      a.date <= to
  );

  let days = 0;
  let nights = 0;
  let attendanceValue = 0;

  for (const att of workerAtt) {
    if (att.dayWorked) {
      days += 1;
      attendanceValue += att.companyDayRateSnapshot || companyDayRate;
    }
    if (att.nightWorked) {
      nights += 1;
      attendanceValue += att.companyNightRateSnapshot || companyNightRate;
    }
  }

  // Extras inside period for this project & worker (counted once)
  const projectExtrasInPeriod = new Map<number, ExtraItem>();
  for (const ex of extras) {
    if (ex.projectId === projectId && ex.date >= from && ex.date <= to && ex.id !== undefined) {
      projectExtrasInPeriod.set(ex.id, ex);
    }
  }

  let extrasValue = 0;
  const processedExtraIdsForWorker = new Set<number>();

  for (const ec of extraCashes) {
    if (
      ec.workerId === workerId &&
      projectExtrasInPeriod.has(ec.extraId) &&
      !processedExtraIdsForWorker.has(ec.extraId)
    ) {
      processedExtraIdsForWorker.add(ec.extraId);
      const ex = projectExtrasInPeriod.get(ec.extraId)!;
      if (ex.valueMode === 'note') continue;
      // If both amount and days are filled, count once (prefer explicit amount, else days * companyDayRate)
      const val = ec.amount > 0 ? ec.amount : ec.days * companyDayRate;
      extrasValue += val;
    }
  }

  return {
    days,
    nights,
    attendanceValue,
    extrasValue,
    calculatedTotal: attendanceValue + extrasValue,
  };
}

export interface ComputedExtractLine extends ExtractLine {
  difference: number; // claimed - calculated
  netDue: number; // claimed - taxAmount
  remaining: number; // netDue - collected
  status: ExtractLineStatus;
}

export function calculateExtractLineMetrics(line: ExtractLine): ComputedExtractLine {
  const calculated = Number(line.calculated) || 0;
  const claimed = Number(line.claimed) || 0;
  const taxRate = Number(line.taxRate) || 0;
  const taxAmount = Math.round(((claimed * taxRate) / 100) * 100) / 100;
  const netDue = Math.round((claimed - taxAmount) * 100) / 100;
  const collected = Number(line.collected) || 0;
  const remaining = Math.round((netDue - collected) * 100) / 100;
  const difference = Math.round((claimed - calculated) * 100) / 100;

  let status: ExtractLineStatus = 'لم يُحصّل';
  if (collected > 0 && remaining <= 0.01) {
    status = 'محصّل بالكامل';
  } else if (collected > 0) {
    status = 'جزئي';
  }

  return {
    ...line,
    calculated,
    claimed,
    taxRate,
    taxAmount,
    collected,
    difference,
    netDue,
    remaining,
    status,
  };
}

export interface ExtractTotals {
  calculated: number;
  claimed: number;
  difference: number;
  taxAmount: number;
  netDue: number;
  collected: number;
  remaining: number;
}

export function calculateExtractTotals(lines: ExtractLine[]): ExtractTotals {
  const computed = lines.map(calculateExtractLineMetrics);
  return computed.reduce(
    (acc, row) => ({
      calculated: acc.calculated + row.calculated,
      claimed: acc.claimed + row.claimed,
      difference: acc.difference + row.difference,
      taxAmount: acc.taxAmount + row.taxAmount,
      netDue: acc.netDue + row.netDue,
      collected: acc.collected + row.collected,
      remaining: acc.remaining + row.remaining,
    }),
    {
      calculated: 0,
      claimed: 0,
      difference: 0,
      taxAmount: 0,
      netDue: 0,
      collected: 0,
      remaining: 0,
    }
  );
}

export interface DashboardSummary {
  totalDays: number;
  totalNights: number;
  requiredFromCompany: number;
  totalCollected: number;
  remainingFromCompany: number;
  totalWorkerWages: number;
  totalAdvancesGiven: number;
  totalExternalExpenses: number;
  ApproximateNetProfit: number;
  incomingChecksPending: number;
  incomingChecksCashed: number;
  outgoingChecksPending: number;
  outgoingChecksCashed: number;
}

export function calculateDashboardSummary(params: {
  attendances: Attendance[];
  extractLines: ExtractLine[];
  advances: Advance[];
  checks: CheckItem[];
  expenses: Expense[];
  extras: ExtraItem[];
  extraCashes: ExtraCash[];
  projectId?: number | null;
  fromDate?: string;
  toDate?: string;
}): DashboardSummary {
  const {
    attendances,
    extractLines,
    advances,
    checks,
    expenses,
    extras,
    extraCashes,
    projectId,
    fromDate,
    toDate,
  } = params;

  const filteredAtt = attendances.filter((a) => {
    if (projectId && a.projectId !== projectId) return false;
    if (fromDate && a.date < fromDate) return false;
    if (toDate && a.date > toDate) return false;
    return true;
  });

  let totalDays = 0;
  let totalNights = 0;
  let attCompanyValue = 0;
  let attWorkerWages = 0;

  for (const a of filteredAtt) {
    if (a.dayWorked) {
      totalDays += 1;
      attCompanyValue += a.companyDayRateSnapshot || 0;
      attWorkerWages += a.workerDayRateSnapshot || 0;
    }
    if (a.nightWorked) {
      totalNights += 1;
      attCompanyValue += a.companyNightRateSnapshot || 0;
      attWorkerWages += a.workerNightRateSnapshot || 0;
    }
  }

  const filteredExtras = extras.filter((e) => {
    if (projectId && e.projectId !== projectId) return false;
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    return true;
  });

  const extraIds = new Set(filteredExtras.map((e) => e.id!));
  let extraWorkerCost = 0;
  let extraCompanyClaim = 0;
  for (const e of filteredExtras) {
    if (e.valueMode !== 'note') {
      extraCompanyClaim += e.amount > 0 ? e.amount : 0;
    }
  }
  for (const ec of extraCashes) {
    if (extraIds.has(ec.extraId)) {
      extraWorkerCost += ec.amount > 0 ? ec.amount : ec.paidCash || 0;
    }
  }

  // If extractLines exist, use their claimed/collected; also support attendance-based required if higher or no extract yet
  const extractTotals = calculateExtractTotals(extractLines);
  const requiredFromCompany =
    extractTotals.netDue > 0
      ? extractTotals.netDue
      : attCompanyValue + extraCompanyClaim;

  const totalCollected = extractTotals.collected;
  const remainingFromCompany = Math.max(0, requiredFromCompany - totalCollected);

  const totalWorkerWages = attWorkerWages + extraWorkerCost;

  const filteredExpenses = expenses.filter((ex) => {
    if (projectId && ex.projectId && ex.projectId !== projectId) return false;
    if (fromDate && ex.date < fromDate) return false;
    if (toDate && ex.date > toDate) return false;
    return true;
  });
  const totalExternalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const filteredAdvances = advances.filter((adv) => {
    if (fromDate && adv.date < fromDate) return false;
    if (toDate && adv.date > toDate) return false;
    return true;
  });
  const totalAdvancesGiven = filteredAdvances.reduce((s, a) => s + a.amount, 0);

  const filteredChecks = checks.filter((c) => {
    if (projectId && c.projectId && c.projectId !== projectId) return false;
    return true;
  });

  let incomingChecksPending = 0;
  let incomingChecksCashed = 0;
  let outgoingChecksPending = 0;
  let outgoingChecksCashed = 0;

  for (const ch of filteredChecks) {
    if (ch.direction === 'وارد') {
      if (ch.status === 'معلق') incomingChecksPending += ch.amount;
      if (ch.status === 'اتصرف') incomingChecksCashed += ch.amount;
    } else {
      if (ch.status === 'معلق') outgoingChecksPending += ch.amount;
      if (ch.status === 'اتصرف') outgoingChecksCashed += ch.amount;
    }
  }

  // صافي الربح التقريبي = المطلوب من الشركة − أجور العمال − المصاريف
  const ApproximateNetProfit =
    requiredFromCompany - totalWorkerWages - totalExternalExpenses;

  return {
    totalDays,
    totalNights,
    requiredFromCompany,
    totalCollected,
    remainingFromCompany,
    totalWorkerWages,
    totalAdvancesGiven,
    totalExternalExpenses,
    ApproximateNetProfit,
    incomingChecksPending,
    incomingChecksCashed,
    outgoingChecksPending,
    outgoingChecksCashed,
  };
}

export function getDueChecksAlerts(
  checks: CheckItem[],
  todayIso: string,
  daysThreshold = 3
): { check: CheckItem; daysRemaining: number }[] {
  const todayMs = new Date(todayIso + 'T00:00:00Z').getTime();
  const alerts: { check: CheckItem; daysRemaining: number }[] = [];

  for (const check of checks) {
    if (check.status !== 'معلق') continue;
    const dueMs = new Date(check.dueDate + 'T00:00:00Z').getTime();
    const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays <= daysThreshold) {
      alerts.push({ check, daysRemaining: diffDays });
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function getLowAttendanceWorkers(
  workers: Worker[],
  attendancesInMonth: Attendance[],
  expectedMonthlyDays: number,
  monthlyDayCap: number
): {
  belowExpected: { worker: Worker; days: number; shortage: number }[];
  reachedCap: { worker: Worker; days: number }[];
} {
  const belowExpected: { worker: Worker; days: number; shortage: number }[] = [];
  const reachedCap: { worker: Worker; days: number }[] = [];

  for (const w of workers) {
    if (!w.active || w.id === undefined) continue;
    const days = attendancesInMonth
      .filter((a) => a.workerId === w.id)
      .reduce((s, a) => s + (a.dayWorked ? 1 : 0), 0);

    if (days >= monthlyDayCap) {
      reachedCap.push({ worker: w, days });
    } else if (days < expectedMonthlyDays) {
      belowExpected.push({
        worker: w,
        days,
        shortage: expectedMonthlyDays - days,
      });
    }
  }

  return { belowExpected, reachedCap };
}

export function isBackupOverdue(
  lastBackupDate: string | null,
  reminderDays: number,
  todayIso: string
): boolean {
  if (!lastBackupDate) return true;
  const lastMs = new Date(lastBackupDate).getTime();
  const todayMs = new Date(todayIso).getTime();
  const diffDays = (todayMs - lastMs) / (1000 * 60 * 60 * 24);
  return diffDays >= reminderDays;
}

export interface DailyHeadcountComparison {
  date: string;
  projectId: number | null;
  hasMandatoryRecord: boolean;
  headcount: DailyHeadcount | null;
  expectedDays: number;
  expectedNights: number;
  expectedSculptors: number;
  expectedRegularWorkers: number;
  actualDays: number;
  actualNights: number;
  actualSculptors: number;
  actualRegularWorkers: number;
  dayDiff: number;
  nightDiff: number;
  isSameDayCount: boolean;
  isSameNightCount: boolean;
  isExactMatch: boolean;
  statusLabel: string;
}

export function compareDailyHeadcount(params: {
  date: string;
  projectId?: number | null;
  headcounts: DailyHeadcount[];
  attendances: Attendance[];
  workers: Worker[];
}): DailyHeadcountComparison {
  const { date, projectId = null, headcounts, attendances, workers } = params;

  const matchingHeadcounts = headcounts.filter(
    (h) => h.date === date && (!projectId || !h.projectId || h.projectId === projectId)
  );
  const hasMandatoryRecord = matchingHeadcounts.length > 0;
  const headcount = matchingHeadcounts[0] || null;

  const expectedDays = matchingHeadcounts.reduce((s, h) => s + (h.expectedDayCount || 0), 0);
  const expectedNights = matchingHeadcounts.reduce((s, h) => s + (h.expectedNightCount || 0), 0);
  const expectedSculptors = matchingHeadcounts.reduce((s, h) => s + (h.sculptorsCount || 0), 0);
  const expectedRegularWorkers = matchingHeadcounts.reduce((s, h) => s + (h.workersCount || 0), 0);

  const workerMap = new Map(workers.map((w) => [w.id!, w]));
  const dayAttendances = attendances.filter(
    (a) => a.date === date && (!projectId || a.projectId === projectId)
  );

  let actualDays = 0;
  let actualNights = 0;
  let actualSculptors = 0;
  let actualRegularWorkers = 0;

  for (const att of dayAttendances) {
    const w = workerMap.get(att.workerId);
    const isSculptor = w?.role.includes('نحات') ?? false;
    if (att.dayWorked) {
      actualDays += 1;
      if (isSculptor) actualSculptors += 1;
      else actualRegularWorkers += 1;
    }
    if (att.nightWorked) {
      actualNights += 1;
    }
  }

  const dayDiff = actualDays - expectedDays;
  const nightDiff = actualNights - expectedNights;
  const isSameDayCount = hasMandatoryRecord && dayDiff === 0;
  const isSameNightCount = hasMandatoryRecord && nightDiff === 0;
  const isExactMatch = isSameDayCount && isSameNightCount;

  let statusLabel = 'لم يُسجّل العدد الإجباري لهذا اليوم بعد';
  if (hasMandatoryRecord) {
    if (isExactMatch) {
      statusLabel = 'نفس العدد تماماً (مطابق ١٠٠٪)';
    } else {
      const parts: string[] = [];
      if (dayDiff < 0) parts.push(`ناقص ${Math.abs(dayDiff)} يومية`);
      if (dayDiff > 0) parts.push(`زيادة ${dayDiff} يومية`);
      if (nightDiff < 0) parts.push(`ناقص ${Math.abs(nightDiff)} سهرة`);
      if (nightDiff > 0) parts.push(`زيادة ${nightDiff} سهرة`);
      statusLabel = `غير مطابق (${parts.join(' · ')})`;
    }
  }

  return {
    date,
    projectId,
    hasMandatoryRecord,
    headcount,
    expectedDays,
    expectedNights,
    expectedSculptors,
    expectedRegularWorkers,
    actualDays,
    actualNights,
    actualSculptors,
    actualRegularWorkers,
    dayDiff,
    nightDiff,
    isSameDayCount,
    isSameNightCount,
    isExactMatch,
    statusLabel,
  };
}

export interface Payday15CycleInfo {
  from: string;
  to: string;
  nextPaydayIso: string;
  daysUntilPayday: number;
  isPaydayNear: boolean;
  label: string;
}

export function getPayday15CycleInfo(todayIso: string, paydayDay = 15): Payday15CycleInfo {
  const parts = todayIso.split('-').map(Number);
  const year = parts[0] || 2026;
  const month = parts[1] || 10; // 1-12
  const day = parts[2] || 15;

  const pad = (n: number) => String(n).padStart(2, '0');

  let fromYear = year;
  let fromMonth = month - 1;
  if (fromMonth < 1) {
    fromMonth = 12;
    fromYear -= 1;
  }

  const from = `${fromYear}-${pad(fromMonth)}-16`;
  const to = `${year}-${pad(month)}-${pad(paydayDay)}`;

  let nextYear = year;
  let nextMonth = month;
  if (day > paydayDay + 3) {
    nextMonth += 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
  }
  const nextPaydayIso = `${nextYear}-${pad(nextMonth)}-${pad(paydayDay)}`;
  const todayMs = new Date(todayIso + 'T00:00:00Z').getTime();
  const nextMs = new Date(nextPaydayIso + 'T00:00:00Z').getTime();
  const daysUntilPayday = Math.round((nextMs - todayMs) / (1000 * 60 * 60 * 24));
  const isPaydayNear = Math.abs(day - paydayDay) <= 4 || (daysUntilPayday >= 0 && daysUntilPayday <= 4);

  return {
    from,
    to,
    nextPaydayIso,
    daysUntilPayday,
    isPaydayNear,
    label: `دورة قبض يوم ${paydayDay} (${from} إلى ${to})`,
  };
}

export interface ProjectLedgerBreakdown {
  projectId: number | null;
  projectName: string;
  companyDayRate: number;
  companyNightRate: number;
  daysCount: number;
  daysWorked: number;
  nightsCount: number;
  nightsWorked: number;
  workersCount: number;
  receivedFromChecks: number;
  receivedFromPersons: number;
  receivedFromCompany: number;
  receivedFromCompanies: number;
  receivedFromExtracts: number;
  totalReceived: number;
  totalReceivedForProject: number;
  pendingIncomingChecks: number;
  companyEntitlement: number;
  owedToMeInProject: number; // ليّا كام في المشروع
  workerGrossWages: number;
  advancesSpent: number; // اتصرف سلف كام في المشروع
  deductionsApplied: number; // خصومات وجزاءات المشروع
  settlementsPaid: number; // قبض العمال المنصرف في المشروع
  nashPaid: number; // ناش مدفوع في المشروع
  expensesSpent: number; // مصاريف المشروع الخارجية
  outgoingChecksCashed: number;
  pendingOutgoingChecks: number;
  totalSpentInProject: number; // إجمالي المنصرف الفعلي في المشروع
  owedByMeInProject: number; // عليّا كام في المشروع (متبقي للعمال + شيكات صادرة معلقة)
  netProfit: number; // صافي ربح المشروع الكلي
  cashBalance: number; // السيولة النقدية الصافية للمشروع (الواصل − المنصرف)
  cashFlowBalance: number;
  collectionPercent: number;
}

export interface LedgerMovementItem {
  id: string;
  rawId?: number;
  isCustomIncoming?: boolean;
  date: string;
  direction: 'in' | 'out';
  title: string;
  category: string;
  subtitle: string;
  categoryLabel: string;
  sourceType: 'شيك' | 'شخص' | 'شركة' | 'مستخلص' | 'سلفة' | 'قبض ١٥' | 'ناش' | 'مصروف' | 'أخرى';
  partyName: string;
  projectId: number | null;
  projectName: string;
  method: string;
  amount: number;
  notes: string;
}

export interface ComprehensiveLedgerSummary {
  // الواصل فعلياً (مقبوضات)
  receivedFromChecks: number;
  receivedFromPersons: number;
  receivedFromCompaniesAndExtracts: number;
  receivedFromCompanies: number;
  totalReceivedAll: number;
  totalReceivedAllSources: number;

  // المنصرف فعلياً (مدفوعات)
  totalAdvancesSpent: number;
  totalAdvancesPaid: number;
  totalSettlementsPaid: number;
  totalNashPaid: number;
  totalNashCashPaid: number;
  totalExpensesSpent: number;
  totalExternalExpenses: number;
  totalOutgoingChecksCashed: number;
  totalSpentAll: number;
  totalSpentAllProjects: number;

  // ليّا وعليّا والربح والخزنة
  totalCompanyEntitlement: number;
  totalWorkerGrossWages: number;
  totalDeductionsApplied: number;
  owedToMeFromCompanies: number;
  pendingIncomingChecks: number;
  pendingIncomingChecksTotal: number;
  pendingOutgoingChecks: number;
  pendingOutgoingChecksTotal: number;
  remainingOwedToWorkers: number;
  owedByMeToWorkers: number;
  totalOwedToMe: number; // إجمالي اللي ليّا بره (عند الشركات + شيكات واردة معلقة)
  totalOwedByMe: number; // إجمالي اللي عليّا للناس (متبقي أجور العمال + شيكات صادرة معلقة)
  totalNetProfit: number; // صافي الربح الكلي لكل المشاريع
  overallNetProfit: number;
  netCashInHand: number; // صافي الخزنة / الفلوس اللي في إيدي فعلياً (إجمالي الواصل − إجمالي المنصرف)

  projectBreakdowns: ProjectLedgerBreakdown[];
  movements: LedgerMovementItem[];
}

export function calculateComprehensiveLedger(params: {
  projects: Project[];
  workers: Worker[];
  attendances: Attendance[];
  advances: Advance[];
  deductions: Deduction[];
  settlements: Settlement[];
  extracts: Extract[];
  extractLines: ExtractLine[];
  extras: ExtraItem[];
  extraCashes: ExtraCash[];
  checks: CheckItem[];
  expenses: Expense[];
  incomingPayments: IncomingPayment[];
  filterProjectId?: number | null;
  selectedProjectId?: number | null;
}): ComprehensiveLedgerSummary {
  const {
    projects,
    workers,
    attendances,
    advances,
    deductions,
    settlements,
    extracts,
    extractLines,
    extras,
    extraCashes,
    checks,
    expenses,
    incomingPayments = [],
  } = params;
  const filterProjectId = params.filterProjectId ?? params.selectedProjectId ?? null;

  const projectMap = new Map<number, Project>();
  for (const p of projects) {
    if (p.id !== undefined) projectMap.set(p.id, p);
  }
  const workerMap = new Map<number, Worker>();
  for (const w of workers) {
    if (w.id !== undefined) workerMap.set(w.id, w);
  }

  // Determine each worker's primary project based on attendance (fallback to first active project)
  const defaultProjId = projects[0]?.id ?? null;
  const workerPrimaryProject = new Map<number, number | null>();
  for (const w of workers) {
    if (w.id === undefined) continue;
    const wAtt = attendances.filter((a) => a.workerId === w.id);
    if (wAtt.length > 0) {
      const counts = new Map<number, number>();
      for (const a of wAtt) {
        counts.set(a.projectId, (counts.get(a.projectId) || 0) + 1);
      }
      let bestProj = wAtt[0].projectId;
      let bestCnt = 0;
      for (const [pid, cnt] of counts.entries()) {
        if (cnt > bestCnt) {
          bestCnt = cnt;
          bestProj = pid;
        }
      }
      workerPrimaryProject.set(w.id, bestProj);
    } else {
      workerPrimaryProject.set(w.id, defaultProjId);
    }
  }

  const getProjName = (pid: number | null | undefined): string => {
    if (!pid) return 'الخزنة العامة / مشترك';
    return projectMap.get(pid)?.name || `مشروع #${pid}`;
  };

  // Track linked checks so we don't double count if an IncomingPayment references a CheckItem
  const linkedCheckIds = new Set<number>(
    incomingPayments.map((ip) => ip.checkId).filter((id): id is number => typeof id === 'number')
  );

  const movements: LedgerMovementItem[] = [];

  // 1. Custom Incoming Payments (واصلني من شخص أو شركة أو شيك)
  for (const ip of incomingPayments) {
    if (filterProjectId && ip.projectId !== filterProjectId) continue;
    const catLabel =
      ip.sourceType === 'شخص'
        ? 'دفعة واصلة من شخص / مهندس'
        : ip.sourceType === 'شيك'
          ? 'تحصيل شيك لحساب مشروع'
          : ip.sourceType === 'شركة'
            ? 'دفعة واصلة من الشركة'
            : ip.sourceType === 'مستخلص'
              ? 'دفعة مستخلص واصلة'
              : 'مبلغ واصل للخزنة';
    const party = ip.sourceName || ip.senderName || 'جهة الدفع';
    movements.push({
      id: `ip-${ip.id}`,
      rawId: ip.id,
      isCustomIncoming: true,
      date: ip.date,
      direction: 'in',
      title: `${catLabel} (${party})`,
      category: ip.sourceType,
      subtitle: ip.notes || (ip.checkNumber ? `شيك #${ip.checkNumber}` : ''),
      categoryLabel: catLabel,
      sourceType:
        ip.sourceType === 'شخص'
          ? 'شخص'
          : ip.sourceType === 'شيك'
            ? 'شيك'
            : ip.sourceType === 'شركة'
              ? 'شركة'
              : ip.sourceType === 'مستخلص'
                ? 'مستخلص'
                : 'أخرى',
      partyName: party,
      projectId: ip.projectId ?? null,
      projectName: getProjName(ip.projectId),
      method: ip.method || 'نقدي',
      amount: Number(ip.amount) || 0,
      notes: ip.notes || '',
    });
  }

  // 2. Cashed Checks (Incoming & Outgoing)
  for (const chk of checks) {
    if (chk.status !== 'اتصرف') continue;
    if (chk.direction === 'وارد' && chk.id && linkedCheckIds.has(chk.id)) continue;
    if (filterProjectId && chk.projectId !== filterProjectId) continue;
    const catLabel =
      chk.direction === 'وارد' ? `صرف شيك وارد #${chk.number}` : `صرف شيك صادر #${chk.number}`;
    const party = `${chk.bank} (شيك #${chk.number})`;

    movements.push({
      id: `chk-${chk.id}`,
      date: chk.dueDate,
      direction: chk.direction === 'وارد' ? 'in' : 'out',
      title: `${catLabel} · ${chk.bank}`,
      category: chk.direction === 'وارد' ? 'شيك وارد' : 'شيك صادر',
      subtitle: chk.notes || '',
      categoryLabel: catLabel,
      sourceType: 'شيك',
      partyName: party,
      projectId: chk.projectId ?? null,
      projectName: getProjName(chk.projectId),
      method: 'شيك بنكي',
      amount: Number(chk.amount) || 0,
      notes: chk.notes || '',
    });
  }

  // 3. Collected Extract Lines
  const extractMap = new Map<number, Extract>();
  for (const ex of extracts) {
    if (ex.id !== undefined) extractMap.set(ex.id, ex);
  }
  for (const line of extractLines) {
    const collected = Number(line.collected) || 0;
    if (collected <= 0) continue;
    if (line.checkId && linkedCheckIds.has(line.checkId)) continue;
    const parentExt = extractMap.get(line.extractId);
    const pid = parentExt?.projectId ?? defaultProjId;
    if (filterProjectId && pid !== filterProjectId) continue;
    const wName = workerMap.get(line.workerId)?.name || `عامل #${line.workerId}`;
    const catLabel = `تحصيل مستخلص #${parentExt?.number || 1}`;
    const party = `مستخلص #${parentExt?.number || 1} (${wName})`;

    movements.push({
      id: `extline-${line.id}`,
      date: line.collectedDate || parentExt?.to || '2026-10-18',
      direction: 'in',
      title: `${catLabel} · ${wName}`,
      category: 'مستخلصات',
      subtitle: line.notes || '',
      categoryLabel: catLabel,
      sourceType: 'مستخلص',
      partyName: party,
      projectId: pid,
      projectName: getProjName(pid),
      method: line.method || 'نقدي',
      amount: collected,
      notes: line.notes || '',
    });
  }

  // 4. Outgoing Worker Advances
  for (const adv of advances) {
    const pid = workerPrimaryProject.get(adv.workerId) ?? defaultProjId;
    if (filterProjectId && pid !== filterProjectId) continue;
    const wName = workerMap.get(adv.workerId)?.name || `عامل #${adv.workerId}`;
    movements.push({
      id: `adv-${adv.id}`,
      date: adv.date,
      direction: 'out',
      title: `سلفة: ${wName}`,
      category: 'سلفة عامل',
      subtitle: adv.reason || adv.notes || '',
      categoryLabel: 'سلفة عامل / نحّات',
      sourceType: 'سلفة',
      partyName: wName,
      projectId: pid,
      projectName: getProjName(pid),
      method: 'نقدي',
      amount: Number(adv.amount) || 0,
      notes: adv.reason || adv.notes || '',
    });
  }

  // 5. Outgoing Settlements (قبض يوم ١٥)
  for (const st of settlements) {
    if ((st.netPaid || 0) <= 0) continue;
    const pid = workerPrimaryProject.get(st.workerId) ?? defaultProjId;
    if (filterProjectId && pid !== filterProjectId) continue;
    const wName = workerMap.get(st.workerId)?.name || `عامل #${st.workerId}`;
    movements.push({
      id: `stl-${st.id}`,
      date: st.date,
      direction: 'out',
      title: `صرف قبض يوم ١٥: ${wName}`,
      category: 'قبض العمال',
      subtitle: `تقفيل من ${st.from} إلى ${st.to}`,
      categoryLabel: 'صرف قبض يوم ١٥ (صافي)',
      sourceType: 'قبض ١٥',
      partyName: wName,
      projectId: pid,
      projectName: getProjName(pid),
      method: 'نقدي',
      amount: Number(st.netPaid) || 0,
      notes: `تقفيل من ${st.from} إلى ${st.to}`,
    });
  }

  // 6. Outgoing Extra Nash Cash Paid
  const extraMap = new Map<number, ExtraItem>();
  for (const ex of extras) {
    if (ex.id !== undefined) extraMap.set(ex.id, ex);
  }
  for (const ec of extraCashes) {
    const paid = Number(ec.paidCash) || 0;
    if (paid <= 0) continue;
    const parentExtra = extraMap.get(ec.extraId);
    const pid = parentExtra?.projectId ?? workerPrimaryProject.get(ec.workerId) ?? defaultProjId;
    if (filterProjectId && pid !== filterProjectId) continue;
    const wName = workerMap.get(ec.workerId)?.name || `عامل #${ec.workerId}`;
    const catLabel = `صرف ناش إضافي (${parentExtra?.type || 'إضافي'})`;
    movements.push({
      id: `nash-${ec.id}`,
      date: parentExtra?.date || '2026-10-18',
      direction: 'out',
      title: `${catLabel} · ${wName}`,
      category: 'ناش وإضافي',
      subtitle: ec.notes || '',
      categoryLabel: catLabel,
      sourceType: 'ناش',
      partyName: wName,
      projectId: pid,
      projectName: getProjName(pid),
      method: 'نقدي',
      amount: paid,
      notes: ec.notes || '',
    });
  }

  // 7. Outgoing External Expenses
  for (const exp of expenses) {
    const pid = exp.projectId ?? defaultProjId;
    if (filterProjectId && pid !== filterProjectId) continue;
    const catLabel = `مصروف خارجي (${exp.category})`;
    movements.push({
      id: `exp-${exp.id}`,
      date: exp.date,
      direction: 'out',
      title: catLabel,
      category: `مصروف (${exp.category})`,
      subtitle: exp.note || '',
      categoryLabel: catLabel,
      sourceType: 'مصروف',
      partyName: exp.category,
      projectId: pid,
      projectName: getProjName(pid),
      method: 'نقدي',
      amount: Number(exp.amount) || 0,
      notes: exp.note || '',
    });
  }

  movements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Build Project-by-Project Breakdowns
  const targetProjects: { id: number | null; name: string; cDay: number; cNight: number }[] =
    projects.map((p) => ({
      id: p.id!,
      name: p.name,
      cDay: p.companyDayRate || 0,
      cNight: p.companyNightRate || 0,
    }));

  // If there are unallocated items or no projects yet, include General Treasury bucket if needed
  const hasUnallocated =
    incomingPayments.some((ip) => !ip.projectId) ||
    checks.some((c) => !c.projectId) ||
    expenses.some((e) => !e.projectId && !defaultProjId);

  if (hasUnallocated || targetProjects.length === 0) {
    targetProjects.push({
      id: null,
      name: 'الخزنة العامة / غير مخصص لمشروع',
      cDay: 0,
      cNight: 0,
    });
  }

  const projectBreakdowns: ProjectLedgerBreakdown[] = [];

  for (const tp of targetProjects) {
    if (filterProjectId && tp.id !== filterProjectId) continue;

    const pid = tp.id;
    const projAtt = attendances.filter((a) => (pid === null ? !a.projectId : a.projectId === pid));
    let daysCount = 0;
    let nightsCount = 0;
    let attCompanyVal = 0;
    let attWorkerWages = 0;
    const workerIdsInProj = new Set<number>();

    for (const a of projAtt) {
      workerIdsInProj.add(a.workerId);
      const dWorked = Number(a.dayWorked) || 0;
      const nWorked = Number(a.nightWorked) || 0;
      if (dWorked > 0) {
        daysCount += dWorked;
        attCompanyVal += dWorked * (a.companyDayRateSnapshot || tp.cDay);
        attWorkerWages += dWorked * (a.workerDayRateSnapshot || 0);
      }
      if (nWorked > 0) {
        nightsCount += nWorked;
        attCompanyVal += nWorked * (a.companyNightRateSnapshot || tp.cNight);
        attWorkerWages += nWorked * (a.workerNightRateSnapshot || 0);
      }
    }

    const projExtras = extras.filter((e) => (pid === null ? !e.projectId : e.projectId === pid));
    const projExtraIds = new Set(projExtras.map((e) => e.id!));
    let extraCompanyVal = 0;
    for (const e of projExtras) {
      if (e.valueMode !== 'note') {
        extraCompanyVal += e.amount > 0 ? e.amount : (e.days || 0) * tp.cDay;
      }
    }

    let extraWorkerWages = 0;
    let nashPaid = 0;
    for (const ec of extraCashes) {
      if (projExtraIds.has(ec.extraId)) {
        workerIdsInProj.add(ec.workerId);
        const wRate = workerMap.get(ec.workerId)?.workerDayRate || 0;
        const val = ec.amount > 0 ? ec.amount : (ec.days || 0) * wRate;
        extraWorkerWages += val;
        nashPaid += ec.paidCash || 0;
      }
    }

    const projExtractIds = new Set(
      extracts.filter((ex) => (pid === null ? !ex.projectId : ex.projectId === pid)).map((ex) => ex.id!)
    );
    const projExtractLines = extractLines.filter((l) => projExtractIds.has(l.extractId));
    const extTotals = calculateExtractTotals(projExtractLines);

    const companyEntitlement = Math.max(extTotals.netDue, attCompanyVal + extraCompanyVal);
    const workerGrossWages = attWorkerWages + extraWorkerWages;

    // Received breakdown for this project
    const projCustomIn = incomingPayments.filter((ip) => (ip.projectId ?? null) === pid);
    const customChecksIn = projCustomIn
      .filter((ip) => ip.sourceType === 'شيك' || ip.method === 'شيك')
      .reduce((s, ip) => s + (Number(ip.amount) || 0), 0);
    const customPersonsIn = projCustomIn
      .filter((ip) => ip.sourceType === 'شخص' && ip.method !== 'شيك')
      .reduce((s, ip) => s + (Number(ip.amount) || 0), 0);
    const customCompanyIn = projCustomIn
      .filter(
        (ip) =>
          (ip.sourceType === 'شركة' || ip.sourceType === 'مستخلص' || ip.sourceType === 'أخرى') &&
          ip.method !== 'شيك'
      )
      .reduce((s, ip) => s + (Number(ip.amount) || 0), 0);

    const projChecks = checks.filter((c) => (c.projectId ?? null) === pid);
    const cashedInChecks = projChecks
      .filter((c) => c.direction === 'وارد' && c.status === 'اتصرف' && (!c.id || !linkedCheckIds.has(c.id)))
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const pendingIncomingChecks = projChecks
      .filter((c) => c.direction === 'وارد' && c.status === 'معلق')
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const outgoingChecksCashed = projChecks
      .filter((c) => c.direction === 'صادر' && c.status === 'اتصرف')
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const pendingOutgoingChecks = projChecks
      .filter((c) => c.direction === 'صادر' && c.status === 'معلق')
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const receivedFromChecks = customChecksIn + cashedInChecks;
    const receivedFromPersons = customPersonsIn;
    const receivedFromCompanies = customCompanyIn;
    const receivedFromExtracts = extTotals.collected;
    const receivedFromCompany = customCompanyIn + extTotals.collected;
    const totalReceived = receivedFromChecks + receivedFromPersons + receivedFromCompany;

    // Advances, deductions, settlements for workers whose primary project is pid
    const advancesSpent = advances
      .filter((adv) => (workerPrimaryProject.get(adv.workerId) ?? null) === pid)
      .reduce((s, a) => s + (Number(a.amount) || 0), 0);

    const deductionsApplied = deductions
      .filter((d) => {
        const dProj = d.projectId ?? workerPrimaryProject.get(d.workerId) ?? null;
        return dProj === pid;
      })
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);

    const settlementsPaid = settlements
      .filter((st) => (workerPrimaryProject.get(st.workerId) ?? null) === pid)
      .reduce((s, st) => s + Math.max(0, Number(st.netPaid) || 0), 0);

    const expensesSpent = expenses
      .filter((ex) => (ex.projectId ?? defaultProjId) === pid)
      .reduce((s, ex) => s + (Number(ex.amount) || 0), 0);

    const totalSpentInProject =
      advancesSpent + settlementsPaid + nashPaid + expensesSpent + outgoingChecksCashed;

    const remainingWorkersInProj = Math.max(
      0,
      workerGrossWages - deductionsApplied - advancesSpent - settlementsPaid - nashPaid
    );
    const owedByMeInProject = remainingWorkersInProj + pendingOutgoingChecks;

    const remainingFromCompanyInProj = Math.max(0, companyEntitlement - totalReceived);
    const owedToMeInProject = remainingFromCompanyInProj + pendingIncomingChecks;

    const netWorkerCost = Math.max(0, workerGrossWages - deductionsApplied);
    const netProfit = companyEntitlement - netWorkerCost - expensesSpent;
    const cashBalance = totalReceived - totalSpentInProject;
    const collectionPercent =
      companyEntitlement > 0 ? Math.min(100, Math.round((totalReceived / companyEntitlement) * 100)) : 0;

    projectBreakdowns.push({
      projectId: pid,
      projectName: tp.name,
      companyDayRate: tp.cDay,
      companyNightRate: tp.cNight,
      daysCount,
      daysWorked: daysCount,
      nightsCount,
      nightsWorked: nightsCount,
      workersCount: workerIdsInProj.size,
      receivedFromChecks,
      receivedFromPersons,
      receivedFromCompany,
      receivedFromCompanies,
      receivedFromExtracts,
      totalReceived,
      totalReceivedForProject: totalReceived,
      pendingIncomingChecks,
      companyEntitlement,
      owedToMeInProject,
      workerGrossWages,
      advancesSpent,
      deductionsApplied,
      settlementsPaid,
      nashPaid,
      expensesSpent,
      outgoingChecksCashed,
      pendingOutgoingChecks,
      totalSpentInProject,
      owedByMeInProject,
      netProfit,
      cashBalance,
      cashFlowBalance: cashBalance,
      collectionPercent,
    });
  }

  // Aggregate overall metrics across breakdowns
  const receivedFromChecks = projectBreakdowns.reduce((s, b) => s + b.receivedFromChecks, 0);
  const receivedFromPersons = projectBreakdowns.reduce((s, b) => s + b.receivedFromPersons, 0);
  const receivedFromCompaniesAndExtracts = projectBreakdowns.reduce(
    (s, b) => s + b.receivedFromCompany,
    0
  );
  const totalReceivedAll =
    receivedFromChecks + receivedFromPersons + receivedFromCompaniesAndExtracts;

  const totalAdvancesSpent = projectBreakdowns.reduce((s, b) => s + b.advancesSpent, 0);
  const totalSettlementsPaid = projectBreakdowns.reduce((s, b) => s + b.settlementsPaid, 0);
  const totalNashPaid = projectBreakdowns.reduce((s, b) => s + b.nashPaid, 0);
  const totalExpensesSpent = projectBreakdowns.reduce((s, b) => s + b.expensesSpent, 0);
  const totalOutgoingChecksCashed = projectBreakdowns.reduce(
    (s, b) => s + b.outgoingChecksCashed,
    0
  );
  const totalSpentAll =
    totalAdvancesSpent +
    totalSettlementsPaid +
    totalNashPaid +
    totalExpensesSpent +
    totalOutgoingChecksCashed;

  const totalCompanyEntitlement = projectBreakdowns.reduce((s, b) => s + b.companyEntitlement, 0);
  const totalWorkerGrossWages = projectBreakdowns.reduce((s, b) => s + b.workerGrossWages, 0);
  const totalDeductionsApplied = projectBreakdowns.reduce((s, b) => s + b.deductionsApplied, 0);
  const pendingIncomingChecks = projectBreakdowns.reduce((s, b) => s + b.pendingIncomingChecks, 0);
  const pendingOutgoingChecks = projectBreakdowns.reduce((s, b) => s + b.pendingOutgoingChecks, 0);
  const remainingOwedToWorkers = Math.max(
    0,
    totalWorkerGrossWages -
      totalDeductionsApplied -
      totalAdvancesSpent -
      totalSettlementsPaid -
      totalNashPaid
  );
  const owedToMeFromCompanies = Math.max(0, totalCompanyEntitlement - totalReceivedAll);
  const totalOwedToMe = projectBreakdowns.reduce((s, b) => s + b.owedToMeInProject, 0);
  const totalOwedByMe = projectBreakdowns.reduce((s, b) => s + b.owedByMeInProject, 0);
  const totalNetProfit = projectBreakdowns.reduce((s, b) => s + b.netProfit, 0);
  const netCashInHand = totalReceivedAll - totalSpentAll;

  return {
    receivedFromChecks,
    receivedFromPersons,
    receivedFromCompaniesAndExtracts,
    receivedFromCompanies: receivedFromCompaniesAndExtracts,
    totalReceivedAll,
    totalReceivedAllSources: totalReceivedAll,
    totalAdvancesSpent,
    totalAdvancesPaid: totalAdvancesSpent,
    totalSettlementsPaid,
    totalNashPaid,
    totalNashCashPaid: totalNashPaid,
    totalExpensesSpent,
    totalExternalExpenses: totalExpensesSpent,
    totalOutgoingChecksCashed,
    totalSpentAll,
    totalSpentAllProjects: totalSpentAll,
    totalCompanyEntitlement,
    totalWorkerGrossWages,
    totalDeductionsApplied,
    owedToMeFromCompanies,
    pendingIncomingChecks,
    pendingIncomingChecksTotal: pendingIncomingChecks,
    pendingOutgoingChecks,
    pendingOutgoingChecksTotal: pendingOutgoingChecks,
    remainingOwedToWorkers,
    owedByMeToWorkers: remainingOwedToWorkers,
    totalOwedToMe,
    totalOwedByMe,
    totalNetProfit,
    overallNetProfit: totalNetProfit,
    netCashInHand,
    projectBreakdowns,
    movements,
  };
}



