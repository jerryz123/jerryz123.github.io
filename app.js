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

  const STORAGE_KEY = 'jz_site_chats_v1';
  // Clear any previous persisted chats on each page load
  try { localStorage.removeItem(STORAGE_KEY); } catch {}

  // Disable persistence so refresh resets state
  const store = {
    load() { return []; },
    save(_) { /* no-op: ephemeral mode */ }
  };

  let chats = store.load();
  if (!chats.length) {
    chats = [
      { id: uid(), title: 'Welcome', msgs: [
        { who: 'assistant', text: 'Welcome to my site! Type a prompt below to explore. Messages reset on refresh.' }
      ]},
    ];
  }

  let currentId = chats[0].id;

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
        renderAll();
      });
      chatList.appendChild(a);
    });
  }

  function renderMessages() {
    const chat = chats.find(c => c.id === currentId);
    if (!chat) return;
    messages.innerHTML = '';
    chat.msgs.forEach(m => messages.appendChild(msgEl(m.who, m.text)));
  }

  function msgEl(who, text) {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.innerHTML = `
      <div class="who">${who === 'user' ? '🧑' : '✨'}</div>
      <div class="bubble">${escapeHtml(text)}</div>
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
    queueMicrotask(() => { messages.scrollTop = messages.scrollHeight; });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function onSubmit(e) {
    e.preventDefault();
    const text = prompt.value.trim();
    if (!text) return;

    const chat = chats.find(c => c.id === currentId);
    if (!chat) return;
    chat.msgs.push({ who: 'user', text });
    setTitleFromFirstUserLine(chat);

    // Static assistant placeholder
    chat.msgs.push({ who: 'assistant', text: "Thanks! In a real app I’d call an API. For now, this site stores your messages locally so you can click around and come back later." });

    store.save(chats);
    prompt.value = '';
    autosize();
    renderAll();
  }

  function autosize() {
    prompt.style.height = 'auto';
    const max = 160; // match CSS
    const h = Math.min(prompt.scrollHeight, max);
    prompt.style.height = h + 'px';
  }

  function newChat() {
    const c = { id: uid(), title: 'New chat', msgs: [] };
    chats.unshift(c);
    currentId = c.id;
    store.save(chats);
    renderAll();
    prompt.focus();
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
  newChatBtn.addEventListener('click', newChat);

  // Init
  autosize();
  renderAll();
})();
