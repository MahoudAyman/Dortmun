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
  ExtractLine,
  ExtractLineStatus,
  NumeralMode,
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

