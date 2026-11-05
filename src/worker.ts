/**
 * Dortmun — Zaki AI API as a Cloudflare Worker (+ static assets).
 *
 * WHY THIS FILE EXISTS:
 * The live site is served by the Cloudflare Worker "dortmun" (see
 * wrangler.jsonc: assets = ./dist/app/browser, SPA fallback). A Worker that
 * only serves assets has NO backend, so /api/zaki/chat used to return the
 * SPA page and the chat always fell back to the local rule-based engine.
 * This entry point serves the static assets AND answers /api/zaki/* with
 * the real Gemini API, so the same code serves both.
 *
 * ── SETUP ───────────────────────────────────────────────────────────────
 * 1. The secret GEMINI_API_KEY is ALREADY set on the Worker "dortmun"
 *    (Cloudflare Dashboard → Workers & Pages → dortmun → Settings →
 *    Variables → Secrets, or `wrangler secret put GEMINI_API_KEY`).
 *    It is a NEW Gemini API key for project 110645591699. NEVER paste it
 *    in chat, in code, or in git — it lives ONLY as a Worker secret.
 *    Without it, both endpoints answer { ok:false, mode:'local_fallback' }
 *    and the chat keeps working locally.
 * 2. Deploy: `npx wrangler deploy` (or the Cloudflare dashboard GitHub
 *    integration, which rebuilds from main). A secret change does NOT
 *    need a redeploy; a code change does.
 * 3. The old hardcoded fallback key in src/server.ts must be REVOKED in
 *    Google Cloud first — removing it from code alone does not help
 *    because it already exists in git history. This Worker never uses it.
 * 4. The Netlify twin of this file is netlify/functions/api.ts (same
 *    logic, process.env instead of env) for the Netlify-hosted copy.
 *
 * SECURITY:
 * - Gemini key comes ONLY from env.GEMINI_API_KEY (never hardcoded).
 * - Every /api/zaki/* request must carry Authorization: Bearer <Supabase
 *   owner JWT>; the token is verified against Supabase Auth and must
 *   belong to the single owner email. No token / bad token / non-owner
 *   → 401. Asset requests are public (the app itself gates on login).
 * - Keys and tokens are never logged.
 */

const SUPABASE_URL = 'https://lmcxonnuzbamfqxbqshu.supabase.co';
// Publishable (anon) key — public by design, used only as the `apikey`
// header when verifying the owner's JWT with Supabase Auth.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7A5T6fhkfAp0IApJMArKuA_Zk8hkPdj';
const OWNER_EMAIL = 'gqikdubrjntorldfieo36@gmail.com';

const GCP_PROJECT_ID = '110645591699';
const GCP_PROJECT_PATH = `projects/${GCP_PROJECT_ID}`;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15000;

