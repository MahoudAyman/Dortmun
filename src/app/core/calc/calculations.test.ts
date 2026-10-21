import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCheckFundBreakdowns,
  calculateComprehensiveLedger,
  calculateDailyPocketSummary,
  calculateDeductionAmount,
  calculateExtractLineMetrics,
  calculateExtractTotals,
  calculateSettlement,
  calculateWorkerExtractBase,
  checkMonthlyCap,
  compareDailyHeadcount,
  formatCurrency,
  getDueChecksAlerts,
  getPayday15CycleInfo,
  calculateDailyDateReport,
  mergeArraysByIdAndSignature,
} from './calculations.ts';
import type {
  Advance,
  Attendance,
  Deduction,
  ExtraCash,
  ExtraItem,
  ExtractLine,
  Worker,
} from '../db/models.ts';

test('formatCurrency formats numbers in Arabic and English numerals with EGP symbol', () => {
  assert.equal(formatCurrency(1500, 'en'), '1,500 ج.م');
  assert.equal(formatCurrency(1500, 'ar'), '١,٥٠٠ ج.م');
});

test('checkMonthlyCap blocks or warns when reaching or exceeding 30 days', () => {
  const attendances: Attendance[] = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    workerId: 1,
    projectId: 1,
    dayWorked: 1,
    nightWorked: 0,
    workerDayRateSnapshot: 300,
    workerNightRateSnapshot: 150,
    companyDayRateSnapshot: 450,
    companyNightRateSnapshot: 250,
    note: '',
  }));

  const blockRes = checkMonthlyCap(attendances, 1, 1, {
    monthlyDayCap: 30,
    capMode: 'block',
  });
  assert.equal(blockRes.exceedsCap, true);
  assert.equal(blockRes.canProceed, false);
  assert.ok(blockRes.message?.includes('وصل الحد الشهري 30 يومية'));

  const confirmRes = checkMonthlyCap(attendances, 1, 1, {
    monthlyDayCap: 30,
    capMode: 'confirm',
  });
  assert.equal(confirmRes.exceedsCap, true);
  assert.equal(confirmRes.canProceed, true);
  assert.equal(confirmRes.requiresConfirmation, true);
  assert.ok(confirmRes.message?.includes('اعمل حسابك'));
});

