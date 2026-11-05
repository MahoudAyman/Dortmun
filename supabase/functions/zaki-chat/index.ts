// supabase/functions/zaki-chat/index.ts
//
// Zaki AI — Supabase Edge Function (thin owner-only Gemini proxy).
//
// WHY: the Gemini key used to live as a secret on the Cloudflare Worker,
// but the value bound there kept not matching the working key (the Worker
// kept getting HTTP 401 "API key not valid" from Google even after the
// secret was rotated twice). The key now lives ONLY as a secret on this
// Supabase project (`supabase secrets set GEMINI_API_KEY=...`), and the
// Worker (src/worker.ts) forwards the owner's JWT + the already-built
// prompt here. This function verifies the owner a second time, calls
// Google, and returns the result. It never logs the key.
//
// CONTRACT (called only by the Cloudflare Worker, never by the browser):
//   POST { systemInstruction, promptContent }
//     -> { ok:true, text, model, latencyMs }
//     -> { ok:false, geminiStatus, geminiError }   (Google rejected the call)
//     -> { ok:false, status:'no_key' }             (secret not set)
//   Any non-owner caller -> 401 { ok:false, error:'Missing owner session' }.
//   The Worker maps these onto the exact /api/zaki/* shapes the Zaki chat
//   frontend already expects, so the frontend needs no change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4';

const OWNER_EMAIL = 'gqikdubrjntorldfieo36@gmail.com';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type GeminiResult =
  | { ok: true; text: string; model: string; latencyMs: number }
  | { ok: false; geminiStatus: number; geminiError: string; status?: string };

async function callGemini(
  apiKey: string,
  promptContent: string,
  systemInstruction: string,
): Promise<GeminiResult> {
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
        geminiStatus: resp.status,
        geminiError: errText || `HTTP ${resp.status}`,
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
      return { ok: false, geminiStatus: 200, geminiError: 'empty reply' };
    }
    return { ok: true, text, model: GEMINI_MODEL, latencyMs: Date.now() - t0 };
  } catch (e) {
    const timedOut =
      e instanceof Error &&
      (e.name === 'AbortError' || e.name === 'TimeoutError');
    return {
      ok: false,
      geminiStatus: 0,
      geminiError: timedOut ? 'timeout' : 'fetch failed',
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

  const apiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!apiKey) {
    return json(200, { ok: false, status: 'no_key' });
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
      geminiStatus: 400,
      geminiError: 'empty prompt',
    });
  }
  return json(200, await callGemini(apiKey, promptContent, systemInstruction));
});
