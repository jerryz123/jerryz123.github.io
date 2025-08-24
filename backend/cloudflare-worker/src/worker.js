// Cloudflare Worker: OpenAI Chat proxy with CORS + optional streaming
// - POST /chat  { messages:[{role,content}], system?, model?, temperature?, stream? }
// - GET  /health

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
      let body;
      try { body = await req.json(); } catch { body = {}; }

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const system = typeof body.system === 'string' ? body.system : undefined;
      const model = (body.model || env.MODEL || 'gpt-4o-mini') + '';
      const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;
      const stream = url.searchParams.get('stream') === '1' || body.stream === true;

      if (!messages.length && !system) {
        return json({ error: 'No messages provided' }, cors, 400);
      }

      const chatMessages = [];
      if (system) chatMessages.push({ role: 'system', content: system.slice(0, 4000) });
      for (const m of messages) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') continue;
        chatMessages.push({ role: m.role, content: m.content.slice(0, 8000) });
      }

      const payload = {
        model,
        messages: chatMessages,
        temperature,
        stream,
      };

      const base = (env.OPENAI_API_BASE || 'https://api.openai.com').replace(/\/$/, '');
      const upstream = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        return json({ error: 'OpenAI error', details: errText }, cors, 502);
      }

      if (stream) {
        // Pass through OpenAI SSE stream
        const headers = new Headers({
          ...cors,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive',
        });
        return new Response(upstream.body, { status: 200, headers });
      }

      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return json({ content, raw: data }, cors);
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
      'Cache-Control': 'no-store',
    },
  });
}

