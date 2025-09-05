# Project Guide for Agents

This repo contains a static GitHub Pages site that resembles a ChatGPT home screen (sidebar chats + prompt) and an optional Cloudflare Worker backend to proxy requests to the OpenAI API securely.

Use this doc to quickly understand structure, behaviors, and how to extend or deploy.

## Overview
- Frontend: Pure static HTML/CSS/JS served by GitHub Pages from repo root.
- Backend: Cloudflare Worker (in `backend/cloudflare-worker`) that holds the OpenAI key, exposes `/chat`, and handles CORS and streaming.
- Persistence: Chats and a lightweight reply cache are stored in `localStorage`.
- Landing flow: The site starts with no active chat; sending a message creates a new chat and activates it. “New Chat” and the brand return to the landing page with no active chat.

## Repo Structure
- `index.html` — Main HTML shell; sidebar + main + composer.
- `styles.css` — Dark theme UI, responsive layout, sidebar, markdown styles.
- `app.js` — App logic: chats, persistence, caching, backend calls, UI behaviors.
- `config.js` — Frontend config: sets `window.API_BASE` (Worker URL). Public, no secrets.
- `assets/headshot.jpg` — Headshot image used on the landing section.
- `.nojekyll` — Ensures GitHub Pages serves files as-is.
- `backend/cloudflare-worker/` — Cloudflare Worker scaffold.
  - `wrangler.toml` — Worker configuration and env vars.
- `src/worker.js` — Worker code: `POST /chat`, `GET /health`, CORS, SSE streaming; optional retrieval via Responses API.
- `README.md` — Setup and deploy instructions for the Worker.
- `database/files/` — Public text/Markdown/PDF sources used for retrieval (synced to OpenAI Vector Store; respects `.gitignore`).
- `database/` — Vector store scripts: `sync-vector-store.mjs`, `list-vector-store.mjs` and content under `database/files/`.

## Frontend Details
Key behaviors in `app.js`:
- Initial state: No active chat (`currentId = null`), landing section is visible.
- Create on first send: When sending from landing, a new chat is created and becomes active.
- New Chat / Brand action: Both call `goToLanding()` which clears the active chat (landing is shown). No chat is created until the user sends.
- Clear Chats: Clears all chats and the reply cache, then returns to landing.
- Sidebar: Chat titles are derived from the first user message (truncated). Buttons left-aligned, ellipsis overflow, and sized to stay within the column.
- Welcome visibility: The landing section (photo, greeting, suggestions) is hidden whenever there is an active chat; shown otherwise.
- Markdown: Assistant messages are rendered via `marked` + sanitized by `DOMPurify`. Libraries are loaded from CDN in `index.html`.
- System prompt is server-controlled in the Worker (`SYSTEM_PROMPT` and `PROMPT_VERSION` in `wrangler.toml`). The frontend no longer sends a `system` field. Prompt v2 rejects unrelated requests and applies the “Absolute Diagnostic Mode” rules.
 - Retrieval: If `VECTOR_STORE_ID` is set, the Worker calls OpenAI Responses API with `tools: [{ type: "file_search", vector_store_ids: [VECTOR_STORE_ID] }]` and streams results; events are transformed into Chat Completions–style deltas for the frontend.
- Persistence: Chats are stored in `localStorage` under `jz_site_chats_v1`.
- Reply cache: Stores assistant replies keyed by a hash of the conversation up to the last user message (`jz_site_reply_cache_v2`). Prevents duplicate backend calls on refresh/resend.
- Keyboard: Enter submits, Shift+Enter inserts newline.

Configuration in `config.js`:
- Set `window.API_BASE` to your deployed Worker URL (e.g., `https://jz-chat-worker.<subdomain>.workers.dev`). Do not put secrets here.

Markdown libraries in `index.html`:
- `DOMPurify` and `marked` are currently loaded from jsDelivr without SRI to avoid integrity mismatches. If stricter supply-chain controls are required, vendor these libs into `assets/` and update the script tags accordingly.