test('calculateSettlement computes (days * rate) + (nights * nightRate) - advances using snapshots', () => {
  const worker: Worker = {
    id: 10,
    name: 'كريم محمود',
    role: 'نجار',
    workerDayRate: 400, // current rate changed
    workerNightRate: 200,
    phone: '0100000000',
    active: true,
    notes: '',
  };

  // Historical attendance had snapshot 350 day / 150 night
  const attendances: Attendance[] = [
    {
      id: 1,
      date: '2026-10-01',
      workerId: 10,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 1,
      workerDayRateSnapshot: 350,
      workerNightRateSnapshot: 150,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
    {
      id: 2,
      date: '2026-10-02',
      workerId: 10,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 0,
      workerDayRateSnapshot: 350,
      workerNightRateSnapshot: 150,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
  ];

  const advances: Advance[] = [
    {
      id: 99,
      date: '2026-10-02',
      workerId: 10,
      amount: 300,
      reason: 'مصاريف',
      settlementId: null,
      notes: '',
    },
  ];

  const res = calculateSettlement(
    worker,
    '2026-10-01',
    '2026-10-15',
    attendances,
    advances
  );

  // 2 days * 350 = 700, 1 night * 150 = 150 -> gross = 850, minus 300 advance = 550
  assert.equal(res.days, 2);
  assert.equal(res.nights, 1);
  assert.equal(res.grossWages, 850);
  assert.equal(res.advancesDeducted, 300);
  assert.equal(res.netPaid, 550);
});

test('calculateWorkerExtractBase includes attendance snapshots and extras once without double counting', () => {
  const attendances: Attendance[] = [
    {
      id: 1,
      date: '2026-10-05',
      workerId: 1,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 0,
      workerDayRateSnapshot: 300,
      workerNightRateSnapshot: 150,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
  ];

  const extras: ExtraItem[] = [
    {
      id: 50,
      date: '2026-10-06',
      projectId: 1,
      type: 'نص إضافي',
      authorizedBy: 'المهندس أحمد',
      performedBy: 'workers',
      workersCount: 1,
      valueMode: 'money',
      amount: 250,
      days: 0.5, // Both filled: should only count once!
      notes: '',
    },
  ];

  const extraCashes: ExtraCash[] = [
    {
      id: 1,
      extraId: 50,
      workerId: 1,
      amount: 250,
      days: 0.5,
      paidCash: 100,
      notes: '',
    },
  ];

  const base = calculateWorkerExtractBase(
    1,
    1,
    '2026-10-01',
    '2026-10-31',
    attendances,
    extras,
    extraCashes,
    500,
    250
  );

  assert.equal(base.attendanceValue, 500);
  assert.equal(base.extrasValue, 250);
  assert.equal(base.calculatedTotal, 750);
});

test('calculateExtractLineMetrics and calculateExtractTotals compute tax, net, status, and remaining', () => {
  const line: ExtractLine = {
    id: 1,
    extractId: 1,
    workerId: 1,
    calculated: 1000,
    claimed: 1200,
    taxRate: 5, // 5% of 1200 = 60
    taxAmount: 0,
    collected: 500,
    collectedDate: '2026-10-10',
    method: 'شيك',
    checkId: 1,
    notes: '',
  };

  const metrics = calculateExtractLineMetrics(line);
  assert.equal(metrics.difference, 200);
  assert.equal(metrics.taxAmount, 60);
  assert.equal(metrics.netDue, 1140);
  assert.equal(metrics.remaining, 640);
  assert.equal(metrics.status, 'جزئي');

  const totals = calculateExtractTotals([line]);
  assert.equal(totals.netDue, 1140);
  assert.equal(totals.remaining, 640);
});

test('getDueChecksAlerts returns pending checks due within 3 days', () => {
  const alerts = getDueChecksAlerts(
    [
      {
        id: 1,
        direction: 'وارد',
        number: 'CHK-101',
        bank: 'البنك الأهلي',
        amount: 25000,
        dueDate: '2026-10-19',
        status: 'معلق',
        projectId: 1,
        extractId: 1,
        notes: '',
      },
      {
        id: 2,
        direction: 'صادر',
        number: 'CHK-102',
        bank: 'بنك مصر',
        amount: 10000,
        dueDate: '2026-10-28',
        status: 'معلق',
        projectId: 1,
        extractId: null,
        notes: '',
      },
    ],
    '2026-10-17',
    3
  );

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].check.number, 'CHK-101');
  assert.equal(alerts[0].daysRemaining, 2);
});

test('calculateDeductionAmount and calculateSettlement handle day, half_day, and money deductions', () => {
  const halfDay = calculateDeductionAmount('half_day', 400, 0);
  assert.equal(halfDay.daysDeducted, 0.5);
  assert.equal(halfDay.amount, 200);

  const worker: Worker = {
    id: 1,
    name: 'إبراهيم النحات',
    role: 'نحات',
    workerDayRate: 400,
    workerNightRate: 200,
    phone: '',
    active: true,
    notes: '',
  };
  const attendances: Attendance[] = [
    {
      id: 1,
      date: '2026-10-05',
      workerId: 1,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 0,
      workerDayRateSnapshot: 400,
      workerNightRateSnapshot: 200,
      companyDayRateSnapshot: 600,
      companyNightRateSnapshot: 300,
      note: '',
    },
  ];
  const deductions: Deduction[] = [
    {
      id: 7,
      date: '2026-10-05',
      workerId: 1,
      projectId: 1,
      mode: 'half_day',
      daysDeducted: 0.5,
      amount: 200,
      reason: 'تأخير',
      settlementId: null,
      notes: '',
    },
  ];

  const st = calculateSettlement(
    worker,
    '2026-10-01',
    '2026-10-15',
    attendances,
    [],
    [],
    [],
    deductions
  );
  assert.equal(st.grossWages, 400);
  assert.equal(st.deductionsDeducted, 200);
  assert.equal(st.netPaid, 200);
  assert.deepEqual(st.unsettledDeductionIds, [7]);
});

test('compareDailyHeadcount detects exact match and mismatch between mandatory headcount and actual attendance', () => {
  const workers: Worker[] = [
    { id: 1, name: 'عامل 1', role: 'عامل', workerDayRate: 300, workerNightRate: 150, phone: '', active: true, notes: '' },
    { id: 2, name: 'نحات 1', role: 'نحات', workerDayRate: 450, workerNightRate: 225, phone: '', active: true, notes: '' },
  ];
  const attendances: Attendance[] = [
    {
      id: 1,
      date: '2026-10-17',
      workerId: 1,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 1,
      workerDayRateSnapshot: 300,
      workerNightRateSnapshot: 150,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
    {
      id: 2,
      date: '2026-10-17',
      workerId: 2,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 0,
      workerDayRateSnapshot: 450,
      workerNightRateSnapshot: 225,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
  ];

  const matchRes = compareDailyHeadcount({
    date: '2026-10-17',
    headcounts: [
      {
        id: 1,
        date: '2026-10-17',
        projectId: 1,
        workersCount: 1,
        sculptorsCount: 1,
        expectedDayCount: 2,
        expectedNightCount: 1,
        supervisorName: 'مشرف',
        notes: '',
      },
    ],
    attendances,
    workers,
  });

  assert.equal(matchRes.hasMandatoryRecord, true);
  assert.equal(matchRes.isExactMatch, true);
  assert.equal(matchRes.actualSculptors, 1);

  const cycle = getPayday15CycleInfo('2026-10-17', 15);
  assert.equal(cycle.from, '2026-09-16');
  assert.equal(cycle.to, '2026-10-15');
});

test('calculateComprehensiveLedger computes incoming from checks, persons, companies, project breakdowns, owed to/by me, and net profit', () => {
  const ledger = calculateComprehensiveLedger({
    projects: [
      {
        id: 1,
        name: 'مشروع مدينتي',
        companyDayRate: 600,
        companyNightRate: 300,
        active: true,
        notes: '',
      },
    ],
    workers: [
      {
        id: 1,
        name: 'محمد السيد',
        role: 'نحات',
        workerDayRate: 400,
        workerNightRate: 200,
        phone: '',
        active: true,
        notes: '',
      },
    ],
    attendances: [
      {
        id: 1,
        date: '2026-10-10',
        workerId: 1,
        projectId: 1,
        dayWorked: 10,
        nightWorked: 0,
        workerDayRateSnapshot: 400, // 4000 worker wages
        workerNightRateSnapshot: 200,
        companyDayRateSnapshot: 600, // 6000 company entitlement
        companyNightRateSnapshot: 300,
        note: '',
      },
    ],
    advances: [
      {
        id: 1,
        date: '2026-10-12',
        workerId: 1,
        amount: 1000,
        reason: 'سلفة',
        settlementId: null,
        notes: '',
      },
    ],
    deductions: [
      {
        id: 1,
        date: '2026-10-13',
        workerId: 1,
        projectId: 1,
        mode: 'money',
        daysDeducted: 0,
        amount: 200,
        reason: 'تأخير',
        settlementId: null,
        notes: '',
      },
    ],
    settlements: [
      {
        id: 1,
        date: '2026-10-15',
        from: '2026-10-01',
        to: '2026-10-15',
        workerId: 1,
        days: 10,
        nights: 0,
        grossWages: 4000,
        advancesDeducted: 1000,
        deductionsDeducted: 200,
        netPaid: 1500, // paid 1500 so far out of 2800 net due
        notes: '',
      },
    ],
    extracts: [],
    extractLines: [],
    extras: [],
    extraCashes: [],
    checks: [
      {
        id: 1,
        direction: 'وارد',
        number: 'CHK-500',
        bank: 'البنك الأهلي',
        amount: 2000,
        dueDate: '2026-10-14',
        status: 'اتصرف',
        projectId: 1,
        extractId: null,
        notes: '',
      },
    ],
    expenses: [
      {
        id: 1,
        date: '2026-10-14',
        category: 'مواصلات',
        amount: 300,
        projectId: 1,
        notes: '',
      },
    ],
    incomingPayments: [
      {
        id: 1,
        date: '2026-10-15',
        sourceType: 'شخص',
        sourceName: 'المهندس طارق',
        method: 'نقدي',
        amount: 1500,
        projectId: 1,
        notes: 'دفعة عهدة',
      },
      {
        id: 2,
        date: '2026-10-16',
        sourceType: 'شركة',
        sourceName: 'طلعت مصطفى',
        method: 'تحويل بنكي',
        amount: 1000,
        projectId: 1,
        notes: 'دفعة حساب مشروع',
      },
    ],
  });

  // Received: 2000 (check) + 1500 (person) + 1000 (company) = 4500
  assert.equal(ledger.receivedFromChecks, 2000);
  assert.equal(ledger.receivedFromPersons, 1500);
  assert.equal(ledger.receivedFromCompaniesAndExtracts, 1000);
  assert.equal(ledger.totalReceivedAll, 4500);

  // Spent: 1000 (advances) + 1500 (settlements) + 300 (expenses) = 2800
  assert.equal(ledger.totalAdvancesSpent, 1000);
  assert.equal(ledger.totalSettlementsPaid, 1500);
  assert.equal(ledger.totalExpensesSpent, 300);
  assert.equal(ledger.totalSpentAll, 2800);

  // Net cash in hand: 4500 - 2800 = 1700
  assert.equal(ledger.netCashInHand, 1700);

  // Owed to me: company entitlement (6000) - received (4500) = 1500
  assert.equal(ledger.totalOwedToMe, 1500);

  // Remaining owed to workers: 4000 gross - 200 deduction - 1000 advance - 1500 settlement = 1300
  assert.equal(ledger.remainingOwedToWorkers, 1300);
  assert.equal(ledger.totalOwedByMe, 1300);

  // Net profit: 6000 - (4000 - 200) - 300 = 1900
  assert.equal(ledger.totalNetProfit, 1900);
  assert.equal(ledger.projectBreakdowns.length, 1);
  assert.equal(ledger.projectBreakdowns[0].projectName, 'مشروع مدينتي');
});

test('calculateDailyPocketSummary computes withdrawn 4000, fee 40, advances 3500 => 500 before fees and 460 net in pocket', () => {
  const summary = calculateDailyPocketSummary({
    withdrawnAmount: 4000,
    withdrawalFee: 40,
    advancesTotal: 3500,
    settlementsTotal: 0,
    otherExpensesTotal: 0,
  });

  assert.equal(summary.withdrawnAmount, 4000);
  assert.equal(summary.totalWorkersPaid, 3500);
  assert.equal(summary.remainingBeforeExpenses, 500);
  assert.equal(summary.totalExternalExpenses, 40);
  assert.equal(summary.netRemainingInPocket, 460);
});

test('calculateCheckFundBreakdowns links check to project, extract, advances, settlements, and fees', () => {
  const breakdowns = calculateCheckFundBreakdowns({
    checks: [
      {
        id: 10,
        direction: 'وارد',
        number: 'CHK-500',
        bank: 'البنك الأهلي',
        amount: 20000,
        dueDate: '2026-10-18',
        status: 'اتصرف',
        projectId: 1,
        extractId: 1,
        withdrawnAmount: 4000,
        withdrawalFee: 40,
        notes: 'شيك مستخلص 1',
      },
    ],
    projects: [
      {
        id: 1,
        name: 'فيلا التجمع',
        companyDayRate: 600,
        companyNightRate: 300,
        active: true,
        notes: '',
      },
    ],
    extracts: [
      {
        id: 1,
        projectId: 1,
        number: 3,
        from: '2026-10-01',
        to: '2026-10-15',
        notes: '',
      },
    ],
    workers: [
      {
        id: 1,
        name: 'كريم محمود',
        role: 'نحات',
        workerDayRate: 450,
        workerNightRate: 225,
        phone: '',
        active: true,
        notes: '',
      },
    ],
    attendances: [
      {
        id: 1,
        date: '2026-10-10',
        workerId: 1,
        projectId: 1,
        dayWorked: 1,
        nightWorked: 0,
        workerDayRateSnapshot: 5000,
        workerNightRateSnapshot: 200,
        companyDayRateSnapshot: 6000,
        companyNightRateSnapshot: 300,
        note: '',
      },
    ],
    advances: [
      {
        id: 1,
        date: '2026-10-18',
        workerId: 1,
        amount: 3500,
        reason: 'سلفة من الشيك',
        settlementId: null,
        projectId: 1,
        checkId: 10,
        notes: '',
      },
    ],
    deductions: [],
    settlements: [],
    expenses: [],
  });

  assert.equal(breakdowns.length, 1);
  const b = breakdowns[0];
  assert.equal(b.projectName, 'فيلا التجمع');
  assert.equal(b.extractNumber, 3);
  assert.equal(b.checkAmount, 20000);
  assert.equal(b.withdrawnAmount, 4000);
  assert.equal(b.remainingInBank, 16000); // 20000 check - 4000 withdrawn = 16000 in bank
  assert.equal(b.remainingInCheck, 16000);
  assert.equal(b.advancesSpentFromCheck, 3500);
  assert.equal(b.expensesSpentFromCheck, 40);
  assert.equal(b.remainingBeforeFees, 500); // 4000 - 3500 = 500
  assert.equal(b.remainingInPocketNet, 460); // 500 - 40 = 460 in pocket
  assert.equal(b.projectOwedToWorkers, 1500); // 5000 gross - 3500 advance
});

test('Contractor Exact Scenario: 100,000 company check deposited in bank, withdrew 4,000 cash for advances, 3,500 advances given, 40 fee => 96,000 remains in bank, 460 remains in pocket', () => {
  const summary = calculateDailyPocketSummary({
    checksIncomingTotal: 100000,
    withdrawnAmount: 4000,
    withdrawalFee: 40,
    advancesTotal: 3500,
    settlementsTotal: 0,
    otherExpensesTotal: 0,
  });

  // المستوى الأول: حساب البنك وفلوس الشيك من الشركة
  assert.equal(summary.checksIncomingTotal, 100000);
  assert.equal(summary.withdrawnAmount, 4000);
  assert.equal(summary.remainingInBank, 96000); // 100,000 - 4,000 = 96,000 في حساب البنك
  assert.equal(summary.remainingInCheck, 96000);

  // المستوى الثاني: عهدة الكاش في جيبك للسلف والمصاريف
  assert.equal(summary.cashInPocket, 4000);
  assert.equal(summary.advancesTotal, 3500);
  assert.equal(summary.remainingBeforeExpenses, 500); // 4,000 - 3,500 = 500 ج.م قبل مصاريف السحب
  assert.equal(summary.withdrawalFee, 40);
  assert.equal(summary.netRemainingInPocket, 460); // 500 - 40 = 460 ج.م صافي في الجيب
});

test('calculateDailyDateReport for 2026-10-20 computes opening cash, spent, worker count, profit, and splits workers with/without advance', () => {
  const report = calculateDailyDateReport({
    date: '2026-10-20',
    projects: [
      {
        id: 1,
        name: 'مشروع الكوبري الجديد',
        companyDayRate: 500,
        companyNightRate: 250,
        active: true,
        notes: '',
      },
    ],
    workers: [
      {
        id: 1,
        name: 'كريم محمود',
        role: 'نحات',
        workerDayRate: 500,
        workerNightRate: 250,
        phone: '01000000001',
        active: true,
        notes: '',
      },
      {
        id: 2,
        name: 'حسن علي',
        role: 'عامل',
        workerDayRate: 300,
        workerNightRate: 150,
        phone: '01000000002',
        active: true,
        notes: '',
      },
      {
        id: 3,
        name: 'سعيد طارق',
        role: 'عامل',
        workerDayRate: 300,
        workerNightRate: 150,
        phone: '01000000003',
        active: true,
        notes: '',
      },
    ],
    attendances: [
      {
        id: 1,
        date: '2026-10-20',
        workerId: 1,
        projectId: 1,
        dayWorked: 1,
        nightWorked: 1,
        workerDayRateSnapshot: 500,
        workerNightRateSnapshot: 250,
        companyDayRateSnapshot: 700,
        companyNightRateSnapshot: 350,
        note: 'شغل واجهة',
      },
      {
        id: 2,
        date: '2026-10-20',
        workerId: 2,
        projectId: 1,
        dayWorked: 1,
        nightWorked: 0,
        workerDayRateSnapshot: 300,
        workerNightRateSnapshot: 150,
        companyDayRateSnapshot: 500,
        companyNightRateSnapshot: 250,
        note: '',
      },
    ],
    advances: [
      {
        id: 1,
        date: '2026-10-19',
        workerId: 1,
        amount: 400,
        reason: 'سلفة أمس',
        settlementId: null,
        projectId: 1,
        notes: '',
      },
      {
        id: 2,
        date: '2026-10-20',
        workerId: 1,
        amount: 200,
        reason: 'سلفة غداء',
        settlementId: null,
        projectId: 1,
        notes: '',
      },
    ],
    deductions: [],
    settlements: [],
    expenses: [
      {
        id: 1,
        date: '2026-10-20',
        category: 'مواصلات',
        amount: 100,
        projectId: 1,
        note: 'عربية نقل',
      },
    ],
    extras: [],
    checks: [
      {
        id: 1,
        direction: 'وارد',
        number: 'CHK-101',
        bank: 'البنك الأهلي',
        amount: 50000,
        withdrawnAmount: 5000,
        dueDate: '2026-10-18',
        status: 'اتصرف',
        projectId: 1,
        extractId: null,
        notes: '',
      },
    ],
    incomingPayments: [],
    headcounts: [],
  });

  // Opening cash before 2026-10-20: 5000 withdrawn on 10-18 minus 400 advance on 10-19 = 4600
  assert.equal(report.openingCashBeforeDay, 4600);
  assert.equal(report.totalAvailableOnDay, 4600);
  // Spent on 2026-10-20: 200 advance + 100 expense = 300
  assert.equal(report.advancesSpentOnDay, 200);
  assert.equal(report.expensesSpentOnDay, 100);
  assert.equal(report.totalSpentOnDay, 300);
  assert.equal(report.closingCashEndOfDay, 4300);

  // Workers who worked on 2026-10-20: 2 (1 sculptor, 1 regular worker), 1 absent
  assert.equal(report.totalWorkersWhoWorked, 2);
  assert.equal(report.sculptorsWhoWorked, 1);
  assert.equal(report.regularWorkersWhoWorked, 1);
  assert.equal(report.workersWhoWorkedWithAdvanceCount, 1); // Karim took 200 advance
  assert.equal(report.workersWhoWorkedWithoutAdvanceCount, 1); // Hassan took 0 advance
  assert.equal(report.absentWorkersCount, 1); // Saeed was absent

  // Profit on 2026-10-20:
  // Karim: company 1050 (700+350), worker 750 (500+250) => margin 300
  // Hassan: company 500, worker 300 => margin 200
  // Total labor margin = 500; minus 100 expense = 400 net profit
  assert.equal(report.companyEntitlementOnDay, 1550);
  assert.equal(report.workerGrossWagesOnDay, 1050);
  assert.equal(report.grossLaborMarginOnDay, 500);
  assert.equal(report.netProfitOnDay, 400);
});

test('mergeArraysByIdAndSignature merges offline local records and remote database records without data loss or ID collision', () => {
  const localAdvances: Advance[] = [
    { id: 1, date: '2026-10-18', workerId: 1, amount: 500, reason: 'سلفة قديمة', settlementId: null, notes: '' },
    { id: 2, date: '2026-10-20', workerId: 2, amount: 300, reason: 'سلفة مسجلة أوفلاين', settlementId: null, notes: '' },
  ];
  const remoteAdvances: Advance[] = [
    { id: 1, date: '2026-10-18', workerId: 1, amount: 500, reason: 'سلفة قديمة', settlementId: null, notes: '' },
    { id: 2, date: '2026-10-20', workerId: 3, amount: 450, reason: 'سلفة من قاعدة البيانات', settlementId: null, notes: '' },
  ];

  const sig = (a: Advance) => `${a.date}|${a.workerId}|${a.amount}|${a.reason}`;
  const res = mergeArraysByIdAndSignature(localAdvances, remoteAdvances, sig);

  assert.equal(res.merged.length, 3);
  assert.equal(res.addedFromLocal.length, 1);
  assert.equal(res.addedFromLocal[0].reason, 'سلفة مسجلة أوفلاين');
  assert.equal(res.addedFromRemote.length, 1);
  assert.equal(res.addedFromRemote[0].reason, 'سلفة من قاعدة البيانات');
  // Verify all 3 merged items have unique IDs
  const uniqueIds = new Set(res.merged.map((m) => m.id));
  assert.equal(uniqueIds.size, 3);
});



