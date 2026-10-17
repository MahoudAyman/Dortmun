import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
