# Jerry Zhao — Personal Site

A minimal, ChatGPT‑style personal website with a sidebar of chats on the left and a prompt composer at the bottom. The frontend is static and can be hosted on GitHub Pages. A Cloudflare Worker backend securely calls the OpenAI API (your key stays server‑side) and streams responses.

## Features
- Chat UI with a left sidebar
- Create chats on first send; return to landing via New Chat or the brand
- Local persistence (saved in your browser); Clear Chats button to reset (no confirmation)
- Remembers the active chat across refreshes (you return to the same chat)
- Markdown rendering for assistant messages (via marked + DOMPurify)
- Streaming replies render as Markdown as they arrive
- Backend proxy on Cloudflare Workers for OpenAI API calls (server-side system prompt, CORS, per‑IP rate limiting)
- Retrieval: Optional OpenAI Vector Store (files in `database/`) used via Responses API `file_search`

## Using The Site
- Start on the landing page (photo, greeting, suggestions)
- Type a message and press Enter to create your first chat
- Click chats in the sidebar to switch between them
- Click “New Chat” or the site name/avatar to go back to the landing page
- Click “Clear Chats” to erase local history

## Run Locally
You can open `index.html` directly in a browser, but for best results use a local server so CORS behaves like production:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Without a backend configured, sending a message will show an error. To enable real responses, configure the Worker URL below.

## Backend
A Cloudflare Worker keeps your OpenAI API key private, adds CORS/streaming, and can enable retrieval from an OpenAI Vector Store:

- Location: `backend/cloudflare-worker`
- Endpoints:
  - `POST /chat` — forwards chat requests to OpenAI (non‑stream and SSE stream supported)
  - `GET /health` — quick health check `{ ok: true }`
- Setup summary:
  1) `npm i -g wrangler`
  2) `cd backend/cloudflare-worker`
  3) `wrangler secret put OPENAI_API_KEY`
  4) Edit `wrangler.toml` (`MODEL`, `ALLOWED_ORIGINS`, `SYSTEM_PROMPT`, `PROMPT_VERSION`)
  5) Ensure the Durable Object migration uses `new_sqlite_classes` (free plan) and tune `RL_MAX`, `RL_WINDOW_MS` for rate limiting
  6) Deploy the Worker
     - Dev (top-level env): `wrangler deploy --env ""` or `make deploy-dev`
     - Prod (no localhost CORS): `wrangler deploy --env production` or `make deploy-prod`
  7) Copy the `*.workers.dev` URL

See the detailed guide in `backend/cloudflare-worker/README.md`.

## Frontend Configuration
Set your Worker URL in `config.js` (no secrets):

```js
window.API_BASE = 'https://<your-worker>.workers.dev';
```

When set, the site will POST chat history to `${API_BASE}/chat` and render the streamed response. If not set, sends will show a helpful error.

UI options and persistence
- The currently open chat is remembered across refreshes.

## Retrieval (Vector Store)
- Put public context files about you in `database/` (`.md`, `.txt`).
- Sync them to an OpenAI Vector Store and deploy:

```bash
OPENAI_API_KEY=sk-... make sync-deploy-dev
```

- This will:
  - Create/refresh a Vector Store and attach files in `database/` (respects `.gitignore`).
  - Write the resulting `VECTOR_STORE_ID` to `backend/cloudflare-worker/wrangler.toml`.
  - Deploy the Worker (use `make deploy-dev` or `make deploy-prod`).

- Verification:
```bash
OPENAI_API_KEY=sk-... make list-vector-store
```

How it works
- The Worker calls OpenAI Responses API with:
  - `tools: [{ type: "file_search", vector_store_ids: [VECTOR_STORE_ID] }]`
  - `input`: your conversation turns
  - `stream: true`
- The Worker transforms Responses streaming events into Chat Completions–style deltas so the frontend remains unchanged.

Note: Files in this repo are public if the repo is public. Keep private material in a private repo and point the sync script there if needed.

## Privacy
- Chats are stored locally in your browser’s `localStorage`.
- “Clear Chats” removes local chat history and the cached replies.
- No analytics or trackers are included by default.
- The backend enforces per‑IP rate limiting via a Durable Object on the free plan.

## Tech Stack
- HTML, CSS, vanilla JS
- Markdown: [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify)
- Optional backend: Cloudflare Workers + OpenAI API

## For Maintainers
- Deeper project context and extension pointers live in `AGENTS.md`.
- Notable storage keys:
  - `localStorage['jz_site_chats_v1']`
  - `localStorage['jz_site_reply_cache_v2']`
  - `localStorage['jz_site_current_chat_v1']`

---
Questions or ideas to improve? Open an issue or reach out.
