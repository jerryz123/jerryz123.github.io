Cloudflare Worker • OpenAI Chat Proxy
=====================================

This Worker holds your private OpenAI API key, accepts chat requests from your GitHub Pages frontend, and forwards them to OpenAI. It adds proper CORS, handles `OPTIONS` preflight, returns an SSE stream to the frontend, and keeps your key off the client.

Quick Start
- Prereqs: Node 18+, `npm i -g wrangler`
- Configure: Edit `wrangler.toml` `[vars]` for your model defaults and allowed origins
- Secrets: `wrangler secret put OPENAI_API_KEY`
- Dev: `wrangler dev`
- Deploy: `wrangler deploy`

Endpoints
- `GET /health` → `{ ok: true }`
- `POST /chat` → JSON body `{ messages: [{ role, content }], model?, reasoning?, text? }`
  - Returns an event stream compatible with the frontend's existing SSE parser

CORS
- Set `ALLOWED_ORIGINS` in `wrangler.toml`, e.g. `https://jerryz123.github.io,https://your-domain.com`
- The Worker echoes the matching origin in `Access-Control-Allow-Origin`

Notes
- Keep secrets server‑side only. Never put your OpenAI key in the frontend.
- Optional `OPENAI_API_BASE` to use a compatible gateway. Defaults to `https://api.openai.com`.
- The Worker always uses the OpenAI Responses API. When retrieval is enabled (`VECTOR_STORE_ID` is set), it adds a `file_search` tool to the request.
- The default repo configuration uses `gpt-5.4-mini` for fast requests. The frontend settings toggle switches to `gpt-5.4` and also raises reasoning/verbosity tuning.

Reasoning effort and verbosity (Responses API)
- Set env defaults in `wrangler.toml`, e.g. `REASONING_EFFORT = "low"` and `TEXT_VERBOSITY = "low"`.
- Or pass them per request: `{ "reasoning": { "effort": "medium" }, "text": { "verbosity": "medium" } }`.
- The frontend now does this automatically when the user enables the slower reasoning mode.

Example `curl`
curl -X POST "$WORKER_URL/chat" \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{"role":"user","content":"Hello!"}],
    "model": "gpt-5.4-mini",
    "reasoning": { "effort": "low" },
    "text": { "verbosity": "low" }
  }'