## Backend (Cloudflare Worker)
Location: `backend/cloudflare-worker`

What it does:
- `POST /chat` forwards a Chat Completions request to OpenAI using the server-side `OPENAI_API_KEY`. It prepends the server-owned system prompt and streams tokens when `?stream=1` (frontend uses this by default).
- `GET /health` returns `{ ok: true }` for sanity checks.
- CORS: Allows origins in `ALLOWED_ORIGINS` (comma-separated). Handles `OPTIONS` preflight.

Setup (summary; see the README in that folder for details):
1) `npm i -g wrangler`
2) `cd backend/cloudflare-worker`
3) `wrangler secret put OPENAI_API_KEY`
4) Edit `wrangler.toml`:
   - `MODEL` (use a fine-tuned model id if available)
   - `ALLOWED_ORIGINS` (include `https://<user>.github.io` and any custom domain)
   - `SYSTEM_PROMPT`, `PROMPT_VERSION` (server-owned prompt + version)
   - Rate limiting: ensure the Durable Object migration uses `new_sqlite_classes` on free plan; tune `RL_MAX`, `RL_WINDOW_MS`.
5) `wrangler deploy`
6) Copy the `*.workers.dev` URL and set it in `config.js` as `window.API_BASE`.

Notes:
- Secrets remain server-side; the frontend never sees them.
- Ensure your backend uses HTTPS and correct CORS to be callable from GitHub Pages.

## Deploying Frontend (GitHub Pages)
- This is a user site repo (e.g., `<user>.github.io`). Pages serves the root automatically when pushed to the default branch.
- `.nojekyll` is present so any files like `_something/*` would be served as-is.
- Local preview without a server can cause CORS origin to be `null`. Use a local server for testing, e.g.: `python3 -m http.server 8000` and (optionally) include this origin in `ALLOWED_ORIGINS` while testing.

## Current UX Summary
- Start on landing (no active chat). Headshot, “Hi, I’m Jerry”, and suggestions are visible.
- Type in the composer and press Enter → new chat is created and becomes active; landing hides.
- Sidebar shows chats; long titles are truncated with ellipsis.
- Click a chat to switch; click “New Chat” or the brand to return to landing (no active chat).
- “Clear Chats” wipes history and the reply cache.
- Assistant responses render Markdown safely and stream token-by-token.

## Known Trade-offs / TODOs
- Abuse controls: Consider Cloudflare Turnstile verification in addition to the per-IP rate limiter.
- Library sourcing: Consider vendoring `marked` and `DOMPurify` to avoid runtime CDN dependency.
- Error UX: Errors are shown inside the last assistant bubble; could be promoted to a toast.
- Mobile polish: Sidebar collapse is basic; could add slide-in behavior.
- 404: Consider adding `404.html`.

## Storage Keys
- Chats: `localStorage['jz_site_chats_v1']`
- Reply cache: `localStorage['jz_site_reply_cache_v2']`

## Quick Commands
- Local preview: `python3 -m http.server 8000`
- Worker dev: `cd backend/cloudflare-worker && wrangler dev`
- Worker deploy: `cd backend/cloudflare-worker && wrangler deploy`
- Set secret: `wrangler secret put OPENAI_API_KEY`

## Extension Pointers
- To add streaming in the frontend:
  - Call `${API_BASE}/chat?stream=1` and read `res.body` via `ReadableStream`.
  - Parse lines starting with `data:`; accumulate `choices[0].delta.content`.
  - Update the assistant bubble incrementally.
- To change model per request: include `model` in the body of `POST /chat`.
- To reset caches on model changes: bump `CACHE_KEY` and/or `STORAGE_KEY` versions.

---
This doc should be enough context for another agent (or future you) to resume work quickly, deploy the backend, wire the frontend, and implement enhancements like streaming, rate limiting, or offline-friendly behavior.
