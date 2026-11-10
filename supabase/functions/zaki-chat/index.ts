// supabase/functions/zaki-chat/index.ts
//
// Zaki AI — Supabase Edge Function (thin owner-only LLM proxy).
//
// PROVIDER CHAIN (2026-11-10): the function tries Apinex first
// (OpenAI-compatible, model free/gpt-6-luna, key APINEX_API_KEY), and
// falls back to Gemini (gemini-2.5-flash, key GEMINI_API_KEY) on ANY
// Apinex failure (no key, non-200, timeout, empty reply). The frontend
// falls back to the local engine if BOTH fail, so the chain is
// Apinex -> Gemini -> local, fully automatic. The response carries
// `provider` ('apinex' | 'gemini') + `model` so the chat can show
// honestly which engine answered.
//
// WHY the keys live here: the Gemini key used to live as a secret on
// the Cloudflare Worker, but the value bound there kept not matching
// the working key. The keys now live ONLY as secrets on this Supabase
// project (`supabase secrets set GEMINI_API_KEY=...` / `APINEX_API_KEY=...`),
// and the Worker (src/worker.ts) forwards the owner's JWT + the
// already-built prompt here. This function verifies the owner a second
// time, calls the LLM, and returns the result. It never logs a key.
//
// CONTRACT (called only by the Cloudflare Worker, never by the browser):
//   POST { systemInstruction, promptContent }
//     -> { ok:true, text, model, provider, latencyMs, action? }
//     -> { ok:false, status:'no_key' }                 (neither secret set)
//     -> { ok:false, status:'both_failed',
//          apinexStatus, apinexError, geminiStatus, geminiError }
//   Any non-owner caller -> 401 { ok:false, error:'Missing owner session' }.
//   The Worker maps these onto the exact /api/zaki/* shapes the Zaki chat
//   frontend already expects, so the frontend needs no change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4';

const OWNER_EMAIL = 'gqikdubrjntorldfieo36@gmail.com';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15000;
// Apinex is tried FIRST and gets a shorter budget so the Gemini fallback
// still fits inside the frontend's 30s chat timeout (10s + 15s + overhead).
const APINEX_MODEL = 'free/gpt-6-luna';
const APINEX_URL = 'https://api.apinex.bond/v1/chat/completions';
const APINEX_TIMEOUT_MS = 10000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Structured action contract (the Worker tells Gemini about it in the
// system instruction): when the user asks to record/change money data,
// Gemini replies with JSON {"reply": "...", "action": {...}} instead of
// plain text. The frontend turns `action` into the same confirmation card
// the local engine uses — nothing executes without the owner's tap on
// «تأكيد وتنفيذ فوراً». If the reply is not valid JSON, or the action
// type is unknown, the raw text is returned with action null (safe).
const API_ACTION_TYPES = new Set([
  'record_pocket_withdrawal',
  'record_custodian_transfer',
  'record_advance',
  'record_expense',
  'record_incoming_payment',
  'record_check',
  // Display / edit / delete: the AI can now propose deleting a record
  // (by id, resolved from the context summary the frontend attaches)
  // and editing a worker rate or a check status. The frontend validates
  // the record exists before showing the confirmation card, and nothing
  // executes without the owner's tap — same golden rule as the adds.
  'delete_record',
  'update_worker_rate',
  'update_check_status',
  // Bulk: several workers in one message, each with their own advance +
  // night + worked flags. The frontend validates every entry's workerId.
  'record_bulk',
]);

// Extract a balanced {...} object starting at `start`, tracking strings
// and escapes, so prose around the JSON can't break the extraction.
function extractBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Gemini often emits real line breaks inside the reply string value,
// which makes JSON.parse fail. Escape control characters that appear
// inside strings (structural whitespace outside strings is untouched).
function repairJsonStrings(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

// Safety net: the user must never see a raw JSON block. If Gemini wrapped
// its answer in prose + JSON and parsing failed, drop the JSON part and
// show the prose only.
function stripJsonBlock(text: string): string {
  const idx = text.indexOf('{"reply"');
  if (idx < 0) return text;
  const before = text.slice(0, idx).trim();
  if (!before) {
    return 'وصلني طلبك، بس الرد جه بصيغة مش مقروءة — ممكن تعيد الطلب تاني؟';
  }
  return before;
}

function parseStructuredReply(
  text: string,
): { reply: string; action: unknown } | null {
  let candidate = text.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidate = fenced[1].trim();
  // Gemini often wraps the JSON in prose ("إليك الرد: {...}"). Find the
  // JSON object (it always starts with {"reply") wherever it sits.
  let jsonText: string | null = null;
  if (candidate.startsWith('{')) {
    jsonText = extractBalancedObject(candidate, 0);
  } else {
    const idx = candidate.indexOf('{"reply"');
    if (idx >= 0) jsonText = extractBalancedObject(candidate, idx);
  }
  if (!jsonText) return null;
  for (const attempt of [jsonText, repairJsonStrings(jsonText)]) {
    try {
      const parsed = JSON.parse(attempt) as {
        reply?: unknown;
        action?: unknown;
      };
      if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) continue;
      // A bad action is dropped, not a reason to lose the whole reply.
      const rawAction = parsed.action ?? null;
      const actionValid =
        rawAction === null ||
        (typeof rawAction === 'object' &&
          typeof (rawAction as { type?: unknown }).type === 'string' &&
          API_ACTION_TYPES.has((rawAction as { type: string }).type));
      return {
        reply: parsed.reply.trim(),
        action: actionValid ? rawAction : null,
      };
    } catch {
      // Try the repaired form next.
    }
  }
  return null;
}

type LlmResult =
  | {
      ok: true;
      text: string;
      model: string;
      provider: 'apinex' | 'gemini';
      latencyMs: number;
      action?: unknown;
    }
  | {
      ok: false;
      provider: 'apinex' | 'gemini';
      status: number;
      error: string;
    };

async function callGemini(
  apiKey: string,
  promptContent: string,
  systemInstruction: string,
): Promise<LlmResult> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
        errText = String(
          errData?.error?.message || errData?.error?.status || '',
        ).slice(0, 200);
      } catch {
        errText = '';
      }
      return {
        ok: false,
        provider: 'gemini',
        status: resp.status,
        error: errText || `HTTP ${resp.status}`,
      };
    }
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || ''
    ).trim();
    if (!text) {
      return { ok: false, provider: 'gemini', status: 200, error: 'empty reply' };
    }
    const structured = parseStructuredReply(text);
    if (structured) {
      return {
        ok: true,
        text: structured.reply,
        action: structured.action,
        model: GEMINI_MODEL,
        provider: 'gemini',
        latencyMs: Date.now() - t0,
      };
    }
    // No structured action: show the reply, never a raw JSON block.
    return {
      ok: true,
      text: stripJsonBlock(text),
      action: null,
      model: GEMINI_MODEL,
      provider: 'gemini',
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    const timedOut =
      e instanceof Error &&
      (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      ok: false,
      provider: 'gemini',
      status: 0,
      error: timedOut ? 'timeout' : 'fetch failed',
    };
  }
}

