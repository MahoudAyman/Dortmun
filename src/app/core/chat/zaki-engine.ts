import type {
  Advance,
  AppSettings,
  Attendance,
  CheckItem,
  DailyHeadcount,
  Deduction,
  DeductionMode,
  Expense,
  ExpenseCategory,
  ExtraCash,
  ExtraItem,
  ExtraType,
  Extract,
  ExtractLine,
  IncomingPayment,
  PaymentMethodType,
  PaymentSourceType,
  Project,
  Settlement,
  Worker,
} from '../db/models';

function calculateComprehensiveLedger(params: {
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
  selectedProjectId?: number | null;
}) {
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
    selectedProjectId = null,
  } = params;
  const defaultProjId = projects[0]?.id ?? null;
  const workerMap = new Map(workers.filter((w) => w.id !== undefined).map((w) => [w.id!, w]));
  const workerPrimaryProject = new Map<number, number | null>();
  for (const w of workers) {
    if (w.id === undefined) continue;
    const wAtt = attendances.filter((a) => a.workerId === w.id);
    workerPrimaryProject.set(w.id, wAtt[0]?.projectId ?? defaultProjId);
  }
  const linkedCheckIds = new Set<number>(
    incomingPayments.map((ip) => ip.checkId).filter((id): id is number => typeof id === 'number')
  );
  const targetProjects = projects.map((p) => ({
    id: p.id!,
    name: p.name,
    cDay: p.companyDayRate || 0,
    cNight: p.companyNightRate || 0,
  }));
  if (targetProjects.length === 0 || incomingPayments.some((ip) => !ip.projectId)) {
    targetProjects.push({ id: null as unknown as number, name: 'الخزنة العامة', cDay: 0, cNight: 0 });
  }
  const projectBreakdowns = targetProjects
    .filter((tp) => !selectedProjectId || tp.id === selectedProjectId)
    .map((tp) => {
      const pid = tp.id ?? null;
      const projAtt = attendances.filter((a) => (pid === null ? !a.projectId : a.projectId === pid));
      let attCompanyVal = 0;
      let attWorkerWages = 0;
      for (const a of projAtt) {
        const d = Number(a.dayWorked) || 0;
        const n = Number(a.nightWorked) || 0;
        attCompanyVal += d * (a.companyDayRateSnapshot || tp.cDay) + n * (a.companyNightRateSnapshot || tp.cNight);
        attWorkerWages += d * (a.workerDayRateSnapshot || 0) + n * (a.workerNightRateSnapshot || 0);
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
          const wRate = workerMap.get(ec.workerId)?.workerDayRate || 0;
          extraWorkerWages += ec.amount > 0 ? ec.amount : (ec.days || 0) * wRate;
          nashPaid += ec.paidCash || 0;
        }
      }
      const projExtractIds = new Set(
        extracts.filter((ex) => (pid === null ? !ex.projectId : ex.projectId === pid)).map((ex) => ex.id!)
      );
      const projExtractLines = extractLines.filter((l) => projExtractIds.has(l.extractId));
      const extNetDue = projExtractLines.reduce((s, l) => {
        const claimed = Number(l.claimed) || 0;
        const tax = Number(l.taxRate) > 0 ? Math.round((claimed * Number(l.taxRate)) / 100) : Number(l.taxAmount) || 0;
        return s + Math.max(0, claimed - tax);
      }, 0);
      const extCollected = projExtractLines.reduce((s, l) => s + (Number(l.collected) || 0), 0);
      const companyEntitlement = Math.max(extNetDue, attCompanyVal + extraCompanyVal);
      const workerGrossWages = attWorkerWages + extraWorkerWages;
      const projCustomIn = incomingPayments.filter((ip) => (ip.projectId ?? null) === pid);
      const customChecksIn = projCustomIn
        .filter((ip) => ip.sourceType === 'شيك' || ip.method === 'شيك')
        .reduce((s, ip) => s + (Number(ip.amount) || 0), 0);
      const receivedFromPersons = projCustomIn
        .filter((ip) => ip.sourceType === 'شخص' && ip.method !== 'شيك')
        .reduce((s, ip) => s + (Number(ip.amount) || 0), 0);
      const receivedFromCompanies = projCustomIn
        .filter((ip) => (ip.sourceType === 'شركة' || ip.sourceType === 'مستخلص' || ip.sourceType === 'أخرى') && ip.method !== 'شيك')
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
      const receivedFromExtracts = extCollected;
      const totalReceivedForProject = receivedFromChecks + receivedFromPersons + receivedFromCompanies + receivedFromExtracts;
      const advancesSpent = advances
        .filter((adv) => (workerPrimaryProject.get(adv.workerId) ?? null) === pid)
        .reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const deductionsApplied = deductions
        .filter((d) => (d.projectId ?? workerPrimaryProject.get(d.workerId) ?? null) === pid)
        .reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const settlementsPaid = settlements
        .filter((st) => (workerPrimaryProject.get(st.workerId) ?? null) === pid)
        .reduce((s, st) => s + Math.max(0, Number(st.netPaid) || 0), 0);
      const expensesSpent = expenses
        .filter((ex) => (ex.projectId ?? defaultProjId) === pid)
        .reduce((s, ex) => s + (Number(ex.amount) || 0), 0);
      const totalSpentInProject = advancesSpent + settlementsPaid + nashPaid + expensesSpent + outgoingChecksCashed;
      const remainingWorkersInProj = Math.max(0, workerGrossWages - deductionsApplied - advancesSpent - settlementsPaid - nashPaid);
      const owedByMeInProject = remainingWorkersInProj + pendingOutgoingChecks;
      const owedToMeInProject = Math.max(0, companyEntitlement - totalReceivedForProject) + pendingIncomingChecks;
      const netProfit = companyEntitlement - Math.max(0, workerGrossWages - deductionsApplied) - expensesSpent;
      const cashFlowBalance = totalReceivedForProject - totalSpentInProject;
      return {
        projectId: pid,
        projectName: tp.name,
        receivedFromChecks,
        receivedFromPersons,
        receivedFromCompanies,
        receivedFromExtracts,
        totalReceivedForProject,
        advancesSpent,
        settlementsPaid,
        nashPaid,
        expensesSpent,
        totalSpentInProject,
        owedToMeInProject,
        owedByMeInProject,
        netProfit,
        cashFlowBalance,
      };
    });
  const receivedFromChecks = projectBreakdowns.reduce((s, b) => s + b.receivedFromChecks, 0);
  const receivedFromPersons = projectBreakdowns.reduce((s, b) => s + b.receivedFromPersons, 0);
  const receivedFromCompanies = projectBreakdowns.reduce((s, b) => s + b.receivedFromCompanies + b.receivedFromExtracts, 0);
  const totalReceivedAllSources = receivedFromChecks + receivedFromPersons + receivedFromCompanies;
  const totalAdvancesPaid = projectBreakdowns.reduce((s, b) => s + b.advancesSpent, 0);
  const totalSettlementsPaid = projectBreakdowns.reduce((s, b) => s + b.settlementsPaid, 0);
  const totalNashCashPaid = projectBreakdowns.reduce((s, b) => s + b.nashPaid, 0);
  const totalExternalExpenses = projectBreakdowns.reduce((s, b) => s + b.expensesSpent, 0);
  const totalSpentAll = projectBreakdowns.reduce((s, b) => s + b.totalSpentInProject, 0);
  const totalOwedToMe = projectBreakdowns.reduce((s, b) => s + b.owedToMeInProject, 0);
  const totalOwedByMe = projectBreakdowns.reduce((s, b) => s + b.owedByMeInProject, 0);
  const totalNetProfit = projectBreakdowns.reduce((s, b) => s + b.netProfit, 0);
  const netCashInHand = totalReceivedAllSources - totalSpentAll;
  return {
    receivedFromChecks,
    receivedFromPersons,
    receivedFromCompanies,
    totalReceivedAllSources,
    totalAdvancesPaid,
    totalSettlementsPaid,
    totalNashCashPaid,
    totalExternalExpenses,
    totalSpentAll,
    totalOwedToMe,
    totalOwedByMe,
    totalNetProfit,
    netCashInHand,
    projectBreakdowns,
  };
}

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function toEnglishDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function formatNumber(
  value: number | undefined | null,
  mode: 'ar' | 'en' = 'ar',
  decimals = 0
): string {
  const safeVal = Number.isFinite(value) ? Number(value) : 0;
  const formatted = safeVal.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return mode === 'ar' ? toArabicDigits(formatted) : formatted;
}

function formatCurrency(
  value: number | undefined | null,
  mode: 'ar' | 'en' = 'ar'
): string {
  const hasFraction = Math.abs((value ?? 0) % 1) > 0.001;
  return `${formatNumber(value, mode, hasFraction ? 2 : 0)} ج.م`;
}

function calculateExtractTotals(lines: ExtractLine[]) {
  return lines.reduce(
    (acc, l) => {
      const claimed = l.claimed ?? 0;
      const taxRate = l.taxRate ?? 0;
      const taxAmount = Math.round((claimed * taxRate) / 100);
      const netDue = claimed - taxAmount;
      const collected = l.collected ?? 0;
      const remaining = Math.max(0, netDue - collected);
      return {
        claimed: acc.claimed + claimed,
        taxAmount: acc.taxAmount + taxAmount,
        netDue: acc.netDue + netDue,
        collected: acc.collected + collected,
        remaining: acc.remaining + remaining,
      };
    },
    { claimed: 0, taxAmount: 0, netDue: 0, collected: 0, remaining: 0 }
  );
}

