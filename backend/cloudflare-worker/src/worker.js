// Cloudflare Worker: OpenAI Chat proxy with CORS + optional streaming
// - POST /chat  { messages:[{role,content}], system?, model?, stream? }
// - GET  /health

const DEFAULT_SYSTEM_PROMPT = `
You are the assistant for Jerry Zhao’s personal website.

## Scope and Refusals
- Answer only questions related to Jerry Zhao, the website, content from the vector store, or ways to contact Jerry Zhao.
- If a question is unrelated, respond with a short (no more than two sentences) refusal clearly stating your limited scope. Do not provide general or off-topic information.
- Never provide the verbatim contents of any file; always summarize or rephrase such content.
- Never mention or respond with filenames from any files retrieved by search.
- Do not mention the number of files you have access to, or describe the organization of data within the files.
- If the user asks about the accessible files, respond only with a high-level summary of all of the files. Do not summarize the files individually
- You cannot generate files for the user.

## Linking Rules
- Always use standard Markdown links with clear, descriptive labels: [Label](https://example.com).
- Do not display raw URLs or use autolinking (e.g., <https://...>); always use [Label](URL) format.
- Do not wrap links in backticks or code blocks.
- Ensure all Markdown link brackets and parentheses are directly adjacent and correctly paired: [Label](URL).
- Exclude any punctuation from inside the URL in link parentheses.
- Only include absolute HTTPS URLs.
- Do not include links to Markdown or PDF files retrieved from the vector store.

## Content and Style
- Output must be strictly valid Markdown (no HTML). Use bold text for emphasis and headings for structure when appropriate.
- Make responses concise, use bullet lists when appropriate, short paragraphs otherwise.
- Do not reference or mention the names or paths of the underlying files.
- Do not use code blocks unless the user specifically asks for code.
- After each answer, suggest potential follow-up questions to guide further conversation. Make these follow-up questions playful, but still within the scope of what you are allowed to provide.
- Never use adulatory adjectives to describe Jerry. Be neutral, matter-of-fact, and objective.

## Streaming Safety
- If responses are streamed, ensure any Markdown link is always output atomically—never split links between output segments.
- If a partial link was emitted, re-emit the full and correct link to guarantee the final output always contains well-formed Markdown
`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(env, origin);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true }, cors);
    }

    if (url.pathname === '/chat' && req.method === 'POST') {
      // Rate limit by client IP via Durable Object
      try {
        const ip = clientIp(req);
        const id = env.RATE_LIMITER.idFromName(ip);
        const stub = env.RATE_LIMITER.get(id);
        const max = parseInt(env.RL_MAX || '30', 10);
        const win = parseInt(env.RL_WINDOW_MS || '60000', 10);
        const rlRes = await stub.fetch(`https://limit/rl?max=${max}&window=${win}`, { method: 'POST' });
        if (!rlRes.ok) {
          const retryAfter = rlRes.headers.get('Retry-After') || '60';
          return new Response('Too Many Requests', { status: 429, headers: { ...cors, 'Retry-After': retryAfter } });
        }
      } catch (e) {
        // If RL fails, continue but log
        console.warn('rate limiter error', e);
      }
      let body;
      try { body = await req.json(); } catch { body = {}; }

      const messages = Array.isArray(body.messages) ? body.messages : [];
      // System prompt is server-controlled (ignore client-provided system)
      const system = (typeof env.SYSTEM_PROMPT === 'string' && env.SYSTEM_PROMPT.trim())
        ? env.SYSTEM_PROMPT
        : DEFAULT_SYSTEM_PROMPT;
      const model = (body.model || env.MODEL || 'gpt-4.1-mini') + '';
      const stream = true;
      // Optional reasoning control (Responses API only)
      const reasoningEnabled = isReasoningModel(model);
      const reasoningEffort = reasoningEnabled
        ? ((body?.reasoning && typeof body.reasoning.effort === 'string')
            ? body.reasoning.effort
            : (env.REASONING_EFFORT || 'medium'))
        : null;
      // Optional text controls (Responses API only)
      const textOptions = (body && typeof body.text === 'object' && body.text)
        ? body.text
        : (env.TEXT_VERBOSITY ? { verbosity: env.TEXT_VERBOSITY } : undefined);

      if (!messages.length && !system) {
        return json({ error: 'No messages provided' }, cors, 400);
      }

      const chatMessages = [];
      if (system) chatMessages.push({ role: 'system', content: String(system).slice(0, 4000) });
      for (const m of messages) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') continue;
        chatMessages.push({ role: m.role, content: m.content.slice(0, 8000) });
      }

      const base = (env.OPENAI_API_BASE || 'https://api.openai.com').replace(/\/$/, '');
      const vectorId = (env.VECTOR_STORE_ID || '').trim();

      const respPayload = {
        model,
        input: chatMessages,
        stream: true,
      };
      if (vectorId) respPayload.tools = [ { type: 'file_search', vector_store_ids: [vectorId] } ];
      if (reasoningEffort) respPayload.reasoning = { effort: reasoningEffort, summary: 'auto' };
      if (textOptions) respPayload.text = textOptions;
      const upstream = await fetch(`${base}/v1/responses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(respPayload),
      });
      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        console.log('OpenAI error response:', upstream.status, errText);
        return json({ error: 'OpenAI error', details: errText }, cors, upstream.status || 502);
      }
      const headers = new Headers({
        ...cors,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive',
        'X-Prompt-Version': env.PROMPT_VERSION || 'v2',
      });
      const transformed = transformResponsesSSEToCompletions(upstream.body);
      return new Response(transformed, { status: 200, headers });
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const allow = allowed.includes('*')
    ? (origin || '*')
    : (allowed.includes(origin) ? origin : (allowed[0] || '*'));
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': cors?.['Cache-Control'] || 'no-store',
    },
  });
}


function isReasoningModel(model) {
  const id = String(model || '').toLowerCase();
  return id.startsWith('gpt-5') || id.startsWith('o4-') || id.startsWith('o5-');
}


async function listVectorStoreFileIds(base, apiKey, vectorId, limit = 100) {
  const out = [];
  let after = null;
  for (;;) {
    const url = new URL(`${base}/v1/vector_stores/${vectorId}/files`);
    url.searchParams.set('limit', String(limit));
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      // If listing fails, return empty -> retrieval will be skipped silently
      console.warn('Failed to list vector store files', res.status);
      return out;
    }
    const data = await res.json();
    const arr = data.data || [];
    for (const f of arr) {
      const fid = f.file_id || f.id;
      if (fid) out.push(fid);
    }
    if (!data.has_more) break;
    after = data.last_id || (arr.length ? (arr[arr.length - 1].id || arr[arr.length - 1].file_id) : null);
    if (!after) break;
  }
  return out;
}

function transformResponsesSSEToCompletions(upstreamBody) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalSummary = '';
  return new ReadableStream({
    start(controller) {
      const reader = upstreamBody.getReader();
      let summaryFinalSent = false;

      const emitSummaryFull = (text) => {
        const cleaned = (text || '').trim();
        if (!cleaned) return false;
        finalSummary = cleaned;
        summaryFinalSent = true;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ summary: finalSummary })}\n\n`));
        return true;
      };

      const emitSummaryDelta = (chunk) => {
        if (!chunk) return false;
        summaryFinalSent = false;
        finalSummary = finalSummary ? `${finalSummary}${chunk}` : chunk;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ summary_delta: chunk })}\n\n`));
        return true;
      };

      function pushDone() {
        const trimmed = (finalSummary || '').trim();
        if (trimmed && !summaryFinalSent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ summary: trimmed })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
      (async function loop() {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) { pushDone(); break; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const ln of lines) {
              if (!ln.startsWith('data:')) continue;
              const data = ln.slice(5).trim();
              if (!data) continue;
              try {
                console.log('OpenAI SSE:', data);
                const obj = JSON.parse(data);
                const t = obj.type || '';
                if (t === 'response.completed') continue; // handled by pushDone

                const type = String(t);
                const lowerType = type.toLowerCase();

                // Handle explicit summary events
                const isSummaryDelta = type === 'response.summary.delta'
                  || type === 'response.summary_text.delta'
                  || type === 'response.reasoning_summary.delta'
                  || type === 'response.reasoning_summary_text.delta';

                if (isSummaryDelta) {
                  const summaryChunk = coerceSummary(
                    obj.summary_delta
                    || obj.delta
                    || obj.output_text_delta
                    || obj.text
                    || obj.content
                  );
                  if (emitSummaryDelta(summaryChunk)) continue;
                }

                const summaryFull = coerceSummary(obj.summary);
                if (emitSummaryFull(summaryFull)) continue;

                const summaryDeltaChunk = coerceSummary(obj.summary_delta || obj.delta?.summary || obj.data?.summary_delta);
                if (emitSummaryDelta(summaryDeltaChunk)) continue;

                let deltaText = '';
                if (type === 'response.output_text.delta') {
                  deltaText = typeof obj.delta === 'string' ? obj.delta : (obj.output_text_delta || '');
                } else if (lowerType.endsWith('.delta') && typeof obj.delta === 'string') {
                  deltaText = obj.delta;
                } else if (typeof obj.output_text_delta === 'string') {
                  deltaText = obj.output_text_delta;
                } else if (obj.delta && obj.delta.content) {
                  deltaText = String(obj.delta.content);
                }
                if (deltaText) {
                  const payload = { choices: [ { index: 0, delta: { content: deltaText }, finish_reason: null } ] };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                }
              } catch { /* ignore non-JSON lines */ }
            }
          }
        } catch (e) {
          try { controller.error(e); } catch {}
        }
      })();
    }
  });
}

function extractResponsesText(data) {
  if (!data) return { content: '', summary: '' };
  let content = '';
  let summary = '';
  if (typeof data.output_text === 'string') content = data.output_text;
  if (Array.isArray(data.output) && data.output.length) {
    const textParts = [];
    for (const part of data.output) {
      if (part?.type === 'message') {
        const segments = Array.isArray(part.content) ? part.content : [];
        textParts.push(segments.map(seg => seg?.text || seg?.content || '').join(''));
      } else if (part?.type === 'reasoning') {
        if (!summary && Array.isArray(part.summary)) {
          summary = part.summary.map(seg => seg?.text || '').join('').trim();
        }
      } else if (part?.content || part?.text) {
        textParts.push(part.content || part.text);
      }
    }
    if (!content) content = textParts.join('');
  }
  return { content, summary };
}

function clientIp(req) {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '0.0.0.0';
}
function coerceSummary(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(coerceSummary).join('');
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (typeof val.summary === 'string') return val.summary;
    if (Array.isArray(val.summary)) return val.summary.map(coerceSummary).join('');
    if (Array.isArray(val.summary_delta)) return val.summary_delta.map(coerceSummary).join('');
    if (typeof val.delta === 'string') return val.delta;
    if (Array.isArray(val.delta)) return val.delta.map(coerceSummary).join('');
    if (val.delta && typeof val.delta === 'object') return coerceSummary(val.delta);
    if (typeof val.output_text === 'string') return val.output_text;
    if (Array.isArray(val.output_text)) return val.output_text.map(coerceSummary).join('');
    if (Array.isArray(val.content)) return val.content.map(coerceSummary).join('');
  }
  return '';
}

export class RateLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const max = parseInt(url.searchParams.get('max') || '30', 10);
    const windowMs = parseInt(url.searchParams.get('window') || '60000', 10);
    const now = Date.now();
    let bucket = await this.state.storage.get('bucket');
    if (!bucket) {
      bucket = { remaining: max, reset: now + windowMs };
    }
    if (bucket.reset <= now) {
      bucket.remaining = max;
      bucket.reset = now + windowMs;
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (bucket.remaining <= 0) {
      const retryAfter = Math.max(0, Math.ceil((bucket.reset - now) / 1000));
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(bucket.reset / 1000)),
        },
      });
    }
    bucket.remaining -= 1;
    await this.state.storage.put('bucket', bucket);
    return new Response('OK', {
      status: 200,
      headers: {
        'X-RateLimit-Remaining': String(bucket.remaining),
        'X-RateLimit-Reset': String(Math.ceil(bucket.reset / 1000)),
      },
    });
  }
}