// Apinex (OpenAI-compatible gateway). Same prompt contract as Gemini:
// the system instruction + user prompt go in as chat messages, and the
// reply text goes through the same structured-action parser. Any failure
// (non-200, timeout, empty reply) returns ok:false so the caller can
// fall back to Gemini — the key is never logged or returned.
async function callApinex(
  apiKey: string,
  promptContent: string,
  systemInstruction: string,
): Promise<LlmResult> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APINEX_TIMEOUT_MS);
    const resp = await fetch(APINEX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: APINEX_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptContent },
        ],
        temperature: 0.35,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      let errText = '';
      try {
        const errData = (await resp.json()) as {
          error?: { message?: string; code?: string };
        };
        errText = String(
          errData?.error?.message || errData?.error?.code || '',
        ).slice(0, 200);
      } catch {
        errText = '';
      }
      return {
        ok: false,
        provider: 'apinex',
        status: resp.status,
        error: errText || `HTTP ${resp.status}`,
      };
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = String(
      data?.choices?.[0]?.message?.content || '',
    ).trim();
    if (!text) {
      return { ok: false, provider: 'apinex', status: 200, error: 'empty reply' };
    }
    const structured = parseStructuredReply(text);
    if (structured) {
      return {
        ok: true,
        text: structured.reply,
        action: structured.action,
        model: APINEX_MODEL,
        provider: 'apinex',
        latencyMs: Date.now() - t0,
      };
    }
    return {
      ok: true,
      text: stripJsonBlock(text),
      action: null,
      model: APINEX_MODEL,
      provider: 'apinex',
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    const timedOut =
      e instanceof Error &&
      (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      ok: false,
      provider: 'apinex',
      status: 0,
      error: timedOut ? 'timeout' : 'fetch failed',
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Owner-only: the caller must present the owner's Supabase JWT.
  const token = (req.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) return json(401, { ok: false, error: 'Missing owner session' });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || (user?.email || '').toLowerCase() !== OWNER_EMAIL) {
    return json(401, { ok: false, error: 'Missing owner session' });
  }

  let body: { systemInstruction?: string; promptContent?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const systemInstruction = String(body.systemInstruction || '');
  const promptContent = String(body.promptContent || '');
  if (!promptContent) {
    return json(200, {
      ok: false,
      status: 'both_failed',
      apinexStatus: 400,
      apinexError: 'empty prompt',
      geminiStatus: 400,
      geminiError: 'empty prompt',
    });
  }

  // Provider chain: Apinex first, Gemini on ANY Apinex failure. The
  // frontend falls back to the local engine if both fail, so the user
  // always gets an answer. `no_key` only when NEITHER secret is set.
  const apinexKey = (Deno.env.get('APINEX_API_KEY') || '').trim();
  const geminiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!apinexKey && !geminiKey) {
    return json(200, { ok: false, status: 'no_key' });
  }

  let apinexFailure: { status: number; error: string } | null = null;
  if (apinexKey) {
    const apinex = await callApinex(apinexKey, promptContent, systemInstruction);
    if (apinex.ok) {
      return json(200, {
        ok: true,
        text: apinex.text,
        action: apinex.action ?? null,
        model: apinex.model,
        provider: apinex.provider,
        latencyMs: apinex.latencyMs,
      });
    }
    apinexFailure = { status: apinex.status, error: apinex.error };
  }
  if (geminiKey) {
    const gemini = await callGemini(geminiKey, promptContent, systemInstruction);
    if (gemini.ok) {
      return json(200, {
        ok: true,
        text: gemini.text,
        action: gemini.action ?? null,
        model: gemini.model,
        provider: gemini.provider,
        latencyMs: gemini.latencyMs,
      });
    }
    return json(200, {
      ok: false,
      status: 'both_failed',
      apinexStatus: apinexFailure?.status ?? 0,
      apinexError: apinexFailure?.error ?? (apinexKey ? '' : 'no_key'),
      geminiStatus: gemini.status,
      geminiError: gemini.error,
    });
  }
  // Apinex was the only key and it failed.
  return json(200, {
    ok: false,
    status: 'both_failed',
    apinexStatus: apinexFailure?.status ?? 0,
    apinexError: apinexFailure?.error ?? '',
    geminiStatus: 0,
    geminiError: 'no_key',
  });
});
