import type {
  Advance,
  AppSettings,
  Attendance,
  CheckItem,
  DailyHeadcount,
  Deduction,
  DeductionMode,
  ExtraCash,
  ExtraItem,
  ExtraType,
  Extract,
  ExtractLine,
  Project,
  Worker,
} from '../db/models';

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
  خمسالاف: 5000,
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
  extracts: Extract[];
  extractLines: ExtractLine[];
  extras: ExtraItem[];
  extraCashes: ExtraCash[];
  checks: CheckItem[];
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
    };

export interface ZakiResponse {
  reply: string;
  requiresConfirmation?: boolean;
  pendingAction?: ZakiPendingWriteAction;
  disambiguationOptions?: { label: string; command: string }[];
  awaitingAdvanceAmountForWorkerId?: number;
  quickCommands?: string[];
  clientEffect?: 'navigate_bulk' | 'export_excel' | 'undo';
  actionRoute?: string;
  actionLabel?: string;
}

const DEFAULT_FALLBACK_COMMANDS = [
  'العدد النهارده 10 يومية و 4 سهرة',
  'هل العدد النهارده مطابق ولا لا؟',
  'احسب قبض يوم 15 لكل العمال',
  'اخصم نص يوم من كريم بسبب تأخير',
  'زكي سجل يومية لمحمد وعلي النهارده',
  'ضيف نحات جديد اسمه حسام بيومية 450 وسهرة 220',
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

  if (norm === 'اتراجع' || norm.includes('تراجع عن اخر')) {
    return {
      reply: 'تمام، تراجعت عن آخر عملية سجلتها.',
      clientEffect: 'undo',
    };
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
          reply: `لسه متسجلش العدد الإجباري ليوم ${formatArabicDateShort(date)}! المسجل بالأسماء حالياً: ${formatNumber(actualDays, numMode)} يومية و ${formatNumber(actualNights, numMode)} سهرة. تقدر تقولي مثلاً: "العدد النهارده 10 يومية و 4 سهرة".`,
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

  // Fallback
  return {
    reply: 'أنا معاك يا هندسة! أقدر أسجلك العدد اليومي الإجباري، يوميات العمال والنحاتية، السهرات، الخصومات والجزاءات، السلف، أو أحسبلك كشف قبض يوم ١٥. جرب واحد من الأوامر الذكية دي:',
    quickCommands: DEFAULT_FALLBACK_COMMANDS,
    actionRoute: '/dashboard',
    actionLabel: 'تحويل للرئيسية',
  };
}
