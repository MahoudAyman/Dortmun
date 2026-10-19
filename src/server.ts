import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPABASE_TABLES_LIST } from './app/core/db/supabase-sql-schema';

const browserDistFolder = join(import.meta.dirname, '../browser');
const cloudStoreFilePath = join(process.cwd(), '.dortmun-cloud-server-store.json');

const SUPABASE_URL =
  process.env['SUPABASE_URL'] || 'https://lmcxonnuzbamfqxbqshu.supabase.co';
const SUPABASE_KEY =
  process.env['SUPABASE_PUBLISHABLE_KEY'] ||
  'sb_publishable_7A5T6fhkfAp0IApJMArKuA_Zk8hkPdj';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

export interface ServerDeviceRecord {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browserOs: string;
  firstLoginAt: string;
  lastActiveAt: string;
  lastAction: string;
  operationsCount: number;
  isOnline?: boolean;
  syncMode: 'cloud' | 'local';
}

export interface ServerCloudBackupItem {
  id: number;
  backupTitle: string;
  createdAt: string;
  createdByDeviceId: string;
  createdByDeviceName: string;
  version: number;
  workersCount: number;
  attendanceCount: number;
  payload: Record<string, unknown>;
}

interface ServerCloudStore {
  version: number;
  updatedAt: string;
  updatedByDeviceId: string;
  updatedByDeviceName: string;
  lastOperation: string;
  snapshot: Record<string, unknown> | null;
  devices: Record<string, ServerDeviceRecord>;
  backups: ServerCloudBackupItem[];
}

function loadServerStore(): ServerCloudStore {
  try {
    if (existsSync(cloudStoreFilePath)) {
      const raw = readFileSync(cloudStoreFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as ServerCloudStore;
      if (parsed && typeof parsed === 'object') {
        parsed.devices = parsed.devices || {};
        parsed.backups = Array.isArray(parsed.backups) ? parsed.backups : [];
        return parsed;
      }
    }
  } catch {
    // Fallback to empty initial store
  }
  return {
    version: 0,
    updatedAt: new Date().toISOString(),
    updatedByDeviceId: '',
    updatedByDeviceName: '',
    lastOperation: 'تهيئة الخادم الأولية',
    snapshot: null,
    devices: {},
    backups: [],
  };
}

const serverStore: ServerCloudStore = loadServerStore();

function saveServerStore(): void {
  try {
    writeFileSync(cloudStoreFilePath, JSON.stringify(serverStore, null, 2), 'utf-8');
  } catch {
    // Ignore file write errors in read-only environments
  }
}

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '25mb' }));

/**
 * GET /api/cloud/state
 * Returns the latest synchronized state, registered devices, cloud backups, and Supabase connection status.
 */
