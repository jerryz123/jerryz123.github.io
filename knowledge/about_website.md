# About This Website

This site is a simple, ChatGPT‑style personal website for Jerry Zhao.

Built by prompting GPT‑5 inside Codex CLI: the site was planned, coded, and wired up end‑to‑end by conversing with GPT‑5 in a terminal. Jerry provided goals and feedback; the AI generated the frontend, backend, and docs.

## What You See
- Familiar chat layout in dark mode only.
- A welcome screen with Jerry’s headshot and quick suggestions.
- “New Chat” to start fresh, and “Clear Chats” to wipe your local history.
- Answers appear live, word‑by‑word, and support Markdown (headings, lists, code blocks, etc.).

## What Happens When You Ask
- Your message is sent to a private serverless backend that Jerry controls.
- The backend calls OpenAI and streams the reply back to your browser in real time.
- If a private knowledge base is configured, the AI also looks up relevant notes about Jerry and this site to ground its answer.
- Your chats are saved only in your own browser so they persist across refreshes. The server does not store your conversation.

## Privacy and Safety
- Keys and secrets live on the server, not in your browser.
- Requests are limited per‑IP to reduce abuse.
- The assistant is instructed to stay on topic (Jerry and this site) and to politely decline unrelated requests.

## How Streaming Works (Plain English)
1) You send a question. 2) The server asks OpenAI for a streamed answer. 3) The words arrive in small pieces and are shown as they come in. 4) When it’s done, the full answer is saved to your local chat history.

## The Knowledge Base (Optional)
- Some pages (like this one) live in a small, private knowledge base.
- When enabled, the assistant can search those notes to answer questions more accurately about Jerry and the website.

## Known Limitations
- Very long conversations can hit browser or model limits; starting a new chat helps.
- Streaming very large answers can briefly cause page reflow while the text grows.

If something looks off or you have suggestions, feel free to reach out via the contact links on the site.
