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
- `POST /chat` → JSON body `{ messages: [{ role, content }], system?, model?, temperature?, stream? }`
  - Non‑stream: returns `{ content, raw }`
  - Stream: set `?stream=1` or body `stream: true`; returns OpenAI SSE as‑is

CORS
- Set `ALLOWED_ORIGINS` in `wrangler.toml`, e.g. `https://jerryz123.github.io,https://your-domain.com`
- The Worker echoes the matching origin in `Access-Control-Allow-Origin`

Notes
- Keep secrets server‑side only. Never put your OpenAI key in the frontend.
- Optional `OPENAI_API_BASE` to use a compatible gateway. Defaults to `https://api.openai.com`.

Example `curl`
curl -X POST "$WORKER_URL/chat" \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{"role":"user","content":"Hello!"}],
    "system": "You are Jerry\'s site bot.",
    "temperature": 0.7
  }'