interface DortmunEnv {
  GEMINI_API_KEY?: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Verify the owner's Supabase JWT. Returns true only for the owner email. */
async function isOwnerRequest(req: Request): Promise<boolean> {
  const token = ownerToken(req);
  if (!token) return false;
  try {
    const user = await fetchSupabaseUser(token);
    return (user?.email || '').toLowerCase() === OWNER_EMAIL;
  } catch {
    return false;
  }
}

/** Bearer token from the request, or ''. */
function ownerToken(req: Request): string {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

async function fetchSupabaseUser(
  token: string
): Promise<{ email?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as { email?: string };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Minimal Supabase PostgREST call as the owner (RLS owner-only policies apply). */
async function sbRest(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

// Tables shown by the in-app diagnostics (same list as the app itself,
// plus the newer custodian transfers table).
const TABLES_FOR_DIAGNOSTICS: Array<{ name: string; label: string }> = [
  { name: 'dortmun_cloud_state', label: 'الحالة السحابية الموحدة (Realtime Snapshot)' },
  { name: 'dortmun_devices', label: 'سجل الأجهزة المتصلة وأسماء الدخول' },
  { name: 'dortmun_cloud_backups', label: 'نقاط الاستعادة والنسخ الاحتياطية السحابية' },
  { name: 'dortmun_settings', label: 'إعدادات النظام والشركة والضرائب' },
  { name: 'dortmun_projects', label: 'المشاريع وأسعار يوميات وسهرات الشركة' },
  { name: 'dortmun_workers', label: 'العمال والنحاتية والصنايعية' },
  { name: 'dortmun_daily_headcounts', label: 'دفتر العدد اليومي الإجباري' },
  { name: 'dortmun_attendance', label: 'سجل الحضور واليوميات والسهرات' },
  { name: 'dortmun_advances', label: 'سجل السلف النقدية' },
  { name: 'dortmun_deductions', label: 'سجل الخصومات والجزاءات' },
  { name: 'dortmun_settlements', label: 'كشوف قبض يوم ١٥ والتسويات' },
  { name: 'dortmun_extracts', label: 'المستخلصات مع الشركات' },
  { name: 'dortmun_extract_lines', label: 'بنود وتفاصيل المستخلصات' },
  { name: 'dortmun_extras', label: 'الإضافي والناش' },
  { name: 'dortmun_extra_cashes', label: 'توزيع نقدية الإضافي والناش للعمال' },
  { name: 'dortmun_checks', label: 'دفتر الشيكات الواردة والصادرة' },
  { name: 'dortmun_expenses', label: 'المصاريف الخارجية للموقع' },
  { name: 'dortmun_incoming_payments', label: 'المقبوضات والدفعات الواردة المباشرة' },
  { name: 'dortmun_audit_logs', label: 'سجل الرقابة والحركات التفصيلي بالأجهزة' },
  { name: 'dortmun_custodian_transfers', label: 'تحويلات الأمناء والسحب للجيب' },
];

type GeminiResult =
  | { ok: true; text: string; model: string; latencyMs: number }
  | { ok: false; geminiStatus: number; geminiError: string };

async function callGemini(
  apiKey: string,
  promptContent: string,
  systemInstruction: string
): Promise<GeminiResult> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: promptContent }] }],
        generationConfig: {
          temperature: 0.35,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      // Surface the real Gemini failure (status + short message, never the key).
      let errText = '';
      try {
        const errData = (await resp.json()) as {
          error?: { message?: string; status?: string };
        };
        errText = String(errData?.error?.message || errData?.error?.status || '').slice(0, 200);
      } catch {
        errText = '';
      }
      return { ok: false, geminiStatus: resp.status, geminiError: errText || `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || ''
    ).trim();
    if (!text) return { ok: false, geminiStatus: 200, geminiError: 'empty reply' };
    return { ok: true, text, model: GEMINI_MODEL, latencyMs: Date.now() - t0 };
  } catch (e) {
    const timedOut =
      e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      ok: false,
      geminiStatus: 0,
      geminiError: timedOut ? 'timeout' : 'fetch failed',
    };
  }
}

async function handleZaki(req: Request, env: DortmunEnv): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api/, '') || '/';
  const apiKey = (env.GEMINI_API_KEY || '').trim();

  if (!(await isOwnerRequest(req))) {
    return json(401, { ok: false, error: 'Missing owner session' });
  }

  // ── GET /api/zaki/status ──────────────────────────────────────────────
  if (req.method === 'GET' && route === '/zaki/status') {
    if (!apiKey) {
      return json(200, {
        ok: false,
        status: 'no_key',
        projectId: GCP_PROJECT_ID,
        projectPath: GCP_PROJECT_PATH,
      });
    }
    if (url.searchParams.get('ping') !== '1') {
      return json(200, {
        ok: true,
        status: 'ready',
        projectId: GCP_PROJECT_ID,
        projectPath: GCP_PROJECT_PATH,
        model: GEMINI_MODEL,
      });
    }
    const result = await callGemini(
      apiKey,
      'قل: متصل وجاهز يا باشمهندس في 4 كلمات فقط',
      'أنت المساعد الذكي زكي لشركة دورتمون للمقاولات.'
    );
    if (result.ok) {
      return json(200, {
        ok: true,
        status: 'connected',
        projectId: GCP_PROJECT_ID,
        projectPath: GCP_PROJECT_PATH,
        model: result.model,
        latencyMs: result.latencyMs,
        sampleReply: result.text,
      });
    }
    return json(200, {
      ok: false,
      status: 'local_fallback',
      projectId: GCP_PROJECT_ID,
      projectPath: GCP_PROJECT_PATH,
      geminiStatus: result.geminiStatus,
      geminiError: result.geminiError,
    });
  }

  // ── POST /api/zaki/chat ──────────────────────────────────────────────
  if (req.method === 'POST' && route === '/zaki/chat') {
    let body: {
      message?: string;
      localReply?: string;
      contextSummary?: string;
      hasPendingAction?: boolean;
    } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
    const userPrompt = String(body.message || '').trim();
    const localReply = String(body.localReply || '');
    if (!userPrompt) {
      return json(200, { ok: false, mode: 'local_fallback', reply: localReply });
    }
    if (!apiKey) {
      return json(200, {
        ok: false,
        mode: 'local_fallback',
        reply: localReply,
        reason: 'No API key configured',
      });
    }

    // System instruction + prompt built exactly like src/server.ts /api/zaki/chat.
    const systemInstruction = [
      'أنت «زكي» المساعد الذكي الهندسي والمالي لشركة دورتمون للمقاولات (إدارة المهندس، وتطوير م/ محمود أيمن 01029046651).',
      'تحدث باللهجة العامية المصرية المهنية المحترمة والودودة (مثل: يا هندسة، يا باشمهندس، عيوني).',
      'اعتمد بدقة ١٠٠٪ على بيانات الموقع الحية المرفقة ولا تخترع أرقاماً من عندك.',
      body.hasPendingAction
        ? 'ملاحظة هامة: النظام المحلي جهّز بالفعل زر تأكيد تنفيذ العملية للمستخدم. حافظ على تفاصيل العملية الدقيقة كما في الرد المحلي وأضف نصيحة سريعة أو توضيح مالي ذكي في سطرين فقط.'
        : 'قدم إجابة مرتبة ومنظمة بالنقاط واضحة الأرقام وقابلة للقراءة السريعة.',
    ].join('\n');

    const promptContent = [
      `رسالة المهندس: "${userPrompt}"`,
      body.contextSummary
        ? `\nبيانات الموقع والخزنة الحية الآن:\n${body.contextSummary}`
        : '',
      localReply
        ? `\nنتيجة المحرك المحلي الدقيقة للاستئناس بها وعدم مخالفة أرقامها:\n${localReply}`
        : '',
    ].join('\n');

    const aiResult = await callGemini(apiKey, promptContent, systemInstruction);
    if (aiResult.ok && aiResult.text) {
      return json(200, {
        ok: true,
        mode: 'api',
        reply: aiResult.text,
        model: aiResult.model,
        latencyMs: aiResult.latencyMs,
        projectId: GCP_PROJECT_ID,
        projectPath: GCP_PROJECT_PATH,
      });
    }
    return json(200, {
      ok: false,
      mode: 'local_fallback',
      reply: localReply,
      projectId: GCP_PROJECT_ID,
      projectPath: GCP_PROJECT_PATH,
      reason: 'API unavailable or key error — local engine active',
      geminiStatus: aiResult.ok ? 200 : aiResult.geminiStatus,
      geminiError: aiResult.ok ? 'empty reply' : aiResult.geminiError,
    });
  }

  return json(404, { ok: false, error: 'Not found' });
}

/**
 * /api/cloud/* — the same endpoints the Express server in src/server.ts
 * used to serve. On the static host they used to answer 405 (assets only
 * serve GET), which the app mostly swallowed — except cloud backups, which
 * silently never saved, and restores, which always warned. Here each route
 * is served by proxying to Supabase PostgREST with the owner's own JWT,
 * so the owner-only RLS policies apply exactly as in the app itself.
 * The app already syncs its data directly to Supabase, so /api/cloud/sync
 * only acknowledges that the direct sync already happened.
 */
async function handleCloud(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/cloud/, '') || '/';
  const token = ownerToken(req);
  if (!token) return json(401, { ok: false, error: 'Missing owner session' });
  const user = await fetchSupabaseUser(token);
  if ((user?.email || '').toLowerCase() !== OWNER_EMAIL) {
    return json(401, { ok: false, error: 'Missing owner session' });
  }

  // ── GET /api/cloud/state ───────────────────────────────────────────
  if (req.method === 'GET' && route === '/state') {
    const res = await sbRest(token, 'dortmun_cloud_state?id=eq.main&select=payload,updated_at');
    if (!res.ok) return json(500, { ok: false, error: 'Cloud state unavailable' });
    const rows = (await res.json()) as Array<{ payload?: unknown; updated_at?: string }>;
    return json(200, {
      ok: true,
      snapshot: rows[0]?.payload || {},
      updatedAt: rows[0]?.updated_at || '',
    });
  }

  // ── GET /api/cloud/diagnostics ─────────────────────────────────────
  if (req.method === 'GET' && route === '/diagnostics') {
    const t0 = Date.now();
    const tables = await Promise.all(
      TABLES_FOR_DIAGNOSTICS.map(async (t) => {
        try {
          const res = await sbRest(token, `${t.name}?select=*&limit=0`, {
            headers: { Prefer: 'count=exact' },
          });
          const range = res.headers.get('content-range') || '';
          const count = Number(range.split('/')[1] || '0') || 0;
          return { name: t.name, label: t.label, ready: res.ok, rowCount: count };
        } catch {
          return { name: t.name, label: t.label, ready: false, rowCount: 0 };
        }
      })
    );
    return json(200, {
      ok: true,
      latencyMs: Date.now() - t0,
      tables,
      readyTablesCount: tables.filter((t) => t.ready).length,
    });
  }

  // ── POST /api/cloud/device ─────────────────────────────────────────
  if (req.method === 'POST' && route === '/device') {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const deviceId = String(body['deviceId'] || '').trim();
    if (!deviceId) return json(400, { ok: false, error: 'Missing deviceId' });
    const now = new Date().toISOString();
    const row = {
      device_id: deviceId,
      device_name: String(body['deviceName'] || 'جهاز غير مسمى'),
      device_type: String(body['deviceType'] || 'desktop'),
      browser_os: String(body['browserOs'] || 'متصفح الويب'),
      first_login_at: String(body['firstLoginAt'] || now),
      last_active_at: now,
      last_action: String(body['lastAction'] || 'تسجيل دخول متصل بالخادم'),
      operations_count: typeof body['operationsCount'] === 'number' ? body['operationsCount'] : 0,
      is_online: true,
      sync_mode: String(body['syncMode'] || 'cloud'),
      updated_at: now,
    };
    const res = await sbRest(token, 'dortmun_devices?on_conflict=device_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    if (!res.ok) return json(500, { ok: false, error: 'Device save failed' });
    const saved = (await res.json()) as Array<Record<string, unknown>>;
    return json(200, { ok: true, device: saved[0] || row });
  }

  // ── DELETE /api/cloud/device/:deviceId ─────────────────────────────
  if (req.method === 'DELETE' && route.startsWith('/device/')) {
    const deviceId = decodeURIComponent(route.slice('/device/'.length));
    await sbRest(token, `dortmun_devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
    return json(200, { ok: true });
  }

  // ── POST /api/cloud/sync ──────────────────────────────────────────
  // The app already persisted the snapshot directly to Supabase before
  // calling this; acknowledge it so the client stops seeing failures.
  if (req.method === 'POST' && route === '/sync') {
    return json(200, { ok: true, syncedAt: new Date().toISOString(), mode: 'direct' });
  }

  // ── POST /api/cloud/backups ───────────────────────────────────────
  if (req.method === 'POST' && route === '/backups') {
    let body: { backupTitle?: string; snapshot?: Record<string, unknown>; device?: Record<string, unknown> } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
    const snapshot = body.snapshot || {};
    const workersArr = Array.isArray(snapshot['workers']) ? snapshot['workers'] : [];
    const attArr = Array.isArray(snapshot['attendances']) ? snapshot['attendances'] : [];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const title = String(body.backupTitle || `نسخة سحابية (${now})`).trim();
    const insert = await sbRest(token, 'dortmun_cloud_backups', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        backup_title: title,
        created_by_device_id: String(body.device?.['deviceId'] || ''),
        created_by_device_name: String(body.device?.['deviceName'] || 'جهاز الإدارة'),
        version: Number((snapshot as Record<string, unknown>)['version'] || 1),
        workers_count: workersArr.length,
        attendance_count: attArr.length,
        payload: snapshot,
      }),
    });
    if (!insert.ok) return json(500, { ok: false, error: 'Backup save failed' });
    const created = (await insert.json()) as Array<Record<string, unknown>>;
    const listRes = await sbRest(
      token,
      'dortmun_cloud_backups?select=id,backup_title,created_at,created_by_device_id,created_by_device_name,version,workers_count,attendance_count&order=created_at.desc&limit=20'
    );
    const list = listRes.ok ? ((await listRes.json()) as Array<Record<string, unknown>>) : [];
    const backup = created[0] || {};
    return json(200, {
      ok: true,
      backup: {
        id: backup['id'],
        backupTitle: backup['backup_title'],
        createdAt: backup['created_at'],
        createdByDeviceId: backup['created_by_device_id'],
        createdByDeviceName: backup['created_by_device_name'],
        version: backup['version'],
        workersCount: backup['workers_count'],
        attendanceCount: backup['attendance_count'],
      },
      backups: list.map((b) => ({
        id: b['id'],
        backupTitle: b['backup_title'],
        createdAt: b['created_at'],
        createdByDeviceId: b['created_by_device_id'],
        createdByDeviceName: b['created_by_device_name'],
        version: b['version'],
        workersCount: b['workers_count'],
        attendanceCount: b['attendance_count'],
      })),
    });
  }

  // ── POST /api/cloud/backups/:id/restore ────────────────────────────
  if (req.method === 'POST' && /^\/backups\/\d+\/restore$/.test(route)) {
    const id = route.split('/')[2];
    const res = await sbRest(token, `dortmun_cloud_backups?id=eq.${id}&select=payload`);
    if (!res.ok) return json(500, { ok: false, error: 'Backup not found' });
    const rows = (await res.json()) as Array<{ payload?: unknown }>;
    if (!rows[0]) return json(404, { ok: false, error: 'Backup not found' });
    return json(200, { ok: true, snapshot: rows[0].payload || {} });
  }

  return json(404, { ok: false, error: 'Not found' });
}

export default {
  async fetch(
    request: Request,
    env: DortmunEnv
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/zaki/')) {
      return handleZaki(request, env);
    }
    if (url.pathname.startsWith('/api/cloud/')) {
      return handleCloud(request);
    }
    // Everything else: the static Angular build (SPA fallback is handled
    // by wrangler.jsonc not_found_handling).
    return env.ASSETS.fetch(request);
  },
};
