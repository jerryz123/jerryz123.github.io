Cloudflare Worker • OpenAI Chat Proxy
=====================================

This Worker holds your private OpenAI API key, accepts chat requests from your GitHub Pages frontend, and forwards them to OpenAI. It adds proper CORS, handles `OPTIONS` preflight, supports optional streaming, and keeps your key off the client.

Quick Start
- Prereqs: Node 18+, `npm i -g wrangler`
- Configure: Edit `wrangler.toml` `[vars]` for your model and allowed origins
- Secrets: `wrangler secret put OPENAI_API_KEY`
- Dev: `wrangler dev`
- Deploy: `wrangler deploy`

Endpoints
- `GET /health` → `{ ok: true }`
- `POST /chat` → JSON body `{ messages: [{ role, content }], system?, model?, stream?, reasoning?, text? }`
  - Non‑stream: returns `{ content, raw }`
  - Stream: set `?stream=1` or body `stream: true`; returns an event stream

CORS
- Set `ALLOWED_ORIGINS` in `wrangler.toml`, e.g. `https://jerryz123.github.io,https://your-domain.com`
- The Worker echoes the matching origin in `Access-Control-Allow-Origin`

Notes
- Keep secrets server‑side only. Never put your OpenAI key in the frontend.
- Optional `OPENAI_API_BASE` to use a compatible gateway. Defaults to `https://api.openai.com`.
- When retrieval is enabled (`VECTOR_STORE_ID` is set), the Worker uses the Responses API and will forward `reasoning` and `text` controls when provided. If the model rejects these parameters (unsupported), the Worker automatically retries once without them.

Reasoning effort and verbosity (Responses API)
- If your Worker is using the Responses API (e.g., retrieval enabled by `VECTOR_STORE_ID`), you can hint the reasoning effort.
- Set an env var in `wrangler.toml`: `REASONING_EFFORT = "minimal"` (default is `minimal`).
- Or pass per‑request: `{ "reasoning": { "effort": "minimal" } }`.
- You can also pass text verbosity per‑request: `{ "text": { "verbosity": "low" } }`. To default it, set `TEXT_VERBOSITY = "low"` in `wrangler.toml`.
 - If the model does not support these controls, the Worker removes them and retries automatically.

Example `curl`
curl -X POST "$WORKER_URL/chat" \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{"role":"user","content":"Hello!"}],
    "system": "You are Jerry\'s site bot.",
    "reasoning": { "effort": "low" },
    "text": { "verbosity": "low" }
  }'
