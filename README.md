# Jerry Zhao — Personal Site

A minimal, ChatGPT‑style personal website with a sidebar of chats on the left and a prompt composer at the bottom. The frontend is static and can be hosted on GitHub Pages. An optional Cloudflare Worker backend securely calls the OpenAI API (your key stays server‑side).

## Features
- Chat UI with a left sidebar
- Create chats on first send; return to landing via New Chat or the brand
- Local persistence (saved in your browser); Clear Chats button to reset
- Markdown rendering for assistant messages (via marked + DOMPurify)
- Optional backend proxy on Cloudflare Workers for OpenAI API calls

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

## Backend (Optional, Recommended)
A tiny Cloudflare Worker keeps your OpenAI API key private and adds CORS:

- Location: `backend/cloudflare-worker`
- Endpoints:
  - `POST /chat` — forwards chat requests to OpenAI (non‑stream and SSE stream supported)
  - `GET /health` — quick health check `{ ok: true }`
- Setup summary:
  1) `npm i -g wrangler`
  2) `cd backend/cloudflare-worker`
  3) `wrangler secret put OPENAI_API_KEY`
  4) Edit `wrangler.toml` (`MODEL`, `ALLOWED_ORIGINS`)
  5) `wrangler deploy`
  6) Copy the `*.workers.dev` URL

See the detailed guide in `backend/cloudflare-worker/README.md`.

## Frontend Configuration
Set your Worker URL in `config.js` (no secrets):

```js
window.API_BASE = 'https://<your-worker>.workers.dev';
```

When set, the site will POST chat history to `${API_BASE}/chat` and render the response. If not set, sends will show a helpful error.

## Privacy
- Chats are stored locally in your browser’s `localStorage`.
- “Clear Chats” removes local chat history and the cached replies.
- No analytics or trackers are included by default.

## Tech Stack
- HTML, CSS, vanilla JS
- Markdown: [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify)
- Optional backend: Cloudflare Workers + OpenAI API

## For Maintainers
- Deeper project context and extension pointers live in `AGENTS.md`.
- Notable storage keys:
  - `localStorage['jz_site_chats_v1']`
  - `localStorage['jz_site_reply_cache_v1']`

---
Questions or ideas to improve? Open an issue or reach out.

