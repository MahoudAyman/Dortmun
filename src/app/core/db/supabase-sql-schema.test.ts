import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_SUPABASE_SQL_SCHEMA,
  SUPABASE_TABLES_LIST,
  parseSmartSiteCommand,
} from './supabase-sql-schema.ts';

test('FULL_SUPABASE_SQL_SCHEMA includes all 19 Dortmun relational tables, RPC, and Views', () => {
  assert.equal(SUPABASE_TABLES_LIST.length, 19);
  for (const tbl of SUPABASE_TABLES_LIST) {
    assert.ok(
      FULL_SUPABASE_SQL_SCHEMA.includes(`CREATE TABLE IF NOT EXISTS public.${tbl.name}`),
      `Missing CREATE TABLE for ${tbl.name}`
    );
  }
  assert.ok(FULL_SUPABASE_SQL_SCHEMA.includes('sync_dortmun_full_snapshot'));
  assert.ok(FULL_SUPABASE_SQL_SCHEMA.includes('dortmun_worker_live_balance_v'));
  assert.ok(FULL_SUPABASE_SQL_SCHEMA.includes('dortmun_project_financial_summary_v'));
  assert.ok(FULL_SUPABASE_SQL_SCHEMA.includes('ENABLE ROW LEVEL SECURITY'));
});

test('parseSmartSiteCommand parses deductions, advances, expenses, headcount, and workers', () => {
  const ded = parseSmartSiteCommand('خصم نص يوم على أحمد بسبب تأخير الصباح');
  assert.equal(ded.kind, 'deduction');
  assert.equal(ded.deductionMode, 'half_day');
  assert.equal(ded.workerNameHint, 'أحمد');
  assert.equal(ded.reason, 'تأخير الصباح');

  const adv = parseSmartSiteCommand('سلفة ٥٠٠ لمحمود');
  assert.equal(adv.kind, 'advance');
  assert.equal(adv.amount, 500);
  assert.equal(adv.workerNameHint, 'محمود');

  const exp = parseSmartSiteCommand('مصروف مواصلات 250 عربية نقل');
  assert.equal(exp.kind, 'expense');
  assert.equal(exp.expenseCategory, 'مواصلات');
  assert.equal(exp.amount, 250);

  const hc = parseSmartSiteCommand('العدد اليومي ١٢ عامل و ٤ نحات و ٥ سهرة');
  assert.equal(hc.kind, 'headcount');
  assert.equal(hc.workersCount, 12);
  assert.equal(hc.sculptorsCount, 4);
  assert.equal(hc.nightsCount, 5);
});
