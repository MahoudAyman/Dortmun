import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabic,
  parseSpokenArabicNumber,
  processZakiMessage,
} from './zaki-engine.ts';
import type { ZakiContext } from './zaki-engine.ts';

const mockContext: ZakiContext = {
  todayIso: '2026-10-17',
  workers: [
    {
      id: 1,
      name: 'محمد السيد',
      role: 'نجار',
      workerDayRate: 350,
      workerNightRate: 180,
      phone: '01011111111',
      active: true,
      notes: '',
    },
    {
      id: 2,
      name: 'علي إبراهيم',
      role: 'نقاش',
      workerDayRate: 320,
      workerNightRate: 160,
      phone: '01022222222',
      active: true,
      notes: '',
    },
    {
      id: 3,
      name: 'حسن عبد الله',
      role: 'نقاش',
      workerDayRate: 320,
      workerNightRate: 160,
      phone: '01033333333',
      active: true,
      notes: '',
    },
    {
      id: 4,
      name: 'كريم محمود',
      role: 'حداد',
      workerDayRate: 380,
      workerNightRate: 200,
      phone: '01044444444',
      active: true,
      notes: '',
    },
  ],
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
  attendances: [
    {
      id: 1,
      date: '2026-10-15',
      workerId: 1,
      projectId: 1,
      dayWorked: 1,
      nightWorked: 0,
      workerDayRateSnapshot: 350,
      workerNightRateSnapshot: 180,
      companyDayRateSnapshot: 500,
      companyNightRateSnapshot: 250,
      note: '',
    },
  ],
  advances: [
    {
      id: 1,
      date: '2026-10-12',
      workerId: 4,
      amount: 300,
      reason: 'سلفة نقدية',
      settlementId: null,
      notes: '',
    },
  ],
  extracts: [
    {
      id: 1,
      projectId: 1,
      number: 1,
      from: '2026-10-01',
      to: '2026-10-31',
      notes: 'المستخلص الأول',
    },
  ],
  extractLines: [
    {
      id: 1,
      extractId: 1,
      workerId: 4,
      calculated: 5000,
      claimed: 5500,
      taxRate: 5,
      taxAmount: 275,
      collected: 3000,
      collectedDate: '2026-10-16',
      method: 'تحويل',
      checkId: null,
      notes: '',
    },
  ],
  extras: [
    {
      id: 10,
      date: '2026-10-15',
      projectId: 1,
      type: 'يوم إضافي',
      authorizedBy: 'المهندس أحمد',
      performedBy: 'workers',
      workersCount: 2,
      valueMode: 'money',
      amount: 600,
      days: 1,
      notes: '',
    },
  ],
  extraCashes: [
    {
      id: 100,
      extraId: 10,
      workerId: 2,
      amount: 300,
      days: 0.5,
      paidCash: 200,
      notes: '',
    },
    {
      id: 101,
      extraId: 10,
      workerId: 3,
      amount: 300,
      days: 0.5,
      paidCash: 150,
      notes: '',
    },
  ],
  checks: [
    {
      id: 1,
      direction: 'وارد',
      number: '9988',
      bank: 'البنك الأهلي',
      amount: 15000,
      dueDate: '2026-10-19',
      status: 'معلق',
      projectId: 1,
      extractId: 1,
      notes: '',
    },
  ],
  settings: {
    companyName: 'شركة دورتمون',
    monthlyDayCap: 30,
    expectedMonthlyDays: 26,
    capMode: 'confirm',
    defaultWorkerDayRate: 350,
    defaultWorkerNightRate: 180,
    defaultCompanyDayRate: 500,
    defaultCompanyNightRate: 250,
    defaultProjectId: 1,
    pinHash: null,
    lastBackupDate: '2026-10-17',
    backupReminderDays: 7,
    numeralMode: 'en',
    darkMode: false,
    lockedMonths: [],
    taxRates: [{ name: 'خصم وتحصيل 5%', rate: 5 }],
    engineers: ['المهندس أحمد', 'المهندس طارق'],
    supervisors: ['المشرف سعيد'],
    paydayDayOfMonth: 15,
    mandatoryDailyHeadcount: true,
    notes: '',
  },
};

