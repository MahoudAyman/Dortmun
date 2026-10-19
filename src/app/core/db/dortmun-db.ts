import Dexie, { type Table } from 'dexie';
import type {
  Advance,
  AppSettings,
  Attendance,
  AuditLogEntry,
  CheckItem,
  DailyHeadcount,
  Deduction,
  Expense,
  ExtraCash,
  ExtraItem,
  Extract,
  ExtractLine,
  IncomingPayment,
  Project,
  RegisteredDevice,
  Settlement,
  Worker,
} from './models';

export class DortmunDatabase extends Dexie {
  workers!: Table<Worker, number>;
  projects!: Table<Project, number>;
  attendance!: Table<Attendance, number>;
  advances!: Table<Advance, number>;
  deductions!: Table<Deduction, number>;
  dailyHeadcounts!: Table<DailyHeadcount, number>;
  settlements!: Table<Settlement, number>;
  extracts!: Table<Extract, number>;
  extractLines!: Table<ExtractLine, number>;
  extras!: Table<ExtraItem, number>;
  extraCash!: Table<ExtraCash, number>;
  checks!: Table<CheckItem, number>;
  expenses!: Table<Expense, number>;
  incomingPayments!: Table<IncomingPayment, number>;
  settings!: Table<AppSettings, number>;
  auditLog!: Table<AuditLogEntry, number>;
  devices!: Table<RegisteredDevice, string>;

  constructor() {
    super('DortmunContractingZeroDB');
    this.version(1).stores({
      workers: '++id, name, role, active',
      projects: '++id, name, active',
      attendance: '++id, date, workerId, projectId',
      advances: '++id, date, workerId, settlementId',
      deductions: '++id, date, workerId, projectId, settlementId',
      dailyHeadcounts: '++id, date, projectId',
      settlements: '++id, workerId, date, from, to',
      extracts: '++id, projectId, number, from, to',
      extractLines: '++id, extractId, workerId',
      extras: '++id, date, projectId, type, authorizedBy',
      extraCash: '++id, extraId, workerId',
      checks: '++id, direction, status, dueDate, projectId, extractId',
      expenses: '++id, date, category, projectId',
      settings: '++id',
      auditLog: '++id, timestamp, action, entity',
    });

    this.version(2).stores({
      workers: '++id, name, role, active',
      projects: '++id, name, active',
      attendance: '++id, date, workerId, projectId',
      advances: '++id, date, workerId, settlementId',
      deductions: '++id, date, workerId, projectId, settlementId',
      dailyHeadcounts: '++id, date, projectId',
      settlements: '++id, workerId, date, from, to',
      extracts: '++id, projectId, number, from, to',
      extractLines: '++id, extractId, workerId',
      extras: '++id, date, projectId, type, authorizedBy',
      extraCash: '++id, extraId, workerId',
      checks: '++id, direction, status, dueDate, projectId, extractId',
      expenses: '++id, date, category, projectId',
      settings: '++id',
      auditLog: '++id, timestamp, action, entity, deviceId',
      devices: 'deviceId, deviceName, lastActiveAt',
    });

    this.version(3).stores({
      workers: '++id, name, role, active',
      projects: '++id, name, active',
      attendance: '++id, date, workerId, projectId',
      advances: '++id, date, workerId, settlementId',
      deductions: '++id, date, workerId, projectId, settlementId',
      dailyHeadcounts: '++id, date, projectId',
      settlements: '++id, workerId, date, from, to',
      extracts: '++id, projectId, number, from, to',
      extractLines: '++id, extractId, workerId',
      extras: '++id, date, projectId, type, authorizedBy',
      extraCash: '++id, extraId, workerId',
      checks: '++id, direction, status, dueDate, projectId, extractId',
      expenses: '++id, date, category, projectId',
      incomingPayments: '++id, date, sourceType, projectId, checkId, extractId',
      settings: '++id',
      auditLog: '++id, timestamp, action, entity, deviceId',
      devices: 'deviceId, deviceName, lastActiveAt',
    });
  }
}
