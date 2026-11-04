/**
 * Dortmun — Zaki AI API as a Netlify Function.
 *
 * WHY THIS FILE EXISTS:
 * The live site on Netlify is static only (publish = dist/app/browser), so the
 * Express server in src/server.ts NEVER runs there and /api/zaki/chat used to
 * return the SPA page — the chat always fell back to the local rule-based
 * engine. This function gives the live site a real /api/zaki/* backend.
 *
 * ── SETUP — REQUIRED BEFORE THE LIVE CHAT CAN ANSWER VIA AI ──────────────
 * 1. In Netlify: Site settings → Environment variables → add GEMINI_API_KEY
 *    with a NEW Gemini API key created in Google AI Studio / Cloud Console
 *    for project 110645591699.
 * 2. NEVER paste that key in chat, in code, or in git — it lives ONLY in the
 *    Netlify environment (and, for local dev, in your local .env as the same
 *    GEMINI_API_KEY variable). Without it, both endpoints answer
 *    { ok:false, mode:'local_fallback' } and the chat keeps working locally.
 * 3. The old hardcoded fallback key in src/server.ts must be REVOKED in
 *    Google Cloud first — removing it from code alone does not help because
 *    it already exists in git history. This function never uses it.
 * 4. netlify.toml rewrites /api/* to this function (see that file).
 *
 * SECURITY:
 * - Gemini key comes ONLY from process.env.GEMINI_API_KEY (never hardcoded).
 * - Every request must carry Authorization: Bearer <Supabase owner JWT>;
 *   the token is verified against Supabase Auth and must belong to the single
 *   owner email. No token / bad token / non-owner → 401.
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
  promptContent: string,
  systemInstruction: string
): Promise<{ text: string; model: string; latencyMs: number } | null> {
  const apiKey = (process.env['GEMINI_API_KEY'] || '').trim();
  if (!apiKey) return null;
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

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Netlify rewrites /api/* → /.netlify/functions/api/*, so the path here is
  // the rewritten one; accept the plain /api/* form too (netlify dev).
  const route = url.pathname
    .replace(/^\/.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';

  if (!(await isOwnerRequest(req))) {
    return json(401, { ok: false, error: 'Missing owner session' });
  }

  // ── GET /api/zaki/status ──────────────────────────────────────────────
  if (req.method === 'GET' && route === '/zaki/status') {
    const apiKey = (process.env['GEMINI_API_KEY'] || '').trim();
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
    const apiKey = (process.env['GEMINI_API_KEY'] || '').trim();
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

    const aiResult = await callGemini(promptContent, systemInstruction);
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
