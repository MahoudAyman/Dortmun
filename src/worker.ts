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
const GEMINI_TIMEOUT_MS = 6000;

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
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const user = (await res.json()) as { email?: string };
    return (user.email || '').toLowerCase() === OWNER_EMAIL;
  } catch {
    return false;
  }
}

async function callGemini(
  apiKey: string,
  promptContent: string,
  systemInstruction: string
): Promise<{ text: string; model: string; latencyMs: number } | null> {
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
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || ''
    ).trim();
    if (!text) return null;
    return { text, model: GEMINI_MODEL, latencyMs: Date.now() - t0 };
  } catch {
    return null;
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
    if (result) {
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
    if (aiResult && aiResult.text) {
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
    });
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
    // Everything else: the static Angular build (SPA fallback is handled
    // by wrangler.jsonc not_found_handling).
    return env.ASSETS.fetch(request);
  },
};