function getLowAttendanceWorkers(
  workers: Worker[],
  attendancesInMonth: Attendance[],
  expectedMonthlyDays: number,
  monthlyDayCap: number
) {
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

export function normalizeArabic(text: string): string {
  if (!text) return '';
  return toEnglishDigits(text)
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Tashkeel
    .replace(/[أإآٱ]/g, 'ا') // Unify Alef
    .replace(/ة/g, 'ه') // Taa Marbuta -> Haa
    .replace(/ى/g, 'ي') // Alef Maqsura -> Yaa
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s.:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const s1 = normalizeArabic(a);
  const s2 = normalizeArabic(b);
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

const SPOKEN_NUMBERS: Record<string, number> = {
  نص: 0.5,
  نصف: 0.5,
  ربع: 0.25,
  واحد: 1,
  يوميه: 1,
  اتنين: 2,
  اثنين: 2,
  يومين: 2,
  تلاته: 3,
  ثلاثه: 3,
  تلات: 3,
  اربعه: 4,
  اربع: 4,
  خمسه: 5,
  خمس: 5,
  سته: 6,
  ست: 6,
  سبعه: 7,
  سبع: 7,
  تمانيه: 8,
  ثمانيه: 8,
  تسعه: 9,
  تسع: 9,
  عشره: 10,
  عشر: 10,
  عشرين: 20,
  تلاتين: 30,
  ثلاثين: 30,
  اربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  تمانين: 80,
  ثمانين: 80,
  تسعين: 90,
  ميه: 100,
  ميت: 100,
  مائه: 100,
  مايه: 100,
  ميتين: 200,
  مائتين: 200,
  تلتميه: 300,
  تلتمائه: 300,
  ثلاثمائه: 300,
  ربعميه: 400,
  اربعمائه: 400,
  خمسميه: 500,
  خمسمائه: 500,
  ستميه: 600,
  سبعميه: 700,
  تمنميه: 800,
  تسعميه: 900,
  الف: 1000,
  الفين: 2000,
  تلاتالاف: 3000,
  اربعالاف: 4000,
  خمسالاف: 5000,
  عشرالاف: 10000,
  عشرينالف: 20000,
  خمسينالف: 50000,
  ميتالف: 100000,
  باكو: 1000,
  ارنب: 1000000,
};

export function parseSpokenArabicNumber(text: string): number | null {
  const norm = normalizeArabic(text);
  const digitMatch = norm.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const tokens = norm.split(/\s+/);
  let total = 0;
  let found = false;

  for (const token of tokens) {
    const cleanToken = token.replace(/^(و|ب)/, '');
    if (SPOKEN_NUMBERS[cleanToken] !== undefined) {
      total += SPOKEN_NUMBERS[cleanToken];
      found = true;
    } else if (SPOKEN_NUMBERS[token] !== undefined) {
      total += SPOKEN_NUMBERS[token];
      found = true;
    }
  }

  return found ? total : null;
}

export function resolveRelativeDate(text: string, todayIso: string): string {
  const norm = normalizeArabic(text);
  const baseDate = new Date(todayIso + 'T12:00:00Z');

  if (norm.includes('اول امبارح') || norm.includes('اول امس')) {
    baseDate.setUTCDate(baseDate.getUTCDate() - 2);
    return baseDate.toISOString().slice(0, 10);
  }
  if (norm.includes('امبارح') || norm.includes('امس')) {
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    return baseDate.toISOString().slice(0, 10);
  }
  return todayIso;
}

export function formatArabicDateShort(dateIso: string): string {
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  const day = Number(parts[2]);
  const monthIdx = Number(parts[1]) - 1;
  return `${day} ${months[monthIdx] || parts[1]}`;
}

export interface ZakiContext {
  todayIso: string; // YYYY-MM-DD
  workers: Worker[];
  projects: Project[];
  attendances: Attendance[];
  advances: Advance[];
  deductions?: Deduction[];
  dailyHeadcounts?: DailyHeadcount[];
  settlements?: Settlement[];
  extracts: Extract[];
  extractLines: ExtractLine[];
  extras: ExtraItem[];
  extraCashes: ExtraCash[];
  checks: CheckItem[];
  expenses?: Expense[];
  incomingPayments?: IncomingPayment[];
  settings: AppSettings;
  pendingAdvanceWorkerId?: number | null;
}

export type ZakiPendingWriteAction =
  | {
      type: 'record_attendance';
      workerIds: number[];
      workerNames: string[];
      projectId: number;
      date: string;
      dayWorked: 0 | 1;
      nightWorked: 0 | 1;
    }
  | {
      type: 'record_advance';
      workerId: number;
      workerName: string;
      amount: number;
      date: string;
      reason: string;
    }
  | {
      type: 'record_deduction';
      workerId: number;
      workerName: string;
      mode: DeductionMode;
      daysDeducted: number;
      amount: number;
      date: string;
      reason: string;
    }
  | {
      type: 'record_headcount';
      date: string;
      projectId: number | null;
      expectedDayCount: number;
      sculptorsCount: number;
      workersCount: number;
      expectedNightCount: number;
    }
  | {
      type: 'add_worker';
      name: string;
      role: string;
      workerDayRate: number;
      workerNightRate: number;
    }
  | {
      type: 'update_worker_rate';
      workerId: number;
      workerName: string;
      workerDayRate: number;
      workerNightRate: number;
    }
  | {
      type: 'add_project';
      name: string;
      companyDayRate: number;
      companyNightRate: number;
    }
  | {
      type: 'record_extra';
      workerIds: number[];
      workerNames: string[];
      projectId: number;
      date: string;
      extraType: ExtraType;
      days: number;
      authorizedBy: string;
    }
  | {
      type: 'add_worker_note';
      workerId: number;
      workerName: string;
      note: string;
    }
  | {
      type: 'record_incoming_payment';
      date: string;
      sourceType: PaymentSourceType;
      sourceName: string;
      amount: number;
      method: PaymentMethodType;
      projectId: number | null;
      projectName: string;
      checkNumber?: string;
      notes: string;
    }
  | {
      type: 'record_expense';
      date: string;
      category: ExpenseCategory;
      amount: number;
      projectId: number | null;
      projectName: string;
      note: string;
    }
  | {
      type: 'record_check';
      direction: 'وارد' | 'صادر';
      number: string;
      bank: string;
      amount: number;
      dueDate: string;
      status: 'معلق' | 'اتصرف' | 'مرتجع';
      projectId: number | null;
      notes: string;
    }
  | {
      type: 'update_check_status';
      checkId: number;
      checkNumber: string;
      newStatus: 'اتصرف' | 'مرتجع' | 'معلق';
      amount: number;
    }
  | {
      type: 'create_extract';
      projectId: number;
      projectName: string;
      from: string;
      to: string;
      number: number;
    }
  | {
      type: 'settle_worker';
      workerId: number;
      workerName: string;
      from: string;
      to: string;
      days: number;
      nights: number;
      grossWages: number;
      advancesDeducted: number;
      deductionsDeducted: number;
      netPaid: number;
    }
  | {
      type: 'delete_record';
      targetEntity:
        | 'worker'
        | 'project'
        | 'attendance'
        | 'advance'
        | 'deduction'
        | 'check'
        | 'expense'
        | 'incomingPayment'
        | 'extract'
        | 'extra';
      recordId: number;
      description: string;
    };

export interface ZakiResponse {
  reply: string;
  requiresConfirmation?: boolean;
  pendingAction?: ZakiPendingWriteAction;
  disambiguationOptions?: { label: string; command: string }[];
  awaitingAdvanceAmountForWorkerId?: number;
  quickCommands?: string[];
  clientEffect?: 'navigate_bulk' | 'export_excel' | 'undo' | 'open_capabilities';
  actionRoute?: string;
  actionLabel?: string;
}

export interface ZakiCapabilitySection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  colorClass: string;
  examples: {
    phrase: string;
    explanation: string;
  }[];
}

export const ZAKI_CAPABILITIES_GUIDE: ZakiCapabilitySection[] = [
  {
    id: 'ledger_payments',
    title: '١. حسابي الشامل والمقبوضات والخزنة',
    subtitle: 'تسجيل أي فلوس وصلتك من شركة أو شخص أو شيك ومعرفة صافي ربحك واللي ليك واللي عليك',
    icon: 'account_balance_wallet',
    badge: 'جديد وشامل',
    colorClass: 'emerald',
    examples: [
      {
        phrase: 'وصلني 50000 من شركة إعمار لمشروع التجمع',
        explanation: 'يسجل دفعة واردة مباشرة في الخزنة ويربطها بحساب المشروع تلقائياً',
      },
      {
        phrase: 'قبضت 20000 من المهندس طارق نقدي',
        explanation: 'يسجل مقبوضات واردة من شخص ويضيفها للرصيد النقدي الفعلي',
      },
      {
        phrase: 'حسابي الشامل كام؟ وصلني كام وليا كام وعليا كام؟',
        explanation: 'يعرض كشف كامل بكل اللي وصلك، واللي اتصرف سلف وقبض ومصاريف، وصافي الربح',
      },
      {
        phrase: 'تفاصيل حساب مشروع الكوبري والربح فيه كام؟',
        explanation: 'يحلل مشروع معين: مستحقات الشركة، المقبوض، المنصرف، المتبقي، وصافي المكسب',
      },
    ],
  },
  {
    id: 'attendance_headcount',
    title: '٢. اليوميات والسهرات والعدد اليومي الإجباري',
    subtitle: 'تحضير العمال والنحاتية بالعامية المصرية ومطابقة العدد الإجباري',
    icon: 'fact_check',
    badge: 'يومي',
    colorClass: 'amber',
    examples: [
      {
        phrase: 'العدد النهارده 10 يومية و 4 سهرة',
        explanation: 'يسجل دفتر العدد اليومي الإجباري للموقع بضغطة واحدة',
      },
      {
        phrase: 'زكي سجل يومية لمحمد وعلي النهارده',
        explanation: 'يسجل حضور يومية (أو سهرة) لعامل أو مجموعة عمال أو لكل النحاتية',
      },
      {
        phrase: 'سجل يومية وسهرة لكل النحاتية النهارده',
        explanation: 'يحضر كل طاقم النحاتية يومية وسهرة دفعة واحدة',
      },
      {
        phrase: 'هل العدد النهارده مطابق ولا لا؟',
        explanation: 'يقارن العدد الإجباري بالمسجل بالأسماء ويكشف أي عجز أو زيادة فوراً',
      },
    ],
  },
  {
    id: 'advances_deductions_settlements',
    title: '٣. السلف والخصومات وتصفية قبض يوم ١٥',
    subtitle: 'صرف سلف، توقيع جزاءات، وتقفيل حساب العمال وصرف القبض',
    icon: 'payments',
    badge: 'مالي للعمال',
    colorClass: 'blue',
    examples: [
      {
        phrase: 'سلفة 500 لكريم النهارده',
        explanation: 'يسجل سلفة نقدية على العامل ويخصمها تلقائياً في كشف القبض',
      },
      {
        phrase: 'اخصم نص يوم من كريم بسبب تأخير',
        explanation: 'يسجل خصم (ربع يوم / نص يوم / يوم كامل / مبلغ) مع السبب',
      },
      {
        phrase: 'صفي حساب كريم واقبضه الصافي',
        explanation: 'يحسب إجمالي يوميات وسهرات العامل ويخصم السلف والجزاءات ويسجل التسوية',
      },
      {
        phrase: 'احسب قبض يوم 15 لكل العمال',
        explanation: 'يعرض ملخص كشف قبض يوم ١٥ لكل العمال والنحاتية بالتفصيل',
      },
    ],
  },
  {
    id: 'extracts_checks_expenses',
    title: '٤. المستخلصات والشيكات والمصاريف والإضافي',
    subtitle: 'إنشاء مستخلصات للشركات، إدارة الشيكات، وتسجيل مصاريف الموقع والناش',
    icon: 'receipt_long',
    badge: 'شركات وموقع',
    colorClass: 'purple',
    examples: [
      {
        phrase: 'اعمل مستخلص جديد لمشروع الكوبري',
        explanation: 'ينشئ مستخلص جديد للمشروع ويجهز بنود العمال تلقائياً',
      },
      {
        phrase: 'سجل شيك وارد بـ 40000 بنك مصر رقم 505',
        explanation: 'يضيف شيك جديد في دفتر الشيكات ويتابع موعد استحقاقه',
      },
      {
        phrase: 'صرف شيك رقم 505',
        explanation: 'يحول حالة الشيك إلى "اتصرف" ويسمّع في الخزنة وحساب المشروع فوراً',
      },
      {
        phrase: 'صرفت 350 مواصلات وعربية نقل النهارده',
        explanation: 'يسجل مصروف خارجي (مواصلات / أكل / أدوات / صيانة) على المشروع',
      },
    ],
  },
  {
    id: 'add_edit_delete_anything',
    title: '٥. إضافة وتعديل وحذف أي حاجة في الموقع',
    subtitle: 'تحكم كامل ١٠٠٪ في العمال والمشاريع والحركات والتراجع الفوري',
    icon: 'auto_fix_high',
    badge: 'تحكم شامل',
    colorClass: 'rose',
    examples: [
      {
        phrase: 'ضيف نحات جديد اسمه حسام بيومية 550 وسهرة 275',
        explanation: 'يضيف عامل أو نحات أو صنايعي جديد بأسعار يوميته وسهرته',
      },
      {
        phrase: 'ضيف مشروع جديد اسمه برج النيل بيومية شركة 700 وسهرة 350',
        explanation: 'يفتح مشروع جديد بأسعار الشركة لليومية والسهرة',
      },
      {
        phrase: 'عدل يومية كريم خليها 600',
        explanation: 'يحدث سعر يومية أو سهرة العامل فوراً',
      },
      {
        phrase: 'احذف اخر سلفة لكريم  أو  امسح اخر مصروف',
        explanation: 'يحذف أي سجل (سلفة / خصم / مصروف / دفعة / شيك / حضور) أو يتراجع فوراً',
      },
    ],
  },
  {
    id: 'methodology_analytics',
    title: '٦. مناهج المقاولات الذكية ومقارنة أرباح المشاريع',
    subtitle: 'تحليل أرباح المشاريع، القواعد الذهبية لإدارة الموقع، وكشف حساب العامل التفصيلي',
    icon: 'analytics',
    badge: 'ذكاء متقدم',
    colorClass: 'indigo',
    examples: [
      {
        phrase: 'اشرح مناهج وقواعد إدارة المقاولات الذكية',
        explanation: 'يعرض منهجية دورتمون الذهبية (٦ قواعد) مع تحليل حي لأرقام موقعك الحالية',
      },
      {
        phrase: 'قارن أرباح المشاريع وقولي انهي مشروع بيكسب اكتر',
        explanation: 'يرتب المشاريع حسب صافي الربح والسيولة وفرق اليوميات مع الشركة',
      },
      {
        phrase: 'كشف حساب تفصيلي لكريم محمود',
        explanation: 'يعرض كشف حساب كامل للعامل (يوميات، سهرات، سلف، خصومات، وصافي المستحق)',
      },
      {
        phrase: 'الشيكات المعلقة والتزاماتي الشهر ده كام؟',
        explanation: 'يعرض جميع الشيكات الواردة والصادرة المعلقة ومواعيد استحقاقها',
      },
    ],
  },
  {
    id: 'bank_audit_and_period_reports',
    title: '٧. تدقيق البنك والشيكات وتقارير الفترات والأمس',
    subtitle: 'فصل حساب البنك عن كاش الجيب وسلف العمال، تقارير محددة بالأيام ومطابقة العدد الإجباري',
    icon: 'account_balance',
    badge: 'فائق الذكاء',
    colorClass: 'emerald',
    examples: [
      {
        phrase: 'سحبت 4000 سلف من شيك 100000.. قولي باقي كام في البنك وباقي كام في جيبي؟',
        explanation: 'يدقق فصلاً كاملاً بين رصيد الشيك في البنك وبين الكاش المصروف سلف ونثريات في جيبك',
      },
      {
        phrase: 'تقرير اليوم  أو  تقرير يوم أمس (امبارح)',
        explanation: 'يعطيك ملخصاً فورياً ليوميات اليوم أو أمس والمصاريف والسلف بدون الحاجة لدخول الجداول',
      },
      {
        phrase: 'مطابقة كشف العدد اليومي',
        explanation: 'يقارن بين دفتر العدد الإجباري وكشف الحضور ويكشف أي فارق في العمالة أو السهرات',
      },
      {
        phrase: 'مين عليه سلف مفتوحة ومخصمتهاش؟',
        explanation: 'يحصر جميع العمال اللي عليهم سلف معلقة لم تُخصم بعد لتسويتها في كشف القبض',
      },
      {
        phrase: 'نصيحة زكي لإدارة السيولة والمقاولات',
        explanation: 'يقدم استشارات مالية وإدارية ذكية مبنية على خبرة إدارة مواقع المقاولات',
      },
    ],
  },
];

const DEFAULT_FALLBACK_COMMANDS = [
  'سحبت 4000 سلف من شيك 100000.. باقي كام في البنك وفي جيبي؟',
  'تقرير اليوم وإحصائيات الحضور والسلف والمصاريف',
  'حسابي الشامل كام؟ وصلني كام وليا كام وعليا كام؟',
  'اشرح مناهج وقواعد إدارة المقاولات الذكية',
  'مطابقة كشف العدد اليومي مع الحضور الفعلي',
  'قارن أرباح المشاريع وقولي انهي مشروع بيكسب اكتر',
  'مين عليه سلف مفتوحة ومخصمتهاش لحد دلوقتي؟',
  'وصلني 50000 من شركة إعمار لمشروع التجمع',
  'العدد النهارده 10 يومية و 4 سهرة',
  'احسب قبض يوم 15 لكل العمال',
  'نصيحة زكي لإدارة السيولة والمقاولات',
  'اخصم نص يوم من كريم بسبب تأخير',
  'تقدر تعمل ايه يا ذكي؟',
];

export interface WorkerMatchResult {
  matched: Worker[];
  ambiguous: Worker[];
  suggestion: Worker | null;
  missingName?: string;
}

export function matchWorkersFromText(
  rawText: string,
  workers: Worker[]
): WorkerMatchResult {
  const normText = normalizeArabic(rawText);
  const activeWorkers = workers.filter((w) => w.active);

  // Check role-based match first (e.g., "لكل النقاشين", "النحاتية", "النحاتين", "النجارين", "الحدادين")
  const roleMappings: { keywords: string[]; role: string }[] = [
    { keywords: ['النحاتيه', 'نحاتيه', 'النحاتين', 'نحاتين', 'نحات'], role: 'نحات' },
    { keywords: ['النقاشين', 'نقاشين', 'نقاش'], role: 'نقاش' },
    { keywords: ['النجارين', 'نجارين', 'نجار'], role: 'نجار' },
    { keywords: ['الحدادين', 'حدادين', 'حداد'], role: 'حداد' },
    { keywords: ['المشرفين', 'مشرفين', 'مشرف'], role: 'مشرف' },
    { keywords: ['العمال', 'عمال'], role: 'عامل' },
    { keywords: ['البنايين', 'بنايين', 'بناء'], role: 'بناء' },
  ];

  if (normText.includes('لكل ') || normText.includes('كل ')) {
    for (const rm of roleMappings) {
      if (rm.keywords.some((kw) => normText.includes(normalizeArabic(kw)))) {
        const byRole = activeWorkers.filter(
          (w) => normalizeArabic(w.role) === normalizeArabic(rm.role)
        );
        if (byRole.length > 0) {
          return { matched: byRole, ambiguous: [], suggestion: null };
        }
      }
    }
  }

  // Exact full name matches in text
  const exactFullMatches: Worker[] = [];
  for (const w of activeWorkers) {
    const wNorm = normalizeArabic(w.name);
    if (wNorm.length > 1 && normText.includes(wNorm)) {
      exactFullMatches.push(w);
    }
  }
  if (exactFullMatches.length > 0) {
    return { matched: exactFullMatches, ambiguous: [], suggestion: null };
  }

  const stopWords = new Set([
    'زكي',
    'يا',
    'سجل',
    'ضيف',
    'حط',
    'زود',
    'اعمل',
    'اخصم',
    'خصم',
    'جزاء',
    'بسبب',
    'تاخير',
    'غياب',
    'يوميه',
    'يوميات',
    'سهره',
    'سهرات',
    'سلفه',
    'سلف',
    'اضافي',
    'نص',
    'نصف',
    'ربع',
    'يوم',
    'النهارده',
    'امبارح',
    'اول',
    'اخد',
    'تاريخ',
    'التاريخ',
    'بتاعه',
    'كام',
    'عدد',
    'الشهر',
    'ده',
    'هذا',
    'بامر',
    'المهندس',
    'المشرف',
    'ملاحظه',
    'ملاحظات',
    'جنيه',
    'الف',
    'ميه',
    'ميت',
    'في',
    'من',
    'علي',
    'الي',
    'عن',
    'مستخلص',
    'المستخلص',
    'الاول',
    'التاني',
    'الثاني',
    'طلبه',
    'اتحصل',
  ]);

  const matchedWorkers = new Map<number, Worker>();
  const ambiguousCandidates: Worker[] = [];

  const textWithoutEngineer = normText.replace(
    /بامر\s+(?:المهندس|المشرف)?\s*\S+/g,
    ''
  );

  for (const w of activeWorkers) {
    const wNorm = normalizeArabic(w.name);
    const firstName = wNorm.split(' ')[0];

    const patterns = [
      new RegExp(`(?:^|\\s)(?:ل|و|ول)?${firstName}(?:$|\\s)`),
    ];

    if (patterns.some((r) => r.test(textWithoutEngineer))) {
      const sameFirst = activeWorkers.filter(
        (other) => normalizeArabic(other.name).split(' ')[0] === firstName
      );
      if (sameFirst.length > 1) {
        for (const sf of sameFirst) {
          if (!ambiguousCandidates.some((x) => x.id === sf.id)) {
            ambiguousCandidates.push(sf);
          }
        }
      } else if (w.id !== undefined) {
        matchedWorkers.set(w.id, w);
      }
    }
  }

  if (ambiguousCandidates.length > 1 && matchedWorkers.size === 0) {
    return {
      matched: [],
      ambiguous: ambiguousCandidates,
      suggestion: null,
    };
  }

  if (matchedWorkers.size > 0) {
    return {
      matched: Array.from(matchedWorkers.values()),
      ambiguous: [],
      suggestion: null,
    };
  }

  const lPrefixMatch = textWithoutEngineer.match(/(?:^|\s)(?:ل|من\s+)([^\s]+)/);
  const candidateToken =
    lPrefixMatch?.[1] ||
    textWithoutEngineer
      .split(' ')
      .find((t) => t.length >= 3 && !stopWords.has(t));

  if (candidateToken) {
    let bestWorker: Worker | null = null;
    let bestDist = 99;
    for (const w of activeWorkers) {
      const firstName = normalizeArabic(w.name).split(' ')[0];
      const dist = levenshteinDistance(candidateToken, firstName);
      if (dist < bestDist) {
        bestDist = dist;
        bestWorker = w;
      }
    }
    if (bestWorker && bestDist <= 2) {
      return {
        matched: [],
        ambiguous: [],
        suggestion: bestWorker,
        missingName: candidateToken,
      };
    }
  }

  return { matched: [], ambiguous: [], suggestion: null };
}

export function processZakiMessage(
  rawInput: string,
  ctx: ZakiContext
): ZakiResponse {
  const input = rawInput.trim();
  const norm = normalizeArabic(input);
  const numMode = ctx.settings.numeralMode || 'ar';
  const defaultProject =
    ctx.projects.find((p) => p.id === ctx.settings.defaultProjectId) ||
    ctx.projects.find((p) => p.active) ||
    ctx.projects[0];

  // 0. If awaiting advance amount from previous turn
  if (ctx.pendingAdvanceWorkerId) {
    const amount = parseSpokenArabicNumber(input);
    const worker = ctx.workers.find((w) => w.id === ctx.pendingAdvanceWorkerId);
    if (amount && amount > 0 && worker && worker.id !== undefined) {
      const date = resolveRelativeDate(input, ctx.todayIso);
      return {
        reply: `هسجل سلفة ${formatCurrency(amount, numMode)} للعامل ${worker.name} بتاريخ ${formatArabicDateShort(date)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_advance',
          workerId: worker.id,
          workerName: worker.name,
          amount,
          date,
          reason: 'سلفة عبر زكي',
        },
        actionRoute: '/advances',
        actionLabel: 'تحويل لصفحة السلف',
      };
    }
  }

  // 1. Navigation & Direct UI Actions
  if (
    norm.includes('افتح الاضافه الجماعيه') ||
    norm.includes('الاضافه الجماعيه')
  ) {
    return {
      reply: 'حاضر يا هندسة، فتحتلك شاشة الإضافة الجماعية.',
      clientEffect: 'navigate_bulk',
      actionRoute: '/bulk',
      actionLabel: 'تحويل للإضافة الجماعية',
    };
  }

  if (
    norm.includes('شيت اكسل المباشر') ||
    norm.includes('شيت اكسيل المباشر') ||
    norm.includes('صفحه الاكسل') ||
    norm.includes('صفحة الاكسل') ||
    norm.includes('افتح الاكسل') ||
    norm.includes('افتح اكسل') ||
    norm.includes('شيت الموقع') ||
    norm.includes('جدول اكسل') ||
    norm.includes('شيت مباشر')
  ) {
    return {
      reply:
        'عيوني يا هندسة! فتحتلك شيت إكسيل الموقع المباشر (Live Excel Studio). تقدر تسجل وتعدل فيه على أي خلية فورياً زي برنامج إكسيل بالظبط (يوميات، عمال، سلف، مصاريف، شيكات)، وتنزله Excel حقيقي أو تنسخه للذاكرة.',
      actionRoute: '/live-excel',
      actionLabel: 'فتح شيت إكسيل المباشر',
      quickCommands: [
        'افتح شيت إكسيل المباشر',
        'تصدير الإكسل',
        'تقرير اليوم',
        'حسابي الشامل',
      ],
    };
  }

  if (
    norm.includes('صدر الاكسل') ||
    norm.includes('تصدير الاكسل') ||
    norm.includes('صدر اكسل') ||
    norm.includes('شيت اكسل')
  ) {
    return {
      reply: 'عيوني! جاري تجهيز وتنزيل ملف الإكسل الكامل بكل الصفحات والإجماليات.',
      clientEffect: 'export_excel',
      actionRoute: '/reports',
      actionLabel: 'تحويل لصفحة التقارير',
    };
  }

  if (norm === 'اتراجع' || norm.includes('تراجع عن اخر') || norm.includes('الغي اخر عمليه')) {
    return {
      reply: 'تمام يا هندسة، تراجعتلك عن آخر عملية سجلتها فوراً.',
      clientEffect: 'undo',
    };
  }

  // 1A-0. Capabilities & Egyptian Greeting ("بتعمل ايه" / "تقدر تعمل ايه" / "قدراتك" / "ازيك يا ذكي" / "عامل ايه")
  if (
    norm.includes('بتعمل ايه') ||
    norm.includes('تقدر تعمل ايه') ||
    norm.includes('ايه قدراتك') ||
    norm.includes('قدرات البوت') ||
    norm.includes('تعرف تعمل ايه') ||
    norm.includes('ما يمكن للبوت') ||
    norm.includes('علمني') ||
    norm.includes('دليل ذكي')
  ) {
    return {
      reply:
        'أنا ذكي يا هندسة — دراعك اليمين في الموقع والحسابات! أقدر بالعامية المصرية أعملك أي حاجة في الموقع بلا استثناء:\n' +
        '• أسجل الفلوس اللي وصلتك (شيكات / من شركة / من شخص) وأقولك حسابك الشامل واللي ليك واللي عليك والربح الصافي في كل مشروع.\n' +
        '• أسجل العدد اليومي الإجباري وأحضر العمال والنحاتية يوميات وسهرات وأطابق العدد.\n' +
        '• أصرف سلف، أوقع خصومات وجزاءات، وأصفي كشف قبض يوم ١٥.\n' +
        '• أعمل مستخلصات للشركات، أسجل وأصرف شيكات، وأسجل مصاريف الموقع والناش.\n' +
        '• أضيف وأعدل وأحذف أي عامل أو مشروع أو حركة في ثانية واحدة! فتحتلك دليل قدراتي الكامل عشان تجرب أي أمر بضغطة زر.',
      clientEffect: 'open_capabilities',
      quickCommands: DEFAULT_FALLBACK_COMMANDS,
      actionRoute: '/my-ledger',
      actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
    };
  }

  if (
    norm === 'ازيك' ||
    norm.includes('ازيك يا زكي') ||
    norm.includes('ازيك يا ذكي') ||
    norm.includes('عامل ايه') ||
    norm.includes('اخبار الشغل ايه') ||
    norm.includes('صباح الخير') ||
    norm.includes('مساء الخير') ||
    norm.includes('يا هندسه')
  ) {
    const ledger = calculateComprehensiveLedger({
      projects: ctx.projects,
      workers: ctx.workers,
      attendances: ctx.attendances,
      advances: ctx.advances,
      deductions: ctx.deductions || [],
      settlements: ctx.settlements || [],
      extracts: ctx.extracts,
      extractLines: ctx.extractLines,
      extras: ctx.extras,
      extraCashes: ctx.extraCashes,
      checks: ctx.checks,
      expenses: ctx.expenses || [],
      incomingPayments: ctx.incomingPayments || [],
      selectedProjectId: null,
    });
    return {
      reply: `أهلاً بيك يا باشمهندس! كله تمام ومترتب ١٠٠٪. لحد دلوقتي إجمالي اللي وصلك في الخزنة ${formatCurrency(ledger.totalReceivedAllSources, numMode)}، وإجمالي اللي اتصرف ${formatCurrency(ledger.totalSpentAll, numMode)}، وليك بره عند الشركات والشيكات ${formatCurrency(ledger.totalOwedToMe, numMode)}، وعليك التزامات للعمال والشيكات ${formatCurrency(ledger.totalOwedByMe, numMode)}، وصافي ربحك ومكسبك ${formatCurrency(ledger.totalNetProfit, numMode)}. أؤمرني أسجلك إيه النهارده؟`,
      quickCommands: DEFAULT_FALLBACK_COMMANDS,
      actionRoute: '/my-ledger',
      actionLabel: 'فتح صفحة حسابي الشامل بالتفصيل',
    };
  }

  // 1A-1. Comprehensive Ledger & Project P&L Inquiry ("حسابي الشامل" / "وصلني كام" / "ليا كام وعليا كام" / "ربح مشروع" / "المكسب كام")
  if (
    norm.includes('حسابي') ||
    norm.includes('الخزنه') ||
    norm.includes('وصلني كام') ||
    norm.includes('قبضت كام') ||
    norm.includes('ليا كام') ||
    norm.includes('عليا كام') ||
    norm.includes('اتصرف كام') ||
    norm.includes('الربح كام') ||
    norm.includes('المكسب كام') ||
    norm.includes('صافي الربح') ||
    (norm.includes('تفاصيل') && norm.includes('مشروع'))
  ) {
    const matchedProject = ctx.projects.find((p) => {
      const pWords = normalizeArabic(p.name)
        .split(' ')
        .filter((w) => w.length >= 3);
      return pWords.some((w) => norm.includes(w));
    });

    const ledger = calculateComprehensiveLedger({
      projects: ctx.projects,
      workers: ctx.workers,
      attendances: ctx.attendances,
      advances: ctx.advances,
      deductions: ctx.deductions || [],
      settlements: ctx.settlements || [],
      extracts: ctx.extracts,
      extractLines: ctx.extractLines,
      extras: ctx.extras,
      extraCashes: ctx.extraCashes,
      checks: ctx.checks,
      expenses: ctx.expenses || [],
      incomingPayments: ctx.incomingPayments || [],
      selectedProjectId: matchedProject?.id ?? null,
    });

    if (matchedProject) {
      const pb = ledger.projectBreakdowns.find((b) => b.projectId === matchedProject.id);
      if (pb) {
        return {
          reply:
            `📊 كشف حساب مشروع "${pb.projectName}" بالتفصيل:\n` +
            `• إجمالي اللي وصلك للمشروع: ${formatCurrency(pb.totalReceivedForProject, numMode)} (شركات/مستخلصات: ${formatCurrency(pb.receivedFromCompanies + pb.receivedFromExtracts, numMode)} · شيكات: ${formatCurrency(pb.receivedFromChecks, numMode)} · أشخاص: ${formatCurrency(pb.receivedFromPersons, numMode)})\n` +
            `• المنصرف في المشروع: ${formatCurrency(pb.totalSpentInProject, numMode)} (سلف: ${formatCurrency(pb.advancesSpent, numMode)} · قبض يوم ١٥: ${formatCurrency(pb.settlementsPaid, numMode)} · ناش: ${formatCurrency(pb.nashPaid, numMode)} · مصاريف: ${formatCurrency(pb.expensesSpent, numMode)})\n` +
            `• ليا بره عند المشروع: ${formatCurrency(pb.owedToMeInProject, numMode)} · وعليا للعمال والشيكات: ${formatCurrency(pb.owedByMeInProject, numMode)}\n` +
            `• صافي الربح (المكسب) في المشروع: ${formatCurrency(pb.netProfit, numMode)} · والسيولة النقدية الصافية: ${formatCurrency(pb.cashFlowBalance, numMode)}.`,
          actionRoute: '/my-ledger',
          actionLabel: 'فتح حسابي الشامل وتفاصيل المشاريع',
        };
      }
    }

    return {
      reply:
        `💰 ملخص حسابك الشامل والخزنة لكل المشاريع:\n` +
        `• إجمالي اللي وصلك فعلياً: ${formatCurrency(ledger.totalReceivedAllSources, numMode)} (من شركات ومستخلصات: ${formatCurrency(ledger.receivedFromCompanies, numMode)} · من شيكات: ${formatCurrency(ledger.receivedFromChecks, numMode)} · من أشخاص: ${formatCurrency(ledger.receivedFromPersons, numMode)})\n` +
        `• إجمالي اللي اتصرف: ${formatCurrency(ledger.totalSpentAll, numMode)} (سلف: ${formatCurrency(ledger.totalAdvancesPaid, numMode)} · تسويات وقبض: ${formatCurrency(ledger.totalSettlementsPaid, numMode)} · ناش: ${formatCurrency(ledger.totalNashCashPaid, numMode)} · مصاريف خارجية: ${formatCurrency(ledger.totalExternalExpenses, numMode)})\n` +
        `• ليك بره (عند الشركات + شيكات واردة معلقة): ${formatCurrency(ledger.totalOwedToMe, numMode)}\n` +
        `• عليك التزامات (أجور عمال متبقية + شيكات صادرة): ${formatCurrency(ledger.totalOwedByMe, numMode)}\n` +
        `• صافي الربح العام: ${formatCurrency(ledger.totalNetProfit, numMode)} · والرصيد النقدي الصافي بالخزنة: ${formatCurrency(ledger.netCashInHand, numMode)}.`,
      actionRoute: '/my-ledger',
      actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
    };
  }

  // 1A-2. Write Intent: Record Incoming Payment ("وصلني 50000 من شركة إعمار لمشروع التجمع" / "قبضت 20000 من الحاج سعيد" / "دخل الخزنة 15000 من المهندس طارق")
  if (
    norm.startsWith('وصلني') ||
    norm.startsWith('قبضت') ||
    norm.startsWith('استلمت') ||
    norm.startsWith('دخل الخزنه') ||
    norm.startsWith('جالي دفعه') ||
    norm.includes('وصلني مبلغ') ||
    norm.includes('دفعه وارده')
  ) {
    const amount = parseSpokenArabicNumber(input) || 0;
    if (amount > 0) {
      const date = resolveRelativeDate(input, ctx.todayIso);
      let sourceType: PaymentSourceType = 'شركة';
      if (norm.includes('شيك')) {
        sourceType = 'شيك';
      } else if (
        norm.includes('شخص') ||
        norm.includes('الحاج') ||
        norm.includes('المهندس') ||
        norm.includes('استاذ') ||
        norm.includes('الاستاذ') ||
        norm.includes('عم ')
      ) {
        sourceType = 'شخص';
      } else if (norm.includes('مستخلص')) {
        sourceType = 'مستخلص';
      }

      let method: PaymentMethodType = 'نقدي';
      if (norm.includes('شيك')) method = 'شيك';
      else if (norm.includes('تحويل') || norm.includes('بنك')) method = 'تحويل بنكي';
      else if (norm.includes('فودافون') || norm.includes('انستاباي') || norm.includes('محفظه'))
        method = 'محفظة إلكترونية';

      const matchedProject =
        ctx.projects.find((p) => {
          const pWords = normalizeArabic(p.name)
            .split(' ')
            .filter((w) => w.length >= 3);
          return pWords.some((w) => norm.includes(w));
        }) || defaultProject;

      const fromMatch = input.match(/من\s+([^\d]+?)(?:\s+لمشروع|\s+في مشروع|\s+لحساب|\s+نقدي|\s+شيك|\s+تحويل|$)/);
      const sourceName = fromMatch
        ? fromMatch[1].trim()
        : sourceType === 'شركة'
          ? matchedProject?.name || 'الشركة'
          : 'دفعة مباشرة';

      const chkMatch = norm.match(/رقم\s*(\d+)/);
      const checkNumber = chkMatch ? chkMatch[1] : '';

      return {
        reply: `هسجل دفعة واردة وصلتك بقيمة ${formatCurrency(amount, numMode)} من (${sourceType}: ${sourceName}) بطريقة (${method}) لحساب "${matchedProject?.name || 'عام'}" بتاريخ ${formatArabicDateShort(date)}. تمام يا هندسة؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_incoming_payment',
          date,
          sourceType,
          sourceName,
          amount,
          method,
          projectId: matchedProject?.id ?? null,
          projectName: matchedProject?.name || 'عام / الخزنة الرئيسية',
          checkNumber,
          notes: `مسجل عبر المساعد ذكي: ${input}`,
        },
        actionRoute: '/my-ledger',
        actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
      };
    }
  }

  // 1A-3. Write Intent: Record Site Expense ("صرفت 300 مواصلات" / "دفعت 450 اكل وغداء" / "سجل مصروف 500 ادوات")
  if (
    norm.startsWith('صرفت') ||
    norm.startsWith('دفعت') ||
    norm.startsWith('مصروف') ||
    norm.startsWith('سجل مصروف') ||
    norm.startsWith('اشترينا')
  ) {
    const amount = parseSpokenArabicNumber(input) || 0;
    if (amount > 0) {
      const date = resolveRelativeDate(input, ctx.todayIso);
      let category: ExpenseCategory = 'مواصلات';
      if (
        norm.includes('اكل') ||
        norm.includes('فطار') ||
        norm.includes('غداء') ||
        norm.includes('عشاء') ||
        norm.includes('شاي') ||
        norm.includes('ميه')
      ) {
        category = 'أكل';
      } else if (
        norm.includes('ادوات') ||
        norm.includes('عده') ||
        norm.includes('اسطوان') ||
        norm.includes('خامات') ||
        norm.includes('مسامير') ||
        norm.includes('سلك')
      ) {
        category = 'أدوات';
      } else if (norm.includes('صيانه') || norm.includes('تصليح') || norm.includes('عطل')) {
        category = 'صيانة';
      } else if (!norm.includes('مواصلات') && !norm.includes('عربيه') && !norm.includes('نقل')) {
        category = 'أخرى';
      }

      const matchedProject =
        ctx.projects.find((p) => {
          const pWords = normalizeArabic(p.name)
            .split(' ')
            .filter((w) => w.length >= 3);
          return pWords.some((w) => norm.includes(w));
        }) || defaultProject;

      return {
        reply: `هسجل مصروف خارجي (${category}) بمبلغ ${formatCurrency(amount, numMode)} على مشروع "${matchedProject?.name || 'عام'}" بتاريخ ${formatArabicDateShort(date)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_expense',
          date,
          category,
          amount,
          projectId: matchedProject?.id ?? null,
          projectName: matchedProject?.name || 'عام',
          note: input,
        },
        actionRoute: '/expenses',
        actionLabel: 'تحويل لصفحة المصاريف',
      };
    }
  }

  // 1A-4. Write Intent: Create Extract ("اعمل مستخلص جديد لمشروع الكوبري" / "طلع مستخلص" / "افتح مستخلص")
  if (
    (norm.includes('اعمل مستخلص') ||
      norm.includes('طلع مستخلص') ||
      norm.includes('افتح مستخلص') ||
      norm.includes('مستخلص جديد') ||
      norm.includes('انشئ مستخلص') ||
      norm.includes('ضيف مستخلص')) &&
    !norm.includes('كام')
  ) {
    const matchedProject =
      ctx.projects.find((p) => {
        const pWords = normalizeArabic(p.name)
          .split(' ')
          .filter((w) => w.length >= 3);
        return pWords.some((w) => norm.includes(w));
      }) || defaultProject;

    if (!matchedProject || matchedProject.id === undefined) {
      return {
        reply: 'يرجى إضافة مشروع أولاً عشان أقدر أعملك مستخلص عليه يا هندسة.',
        actionRoute: '/settings',
        actionLabel: 'إضافة مشروع من الإعدادات',
      };
    }

    const projExtracts = ctx.extracts.filter((e) => e.projectId === matchedProject.id);
    const nextNum = Math.max(0, ...projExtracts.map((e) => e.number || 0)) + 1;
    const from = `${ctx.todayIso.slice(0, 7)}-01`;
    const to = ctx.todayIso;

    return {
      reply: `هجهزلك وأحفظ مستخلص جديد رقم (${formatNumber(nextNum, numMode)}) لمشروع "${matchedProject.name}" عن الفترة من ${formatArabicDateShort(from)} إلى ${formatArabicDateShort(to)} شامل حسابات العمال والنحاتية. تمام؟`,
      requiresConfirmation: true,
      pendingAction: {
        type: 'create_extract',
        projectId: matchedProject.id,
        projectName: matchedProject.name,
        from,
        to,
        number: nextNum,
      },
      actionRoute: '/extracts',
      actionLabel: 'تحويل لصفحة المستخلصات',
    };
  }

  // 1A-5. Write Intent: Checks — Add Check or Cash/Collect Check ("صرف شيك رقم 105" / "حصل شيك 105" / "سجل شيك وارد بـ 40000 بنك مصر رقم 505")
  if (
    norm.includes('صرف شيك') ||
    norm.includes('حصل شيك') ||
    norm.includes('اتصرف شيك') ||
    (norm.includes('شيك') && (norm.includes('اتصرف') || norm.includes('مرتجع')))
  ) {
    const numMatch = norm.match(/(\d+)/);
    const numHint = numMatch ? numMatch[1] : '';
    const targetCheck =
      ctx.checks.find((c) => numHint && c.number.includes(numHint)) ||
      ctx.checks.find((c) => c.status === 'معلق');

    if (targetCheck && targetCheck.id !== undefined) {
      const newStatus: 'اتصرف' | 'مرتجع' = norm.includes('مرتجع') ? 'مرتجع' : 'اتصرف';
      return {
        reply: `هحدث حالة الشيك رقم (${targetCheck.number}) بمبلغ ${formatCurrency(targetCheck.amount, numMode)} (${targetCheck.bank}) إلى "${newStatus}". تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'update_check_status',
          checkId: targetCheck.id,
          checkNumber: targetCheck.number,
          newStatus,
          amount: targetCheck.amount,
        },
        actionRoute: '/checks',
        actionLabel: 'تحويل لدفتر الشيكات',
      };
    }
  }

  if (
    (norm.includes('سجل شيك') || norm.includes('ضيف شيك') || norm.includes('شيك جديد')) &&
    !norm.includes('كام')
  ) {
    const direction: 'وارد' | 'صادر' = norm.includes('صادر') ? 'صادر' : 'وارد';
    const numMatch = norm.match(/رقم\s*(\d+)/);
    const checkNum = numMatch ? numMatch[1] : String(Math.floor(1000 + Math.random() * 9000));
    const withoutNum = norm.replace(/رقم\s*\d+/, '');
    const amountMatch = withoutNum.match(/(\d+(?:\.\d+)?)/);
    const amount = amountMatch ? Number(amountMatch[1]) : parseSpokenArabicNumber(withoutNum) || 0;
    const bankMatch = input.match(/بنك\s+([^\s\d]+(?:\s+[^\s\d]+)?)/);
    const bank = bankMatch ? `بنك ${bankMatch[1].trim()}` : 'بنك مصر';

    const matchedProject =
      ctx.projects.find((p) => {
        const pWords = normalizeArabic(p.name)
          .split(' ')
          .filter((w) => w.length >= 3);
        return pWords.some((w) => norm.includes(w));
      }) || defaultProject;

    if (amount > 0) {
      return {
        reply: `هسجل شيك (${direction}) رقم ${checkNum} على ${bank} بمبلغ ${formatCurrency(amount, numMode)} لحساب "${matchedProject?.name || 'عام'}" (حالته: معلق). تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_check',
          direction,
          number: checkNum,
          bank,
          amount,
          dueDate: ctx.todayIso,
          status: 'معلق',
          projectId: matchedProject?.id ?? null,
          notes: `شيك ${direction} مسجل عبر ذكي`,
        },
        actionRoute: '/checks',
        actionLabel: 'تحويل لدفتر الشيكات',
      };
    }
  }

  // 1A-6. Write Intent: Settle Worker Account ("صفي حساب كريم" / "اقفل حساب محمد واصرفله قبضه")
  if (
    norm.includes('صفي حساب') ||
    norm.includes('اقفل حساب') ||
    norm.includes('سوي حساب') ||
    norm.includes('اصرف قبض')
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.matched.length > 0) {
      const w = wm.matched[0];
      const wAtt = ctx.attendances.filter((a) => a.workerId === w.id);
      const days = wAtt.reduce((s, a) => s + (a.dayWorked ? 1 : 0), 0);
      const nights = wAtt.reduce((s, a) => s + (a.nightWorked ? 1 : 0), 0);
      const grossWages = wAtt.reduce(
        (s, a) =>
          s +
          (a.dayWorked ? a.workerDayRateSnapshot || w.workerDayRate : 0) +
          (a.nightWorked ? a.workerNightRateSnapshot || w.workerNightRate : 0),
        0
      );
      const advancesDeducted = ctx.advances
        .filter((a) => a.workerId === w.id && a.settlementId === null)
        .reduce((s, a) => s + a.amount, 0);
      const deductionsDeducted = (ctx.deductions || [])
        .filter((d) => d.workerId === w.id && d.settlementId === null)
        .reduce((s, d) => s + d.amount, 0);
      const netPaid = Math.max(0, grossWages - advancesDeducted - deductionsDeducted);
      const from = `${ctx.todayIso.slice(0, 7)}-01`;
      const to = ctx.todayIso;

      return {
        reply: `هصفي حساب ${w.name}: إجمالي الأجر ${formatCurrency(grossWages, numMode)} (${formatNumber(days, numMode)} يومية و ${formatNumber(nights, numMode)} سهرة) − سلف ${formatCurrency(advancesDeducted, numMode)} − خصومات ${formatCurrency(deductionsDeducted, numMode)} = الصافي المستحق للصرف ${formatCurrency(netPaid, numMode)}. أعتمد التسوية والصرف؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'settle_worker',
          workerId: w.id!,
          workerName: w.name,
          from,
          to,
          days,
          nights,
          grossWages,
          advancesDeducted,
          deductionsDeducted,
          netPaid,
        },
        actionRoute: '/settlements',
        actionLabel: 'تحويل لصفحة كشف قبض يوم 15 والتسويات',
      };
    }
  }

  // 1A-7. Write Intent: Update Worker Rate ("عدل يومية كريم خليها 600" / "غير يومية محمد لـ 550 وسهرة 275")
  if (
    (norm.includes('عدل يوميه') ||
      norm.includes('غير يوميه') ||
      norm.includes('خلي يوميه') ||
      norm.includes('زود يوميه')) &&
    !norm.includes('شركه')
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    const newRate = parseSpokenArabicNumber(input) || 0;
    if (wm.matched.length > 0 && newRate > 0) {
      const w = wm.matched[0];
      const nightMatch = norm.match(/سهره\s*(\d+)/);
      const newNight = nightMatch ? Number(nightMatch[1]) : Math.round(newRate / 2);
      return {
        reply: `هعدل سعر يومية ${w.name} لتصبح ${formatCurrency(newRate, numMode)} وسهرته ${formatCurrency(newNight, numMode)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'update_worker_rate',
          workerId: w.id!,
          workerName: w.name,
          workerDayRate: newRate,
          workerNightRate: newNight,
        },
        actionRoute: '/workers',
        actionLabel: 'تحويل لصفحة العمال والنحاتية',
      };
    }
  }

  // 1A-8. Write Intent: Delete Any Record ("احذف" / "امسح" / "شيل" / "الغي")
  if (
    norm.startsWith('احذف') ||
    norm.startsWith('امسح') ||
    norm.startsWith('شيل') ||
    norm.startsWith('الغي')
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    const targetWorker = wm.matched[0];

    // Delete advance
    if (norm.includes('سلفه') || norm.includes('سلف')) {
      const cand = targetWorker
        ? ctx.advances.find((a) => a.workerId === targetWorker.id)
        : ctx.advances[0];
      if (cand && cand.id !== undefined) {
        const wName = ctx.workers.find((w) => w.id === cand.workerId)?.name || '';
        return {
          reply: `هحذف سلفة ${wName} بقيمة ${formatCurrency(cand.amount, numMode)} بتاريخ ${formatArabicDateShort(cand.date)}. متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'advance',
            recordId: cand.id,
            description: `سلفة ${wName} (${formatCurrency(cand.amount, numMode)})`,
          },
          actionRoute: '/advances',
          actionLabel: 'تحويل لصفحة السلف',
        };
      }
    }

    // Delete deduction
    if (norm.includes('خصم') || norm.includes('جزاء')) {
      const deds = ctx.deductions || [];
      const cand = targetWorker
        ? deds.find((d) => d.workerId === targetWorker.id)
        : deds[0];
      if (cand && cand.id !== undefined) {
        const wName = ctx.workers.find((w) => w.id === cand.workerId)?.name || '';
        return {
          reply: `هحذف خصم ${wName} بقيمة ${formatCurrency(cand.amount, numMode)} (${cand.reason}). متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'deduction',
            recordId: cand.id,
            description: `خصم ${wName} (${formatCurrency(cand.amount, numMode)})`,
          },
          actionRoute: '/deductions',
          actionLabel: 'تحويل لصفحة الخصومات',
        };
      }
    }

    // Delete attendance
    if (norm.includes('حضور') || norm.includes('يوميه') || norm.includes('تحضير')) {
      const date = resolveRelativeDate(input, ctx.todayIso);
      const cand = targetWorker
        ? ctx.attendances.find((a) => a.workerId === targetWorker.id && a.date === date) ||
          ctx.attendances.find((a) => a.workerId === targetWorker.id)
        : ctx.attendances[0];
      if (cand && cand.id !== undefined) {
        const wName = ctx.workers.find((w) => w.id === cand.workerId)?.name || '';
        return {
          reply: `هحذف سجل حضور ${wName} بتاريخ ${formatArabicDateShort(cand.date)}. متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'attendance',
            recordId: cand.id,
            description: `حضور ${wName} يوم ${cand.date}`,
          },
          actionRoute: '/attendance',
          actionLabel: 'تحويل لشبكة الحضور',
        };
      }
    }

    // Delete expense
    if (norm.includes('مصروف') || norm.includes('مصاريف')) {
      const exps = ctx.expenses || [];
      const cand = exps[0];
      if (cand && cand.id !== undefined) {
        return {
          reply: `هحذف مصروف (${cand.category}) بقيمة ${formatCurrency(cand.amount, numMode)} بتاريخ ${formatArabicDateShort(cand.date)}. متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'expense',
            recordId: cand.id,
            description: `مصروف ${cand.category} (${formatCurrency(cand.amount, numMode)})`,
          },
          actionRoute: '/expenses',
          actionLabel: 'تحويل لصفحة المصاريف',
        };
      }
    }

    // Delete incoming payment
    if (norm.includes('دفعه') || norm.includes('مقبوض') || norm.includes('وارد')) {
      const incs = ctx.incomingPayments || [];
      const cand = incs[0];
      if (cand && cand.id !== undefined) {
        return {
          reply: `هحذف الدفعة الواردة من (${cand.sourceName}) بقيمة ${formatCurrency(cand.amount, numMode)}. متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'incomingPayment',
            recordId: cand.id,
            description: `دفعة واردة من ${cand.sourceName} (${formatCurrency(cand.amount, numMode)})`,
          },
          actionRoute: '/my-ledger',
          actionLabel: 'تحويل لحسابي الشامل',
        };
      }
    }

    // Delete check
    if (norm.includes('شيك')) {
      const numMatch = norm.match(/(\d+)/);
      const cand = numMatch
        ? ctx.checks.find((c) => c.number.includes(numMatch[1]))
        : ctx.checks[0];
      if (cand && cand.id !== undefined) {
        return {
          reply: `هحذف الشيك رقم ${cand.number} (${cand.bank}) بقيمة ${formatCurrency(cand.amount, numMode)}. متأكد؟`,
          requiresConfirmation: true,
          pendingAction: {
            type: 'delete_record',
            targetEntity: 'check',
            recordId: cand.id,
            description: `شيك رقم ${cand.number} (${formatCurrency(cand.amount, numMode)})`,
          },
          actionRoute: '/checks',
          actionLabel: 'تحويل لدفتر الشيكات',
        };
      }
    }

    // Delete worker
    if (targetWorker && targetWorker.id !== undefined && (norm.includes('عامل') || norm.includes('نحات') || norm.includes(normalizeArabic(targetWorker.name)))) {
      return {
        reply: `هحذف العامل "${targetWorker.name}" (${targetWorker.role}) من قائمة العمال. متأكد يا هندسة؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'delete_record',
          targetEntity: 'worker',
          recordId: targetWorker.id,
          description: `العامل ${targetWorker.name}`,
        },
        actionRoute: '/workers',
        actionLabel: 'تحويل لصفحة العمال',
      };
    }
  }

  // 1B. Write Intent: Add New Worker or Sculptor ("ضيف نحات جديد اسمه حسام بيومية 450 وسهرة 220" / "ضيف عامل جديد اسمه محمود بيومية 350")
  if (
    (norm.includes('ضيف عامل') ||
      norm.includes('ضيف نحات') ||
      norm.includes('ضيف نجار') ||
      norm.includes('ضيف حداد') ||
      norm.includes('ضيف نقاش') ||
      norm.includes('سجل عامل جديد') ||
      norm.includes('عامل جديد اسمه') ||
      norm.includes('نحات جديد اسمه')) &&
    norm.includes('اسمه')
  ) {
    const role = norm.includes('نحات')
      ? 'نحات'
      : norm.includes('نجار')
        ? 'نجار'
        : norm.includes('حداد')
          ? 'حداد'
          : norm.includes('نقاش')
            ? 'نقاش'
            : 'عامل';
    const nameMatch = input.match(/اسم[هة]\s+([^\d]+?)(?:\s+بيومي[ةه]|\s+يومي[ةه]|\s+بسعر|$)/);
    const workerName = nameMatch ? nameMatch[1].trim() : 'عامل جديد';
    const dayRateMatch = norm.match(/(?:بيوميه|يوميه)\s*(\d+)/);
    const nightRateMatch = norm.match(/(?:وسهره|سهره)\s*(\d+)/);
    const workerDayRate = dayRateMatch
      ? Number(dayRateMatch[1])
      : ctx.settings.defaultWorkerDayRate || 400;
    const workerNightRate = nightRateMatch
      ? Number(nightRateMatch[1])
      : ctx.settings.defaultWorkerNightRate || Math.round(workerDayRate / 2);

    return {
      reply: `هسجل ${role} جديد باسم "${workerName}" بيومية ${formatCurrency(workerDayRate, numMode)} وسهرة ${formatCurrency(workerNightRate, numMode)}. تمام؟`,
      requiresConfirmation: true,
      pendingAction: {
        type: 'add_worker',
        name: workerName,
        role,
        workerDayRate,
        workerNightRate,
      },
      actionRoute: '/workers',
      actionLabel: 'تحويل لصفحة العمال والنحاتية',
    };
  }

  // 1C. Write Intent: Add New Project ("ضيف مشروع جديد اسمه برج النيل بيومية شركة 600 وسهرة 300")
  if (
    (norm.includes('ضيف مشروع') || norm.includes('مشروع جديد')) &&
    norm.includes('اسمه')
  ) {
    const nameMatch = input.match(/اسم[هة]\s+([^\d]+?)(?:\s+بيومي[ةه]|\s+يومي[ةه]|\s+بسعر|$)/);
    const projName = nameMatch ? nameMatch[1].trim() : 'مشروع جديد';
    const dayRateMatch = norm.match(/(?:بيوميه|يوميه)(?:\s+شركه)?\s*(\d+)/);
    const nightRateMatch = norm.match(/(?:وسهره|سهره)\s*(\d+)/);
    const companyDayRate = dayRateMatch
      ? Number(dayRateMatch[1])
      : ctx.settings.defaultCompanyDayRate || 550;
    const companyNightRate = nightRateMatch
      ? Number(nightRateMatch[1])
      : ctx.settings.defaultCompanyNightRate || Math.round(companyDayRate / 2);

    return {
      reply: `هسجل مشروع جديد باسم "${projName}" بيومية شركة ${formatCurrency(companyDayRate, numMode)} وسهرة ${formatCurrency(companyNightRate, numMode)}. تمام؟`,
      requiresConfirmation: true,
      pendingAction: {
        type: 'add_project',
        name: projName,
        companyDayRate,
        companyNightRate,
      },
      actionRoute: '/settings',
      actionLabel: 'تحويل لإعدادات المشاريع',
    };
  }

  // 1D. Query or Write: Mandatory Daily Headcount ("العدد النهارده 10 يومية و 4 سهرة" / "هل العدد النهارده مطابق ولا لا؟")
  if (
    norm.includes('العدد النهارده') ||
    norm.includes('العدد اليومي') ||
    norm.includes('سجل العدد') ||
    norm.includes('نفس العدد') ||
    norm.includes('العدد مطابق') ||
    (norm.includes('العدد') && (norm.includes('مطابق') || norm.includes('سهره') || norm.includes('عماله') || norm.includes('نحاتيه')))
  ) {
    const date = resolveRelativeDate(input, ctx.todayIso);
    const headcounts = ctx.dailyHeadcounts || [];

    // Check if it's a query asking if the count matches ("هل العدد مطابق؟" / "هل نفس العدد؟" / "العدد كام؟")
    if (
      norm.includes('هل') ||
      norm.includes('مطابق') ||
      norm.includes('نفس العدد') ||
      norm.includes('كام')
    ) {
      const todayHc = headcounts.find((h) => h.date === date);
      const dayAtt = ctx.attendances.filter((a) => a.date === date);
      const actualDays = dayAtt.reduce((s, a) => s + (a.dayWorked ? 1 : 0), 0);
      const actualNights = dayAtt.reduce((s, a) => s + (a.nightWorked ? 1 : 0), 0);

      if (!todayHc) {
        return {
          reply: `لسه متسجلش في دفتر العدد اليومي الإجباري ليوم ${formatArabicDateShort(date)}! المسجل بالأسماء حالياً: ${formatNumber(actualDays, numMode)} يومية و ${formatNumber(actualNights, numMode)} سهرة. تقدر تقولي مثلاً: "العدد النهارده 10 يومية و 4 سهرة".`,
          actionRoute: '/attendance',
          actionLabel: 'تحويل لتسجيل العدد اليومي الإجباري',
        };
      }

      const sameDays = actualDays === todayHc.expectedDayCount;
      const sameNights = actualNights === todayHc.expectedNightCount;
      if (sameDays && sameNights) {
        return {
          reply: `✅ نعم، نفس العدد تماماً ليوم ${formatArabicDateShort(date)}! العدد الإجباري المسجل (${formatNumber(todayHc.expectedDayCount, numMode)} يومية و ${formatNumber(todayHc.expectedNightCount, numMode)} سهرة) مطابق ١٠٠٪ للمسجل بالأسماء.`,
          actionRoute: '/attendance',
          actionLabel: 'تحويل لشبكة الحضور والعدد',
        };
      }

      const dayDiff = actualDays - todayHc.expectedDayCount;
      const nightDiff = actualNights - todayHc.expectedNightCount;
      return {
        reply: `⚠️ لا، العدد غير مطابق ليوم ${formatArabicDateShort(date)}! العدد الإجباري: (${formatNumber(todayHc.expectedDayCount, numMode)} يومية و ${formatNumber(todayHc.expectedNightCount, numMode)} سهرة)، بينما المسجل بالأسماء: (${formatNumber(actualDays, numMode)} يومية و ${formatNumber(actualNights, numMode)} سهرة). الفرق: ${dayDiff === 0 ? 'اليوميات مطابقة' : dayDiff < 0 ? `ناقص ${formatNumber(Math.abs(dayDiff), numMode)} يومية` : `زيادة ${formatNumber(dayDiff, numMode)} يومية`} · ${nightDiff === 0 ? 'السهرات مطابقة' : nightDiff < 0 ? `ناقص ${formatNumber(Math.abs(nightDiff), numMode)} سهرة` : `زيادة ${formatNumber(nightDiff, numMode)} سهرة`}.`,
        actionRoute: '/bulk',
        actionLabel: 'تحويل للإضافة الجماعية لضبط العدد',
      };
    }

    // Otherwise it's a write command to record the mandatory daily headcount: e.g. "العدد النهارده 10 يومية و 4 سهرة"
    const dayMatch = norm.match(/(\d+)\s*(?:يوميه|يوميات|عمال|عماله|فرد)/);
    const sculptMatch = norm.match(/(\d+)\s*(?:نحات|نحاتيه|نحاتين)/);
    const nightMatch = norm.match(/(\d+)\s*(?:سهره|سهرات)/);

    const sculptorsCount = sculptMatch ? Number(sculptMatch[1]) : 0;
    const workersCount = dayMatch ? Number(dayMatch[1]) : 0;
    const expectedDayCount =
      sculptorsCount > 0 && workersCount > 0 && norm.includes('منهم')
        ? workersCount
        : workersCount + sculptorsCount || parseSpokenArabicNumber(input) || 0;
    const expectedNightCount = nightMatch ? Number(nightMatch[1]) : 0;

    if (expectedDayCount > 0 || expectedNightCount > 0) {
      return {
        reply: `هسجل العدد اليومي الإجباري ليوم ${formatArabicDateShort(date)}: إجمالي العمالة والنحاتية = ${formatNumber(expectedDayCount, numMode)} يومية، وعدد السهرة = ${formatNumber(expectedNightCount, numMode)} سهرة. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_headcount',
          date,
          projectId: defaultProject?.id ?? null,
          expectedDayCount,
          sculptorsCount,
          workersCount: Math.max(0, expectedDayCount - sculptorsCount),
          expectedNightCount,
        },
        actionRoute: '/attendance',
        actionLabel: 'تحويل لشبكة الحضور والعدد',
      };
    }
  }

  // 1E. Query: Payday 15th Settlement Calculation ("احسب قبض يوم 15 لكل العمال" / "قبض يوم 15")
  if (
    norm.includes('قبض يوم 15') ||
    norm.includes('قبض 15') ||
    norm.includes('قبض الناس') ||
    (norm.includes('قبض') && norm.includes('15'))
  ) {
    const activeWorkers = ctx.workers.filter((w) => w.active);
    if (activeWorkers.length === 0) {
      return {
        reply: 'لسه مسجلتش عمال أو نحاتية في النظام عشان أحسبلك كشف قبض يوم ١٥. اضغط على زر التحويل لإضافة العمال أولاً.',
        actionRoute: '/workers',
        actionLabel: 'تحويل لإضافة العمال',
      };
    }

    const deductions = ctx.deductions || [];
    let totalGross = 0;
    let totalAdv = 0;
    let totalDed = 0;
    let totalNet = 0;

    const workerSummaries: string[] = [];
    for (const w of activeWorkers) {
      const wAtt = ctx.attendances.filter((a) => a.workerId === w.id);
      const gross = wAtt.reduce(
        (s, a) =>
          s +
          (a.dayWorked ? a.workerDayRateSnapshot || w.workerDayRate : 0) +
          (a.nightWorked ? a.workerNightRateSnapshot || w.workerNightRate : 0),
        0
      );
      const adv = ctx.advances
        .filter((a) => a.workerId === w.id && a.settlementId === null)
        .reduce((s, a) => s + a.amount, 0);
      const ded = deductions
        .filter((d) => d.workerId === w.id && d.settlementId === null)
        .reduce((s, d) => s + d.amount, 0);
      const net = gross - adv - ded;

      totalGross += gross;
      totalAdv += adv;
      totalDed += ded;
      totalNet += net;

      if (gross > 0 || adv > 0 || ded > 0) {
        workerSummaries.push(`${w.name}: صافي ${formatCurrency(net, numMode)}`);
      }
    }

    const detailsText =
      workerSummaries.length > 0
        ? ` (${workerSummaries.slice(0, 5).join(' · ')})`
        : '';

    return {
      reply: `ملخص كشف قبض يوم ١٥ لجميع العمال: إجمالي الأجور ${formatCurrency(totalGross, numMode)} − السلف ${formatCurrency(totalAdv, numMode)} − الخصومات ${formatCurrency(totalDed, numMode)} = الصافي المستحق للصرف ${formatCurrency(totalNet, numMode)}${detailsText}.`,
      actionRoute: '/settlements',
      actionLabel: 'تحويل لكشف قبض يوم 15 والتسويات',
    };
  }

  // 1F. Write or Query: Worker Deductions ("اخصم نص يوم من كريم بسبب تأخير" / "كام خصومات كريم؟")
  if (
    norm.includes('اخصم') ||
    norm.includes('خصم') ||
    norm.includes('خصومات') ||
    norm.includes('جزاء')
  ) {
    const deductions = ctx.deductions || [];
    const wm = matchWorkersFromText(input, ctx.workers);

    // Query deductions
    if (norm.includes('كام') || norm.includes('كم') || norm.includes('مين عليه خصومات')) {
      if (wm.matched.length > 0) {
        const w = wm.matched[0];
        const wDeds = deductions.filter((d) => d.workerId === w.id && d.settlementId === null);
        const sumAmt = wDeds.reduce((s, d) => s + d.amount, 0);
        const sumDays = wDeds.reduce((s, d) => s + (d.daysDeducted || 0), 0);
        if (wDeds.length === 0) {
          return {
            reply: `${w.name} معليهوش أي خصومات أو جزاءات مفتوحة حالياً.`,
            actionRoute: '/deductions',
            actionLabel: 'تحويل لصفحة الخصومات',
          };
        }
        return {
          reply: `إجمالي خصومات ${w.name} المفتوحة: ${formatCurrency(sumAmt, numMode)} (${formatNumber(sumDays, numMode, 2)} يوم) في ${formatNumber(wDeds.length, numMode)} جزاءات.`,
          actionRoute: '/deductions',
          actionLabel: 'تحويل لصفحة الخصومات',
        };
      }
      const allOpen = deductions.filter((d) => d.settlementId === null);
      const totalOpen = allOpen.reduce((s, d) => s + d.amount, 0);
      return {
        reply: `إجمالي الخصومات والجزاءات المفتوحة على كل العمال: ${formatCurrency(totalOpen, numMode)} في ${formatNumber(allOpen.length, numMode)} حركات.`,
        actionRoute: '/deductions',
        actionLabel: 'تحويل لصفحة الخصومات',
      };
    }

    // Write deduction
    if (wm.matched.length > 0) {
      const worker = wm.matched[0];
      const date = resolveRelativeDate(input, ctx.todayIso);
      let mode: DeductionMode = 'day';
      let daysDeducted = 1;
      let amount = worker.workerDayRate;

      if (norm.includes('نص يوم') || norm.includes('نصف يوم') || norm.includes('نص يوميه')) {
        mode = 'half_day';
        daysDeducted = 0.5;
        amount = Math.round(worker.workerDayRate * 0.5);
      } else if (norm.includes('ربع يوم')) {
        mode = 'quarter_day';
        daysDeducted = 0.25;
        amount = Math.round(worker.workerDayRate * 0.25);
      } else if (norm.includes('يوم كامل') || norm.includes('يوم من') || norm.includes('يوميه من')) {
        mode = 'day';
        daysDeducted = 1;
        amount = worker.workerDayRate;
      } else {
        const parsedMoney = parseSpokenArabicNumber(input);
        if (parsedMoney && parsedMoney > 2) {
          mode = 'money';
          daysDeducted = 0;
          amount = parsedMoney;
        }
      }

      const reasonMatch = input.match(/بسبب\s+(.+)$/);
      const reason = reasonMatch ? reasonMatch[1].trim() : 'خصم إداري عبر زكي';
      const modeDesc =
        mode === 'day'
          ? 'يوم كامل'
          : mode === 'half_day'
            ? 'نص يوم'
            : mode === 'quarter_day'
              ? 'ربع يوم'
              : 'مبلغ مالي';

      return {
        reply: `هسجل خصم (${modeDesc} = ${formatCurrency(amount, numMode)}) على العامل ${worker.name} بسبب "${reason}" بتاريخ ${formatArabicDateShort(date)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_deduction',
          workerId: worker.id!,
          workerName: worker.name,
          mode,
          daysDeducted,
          amount,
          date,
          reason,
        },
        actionRoute: '/deductions',
        actionLabel: 'تحويل لصفحة الخصومات والجزاءات',
      };
    }
  }

  // 2. Query: Who reached monthly cap / Who is below expected days ("مين وصل الحد؟" / "مين ناقص؟")
  if (
    norm.includes('مين وصل الحد') ||
    norm.includes('وصلوا الحد') ||
    norm.includes('مين ناقص') ||
    norm.includes('اقل من المتوقع')
  ) {
    const currentMonth = ctx.todayIso.slice(0, 7);
    const monthAtt = ctx.attendances.filter((a) =>
      a.date.startsWith(currentMonth)
    );
    const { belowExpected, reachedCap } = getLowAttendanceWorkers(
      ctx.workers,
      monthAtt,
      ctx.settings.expectedMonthlyDays || 26,
      ctx.settings.monthlyDayCap || 30
    );

    const parts: string[] = [];
    if (norm.includes('وصل الحد') || norm.includes('وصلوا الحد')) {
      if (reachedCap.length === 0) {
        parts.push(
          `مفيش حد وصل الحد الشهري (${formatNumber(ctx.settings.monthlyDayCap, numMode)} يومية) لحد دلوقتي.`
        );
      } else {
        const list = reachedCap
          .map((x) => `${x.worker.name} (${formatNumber(x.days, numMode)} يوم)`)
          .join('، ');
        parts.push(`اللي وصلوا الحد الشهري: ${list}.`);
      }
    }

    if (norm.includes('مين ناقص') || norm.includes('اقل من المتوقع')) {
      if (belowExpected.length === 0) {
        parts.push('كل العمال مكملين الأيام المتوقعة الشهر ده تمام.');
      } else {
        const list = belowExpected
          .map(
            (x) =>
              `${x.worker.name} (${formatNumber(x.days, numMode)} يوم - ناقص ${formatNumber(x.shortage, numMode)})`
          )
          .join('، ');
        parts.push(
          `العمال اللي أيامهم أقل من ${formatNumber(ctx.settings.expectedMonthlyDays, numMode)} يوم: ${list}.`
        );
      }
    }

    return {
      reply: parts.join(' '),
      actionRoute: '/attendance',
      actionLabel: 'تحويل لشبكة الحضور',
    };
  }

  // 3. Query: Pending Checks ("كام الشيكات المعلقة؟")
  if (norm.includes('الشيكات المعلقه') || norm.includes('شيكات معلقه')) {
    const pending = ctx.checks.filter((c) => c.status === 'معلق');
    const incoming = pending.filter((c) => c.direction === 'وارد');
    const outgoing = pending.filter((c) => c.direction === 'صادر');
    const inSum = incoming.reduce((s, c) => s + c.amount, 0);
    const outSum = outgoing.reduce((s, c) => s + c.amount, 0);

    return {
      reply: `عندك ${formatNumber(pending.length, numMode)} شيكات معلقة: وارد ${formatNumber(incoming.length, numMode)} بإجمالي ${formatCurrency(inSum, numMode)}، وصادر ${formatNumber(outgoing.length, numMode)} بإجمالي ${formatCurrency(outSum, numMode)}.`,
      actionRoute: '/checks',
      actionLabel: 'تحويل لصفحة الشيكات',
    };
  }

  // 4. Query: Total Nash for all workers this month ("احسب إجمالي الناش لجميع الموظفين في هذا الشهر")
  if (
    (norm.includes('اجمالي الناش') || norm.includes('حساب الناش')) &&
    (norm.includes('الشهر') || norm.includes('موظفين') || norm.includes('عمال'))
  ) {
    const currentMonth = ctx.todayIso.slice(0, 7);
    const monthExtraIds = new Set(
      ctx.extras
        .filter((e) => e.date.startsWith(currentMonth) && e.id !== undefined)
        .map((e) => e.id!)
    );
    const monthNash = ctx.extraCashes.filter((ec) =>
      monthExtraIds.has(ec.extraId)
    );
    const totalPaid = monthNash.reduce((s, ec) => s + (ec.paidCash || 0), 0);
    const totalAssigned = monthNash.reduce((s, ec) => s + (ec.amount || 0), 0);

    return {
      reply: `إجمالي الناش الشهر ده لجميع العمال: المستحق ${formatCurrency(totalAssigned, numMode)}، والمدفوع نقداً فعلياً ${formatCurrency(totalPaid, numMode)} (في ${formatNumber(monthNash.length, numMode)} حركات).`,
      actionRoute: '/extras',
      actionLabel: 'تحويل لصفحة الإضافي والناش',
    };
  }

  // 5. Query: Who got paid Nash this week ("مين اتدفعله ناش في إضافي الأسبوع ده؟")
  if (norm.includes('اتدفعله ناش') || (norm.includes('ناش') && norm.includes('الاسبوع'))) {
    const todayDate = new Date(ctx.todayIso + 'T12:00:00Z');
    todayDate.setUTCDate(todayDate.getUTCDate() - 7);
    const weekAgoIso = todayDate.toISOString().slice(0, 10);

    const weekExtraIds = new Set(
      ctx.extras
        .filter((e) => e.date >= weekAgoIso && e.date <= ctx.todayIso && e.id !== undefined)
        .map((e) => e.id!)
    );
    const paidNash = ctx.extraCashes.filter(
      (ec) => weekExtraIds.has(ec.extraId) && (ec.paidCash || 0) > 0
    );

    if (paidNash.length === 0) {
      return {
        reply: 'مفيش حد اتدفعله ناش نقداً في إضافي الأسبوع ده.',
        actionRoute: '/extras',
        actionLabel: 'تحويل للإضافي والناش',
      };
    }

    const summaryByWorker = new Map<number, number>();
    for (const ec of paidNash) {
      summaryByWorker.set(
        ec.workerId,
        (summaryByWorker.get(ec.workerId) || 0) + ec.paidCash
      );
    }

    const details = Array.from(summaryByWorker.entries())
      .map(([wId, amt]) => {
        const wName = ctx.workers.find((w) => w.id === wId)?.name || `عامل #${wId}`;
        return `${wName} (${formatCurrency(amt, numMode)})`;
      })
      .join('، ');

    return {
      reply: `اللي اتدفعلهم ناش الأسبوع ده: ${details}.`,
      actionRoute: '/extras',
      actionLabel: 'تحويل للإضافي والناش',
    };
  }

  // 6. Query: Extras authorized by an Engineer ("كام الإضافي اللي أمر بيه المهندس أحمد الشهر ده؟")
  if (
    norm.includes('الاضافي') &&
    (norm.includes('امر بيه') || norm.includes('المهندس') || norm.includes('المشرف')) &&
    (norm.includes('كام') || norm.includes('احسب'))
  ) {
    const currentMonth = ctx.todayIso.slice(0, 7);
    const engMatch = norm.match(/(?:المهندس|المشرف)\s+([^\s]+)/);
    const engToken = engMatch ? engMatch[1] : '';

    const matchingExtras = ctx.extras.filter((e) => {
      const inMonth = norm.includes('الشهر') ? e.date.startsWith(currentMonth) : true;
      const matchesAuth = engToken
        ? normalizeArabic(e.authorizedBy).includes(engToken)
        : true;
      return inMonth && matchesAuth;
    });

    const totalAmt = matchingExtras.reduce((s, e) => s + (e.amount || 0), 0);
    const totalDays = matchingExtras.reduce((s, e) => s + (e.days || 0), 0);

    return {
      reply: `الإضافي اللي أمر بيه ${engToken ? 'المهندس ' + engToken : 'المهندس'} الشهر ده: ${formatNumber(matchingExtras.length, numMode)} بنود بإجمالي ${formatCurrency(totalAmt, numMode)} و ${formatNumber(totalDays, numMode)} يوميات إضافية.`,
      actionRoute: '/extras',
      actionLabel: 'تحويل للإضافي والناش',
    };
  }

  // 7. Query: Extract worker claim & collected ("المستخلص الأول كام طلبه كريم وكام اتحصل؟")
  if (
    norm.includes('المستخلص') &&
    (norm.includes('طلبه') || norm.includes('اتحصل'))
  ) {
    const extractNum = norm.includes('التاني') || norm.includes('الثاني') || norm.includes('2') ? 2 : 1;
    const targetExtract =
      ctx.extracts.find((ex) => ex.number === extractNum) || ctx.extracts[0];
    const workerMatch = matchWorkersFromText(input, ctx.workers);
    const worker = workerMatch.matched[0];

    if (targetExtract && worker) {
      const line = ctx.extractLines.find(
        (l) => l.extractId === targetExtract.id && l.workerId === worker.id
      );
      if (line) {
        const net = line.claimed - line.taxAmount;
        const rem = net - line.collected;
        return {
          reply: `في المستخلص رقم ${formatNumber(targetExtract.number, numMode)} للعامل ${worker.name}: المحسوب ${formatCurrency(line.calculated, numMode)}، المطالب ${formatCurrency(line.claimed, numMode)}، الصافي بعد الضريبة ${formatCurrency(net, numMode)}، اللي اتحصل ${formatCurrency(line.collected, numMode)}، والمتبقي ${formatCurrency(rem, numMode)}.`,
          actionRoute: '/extracts',
          actionLabel: 'تحويل لصفحة المستخلصات',
        };
      }
      return {
        reply: `ملقتش سطر للعامل ${worker.name} في المستخلص رقم ${formatNumber(targetExtract.number, numMode)}.`,
        actionRoute: '/extracts',
        actionLabel: 'تحويل لصفحة المستخلصات',
      };
    }
  }

  // 8. Query: Extract taxes or remaining ("كام الضرائب على مستخلص الكوبري؟" / "كام المتبقي على مستخلص الكوبري؟")
  if (
    norm.includes('مستخلص') &&
    (norm.includes('الضرايب') || norm.includes('الضرائب') || norm.includes('المتبقي') || norm.includes('باقي'))
  ) {
    const matchedProject =
      ctx.projects.find((p) => {
        const pWords = normalizeArabic(p.name).split(' ');
        return pWords.some((w) => w.length >= 3 && norm.includes(w));
      }) || defaultProject;

    const projectExtracts = ctx.extracts.filter(
      (ex) => !matchedProject || ex.projectId === matchedProject.id
    );
    const extractIds = new Set(projectExtracts.map((ex) => ex.id!));
    const lines = ctx.extractLines.filter((l) => extractIds.has(l.extractId));
    const totals = calculateExtractTotals(lines);

    if (norm.includes('الضرايب') || norm.includes('الضرائب')) {
      return {
        reply: `إجمالي الضرائب المخصومة على مستخلص ${matchedProject?.name || 'المشروع'}: ${formatCurrency(totals.taxAmount, numMode)} من إجمالي مطالبات ${formatCurrency(totals.claimed, numMode)}.`,
        actionRoute: '/extracts',
        actionLabel: 'تحويل لصفحة المستخلصات',
      };
    }

    return {
      reply: `المتبقي على مستخلص ${matchedProject?.name || 'المشروع'}: ${formatCurrency(totals.remaining, numMode)} (الصافي المستحق ${formatCurrency(totals.netDue, numMode)}، والمحصّل ${formatCurrency(totals.collected, numMode)}).`,
      actionRoute: '/extracts',
      actionLabel: 'تحويل لصفحة المستخلصات',
    };
  }

  // 9. Query: Worker advances & dates ("كام سلفة كريم والتاريخ بتاعه؟")
  if (
    (norm.includes('سلفه') || norm.includes('سلف')) &&
    (norm.includes('كام') || norm.includes('تاريخ') || norm.includes('بتاعه'))
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.ambiguous.length > 1) {
      return {
        reply: 'قصدك أنهي واحد فيهم؟ اختار الاسم:',
        disambiguationOptions: wm.ambiguous.map((w) => ({
          label: w.name,
          command: `كام سلفة ${w.name} والتاريخ بتاعه؟`,
        })),
      };
    }
    const worker = wm.matched[0];
    if (worker) {
      const workerAdvances = ctx.advances.filter(
        (a) => a.workerId === worker.id && a.settlementId === null
      );
      if (workerAdvances.length === 0) {
        return {
          reply: `${worker.name} معليهوش أي سلف متبقية حالياً.`,
          actionRoute: '/advances',
          actionLabel: 'تحويل لصفحة السلف',
        };
      }
      const totalAdv = workerAdvances.reduce((s, a) => s + a.amount, 0);
      const datesList = workerAdvances
        .map((a) => `${formatCurrency(a.amount, numMode)} يوم ${formatArabicDateShort(a.date)}`)
        .join('، ');
      return {
        reply: `إجمالي سلف ${worker.name} المتبقية: ${formatCurrency(totalAdv, numMode)} (${datesList}).`,
        actionRoute: '/advances',
        actionLabel: 'تحويل لصفحة السلف',
      };
    }
  }

  // 10. Query: Worker monthly days count ("عدد يوميات محمد الشهر ده كام؟")
  if (
    (norm.includes('عدد يوميات') || norm.includes('كم يوميه') || norm.includes('كام يوميه')) ||
    (norm.includes('يوميات') && norm.includes('كام'))
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.ambiguous.length > 1) {
      return {
        reply: 'قصدك أنهي عامل؟ اختار الاسم:',
        disambiguationOptions: wm.ambiguous.map((w) => ({
          label: w.name,
          command: `عدد يوميات ${w.name} الشهر ده كام؟`,
        })),
      };
    }
    const worker = wm.matched[0];
    if (worker) {
      const currentMonth = ctx.todayIso.slice(0, 7);
      const att = ctx.attendances.filter(
        (a) => a.workerId === worker.id && a.date.startsWith(currentMonth)
      );
      const days = att.reduce((s, a) => s + (a.dayWorked ? 1 : 0), 0);
      const nights = att.reduce((s, a) => s + (a.nightWorked ? 1 : 0), 0);
      return {
        reply: `${worker.name} مسجل ليه الشهر ده ${formatNumber(days, numMode)} يومية و ${formatNumber(nights, numMode)} سهرة.`,
        actionRoute: '/attendance',
        actionLabel: 'تحويل لشبكة الحضور',
      };
    }
  }

  // 11. Write Intent: Add Note to Worker ("ضيف ملاحظة لعلي: مستني تحويل")
  if (norm.includes('ملاحظه')) {
    const wm = matchWorkersFromText(input, ctx.workers);
    const colonParts = input.split(/[:：]/);
    const noteText =
      colonParts.length > 1
        ? colonParts.slice(1).join(':').trim()
        : input.replace(/^.*ملاحظ[ةه]\s*(?:لـ?|لعامل)?\s*\S+\s*/i, '').trim();

    if (wm.matched.length > 0 && noteText) {
      const w = wm.matched[0];
      return {
        reply: `هسجل ملاحظة للعامل ${w.name}: "${noteText}". تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'add_worker_note',
          workerId: w.id!,
          workerName: w.name,
          note: noteText,
        },
        actionRoute: '/workers',
        actionLabel: 'تحويل لملف العامل',
      };
    }
  }

  // 12. Write Intent: Record Extra ("سجل إضافي نص يوم لحسن وعلي بأمر المهندس أحمد")
  if (norm.includes('اضافي')) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.ambiguous.length > 1) {
      return {
        reply: 'فيه أكتر من عامل بالاسم ده، تقصد مين؟',
        disambiguationOptions: wm.ambiguous.map((w) => ({
          label: w.name,
          command: `سجل إضافي نص يوم ل${w.name}`,
        })),
      };
    }
    if (wm.suggestion && wm.matched.length === 0) {
      return {
        reply: `ملقتش عامل باسم "${wm.missingName}"، هل تقصد "${wm.suggestion.name}"؟`,
        disambiguationOptions: [
          {
            label: `نعم، ${wm.suggestion.name}`,
            command: `سجل إضافي نص يوم ل${wm.suggestion.name}`,
          },
        ],
      };
    }

    if (wm.matched.length > 0) {
      const projId = defaultProject?.id ?? 1;
      const date = resolveRelativeDate(input, ctx.todayIso);
      let extraType: ExtraType = 'يوم إضافي';
      let days = 1;
      if (norm.includes('نص')) {
        extraType = 'نص إضافي';
        days = 0.5;
      } else if (norm.includes('10 ايام') || norm.includes('عشر ايام')) {
        extraType = '10 أيام';
        days = 10;
      }

      const authMatch = input.match(/ب[أا]مر\s+((?:المهندس|المشرف)?\s*[^\s]+)/);
      const authorizedBy = authMatch
        ? authMatch[1].trim()
        : ctx.settings.engineers[0] || 'المهندس أحمد';

      const names = wm.matched.map((w) => w.name).join(' و');
      return {
        reply: `هسجل بند إضافي (${extraType}) لـ ${names} بأمر ${authorizedBy} بتاريخ ${formatArabicDateShort(date)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_extra',
          workerIds: wm.matched.map((w) => w.id!),
          workerNames: wm.matched.map((w) => w.name),
          projectId: projId,
          date,
          extraType,
          days,
          authorizedBy,
        },
        actionRoute: '/extras',
        actionLabel: 'تحويل لصفحة الإضافي والناش',
      };
    }
  }

  // 13. Write Intent: Record Advance ("كريم أخد سلفة 300 النهارده")
  if (norm.includes('سلفه') || norm.includes('اخد سلفه')) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.ambiguous.length > 1) {
      const amt = parseSpokenArabicNumber(input) || 200;
      return {
        reply: 'قصدك أنهي عامل فيهم؟ اختار الاسم:',
        disambiguationOptions: wm.ambiguous.map((w) => ({
          label: w.name,
          command: `${w.name} أخد سلفة ${amt} النهارده`,
        })),
      };
    }
    if (wm.suggestion && wm.matched.length === 0) {
      const amt = parseSpokenArabicNumber(input) || 200;
      return {
        reply: `ملقتش "${wm.missingName}"، تقصد "${wm.suggestion.name}"؟`,
        disambiguationOptions: [
          {
            label: `نعم، ${wm.suggestion.name}`,
            command: `${wm.suggestion.name} أخد سلفة ${amt} النهارده`,
          },
        ],
      };
    }

    if (wm.matched.length > 0) {
      const worker = wm.matched[0];
      const amount = parseSpokenArabicNumber(input);
      if (!amount || amount <= 0) {
        return {
          reply: `بكام السلفة اللي أخدها ${worker.name}؟ اكتب المبلغ بس.`,
          awaitingAdvanceAmountForWorkerId: worker.id,
        };
      }
      const date = resolveRelativeDate(input, ctx.todayIso);
      return {
        reply: `هسجل سلفة ${formatCurrency(amount, numMode)} للعامل ${worker.name} بتاريخ ${formatArabicDateShort(date)}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_advance',
          workerId: worker.id!,
          workerName: worker.name,
          amount,
          date,
          reason: 'سلفة مسجلة عبر زكي',
        },
        actionRoute: '/advances',
        actionLabel: 'تحويل لصفحة السلف',
      };
    }
  }

  // 14. Write Intent: Record Attendance ("زكي سجل يومية لمحمد وعلي النهارده", "سجل سهرة لحسن امبارح", "سجل يومية وسهرة لكريم", "يومية لكل النقاشين النهارده")
  if (
    norm.includes('يوميه') ||
    norm.includes('يوميات') ||
    norm.includes('سهره') ||
    norm.includes('سهرات')
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.ambiguous.length > 1) {
      return {
        reply: 'الاسم ده متكرر لأكتر من عامل، تقصد مين فيهم؟',
        disambiguationOptions: wm.ambiguous.map((w) => ({
          label: `${w.name} (${w.role})`,
          command: `سجل يومية ل${w.name} النهارده`,
        })),
      };
    }
    if (wm.suggestion && wm.matched.length === 0) {
      return {
        reply: `ملقتش عامل بالاسم ده، هل تقصد "${wm.suggestion.name}"؟`,
        disambiguationOptions: [
          {
            label: `نعم، سجل لـ ${wm.suggestion.name}`,
            command: `سجل يومية ل${wm.suggestion.name} النهارده`,
          },
        ],
      };
    }

    if (wm.matched.length > 0) {
      const projId = defaultProject?.id ?? 1;
      const projName = defaultProject?.name ?? 'المشروع الرئيسي';
      const date = resolveRelativeDate(input, ctx.todayIso);
      const dayWorked: 0 | 1 =
        norm.includes('يوميه') || norm.includes('يوميات') ? 1 : 0;
      const nightWorked: 0 | 1 =
        norm.includes('سهره') || norm.includes('سهرات') ? 1 : 0;

      const labelParts: string[] = [];
      if (dayWorked) labelParts.push('يومية');
      if (nightWorked) labelParts.push('سهرة');
      const workDesc = labelParts.join(' و');
      const names = wm.matched.map((w) => w.name).join(' و');

      return {
        reply: `هسجل ${workDesc} لـ ${names} بتاريخ ${formatArabicDateShort(date)} في ${projName}. تمام؟`,
        requiresConfirmation: true,
        pendingAction: {
          type: 'record_attendance',
          workerIds: wm.matched.map((w) => w.id!),
          workerNames: wm.matched.map((w) => w.name),
          projectId: projId,
          date,
          dayWorked: dayWorked || 1,
          nightWorked,
        },
        actionRoute: '/attendance',
        actionLabel: 'تحويل لشبكة الحضور',
      };
    }
  }

  // 15. Smart Contractor Methodology & Golden Rules ("اشرح مناهج وقواعد إدارة المقاولات الذكية", "نصيحة مالية")
  if (
    norm.includes('مناهج') ||
    norm.includes('منهجيه') ||
    norm.includes('قواعد المقاولات') ||
    norm.includes('نصيحه ماليه') ||
    norm.includes('القاعده الذهبيه') ||
    (norm.includes('قواعد') && norm.includes('اداره'))
  ) {
    const ledger = calculateComprehensiveLedger({
      projects: ctx.projects,
      workers: ctx.workers,
      attendances: ctx.attendances,
      advances: ctx.advances,
      deductions: ctx.deductions || [],
      settlements: ctx.settlements || [],
      extracts: ctx.extracts || [],
      extractLines: ctx.extractLines || [],
      extras: ctx.extras || [],
      extraCashes: ctx.extraCashes,
      checks: ctx.checks,
      expenses: ctx.expenses || [],
      incomingPayments: ctx.incomingPayments || [],
      selectedProjectId: null,
    });
    const avgWorkerDay =
      ctx.workers.length > 0
        ? Math.round(
            ctx.workers.reduce((s, w) => s + w.workerDayRate, 0) / ctx.workers.length
          )
        : 0;
    const avgCompDay =
      ctx.projects.length > 0
        ? Math.round(
            ctx.projects.reduce((s, p) => s + p.companyDayRate, 0) / ctx.projects.length
          )
        : 0;
    const spreadPerDay = avgCompDay - avgWorkerDay;
    const totalDeductionsApplied = (ctx.deductions || []).reduce(
      (s, d) => s + d.amount,
      0
    );

    return {
      reply: [
        `📐 **مناهج وقواعد إدارة المقاولات الذكية في موقعك:**`,
        `١. **قاعدة مطابقة العدد اليومي الإجباري:** لا تُصرف يومية أو سهرة إلا بعد مطابقة دفتر العدد الإجباري مع الأسماء المسجلة.`,
        `٢. **قاعدة فارق اليومية والسهرة (Spread):** متوسط يومية الشركة (${formatCurrency(avgCompDay, numMode)}) مقابل متوسط يومية العامل (${formatCurrency(avgWorkerDay, numMode)}) يوفّر لك هامش ربح يومي متوسطه (${formatCurrency(spreadPerDay, numMode)}) عن كل عامل.`,
        `٣. **قاعدة دورة قبض يوم ١٥ وسقف السلف:** إجمالي السلف المنصرفة حالياً (${formatCurrency(ledger.totalAdvancesPaid, numMode)}) والخصومات المطبقة وفّرت (${formatCurrency(totalDeductionsApplied, numMode)}).`,
        `٤. **قاعدة التوازن النقدي (الخزنة مقابل الشيكات):** السيولة النقدية الفعلية بالخزنة (${formatCurrency(ledger.netCashInHand, numMode)})، ومستحقاتك الخارجية (${formatCurrency(ledger.totalOwedToMe, numMode)}).`,
        `٥. **قاعدة ربط كل دفعة بمشروعها:** أي مبلغ يصلك (شركة / شخص / شيك) يُربط بمشروعه لفرز المشروع الكسبان من الخسران بدقة ١٠٠٪.`,
        `٦. **صافي ربحك العام الحالي:** ${formatCurrency(ledger.totalNetProfit, numMode)}.`,
      ].join('\n'),
      actionRoute: '/my-ledger',
      actionLabel: 'فتح منهجية المقاولات وحسابي الشامل',
    };
  }

  // 16. Project Profitability Comparison ("قارن أرباح المشاريع وقولي انهي مشروع بيكسب اكتر")
  if (
    (norm.includes('قارن') && norm.includes('مشاريع')) ||
    (norm.includes('انهي مشروع') && (norm.includes('بيكسب') || norm.includes('اربح') || norm.includes('افضل'))) ||
    norm.includes('مقارنه المشاريع') ||
    norm.includes('ترتيب المشاريع')
  ) {
    const ledger = calculateComprehensiveLedger({
      projects: ctx.projects,
      workers: ctx.workers,
      attendances: ctx.attendances,
      advances: ctx.advances,
      deductions: ctx.deductions || [],
      settlements: ctx.settlements || [],
      extracts: ctx.extracts || [],
      extractLines: ctx.extractLines || [],
      extras: ctx.extras || [],
      extraCashes: ctx.extraCashes,
      checks: ctx.checks,
      expenses: ctx.expenses || [],
      incomingPayments: ctx.incomingPayments || [],
      selectedProjectId: null,
    });
    const sorted = [...ledger.projectBreakdowns].sort((a, b) => b.netProfit - a.netProfit);
    if (sorted.length === 0) {
      return {
        reply: 'لا توجد مشاريع مسجلة حالياً للمقارنة بينها.',
        actionRoute: '/settings',
        actionLabel: 'إضافة مشروع جديد',
      };
    }
    const lines = sorted.map(
      (p, idx) =>
        `${idx + 1}. **${p.projectName}**: صافي الربح ${formatCurrency(p.netProfit, numMode)} | وصلك: ${formatCurrency(p.totalReceivedForProject, numMode)} | اتصرف: ${formatCurrency(p.totalSpentInProject, numMode)} | ليك: ${formatCurrency(p.owedToMeInProject, numMode)}`
    );
    return {
      reply: `🏆 **مقارنة وترتيب أرباح المشاريع من الأعلى للأقل:**\n${lines.join('\n')}\n💡 المشروع الأعلى ربحاً هو **${sorted[0].projectName}** بصافي ربح **${formatCurrency(sorted[0].netProfit, numMode)}**.`,
      actionRoute: '/my-ledger',
      actionLabel: 'عرض بطاقات مقارنة المشاريع',
    };
  }

  // 17. Pending Checks & Financial Obligations ("الشيكات المعلقة والتزاماتي الشهر ده كام؟")
  if (
    norm.includes('الشيكات المعلقه') ||
    norm.includes('شيكات معلقه') ||
    norm.includes('التزاماتي') ||
    (norm.includes('شيكات') && (norm.includes('معادها') || norm.includes('الجايه')))
  ) {
    const pendingIn = ctx.checks.filter((c) => c.direction === 'وارد' && c.status === 'معلق');
    const pendingOut = ctx.checks.filter((c) => c.direction === 'صادر' && c.status === 'معلق');
    const sumIn = pendingIn.reduce((s, c) => s + c.amount, 0);
    const sumOut = pendingOut.reduce((s, c) => s + c.amount, 0);
    return {
      reply: [
        `🏦 **ملخص الشيكات المعلقة والتزاماتك المالية:**`,
        `• **شيكات واردة معلقة (فلوس ليك):** ${formatNumber(pendingIn.length, numMode)} شيك بإجمالي **${formatCurrency(sumIn, numMode)}**`,
        `• **شيكات صادرة معلقة (التزامات عليك):** ${formatNumber(pendingOut.length, numMode)} شيك بإجمالي **${formatCurrency(sumOut, numMode)}**`,
      ].join('\n'),
      actionRoute: '/checks',
      actionLabel: 'فتح دفتر الشيكات',
    };
  }

  // 18. Detailed Worker Statement ("كشف حساب تفصيلي لكريم محمود")
  if (
    norm.includes('كشف حساب') ||
    (norm.includes('تفاصيل حساب') && !norm.includes('مشروع'))
  ) {
    const wm = matchWorkersFromText(input, ctx.workers);
    if (wm.matched.length > 0) {
      const w = wm.matched[0];
      const wAtt = ctx.attendances.filter((a) => a.workerId === w.id);
      const days = wAtt.reduce((s, a) => s + a.dayWorked, 0);
      const nights = wAtt.reduce((s, a) => s + a.nightWorked, 0);
      const gross = wAtt.reduce(
        (s, a) =>
          s +
          a.dayWorked * (a.workerDayRateSnapshot || w.workerDayRate) +
          a.nightWorked * (a.workerNightRateSnapshot || w.workerNightRate),
        0
      );
      const adv = ctx.advances
        .filter((a) => a.workerId === w.id && a.settlementId === null)
        .reduce((s, a) => s + a.amount, 0);
      const ded = (ctx.deductions || [])
        .filter((d) => d.workerId === w.id && d.settlementId === null)
        .reduce((s, d) => s + d.amount, 0);
      const net = gross - adv - ded;
      return {
        reply: [
          `👷 **كشف حساب تفصيلي — ${w.name} (${w.role}):**`,
          `• سعر اليومية: ${formatCurrency(w.workerDayRate, numMode)} | سعر السهرة: ${formatCurrency(w.workerNightRate, numMode)}`,
          `• إجمالي الحضور: ${formatNumber(days, numMode)} يومية و ${formatNumber(nights, numMode)} سهرة`,
          `• إجمالي الأجر المستحق: ${formatCurrency(gross, numMode)}`,
          `• السلف المفتوحة: ${formatCurrency(adv, numMode)} | الخصومات المفتوحة: ${formatCurrency(ded, numMode)}`,
          `• **صافي المستحق للصرف الآن:** ${formatCurrency(net, numMode)}`,
        ].join('\n'),
        actionRoute: '/workers',
        actionLabel: 'فتح ملف العامل الكامل',
      };
    }
  }

  // 19. Bank Checks vs Pocket Cash Systematic Audit ("تدقيق الشيكات والبنك" / "سحبت 4000 وباقي كام")
  if (
    (norm.includes('شيك') && (norm.includes('بنك') || norm.includes('سحب') || norm.includes('جيب') || norm.includes('سلف') || norm.includes('باقي') || norm.includes('تدقيق'))) ||
    norm.includes('تدقيق الشيكات') ||
    norm.includes('فلوس البنك') ||
    norm.includes('فلوس الشيك') ||
    norm.includes('حساب البنك') ||
    norm.includes('سحبت من البنك')
  ) {
    const totalChecks = ctx.checks.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const withdrawnCash = ctx.checks.reduce((s, c) => {
      const w = c.withdrawnAmount !== undefined && c.withdrawnAmount !== null && c.withdrawnAmount > 0
        ? Number(c.withdrawnAmount)
        : (c.status === 'اتصرف' ? Number(c.amount) || 0 : 0);
      return s + w;
    }, 0);
    const remainingInBank = Math.max(0, totalChecks - withdrawnCash);
    const totalAdvances = ctx.advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const totalExpenses = (ctx.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const netPocketCash = Math.max(0, withdrawnCash - totalAdvances - totalExpenses);

    return {
      reply: [
        `🏦 **تدقيق الشيكات والبنك وكاش الجيب بنظام الحسابين المنفصلين:**`,
        `─────────────`,
        `🔹 **المستوى الأول: حساب الشركة والشيكات في البنك**`,
        `• إجمالي الشيكات المودعة: **${formatCurrency(totalChecks, numMode)}**`,
        `• المسحوب نقداً من البنك: **${formatCurrency(withdrawnCash, numMode)}**`,
        `• **المتبقي الصافي في حساب البنك:** **${formatCurrency(remainingInBank, numMode)}**`,
        `─────────────`,
        `🔸 **المستوى الثاني: فلوس العهدة وسلف العمال في جيبك**`,
        `• الكاش اللي سحبته واستلمته في يدك: **${formatCurrency(withdrawnCash, numMode)}**`,
        `• المنصرف سلف للعمال: **${formatCurrency(totalAdvances, numMode)}**`,
        `• المنصرف مصاريف ونثريات: **${formatCurrency(totalExpenses, numMode)}**`,
        `• **المتبقي الصافي في جيبك (العهدة الحالية):** **${formatCurrency(netPocketCash, numMode)}**`,
        `─────────────`,
        `💡 مفيش أي تداخل: فلوس الشيك في البنك محفوظة ومتبقي فيها ${formatCurrency(remainingInBank, numMode)}، وفلوس السلف في جيبك محسوبة ومتبقي فيها ${formatCurrency(netPocketCash, numMode)}!`,
      ].join('\n'),
      actionRoute: '/my-ledger',
      actionLabel: 'فتح بطاقات الخزنة وحساب البنك',
    };
  }

  // 20. Smart Period & Daily Reports ("تقرير اليوم" / "تقرير امبارح" / "تقرير الفترة")
  if (
    norm.includes('تقرير اليوم') ||
    norm.includes('تقرير امس') ||
    norm.includes('تقرير امبارح') ||
    norm.includes('حساب النهارده') ||
    norm.includes('حساب امبارح') ||
    norm.includes('تقرير الفتره') ||
    norm.includes('تقرير المشاريع')
  ) {
    const isYesterday = norm.includes('امس') || norm.includes('امبارح');
    let targetDate = ctx.todayIso;
    if (isYesterday) {
      const act = new Date(ctx.todayIso + 'T12:00:00Z');
      act.setDate(act.getDate() - 1);
      const y = act.getFullYear();
      const m = String(act.getMonth() + 1).padStart(2, '0');
      const d = String(act.getDate()).padStart(2, '0');
      targetDate = `${y}-${m}-${d}`;
    }

    const dayAtts = ctx.attendances.filter((a) => a.date === targetDate);
    const dayAdvs = ctx.advances.filter((a) => a.date === targetDate);
    const dayExps = (ctx.expenses || []).filter((e) => e.date === targetDate);

    const daysCount = dayAtts.reduce((s, a) => s + (a.dayWorked || 0), 0);
    const nightsCount = dayAtts.reduce((s, a) => s + (a.nightWorked || 0), 0);
    const wagesTotal = dayAtts.reduce(
      (s, a) =>
        s +
        (a.dayWorked ? a.workerDayRateSnapshot : 0) +
        (a.nightWorked ? a.workerNightRateSnapshot : 0),
      0
    );
    const advsTotal = dayAdvs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const expsTotal = dayExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const title = isYesterday ? `يوم أمس (${formatArabicDateShort(targetDate)})` : `اليوم (${formatArabicDateShort(targetDate)})`;

    return {
      reply: [
        `📊 **تقرير وإحصائيات ${title}:**`,
        `• عدد العمالة الحاضرة: **${formatNumber(dayAtts.length, numMode)}** عمال (${formatNumber(daysCount, numMode)} يومية و ${formatNumber(nightsCount, numMode)} سهرة)`,
        `• إجمالي أجور اليوميات: **${formatCurrency(wagesTotal, numMode)}**`,
        `• إجمالي السلف المنصرفة: **${formatCurrency(advsTotal, numMode)}** (${formatNumber(dayAdvs.length, numMode)} سلفة)`,
        `• إجمالي المصاريف المسجلة: **${formatCurrency(expsTotal, numMode)}**`,
        `• إجمالي المدفوعات النقدية الخارجة اليوم: **${formatCurrency(advsTotal + expsTotal, numMode)}**`,
        `─────────────`,
        `📑 يمكنك استعراض وفلترة وطباعة جميع التقارير من لوحة التقارير الشاملة الجديدة.`,
      ].join('\n'),
      actionRoute: '/reports',
      actionLabel: 'فتح لوحة التقارير والتصدير الشاملة',
    };
  }

  // 21. Daily Headcount Audit ("مطابقة كشف العدد اليومي" / "فحص العدد")
  if (
    norm.includes('مطابقه العدد') ||
    norm.includes('فحص العدد') ||
    norm.includes('دفتر العدد') ||
    norm.includes('كشف العدد')
  ) {
    const allHc = ctx.dailyHeadcounts || [];
    const todayHeadcounts = allHc.filter((h) => h.date === ctx.todayIso);
    const todayAtt = ctx.attendances.filter((a) => a.date === ctx.todayIso);
    const actualDays = todayAtt.reduce((s, a) => s + (a.dayWorked || 0), 0);
    const actualNights = todayAtt.reduce((s, a) => s + (a.nightWorked || 0), 0);

    if (todayHeadcounts.length === 0) {
      return {
        reply: `⚠️ **دفتر العدد اليومي لم يُسجل بعد ليوم ${formatArabicDateShort(ctx.todayIso)}!**\nسجلت حضور بالأسماء لـ ${formatNumber(todayAtt.length, numMode)} عمال (${formatNumber(actualDays, numMode)} يومية و ${formatNumber(actualNights, numMode)} سهرة)، بس لازم تسجل إجمالي العدد الإجباري في الدفتر علشان نضمن مطابقة الموقع مع المهندس.`,
        actionRoute: '/attendance',
        actionLabel: 'تسجيل العدد اليومي الإجباري',
      };
    }

    const hc = todayHeadcounts[0];
    const expectedDays = (hc.sculptorsCount || 0) + (hc.workersCount || 0);
    const expectedNights = hc.expectedNightCount || 0;
    const isMatch = actualDays === expectedDays && actualNights === expectedNights;

    if (isMatch) {
      return {
        reply: `✅ **تطابق كامل ومثالي في دفتر العدد ليوم ${formatArabicDateShort(ctx.todayIso)}!**\n• اليوميات: المسجل بالأسماء (${formatNumber(actualDays, numMode)}) مطابق تماماً للدفتر (${formatNumber(expectedDays, numMode)}).\n• السهرات: المسجل (${formatNumber(actualNights, numMode)}) مطابق للدفتر (${formatNumber(expectedNights, numMode)}).\nشغلك مظبوط ١٠٠٪ يا هندسة ولا يوجد أي فوارق.`,
        actionRoute: '/attendance',
        actionLabel: 'عرض كشف الحضور',
      };
    } else {
      return {
        reply: `⚠️ **يوجد فارق وعدم تطابق بين دفتر العدد وكشف الحضور ليوم ${formatArabicDateShort(ctx.todayIso)}:**\n• اليوميات: في الدفتر **${formatNumber(expectedDays, numMode)}** بينما المسجل بالأسماء **${formatNumber(actualDays, numMode)}** (فارق: ${formatNumber(Math.abs(expectedDays - actualDays), numMode)})\n• السهرات: في الدفتر **${formatNumber(expectedNights, numMode)}** بينما المسجل **${formatNumber(actualNights, numMode)}**\nراجع الأسماء في كشف الحضور لضبط الفارق قبل نهاية اليوم.`,
        actionRoute: '/attendance',
        actionLabel: 'ضبط كشف الحضور لمطابقة الدفتر',
      };
    }
  }

  // 22. Unsettled Advances Audit ("مين عليه سلف" / "السلف المفتوحة")
  if (
    norm.includes('مين عليه سلف') ||
    norm.includes('السلف المفتوحه') ||
    norm.includes('السلف المعلقه') ||
    norm.includes('سلف مخصمتهاش')
  ) {
    const openAdvances = ctx.advances.filter((a) => a.settlementId === null);
    if (openAdvances.length === 0) {
      return {
        reply: '👏 كل السلف مسواة ومخصومة بالكامل، مفيش أي سلف معلقة على العمال حالياً!',
        actionRoute: '/advances',
        actionLabel: 'عرض سجل السلف',
      };
    }

    const workerAdvMap = new Map<number, { name: string; total: number; count: number }>();
    for (const a of openAdvances) {
      const prev = workerAdvMap.get(a.workerId) || {
        name: ctx.workers.find((w) => w.id === a.workerId)?.name || `عامل #${a.workerId}`,
        total: 0,
        count: 0,
      };
      prev.total += a.amount;
      prev.count += 1;
      workerAdvMap.set(a.workerId, prev);
    }

    const lines = Array.from(workerAdvMap.values()).map(
      (w) => `• **${w.name}**: عليه سلف مفتوحة بإجمالي **${formatCurrency(w.total, numMode)}** (${formatNumber(w.count, numMode)} سلفة)`
    );

    const grandTotal = openAdvances.reduce((s, a) => s + a.amount, 0);

    return {
      reply: `⚠️ **كشف السلف المفتوحة التي لم تُخصم بعد (${formatNumber(openAdvances.length, numMode)} سلفة بإجمالي ${formatCurrency(grandTotal, numMode)}):**\n${lines.join('\n')}\n💡 سيتم خصم هذه السلف تلقائياً عند إجراء التسوية أو تصفية الحساب في كشف قبض يوم 15.`,
      actionRoute: '/settlements',
      actionLabel: 'فتح كشف التسويات والقبض',
    };
  }

  // 23. Pro Construction & Cashflow Advice ("نصيحة المقاولات" / "نصيحة زكي")
  if (
    norm.includes('نصيحه') ||
    norm.includes('نصايح') ||
    norm.includes('ازاي ادير') ||
    norm.includes('قواعد المقاولات')
  ) {
    return {
      reply: [
        `💡 **نصائح زكي الذهبية لإدارة سيولة وحسابات المقاولات الذكية:**`,
        `1. **فصل حساب البنك عن كاش الجيب:** شيك الشركة ينزل البنك، تسحب منه المبلغ المطلوب فقط للعهدة، وباقي قيمة الشيك تفضل في البنك كاحتياطي.`,
        `2. **قاعدة الـ 30% للسلف:** لا تصرف للعامل سلفة تتجاوز ثلث مستحقاته المسجلة حتى لا يتراكم عليه عجز وقت التصفية.`,
        `3. **المطابقة اليومية الإجبارية:** لا تنم قبل مطابقة دفتر العدد مع الحضور الفعلي بالأسماء، لتجنب نسيان أي يومية أو سهرة.`,
        `4. **تسجيل المصروف في لحظته:** أي نثريات أو نقل أو خامات سجلها فوراً من زر التسجيل السريع (+ وصلني / صرفت) لتبقى الخزنة متطابقة بالقرش.`,
        `5. **التسوية الدورية يوم 15:** إغلاق حسابات العمال بانتظام يرفع الإنتاجية ويمنع تراكم الفروقات.`,
      ].join('\n'),
      actionRoute: '/reports',
      actionLabel: 'عرض التقارير الشاملة',
    };
  }

  // Fallback
  return {
    reply:
      'أنا معاك يا هندسة! أقدر بالعامية المصرية أسجلك أي فلوس وصلتك (شيكات أو من شركة أو شخص)، أحسبلك حسابك الشامل والربح في كل مشروع، أعملك تقرير أي فترة من كذا إلى كذا، أدقق حساب الشيكات والبنك والكاش في جيبك، أطابق دفتر العدد، أشرحلك قواعد المقاولات، أحضّر العمال والنحاتية، أعمل مستخلصات، وأصرف سلف وأوقع خصومات. جرب تسألني أو اضغط على "ماذا يمكن للبوت فعله؟":',
    quickCommands: DEFAULT_FALLBACK_COMMANDS,
    actionRoute: '/my-ledger',
    actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
  };
}
