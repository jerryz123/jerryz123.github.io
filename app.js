/* Simple ChatGPT-style homepage interactions (no network). */
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const chatList = $('#chatList');
  const messages = $('#messages');
  const prompt = $('#prompt');
  const form = $('#composerForm');
  const sendBtn = $('#sendBtn');
  const newChatBtn = $('#newChatBtn');
  const contentSection = document.getElementById('content');
  const suggestionsEl = document.querySelector('.suggestions');
  const styleSuggestionsEl = document.querySelector('.style-suggestions');
  const scrollSentinel = document.createElement('div');
  scrollSentinel.setAttribute('aria-hidden', 'true');
  scrollSentinel.style.height = '1px';
  let stickToBottom = true;
  let firstLoad = true;
  let forceNextScroll = false;
  // Track selected writing style (exclusive)
  let selectedStyle = null;

  // Suggestions: see four themed pools below

  // Four-pool variant: pick one suggestion from each pool
  const SUGGESTION_POOLS = {
    about: [
      "Tell me about Jerry.",
      "Summarize Jerry's background.",
      "What is Jerry's background?",
      "Give me a quick bio of Jerry.",
      "Where did Jerry study and work?",
      "What are Jerry's interests outside work?",
      "What motivates Jerry’s work?",
      "What are Jerry’s notable achievements?",
      "Tell me about Jerry, in a Haiku",
    ],
    expertise: [
      "What is Jerry's expertise in?",
      "What projects is Jerry working on?",
      "What topics does Jerry focus on?",
      "Which areas does Jerry research?",
      "Show highlights from Jerry’s portfolio.",
      "What’s Jerry’s experience with AI/ML?",
      "What languages and tools does Jerry use?",
      "What problems is Jerry currently exploring?",
    ],
    contact: [
      "How do I contact Jerry?",
      "What's the best way to reach Jerry?",
      "Where can I find Jerry online?",
      "Share Jerry’s email and social links.",
      "Where is Jerry located?",
    ],
    site: [
      "How does this website work?",
      "What does the backend use?",
      "What model powers this site?",
      "How was this website designed?",
      "What powers the frontend?",
      "How do I deploy my own version?",
      "What system-prompt is used?",
    ],
  };

  function renderSuggestionsFromPools() {
    if (!suggestionsEl) return;
    const pickOne = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
    const picks = [
      pickOne(SUGGESTION_POOLS.about),
      pickOne(SUGGESTION_POOLS.expertise),
      pickOne(SUGGESTION_POOLS.contact),
      pickOne(SUGGESTION_POOLS.site),
    ].filter(Boolean);
    // Shuffle the four suggestions so their positions vary
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    suggestionsEl.innerHTML = picks.map(t => `<button class="suggestion" title="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  }

  // Style suggestions: pick four from a single pool
  const STYLE_POOL = [
      "A Haiku",
      "A Personnel Dossier",
      "A FAQ",
      "Release Notes",
      "A Unix man page",
      "A Design Doc",
      "A Stack Trace",
      "A Compiler Error",
      "Chisel RTL",
      "A Socratic Dialogue",
      "A Pull Request",
      "A Github Issue",
      "A CHANGELOG",
      "A README",
      "A ELI5",
      "A Rogue AI",
      "Snoopy",
      "R2-D2",
      "Dr. Doofenshmirtz",
      "Emperor Palpatine",
      "A ASCII diagram",
      "A TL;DR",
  ];

  function renderStyleSuggestions() {
    if (!styleSuggestionsEl) return;
    const items = STYLE_POOL.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    const picks = items.slice(0, Math.min(4, items.length));
    styleSuggestionsEl.innerHTML = picks.map(t => {
      const active = selectedStyle === t;
      const title = escapeHtml(t);
      return `<button class="suggestion style-suggestion" aria-pressed="${active}" title="${title}">${title}</button>`;
    }).join('');
  }

  function isNearBottom() {
    const s = contentSection;
    if (!s) return true;
    return s.scrollTop + s.clientHeight >= s.scrollHeight - 80;
  }
  if (contentSection) {
    contentSection.addEventListener('scroll', () => {
      stickToBottom = isNearBottom();
    }, { passive: true });
  }

  const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
  // System prompt now lives in the backend (Cloudflare Worker)

  const STORAGE_KEY = 'jz_site_chats_v1';
  const CACHE_KEY = 'jz_site_reply_cache_v2';
  const CURRENT_KEY = 'jz_site_current_chat_v1';
  // Re-enable persistence in localStorage
  const store = {
    load() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
      catch { return []; }
    },
    save(chats) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {}
    }
  };

  let chats = store.load();
  // Reply cache: maps conversation hash -> assistant content
  const cache = {
    load() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } },
    save(obj) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {} },
  };
  let replyCache = cache.load();

  // If a chat ended with a pending placeholder (e.g., refresh mid-request), drop the Thinking… text
  for (const c of chats) {
    if (!c || !Array.isArray(c.msgs) || c.msgs.length === 0) continue;
    const last = c.msgs[c.msgs.length - 1];
    if (last.who === 'assistant' && last.text === 'Thinking…') {
      last.text = '';
    }
  }
  // Restore last active chat id; if not found, show landing
  let currentId = null;
  try {
    const savedId = localStorage.getItem(CURRENT_KEY) || '';
    if (savedId && chats.some(c => c.id === savedId)) currentId = savedId;
  } catch {}

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function renderSidebar() {
    chatList.innerHTML = '';
    chats.forEach(chat => {
      const a = document.createElement('button');
      a.className = 'chat-item';
      a.type = 'button';
      a.setAttribute('data-id', chat.id);
      a.innerHTML = `
        <span class="chat-item__icon">💬</span>
        <span class="chat-item__title">${escapeHtml(chat.title || 'Untitled')}</span>
      `;
      if (chat.id === currentId) a.style.borderColor = 'var(--accent)';
      a.addEventListener('click', () => {
        // Remove Thinking… text from the current chat if present
        const cur = chats.find(c => c.id === currentId);
        if (cur) {
          clearThinkingText(cur);
          store.save(chats);
        }
        currentId = chat.id;
        try { localStorage.setItem(CURRENT_KEY, currentId); } catch {}
        stickToBottom = true; // ensure we pin to bottom when switching chats
        forceNextScroll = true; // force scroll even if not near bottom
        renderAll();
      });
      chatList.appendChild(a);
    });
  }

  function renderMessages() {
    const chat = chats.find(c => c.id === currentId);
    messages.innerHTML = '';
    if (!chat) return;
    chat.msgs.forEach(m => messages.appendChild(msgEl(m.who, m.text)));
    // Ensure there is a bottom sentinel to scroll into view
    messages.appendChild(scrollSentinel);
    // After rendering messages, maybe scroll to bottom on next frame
    maybeScrollBottom(true);
  }

  function msgEl(who, text) {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    const isAssistant = who === 'assistant';
    // Special animated placeholder for pending responses
    if (isAssistant && text === 'Thinking…') {
      el.innerHTML = `
        <div class="who">${who === 'user' ? '🧑' : '✨'}</div>
        <div class="bubble thinking">Thinking<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
      `;
      return el;
    }
    const contentHTML = isAssistant ? renderMarkdown(text || '') : escapeHtml(text || '');
    el.innerHTML = `
      <div class="who">${who === 'user' ? '🧑' : '✨'}</div>
      <div class="bubble">${contentHTML}</div>
    `;
    return el;
  }

  function setTitleFromFirstUserLine(chat) {
    const firstUser = chat.msgs.find(m => m.who === 'user');
    if (firstUser) chat.title = truncate(firstUser.text.replace(/\n/g, ' '), 36);
  }

  function renderAll() {
    renderSidebar();
    renderMessages();
    const started = !!currentId; // landing when no active chat
    if (!started) {
      // Ensure landing suggestions are present
      renderSuggestionsFromPools();
      renderStyleSuggestions();
    }
    if (contentSection) contentSection.classList.toggle('hide-welcome', started);
    queueMicrotask(() => maybeScrollBottom(true));
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  async function onSubmit(e) {
    e.preventDefault();
    const baseText = prompt.value.trim();
    if (!baseText) return;
    let text = baseText;
    if (selectedStyle) {
      text = `${baseText} in the style of ${selectedStyle}`;
    }

    let chat = chats.find(c => c.id === currentId);
    if (!chat) {
      // Create a new chat when sending from the landing page
      chat = { id: uid(), title: 'New chat', msgs: [] };
      chats.unshift(chat);
      currentId = chat.id;
      try { localStorage.setItem(CURRENT_KEY, currentId); } catch {}
      stickToBottom = true;
      forceNextScroll = true;
    }
    chat.msgs.push({ who: 'user', text });
    setTitleFromFirstUserLine(chat);
    // Persist the user message immediately
    store.save(chats);

    // Check cache: if we already have a reply for this exact conversation state, reuse it
    const key = convoKey(chat);
    let assistantIndex;
    if (replyCache[key]) {
      chat.msgs.push({ who: 'assistant', text: replyCache[key] });
      assistantIndex = chat.msgs.length - 1;
      store.save(chats);
      prompt.value = '';
      sendBtn.disabled = false;
      autosize();
      renderAll();
      return;
    }

    // Placeholder assistant bubble; show Thinking… until first tokens arrive
    chat.msgs.push({ who: 'assistant', text: 'Thinking…' });
    assistantIndex = chat.msgs.length - 1;

    prompt.value = '';
    sendBtn.disabled = true;
    autosize();
    renderAll();

    try {
      await streamCompletion(chat, assistantIndex, key);
    } catch (err) {
      chat.msgs[assistantIndex].text = 'Error contacting backend. Please configure config.js with your Worker URL and ensure CORS is allowed.\n\n' + (err?.message || String(err));
    } finally {
      sendBtn.disabled = false;
      renderAll();
    }
  }

  async function streamCompletion(chat, assistantIndex, key) {
    if (!API_BASE) throw new Error('API_BASE is not set. Edit config.js.');
    const history = buildHistoryForAPI(chat);
    const res = await fetch(`${API_BASE}/chat?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, stream: true }),
    });
    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 500)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let acc = '';
    let lastPaint = 0;
    // Grab the last assistant bubble to update in-place (avoid full re-render flicker)
    const bubbleEl = getLastAssistantBubble();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') {
          replyCache[key] = acc;
          cache.save(replyCache);
          store.save(chats);
          if (bubbleEl) { bubbleEl.innerHTML = renderMarkdown(acc); }
          maybeScrollBottom(false);
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content || '';
          if (delta) {
            acc += delta;
            chat.msgs[assistantIndex].text = acc;
            const now = Date.now();
            if (now - lastPaint > 50) {
              // During streaming, render incrementally: raw uses text, otherwise Markdown
              if (bubbleEl) {
                if (bubbleEl.classList.contains('thinking')) {
                  // First tokens: drop thinking state
                  bubbleEl.classList.remove('thinking');
                }
                bubbleEl.innerHTML = renderMarkdown(acc);
              }
              lastPaint = now;
              maybeScrollBottom(false);
            }
          }
        } catch {}
      }
    }
    replyCache[key] = acc;
    cache.save(replyCache);
    store.save(chats);
    if (bubbleEl) {
      bubbleEl.innerHTML = renderMarkdown(acc);
    }
    maybeScrollBottom(false);
  }

  function renderMarkdown(text) {
    try {
      if (window.marked && window.DOMPurify) {
        return window.DOMPurify.sanitize(window.marked.parse(text));
      }
    } catch {}
    return escapeHtml(text || '');
  }

  function clearThinkingText(chat) {
    if (!chat || !Array.isArray(chat.msgs)) return;
    for (const m of chat.msgs) {
      if (m && m.who === 'assistant' && m.text === 'Thinking…') m.text = '';
    }
  }

  function getLastAssistantBubble() {
    const nodes = messages.querySelectorAll('.msg.assistant .bubble');
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function scrollToBottom(smooth = false) {
    const behavior = smooth ? 'smooth' : 'auto';
    const scroller = contentSection || document.scrollingElement || document.documentElement;
    try { scroller.scrollTo({ top: scroller.scrollHeight + 1000, behavior }); }
    catch { scroller.scrollTop = scroller.scrollHeight; }
  }

  function rafScroll() {
    // Use two RAFs to ensure layout has settled before scrolling
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(true)));
  }

  function maybeScrollBottom(smooth = false) {
    // On first render after page load, force a scroll to bottom
    if (firstLoad) {
      firstLoad = false;
      rafScroll();
      return;
    }
    if (forceNextScroll) {
      forceNextScroll = false;
      smooth ? rafScroll() : scrollToBottom(false);
      return;
    }
    if (stickToBottom) {
      // If already near bottom, keep pinning to bottom
      if (isNearBottom()) {
        smooth ? rafScroll() : scrollToBottom(false);
      }
    }
  }

  async function fetchCompletion(chat) {
    if (!API_BASE) throw new Error('API_BASE is not set. Edit config.js.');
    // Build chat history into OpenAI format
    const history = buildHistoryForAPI(chat);
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) {
      const t = await safeText(res);
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 500)}`);
    }
    const data = await res.json();
    return data?.content || '';
  }

  async function safeText(res) {
    try { return await res.text(); } catch { return ''; }
  }

  function autosize() {
    prompt.style.height = 'auto';
    const max = 160; // match CSS
    const h = Math.min(prompt.scrollHeight, max);
    prompt.style.height = h + 'px';
  }

  function goToLanding() {
    // Remove Thinking… text from the current chat if present
    const cur = chats.find(c => c.id === currentId);
    if (cur) {
      clearThinkingText(cur);
      store.save(chats);
    }
    currentId = null;
    try { localStorage.setItem(CURRENT_KEY, ''); } catch {}
    // Re-roll the suggestions when returning to the landing view
    renderSuggestionsFromPools();
    renderStyleSuggestions();
    renderAll();
    prompt.focus();
  }

  const brandHome = document.getElementById('brandHome');
  if (brandHome) {
    brandHome.addEventListener('click', () => { goToLanding(); stickToBottom = true; });
    brandHome.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToLanding(); } });
  }

  // Clear chats button
  const clearBtn = document.getElementById('clearChatsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      chats = [];
      currentId = null;
      store.save(chats);
      try { localStorage.setItem(CURRENT_KEY, ''); } catch {}
      // Also clear the reply cache
      replyCache = {};
      cache.save(replyCache);
      renderAll();
    });
  }

  // Suggestions (event delegation so dynamically-rendered buttons work)
  if (suggestionsEl) {
    suggestionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.suggestion');
      if (!btn) return;
      prompt.value = btn.textContent.trim();
      autosize();
      prompt.focus();
    });
  }

  // Style suggestions: toggle single selected style; applied on send
  if (styleSuggestionsEl) {
    styleSuggestionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.style-suggestion');
      if (!btn) return;
      const style = btn.textContent.trim();
      if (selectedStyle === style) {
        selectedStyle = null;
        btn.setAttribute('aria-pressed', 'false');
      } else {
        selectedStyle = style;
        // Clear previous selection in the UI
        styleSuggestionsEl.querySelectorAll('.style-suggestion[aria-pressed="true"]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
      }
    });
  }

  // Theme toggle removed; site stays in dark mode.

  // Events
  form.addEventListener('submit', onSubmit);
  prompt.addEventListener('input', () => { sendBtn.disabled = !prompt.value.trim(); autosize(); });
  prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  newChatBtn.addEventListener('click', () => { goToLanding(); stickToBottom = true; });

  // Init
  try { if (window.marked) window.marked.setOptions({ gfm: true, breaks: false }); } catch {}
  renderSuggestionsFromPools();
  renderStyleSuggestions();
  autosize();
  renderAll();
})();

// Compute a stable key for the conversation state up to the last user turn.
// If excludeTrailingAssistant is true, drop a trailing assistant message (e.g., placeholder) from the hash.
function convoKey(chat, excludeTrailingAssistant = false) {
  const msgs = chat.msgs.slice();
  if (excludeTrailingAssistant && msgs.length && msgs[msgs.length - 1].who === 'assistant') {
    msgs.pop();
  }
  // Only include up to the last user message inclusive
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].who === 'user') { lastUserIdx = i; break; } }
  const subset = lastUserIdx >= 0 ? msgs.slice(0, lastUserIdx + 1) : msgs;
  const payload = JSON.stringify({ system: 'site-assistant:v1', msgs: subset.map(m => ({ r: m.who, c: m.text })) });
  return hashStr(payload);
}

function hashStr(s) {
  // djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  // Convert to unsigned hex
  return (h >>> 0).toString(16);
}

// Build message history for the API: include turns up to and including the last user message.
// Skip any trailing assistant placeholder like 'Thinking…' or empty content.
function buildHistoryForAPI(chat) {
  const msgs = Array.isArray(chat?.msgs) ? chat.msgs : [];
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].who === 'user') { lastUserIdx = i; break; } }
  const subset = lastUserIdx >= 0 ? msgs.slice(0, lastUserIdx + 1) : msgs;
  const out = [];
  for (const m of subset) {
    if (!m || typeof m.text !== 'string') continue;
    const role = m.who === 'user' ? 'user' : 'assistant';
    const content = m.text;
    if (role === 'assistant' && (content === '' || content === 'Thinking…')) continue;
    out.push({ role, content });
  }
  return out;
}