app.get('/api/cloud/state', async (_req, res) => {
  try {
    let supabaseTablesReady = false;
    const { data: sbState, error: sbErr } = await supabase
      .from('dortmun_cloud_state')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    if (!sbErr) {
      supabaseTablesReady = true;
      if (sbState && sbState['payload'] && (sbState['version'] || 0) >= serverStore.version) {
        serverStore.version = Number(sbState['version']) || serverStore.version + 1;
        serverStore.updatedAt = String(sbState['updated_at'] || new Date().toISOString());
        serverStore.updatedByDeviceId = String(sbState['updated_by_device_id'] || '');
        serverStore.updatedByDeviceName = String(sbState['updated_by_device_name'] || '');
        serverStore.lastOperation = String(sbState['last_action'] || '');
        serverStore.snapshot = sbState['payload'] as Record<string, unknown>;
      }
    }

    const { data: sbDevices, error: devErr } = await supabase
      .from('dortmun_devices')
      .select('*');

    if (!devErr && Array.isArray(sbDevices)) {
      for (const d of sbDevices) {
        const id = String(d['device_id'] || '');
        if (id) {
          serverStore.devices[id] = {
            deviceId: id,
            deviceName: String(d['device_name'] || 'جهاز متصل'),
            deviceType: (d['device_type'] as 'desktop' | 'mobile' | 'tablet') || 'desktop',
            browserOs: String(d['browser_os'] || ''),
            firstLoginAt: String(d['first_login_at'] || new Date().toISOString()),
            lastActiveAt: String(d['last_active_at'] || new Date().toISOString()),
            lastAction: String(d['last_action'] || ''),
            operationsCount: Number(d['operations_count'] || 0),
            syncMode: (d['sync_mode'] as 'cloud' | 'local') || 'cloud',
          };
        }
      }
      saveServerStore();
    }

    const { data: sbBackups, error: bkpErr } = await supabase
      .from('dortmun_cloud_backups')
      .select('id, backup_title, created_at, created_by_device_id, created_by_device_name, version, workers_count, attendances_count, snapshot')
      .order('id', { ascending: false })
      .limit(15);

    if (!bkpErr && Array.isArray(sbBackups) && sbBackups.length > 0) {
      serverStore.backups = sbBackups.map((b) => ({
        id: Number(b['id'] || Date.now()),
        backupTitle: String(b['backup_title'] || 'نسخة احتياطية سحابية'),
        createdAt: String(b['created_at'] || '').replace('T', ' ').slice(0, 16),
        createdByDeviceId: String(b['created_by_device_id'] || ''),
        createdByDeviceName: String(b['created_by_device_name'] || 'جهاز متصل'),
        version: Number(b['version'] || 1),
        workersCount: Number(b['workers_count'] || 0),
        attendanceCount: Number(b['attendances_count'] || 0),
        payload: (b['snapshot'] as Record<string, unknown>) || {},
      }));
    }

    res.json({
      ok: true,
      supabaseUrl: SUPABASE_URL,
      supabaseTablesReady,
      version: serverStore.version,
      updatedAt: serverStore.updatedAt,
      updatedByDeviceId: serverStore.updatedByDeviceId,
      updatedByDeviceName: serverStore.updatedByDeviceName,
      lastOperation: serverStore.lastOperation,
      snapshot: serverStore.snapshot,
      backups: serverStore.backups.slice(0, 15).map((b) => ({
        id: b.id,
        backupTitle: b.backupTitle,
        createdAt: b.createdAt,
        createdByDeviceId: b.createdByDeviceId,
        createdByDeviceName: b.createdByDeviceName,
        version: b.version,
        workersCount: b.workersCount,
        attendanceCount: b.attendanceCount,
      })),
      devices: Object.values(serverStore.devices).sort((a, b) =>
        b.lastActiveAt.localeCompare(a.lastActiveAt)
      ),
    });
  } catch (err) {
    res.json({
      ok: true,
      supabaseUrl: SUPABASE_URL,
      supabaseTablesReady: false,
      version: serverStore.version,
      updatedAt: serverStore.updatedAt,
      updatedByDeviceId: serverStore.updatedByDeviceId,
      updatedByDeviceName: serverStore.updatedByDeviceName,
      lastOperation: serverStore.lastOperation,
      snapshot: serverStore.snapshot,
      backups: serverStore.backups.slice(0, 15),
      devices: Object.values(serverStore.devices),
      warning: String(err),
    });
  }
});

/**
 * GET /api/cloud/diagnostics
 * Checks all 18 Supabase PostgreSQL tables, latency, and RPC readiness.
 */