test('normalizeArabic unifies Alef, Taa Marbuta, Alef Maqsura and strips diacritics', () => {
  assert.equal(normalizeArabic('أَحْمَدُ وَعَلِيٌّ سلفة'), 'احمد وعلي سلفه');
});

test('parseSpokenArabicNumber parses colloquial Egyptian numbers and Arabic digits', () => {
  assert.equal(parseSpokenArabicNumber('خمسين جنيه'), 50);
  assert.equal(parseSpokenArabicNumber('ميت جنيه'), 100);
  assert.equal(parseSpokenArabicNumber('ألفين'), 2000);
  assert.equal(parseSpokenArabicNumber('٣٠٠ جنيه'), 300);
});

test('Zaki requires confirmation before recording attendance for multiple workers', () => {
  const res = processZakiMessage('زكي سجل يومية لمحمد وعلي النهارده', mockContext);
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_attendance');
  if (res.pendingAction?.type === 'record_attendance') {
    assert.deepEqual(res.pendingAction.workerIds.sort(), [1, 2]);
    assert.equal(res.pendingAction.dayWorked, 1);
    assert.equal(res.pendingAction.date, '2026-10-17');
  }
  assert.ok(res.reply.includes('تمام؟'));
});

test('Zaki handles role-based attendance ("يومية لكل النقاشين النهارده")', () => {
  const res = processZakiMessage('يومية لكل النقاشين النهارده', mockContext);
  assert.equal(res.requiresConfirmation, true);
  if (res.pendingAction?.type === 'record_attendance') {
    assert.deepEqual(res.pendingAction.workerIds.sort(), [2, 3]);
  }
});

