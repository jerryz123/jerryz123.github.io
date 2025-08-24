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
  const scrollSentinel = document.createElement('div');
  scrollSentinel.setAttribute('aria-hidden', 'true');
  scrollSentinel.style.height = '1px';
  let stickToBottom = true;
  let firstLoad = true;
  let forceNextScroll = false;

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
  const SYSTEM_PROMPT = "You are the helpful personal site assistant for Jerry Zhao. Be concise and friendly.";

  const STORAGE_KEY = 'jz_site_chats_v1';
  const CACHE_KEY = 'jz_site_reply_cache_v1';
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

  // If a chat ended with a pending placeholder (e.g., refresh mid-request), try to fill from cache
  for (const c of chats) {
    if (!c || !Array.isArray(c.msgs) || c.msgs.length === 0) continue;
    const last = c.msgs[c.msgs.length - 1];
    if (last.who === 'assistant' && last.text === 'Thinking…') {
      const key = convoKey(c, /*excludeTrailingAssistant=*/true);
      if (replyCache[key]) {
        last.text = replyCache[key];
      } else {
        last.text = '(interrupted — no cached reply)';
      }
    }
  }
  // Start on landing with no active chat if nothing saved
  let currentId = chats.length ? chats[0].id : null;

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
        currentId = chat.id;
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
    const contentHTML = (who === 'assistant') ? renderMarkdown(text || '') : escapeHtml(text || '');
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
    if (contentSection) contentSection.classList.toggle('hide-welcome', started);
    queueMicrotask(() => maybeScrollBottom(true));
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  async function onSubmit(e) {
    e.preventDefault();
    const text = prompt.value.trim();
    if (!text) return;

    let chat = chats.find(c => c.id === currentId);
    if (!chat) {
      // Create a new chat when sending from the landing page
      chat = { id: uid(), title: 'New chat', msgs: [] };
      chats.unshift(chat);
      currentId = chat.id;
      stickToBottom = true;
      forceNextScroll = true;
    }
    chat.msgs.push({ who: 'user', text });
    setTitleFromFirstUserLine(chat);

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

    // Placeholder assistant bubble; stream in content
    chat.msgs.push({ who: 'assistant', text: '' });
    assistantIndex = chat.msgs.length - 1;

    store.save(chats);
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
    const history = chat.msgs.map(m => ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.text }));
    const res = await fetch(`${API_BASE}/chat?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, system: SYSTEM_PROMPT, temperature: 0.7, stream: true }),
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
          if (bubbleEl) bubbleEl.innerHTML = renderMarkdown(acc);
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
              if (bubbleEl) bubbleEl.innerHTML = renderMarkdown(acc);
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
    if (bubbleEl) bubbleEl.innerHTML = renderMarkdown(acc);
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
    const history = chat.msgs.map(m => ({
      role: m.who === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, system: SYSTEM_PROMPT, temperature: 0.7 }),
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
    currentId = null;
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
      const ok = confirm('Clear all chats? This will remove chat history saved in your browser.');
      if (!ok) return;
      chats = [];
      currentId = null;
      store.save(chats);
      // Also clear the reply cache
      replyCache = {};
      cache.save(replyCache);
      renderAll();
    });
  }

  // Suggestions
  $$('.suggestion').forEach(btn => btn.addEventListener('click', () => {
    prompt.value = btn.textContent.trim();
    autosize();
    prompt.focus();
  }));

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
  try { if (window.marked) window.marked.setOptions({ gfm: true, breaks: true }); } catch {}
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