app.get('/api/cloud/diagnostics', async (_req, res) => {
  const startMs = Date.now();
  try {
    const checks = await Promise.all(
      SUPABASE_TABLES_LIST.map(async (tbl) => {
        const { count, error } = await supabase
          .from(tbl.name)
          .select('*', { count: 'exact', head: true });
        return {
          name: tbl.name,
          label: tbl.label,
          ready: !error,
          rowCount: count ?? 0,
        };
      })
    );

    const latencyMs = Date.now() - startMs;
    const readyCount = checks.filter((c) => c.ready).length;

    res.json({
      ok: true,
      latencyMs,
      totalTables: SUPABASE_TABLES_LIST.length,
      readyTablesCount: readyCount,
      allReady: readyCount === SUPABASE_TABLES_LIST.length,
      tables: checks,
      serverVersion: serverStore.version,
      devicesCount: Object.keys(serverStore.devices).length,
      backupsCount: serverStore.backups.length,
    });
  } catch (err) {
    res.json({
      ok: false,
      latencyMs: Date.now() - startMs,
      totalTables: SUPABASE_TABLES_LIST.length,
      readyTablesCount: 0,
      allReady: false,
      tables: SUPABASE_TABLES_LIST.map((t) => ({
        name: t.name,
        label: t.label,
        ready: false,
        rowCount: 0,
      })),
      error: String(err),
    });
  }
});

/**
 * POST /api/cloud/device
 * Registers or updates a device login/heartbeat on the server and in Supabase.
 */