test('Zaki handles recording extras ("سجل إضافي نص يوم لحسن وعلي بأمر المهندس أحمد")', () => {
  const res = processZakiMessage(
    'سجل إضافي نص يوم لحسن وعلي بأمر المهندس أحمد',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_extra');
  if (res.pendingAction?.type === 'record_extra') {
    assert.equal(res.pendingAction.extraType, 'نص إضافي');
    assert.equal(res.pendingAction.days, 0.5);
    assert.ok(res.pendingAction.authorizedBy.includes('أحمد'));
  }
});

test('Zaki answers extract query ("المستخلص الأول كام طلبه كريم وكام اتحصل؟")', () => {
  const res = processZakiMessage(
    'المستخلص الأول كام طلبه كريم وكام اتحصل؟',
    mockContext
  );
  assert.ok(res.reply.includes('5,500'));
  assert.ok(res.reply.includes('3,000'));
});

test('Zaki calculates total Nash for all workers this month ("احسب إجمالي الناش لجميع الموظفين في هذا الشهر")', () => {
  const res = processZakiMessage(
    'احسب إجمالي الناش لجميع الموظفين في هذا الشهر',
    mockContext
  );
  assert.ok(res.reply.includes('600'));
  assert.ok(res.reply.includes('350'));
});

test('Zaki records mandatory daily headcount ("سجل العدد اليومي 10 عمال و 4 نحاتين و 5 سهرة النهارده")', () => {
  const res = processZakiMessage(
    'سجل العدد اليومي 10 عمال و 4 نحاتين و 5 سهرة النهارده',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_headcount');
  if (res.pendingAction?.type === 'record_headcount') {
    assert.equal(res.pendingAction.workersCount, 10);
    assert.equal(res.pendingAction.sculptorsCount, 4);
    assert.equal(res.pendingAction.expectedNightCount, 5);
  }
});

test('Zaki records worker deduction ("اخصم نص يوم من كريم بسبب تأخير")', () => {
  const res = processZakiMessage('اخصم نص يوم من كريم بسبب تأخير', mockContext);
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_deduction');
  if (res.pendingAction?.type === 'record_deduction') {
    assert.equal(res.pendingAction.workerId, 4);
    assert.equal(res.pendingAction.mode, 'half_day');
    assert.equal(res.pendingAction.amount, 190); // half of 380
  }
});

test('Zaki adds a new sculptor ("ضيف نحات جديد اسمه ابراهيم بيومية 500 وسهرة 250")', () => {
  const res = processZakiMessage(
    'ضيف نحات جديد اسمه ابراهيم بيومية 500 وسهرة 250',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'add_worker');
  if (res.pendingAction?.type === 'add_worker') {
    assert.equal(res.pendingAction.role, 'نحات');
    assert.equal(res.pendingAction.workerDayRate, 500);
    assert.equal(res.pendingAction.workerNightRate, 250);
  }
});

test('Zaki records incoming payment from company/check/person to project ("وصلني 25000 شيك من شركة طلعت مصطفى لحساب مشروع الكوبري الجديد")', () => {
  const res = processZakiMessage(
    'وصلني 25000 شيك من شركة طلعت مصطفى لحساب مشروع الكوبري الجديد',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_incoming_payment');
  if (res.pendingAction?.type === 'record_incoming_payment') {
    assert.equal(res.pendingAction.amount, 25000);
    assert.equal(res.pendingAction.projectId, 1);
  }
});

test('Zaki records site expense ("صرفت 350 مواصلات لمشروع الكوبري الجديد")', () => {
  const res = processZakiMessage(
    'صرفت 350 مواصلات لمشروع الكوبري الجديد',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'record_expense');
  if (res.pendingAction?.type === 'record_expense') {
    assert.equal(res.pendingAction.amount, 350);
    assert.equal(res.pendingAction.category, 'مواصلات');
  }
});

test('Zaki creates new extract ("اعمل مستخلص جديد لمشروع الكوبري الجديد")', () => {
  const res = processZakiMessage(
    'اعمل مستخلص جديد لمشروع الكوبري الجديد',
    mockContext
  );
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'create_extract');
  if (res.pendingAction?.type === 'create_extract') {
    assert.equal(res.pendingAction.projectId, 1);
    assert.equal(res.pendingAction.number, 2);
  }
});

test('Zaki deletes/deactivates worker ("احذف العامل كريم محمود")', () => {
  const res = processZakiMessage('احذف العامل كريم محمود', mockContext);
  assert.equal(res.requiresConfirmation, true);
  assert.equal(res.pendingAction?.type, 'delete_record');
  if (res.pendingAction?.type === 'delete_record') {
    assert.equal(res.pendingAction.targetEntity, 'worker');
    assert.equal(res.pendingAction.recordId, 4);
  }
});

test('Zaki answers comprehensive ledger query ("حسابي الشامل وصلني كام وصرفت كام وربحي كام؟")', () => {
  const res = processZakiMessage(
    'حسابي الشامل وصلني كام وصرفت كام وربحي كام؟',
    mockContext
  );
  assert.ok(res.reply.includes('حسابك الشامل والخزنة'));
  assert.equal(res.actionRoute, '/my-ledger');
});

test('Zaki explains contractor methodology and golden rules ("اشرح مناهج وقواعد إدارة المقاولات الذكية")', () => {
  const res = processZakiMessage(
    'اشرح مناهج وقواعد إدارة المقاولات الذكية',
    mockContext
  );
  assert.ok(res.reply.includes('مناهج وقواعد إدارة المقاولات الذكية'));
  assert.equal(res.actionRoute, '/my-ledger');
});

test('Zaki compares project profitability ("قارن أرباح المشاريع وقولي انهي مشروع بيكسب اكتر")', () => {
  const res = processZakiMessage(
    'قارن أرباح المشاريع وقولي انهي مشروع بيكسب اكتر',
    mockContext
  );
  assert.ok(res.reply.includes('مقارنة وترتيب أرباح المشاريع'));
  assert.equal(res.actionRoute, '/my-ledger');
});

test('Zaki returns detailed worker statement ("كشف حساب تفصيلي لكريم محمود")', () => {
  const res = processZakiMessage('كشف حساب تفصيلي لكريم محمود', mockContext);
  assert.ok(res.reply.includes('كشف حساب تفصيلي'));
  assert.ok(res.reply.includes('كريم محمود'));
  assert.equal(res.actionRoute, '/workers');
});