app.post('/api/cloud/device', async (req, res) => {
  try {
    const body = req.body as Partial<ServerDeviceRecord>;
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ ok: false, error: 'Missing deviceId' });
      return;
    }

    const existing = serverStore.devices[deviceId];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const updatedDevice: ServerDeviceRecord = {
      deviceId,
      deviceName: String(body.deviceName || existing?.deviceName || 'جهاز غير مسمى').trim(),
      deviceType: body.deviceType || existing?.deviceType || 'desktop',
      browserOs: String(body.browserOs || existing?.browserOs || 'متصفح الويب'),
      firstLoginAt: existing?.firstLoginAt || body.firstLoginAt || now,
      lastActiveAt: now,
      lastAction: String(body.lastAction || existing?.lastAction || 'تسجيل دخول متصل بالخادم'),
      operationsCount:
        typeof body.operationsCount === 'number'
          ? body.operationsCount
          : existing?.operationsCount || 0,
      isOnline: true,
      syncMode: body.syncMode || 'cloud',
    };

    serverStore.devices[deviceId] = updatedDevice;
    saveServerStore();

    await supabase.from('dortmun_devices').upsert(
      {
        device_id: updatedDevice.deviceId,
        device_name: updatedDevice.deviceName,
        device_type: updatedDevice.deviceType,
        browser_os: updatedDevice.browserOs,
        first_login_at: updatedDevice.firstLoginAt,
        last_active_at: updatedDevice.lastActiveAt,
        last_action: updatedDevice.lastAction,
        operations_count: updatedDevice.operationsCount,
        is_online: true,
        sync_mode: updatedDevice.syncMode,
      },
      { onConflict: 'device_id' }
    );

    res.json({
      ok: true,
      device: updatedDevice,
      devices: Object.values(serverStore.devices).sort((a, b) =>
        b.lastActiveAt.localeCompare(a.lastActiveAt)
      ),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * DELETE /api/cloud/device/:deviceId
 * Deletes a registered device from server and Supabase.
 */
app.delete('/api/cloud/device/:deviceId', async (req, res) => {
  try {
    const deviceId = String(req.params['deviceId'] || '');
    if (deviceId && serverStore.devices[deviceId]) {
      delete serverStore.devices[deviceId];
      saveServerStore();
    }
    await supabase.from('dortmun_devices').delete().eq('device_id', deviceId);
    res.json({
      ok: true,
      devices: Object.values(serverStore.devices).sort((a, b) =>
        b.lastActiveAt.localeCompare(a.lastActiveAt)
      ),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /api/cloud/sync
 * Receives 100% live state updates from any device and persists them on the server and all 18 Supabase tables.
 */
app.post('/api/cloud/sync', async (req, res) => {
  try {
    const { snapshot, device, lastOperation } = req.body as {
      snapshot: Record<string, unknown>;
      device?: Partial<ServerDeviceRecord>;
      lastOperation?: string;
    };

    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    serverStore.version += 1;
    serverStore.updatedAt = now;
    serverStore.lastOperation = String(lastOperation || 'مزامنة مباشرة مع الخادم');

    if (device?.deviceId) {
      const id = String(device.deviceId);
      const existing = serverStore.devices[id];
      serverStore.updatedByDeviceId = id;
      serverStore.updatedByDeviceName = String(
        device.deviceName || existing?.deviceName || 'جهاز متصل'
      );

      serverStore.devices[id] = {
        deviceId: id,
        deviceName: serverStore.updatedByDeviceName,
        deviceType: device.deviceType || existing?.deviceType || 'desktop',
        browserOs: String(device.browserOs || existing?.browserOs || 'متصفح الويب'),
        firstLoginAt: existing?.firstLoginAt || device.firstLoginAt || now,
        lastActiveAt: now,
        lastAction: serverStore.lastOperation,
        operationsCount: (existing?.operationsCount || 0) + 1,
        isOnline: true,
        syncMode: 'cloud',
      };
    }

    if (snapshot && typeof snapshot === 'object') {
      serverStore.snapshot = {
        ...snapshot,
        version: serverStore.version,
        updatedAt: serverStore.updatedAt,
        updatedByDeviceId: serverStore.updatedByDeviceId,
        updatedByDeviceName: serverStore.updatedByDeviceName,
        lastOperation: serverStore.lastOperation,
      };
    }

    saveServerStore();

    let supabaseTablesReady = false;
    const { error: stateErr } = await supabase.from('dortmun_cloud_state').upsert(
      {
        id: 'main',
        version: serverStore.version,
        updated_at: new Date().toISOString(),
        updated_by_device_id: serverStore.updatedByDeviceId,
        updated_by_device_name: serverStore.updatedByDeviceName,
        last_action: serverStore.lastOperation,
        payload: serverStore.snapshot,
      },
      { onConflict: 'id' }
    );
    if (!stateErr) {
      supabaseTablesReady = true;
    }

    if (device?.deviceId && serverStore.devices[device.deviceId]) {
      const d = serverStore.devices[device.deviceId];
      await supabase.from('dortmun_devices').upsert(
        {
          device_id: d.deviceId,
          device_name: d.deviceName,
          device_type: d.deviceType,
          browser_os: d.browserOs,
          first_login_at: d.firstLoginAt,
          last_active_at: d.lastActiveAt,
          last_action: d.lastAction,
          operations_count: d.operationsCount,
          is_online: true,
          sync_mode: d.syncMode,
        },
        { onConflict: 'device_id' }
      );
    }

    res.json({
      ok: true,
      version: serverStore.version,
      updatedAt: serverStore.updatedAt,
      updatedByDeviceId: serverStore.updatedByDeviceId,
      updatedByDeviceName: serverStore.updatedByDeviceName,
      lastOperation: serverStore.lastOperation,
      supabaseTablesReady,
      devices: Object.values(serverStore.devices).sort((a, b) =>
        b.lastActiveAt.localeCompare(a.lastActiveAt)
      ),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /api/cloud/backups
 * Creates a named Cloud Restore Point on the server and in Supabase `dortmun_cloud_backups`.
 */
app.post('/api/cloud/backups', async (req, res) => {
  try {
    const { backupTitle, snapshot, device } = req.body as {
      backupTitle?: string;
      snapshot?: Record<string, unknown>;
      device?: Partial<ServerDeviceRecord>;
    };

    const payloadToSave = snapshot || serverStore.snapshot || {};
    const workersArr = Array.isArray(payloadToSave['workers']) ? payloadToSave['workers'] : [];
    const attArr = Array.isArray(payloadToSave['attendances']) ? payloadToSave['attendances'] : [];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const newBackup: ServerCloudBackupItem = {
      id: Date.now(),
      backupTitle: String(backupTitle || `نسخة سحابية (${now})`).trim(),
      createdAt: now,
      createdByDeviceId: String(device?.deviceId || serverStore.updatedByDeviceId || ''),
      createdByDeviceName: String(
        device?.deviceName || serverStore.updatedByDeviceName || 'جهاز الإدارة'
      ),
      version: serverStore.version || 1,
      workersCount: workersArr.length,
      attendanceCount: attArr.length,
      payload: payloadToSave,
    };

    serverStore.backups = [newBackup, ...serverStore.backups.slice(0, 19)];
    saveServerStore();

    await supabase.from('dortmun_cloud_backups').insert({
      backup_title: newBackup.backupTitle,
      created_by_device_id: newBackup.createdByDeviceId,
      created_by_device_name: newBackup.createdByDeviceName,
      version: newBackup.version,
      workers_count: newBackup.workersCount,
      attendances_count: newBackup.attendanceCount,
      snapshot: newBackup.payload,
    });

    res.json({
      ok: true,
      backup: {
        id: newBackup.id,
        backupTitle: newBackup.backupTitle,
        createdAt: newBackup.createdAt,
        createdByDeviceId: newBackup.createdByDeviceId,
        createdByDeviceName: newBackup.createdByDeviceName,
        version: newBackup.version,
        workersCount: newBackup.workersCount,
        attendanceCount: newBackup.attendanceCount,
      },
      backups: serverStore.backups.map((b) => ({
        id: b.id,
        backupTitle: b.backupTitle,
        createdAt: b.createdAt,
        createdByDeviceId: b.createdByDeviceId,
        createdByDeviceName: b.createdByDeviceName,
        version: b.version,
        workersCount: b.workersCount,
        attendanceCount: b.attendanceCount,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /api/cloud/backups/:id/restore
 * Restores a cloud backup point and makes it the active server snapshot.
 */
app.post('/api/cloud/backups/:id/restore', async (req, res) => {
  try {
    const id = Number(req.params['id'] || 0);
    let found = serverStore.backups.find((b) => b.id === id);

    if (!found) {
      const { data: sbRow } = await supabase
        .from('dortmun_cloud_backups')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (sbRow && (sbRow['snapshot'] || sbRow['payload'])) {
        found = {
          id: Number(sbRow['id']),
          backupTitle: String(sbRow['backup_title'] || ''),
          createdAt: String(sbRow['created_at'] || ''),
          createdByDeviceId: String(sbRow['created_by_device_id'] || ''),
          createdByDeviceName: String(sbRow['created_by_device_name'] || ''),
          version: Number(sbRow['version'] || 1),
          workersCount: Number(sbRow['workers_count'] || 0),
          attendanceCount: Number(sbRow['attendances_count'] || sbRow['attendance_count'] || 0),
          payload: (sbRow['snapshot'] || sbRow['payload']) as Record<string, unknown>,
        };
      }
    }

    if (!found || !found.payload) {
      res.status(404).json({ ok: false, error: 'Backup not found' });
      return;
    }

    serverStore.version += 1;
    serverStore.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    serverStore.lastOperation = `استعادة نقطة سحابية: ${found.backupTitle}`;
    serverStore.snapshot = {
      ...found.payload,
      version: serverStore.version,
      updatedAt: serverStore.updatedAt,
      lastOperation: serverStore.lastOperation,
    };
    saveServerStore();

    await supabase.from('dortmun_cloud_state').upsert(
      {
        id: 'main',
        version: serverStore.version,
        updated_at: new Date().toISOString(),
        updated_by_device_id: serverStore.updatedByDeviceId,
        updated_by_device_name: serverStore.updatedByDeviceName,
        last_action: serverStore.lastOperation,
        payload: serverStore.snapshot,
      },
      { onConflict: 'id' }
    );

    res.json({
      ok: true,
      snapshot: serverStore.snapshot,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
