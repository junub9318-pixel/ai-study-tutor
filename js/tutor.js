/* =========================================================
   tutor.js — 1:1 단계별 튜터 채팅 (이미지 · PDF · 음성 · KaTeX)
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, renderRich, toSpeech, streamChat, tutorSystem,
  currentSubject, subjectKey, hasKey, openModal, toast, uid, materialContext, ApiError,
} from './core.js?v=827d81c6';
import {
  speak, stopSpeaking, listen, sttSupported, ttsSupported, readImageFile, fileToMaterial,
  openMaterialsModal, scrollToBottom, toastCopy, setStatus, onView, openKeyModal,
} from './ui.js?v=827d81c6';
import { awardXP, bump, profile } from './gamify.js?v=827d81c6';

let chats = load(K.chats, {});
let controller = null;
let recognition = null;
let renderTimer = null;

const el = (id) => document.getElementById(id);

function msgs() { return chats[subjectKey()] || []; }
function setMsgs(list) { chats[subjectKey()] = list; persist(); }
function persist() {
  if (save(K.chats, chats)) return;
  // 저장 공간 부족: 오래된 메시지의 이미지를 제거하고 재시도
  Object.keys(chats).forEach(k => {
    const list = chats[k] || [];
    list.slice(0, Math.max(0, list.length - 3)).forEach(m => { if (m.images) m.images = []; });
  });
  if (!save(K.chats, chats)) toast('대화가 너무 커서 일부만 저장했어요. (오래된 사진은 표시되지 않을 수 있어요)', 'err');
}

/* ---------------- render ---------------- */
function msgNode(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (m.role === 'user' ? 'user' : m.role === 'error' ? 'ai error' : 'ai');
  wrap.dataset.id = m.id;

  const ava = document.createElement('div');
  ava.className = 'ava';
  ava.textContent = m.role === 'user' ? (profile().emoji || '🙋') : '🎓';
  wrap.appendChild(ava);

  const body = document.createElement('div');
  body.className = 'body';

  if (m.images && m.images.length) {
    const grid = document.createElement('div');
    grid.className = 'img-grid';
    m.images.forEach(img => {
      const im = document.createElement('img');
      im.src = img.dataUrl;
      im.alt = img.name || '첨부한 사진';
      im.loading = 'lazy';
      im.addEventListener('click', () => {
        openModal(`<div class="modal-head"><h2>${escapeHtml(img.name || '사진')}</h2><button class="icon-btn" data-close type="button">✕</button></div>
          <div class="modal-body"><img src="${img.dataUrl}" style="width:100%;border-radius:12px" alt="첨부 사진" /></div>`);
      });
      grid.appendChild(im);
    });
    body.appendChild(grid);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (m.role === 'user') {
    bubble.innerHTML = renderRich(m.text || '');
  } else {
    bubble.innerHTML = renderRich(m.text || '');
  }
  body.appendChild(bubble);

  if (m.atts && m.atts.length) {
    const atts = document.createElement('div');
    atts.className = 'atts';
    atts.innerHTML = m.atts.map(a => `<span class="att-pill">📎 ${escapeHtml(a)}</span>`).join('');
    body.appendChild(atts);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const time = m.ts ? new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
  meta.innerHTML = `<span class="tag">${m.demo ? '예시 · ' : ''}${time}${m.model ? ' · ' + escapeHtml(String(m.model).replace('gemini-', '')) : ''}</span>`;

  if (m.role !== 'user') {
    const speakBtn = document.createElement('button');
    speakBtn.className = 'mbtn';
    speakBtn.type = 'button';
    speakBtn.textContent = '🔊 듣기';
    speakBtn.addEventListener('click', () => speak(toSpeech(m.text), { rate: state.settings.ttsRate || 1 }));
    meta.appendChild(speakBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'mbtn';
    copyBtn.type = 'button';
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', () => toastCopy(m.text, '답변을 복사했어요'));
    meta.appendChild(copyBtn);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'mbtn';
    retryBtn.type = 'button';
    retryBtn.textContent = '↻ 다시';
    retryBtn.addEventListener('click', () => regenerate(m.id));
    meta.appendChild(retryBtn);
  }
  body.appendChild(meta);
  wrap.appendChild(body);
  return wrap;
}

function renderChat() {
  const list = msgs();
  const host = el('messages');
  const empty = el('chatEmpty');
  if (!host) return;
  empty.hidden = list.length > 0;
  host.innerHTML = '';
  list.forEach(m => host.appendChild(msgNode(m)));
  scrollToBottom(el('chatScroll'));
  requestAnimationFrame(() => scrollToBottom(el('chatScroll')));
  setTimeout(() => scrollToBottom(el('chatScroll')), 180);
}

function renderSuggestions() {
  const host = el('suggestList');
  if (!host) return;
  const s = currentSubject();
  host.innerHTML = '';
  (s.suggestions || []).forEach(text => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      el('chatInput').value = text;
      el('chatInput').focus();
      autoGrow();
    });
    host.appendChild(b);
  });
  const title = el('emptyTitle');
  if (title) title.textContent = `${s.label}, 한 단계씩`;
  const sub = el('emptySub');
  if (sub) sub.textContent = `${s.label} 문제를 적거나 사진으로 찍어 보내면, 정답부터 주지 않고 함께 풀어 봐요.`;
}

/* ---------------- attachments ---------------- */
function renderPending() {
  const tray = el('pendingTray');
  const { images, materials } = state.pending;
  if (!images.length && !materials.length) { tray.hidden = true; tray.innerHTML = ''; return; }
  tray.hidden = false;
  tray.innerHTML = '';
  images.forEach((img, i) => {
    const d = document.createElement('div');
    d.className = 'pend-item';
    d.innerHTML = `<img src="${img.dataUrl}" alt="첨부 사진 ${i + 1}" /><button class="pend-x" type="button" aria-label="사진 빼기">✕</button>`;
    d.querySelector('.pend-x').addEventListener('click', () => { state.pending.images.splice(i, 1); renderPending(); });
    tray.appendChild(d);
  });
  materials.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'pend-item pend-file';
    d.innerHTML = `<span>${m.kind === 'pdf' ? '📕' : '📄'} ${escapeHtml(m.name.length > 14 ? m.name.slice(0, 14) + '…' : m.name)}</span><button class="pend-x" type="button" aria-label="자료 빼기">✕</button>`;
    d.querySelector('.pend-x').addEventListener('click', () => { state.pending.materials.splice(i, 1); renderPending(); });
    tray.appendChild(d);
  });
}

function openAttachMaterialPicker() {
  const selected = new Set(state.pending.materials.map(m => m.id));
  const modal = openModal(`
    <div class="modal-head"><h2>학습 자료 첨부</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <div id="attList"></div>
      <div class="row">
        <button class="ghost-btn small" id="attUpload" type="button">📄 새 PDF · TXT 올리기</button>
        <button class="primary small" id="attDone" type="button">첨부하기</button>
      </div>
    </div>`);
  const list = modal.root.querySelector('#attList');
  const draw = () => {
    list.innerHTML = state.materials.length
      ? state.materials.map(m => `
        <label class="task" style="border-bottom:1px solid var(--border-soft)">
          <input type="checkbox" data-mid="${m.id}" ${selected.has(m.id) ? 'checked' : ''} />
          <span class="t-body"><span class="t-title">${m.kind === 'pdf' ? '📕' : '📄'} ${escapeHtml(m.name)}</span><span class="t-sub">${m.chars.toLocaleString()}자</span></span>
        </label>`).join('')
      : '<p class="mat-empty">자료가 없어요. PDF·TXT를 올리거나, 상단 📎 자료에서 추가하세요.</p>';
    list.querySelectorAll('input[data-mid]').forEach(inp => {
      inp.addEventListener('change', () => {
        if (inp.checked) selected.add(inp.dataset.mid); else selected.delete(inp.dataset.mid);
      });
    });
  };
  draw();
  modal.root.querySelector('#attUpload').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.pdf,.txt,text/plain,application/pdf';
    inp.multiple = true;
    inp.addEventListener('change', async () => {
      for (const f of Array.from(inp.files || [])) {
        try {
          const mat = await fileToMaterial(f);
          if (mat && mat.kind !== 'img') {
            const { addMaterial } = await import('./ui.js?v=827d81c6');
            addMaterial(mat);
            selected.add(mat.id);
          }
        } catch (e) { toast(e.message, 'err'); }
      }
      draw();
    });
    inp.click();
  });
  modal.root.querySelector('#attDone').addEventListener('click', () => {
    state.pending.materials = state.materials.filter(m => selected.has(m.id));
    renderPending();
    modal.close();
  });
}

function addImages(files) {
  Array.from(files || []).forEach(async (f) => {
    if (!/^image\//.test(f.type)) { toast('사진 파일만 첨부할 수 있어요.', 'err'); return; }
    try {
      const img = await readImageFile(f);
      if (state.pending.images.length >= 4) { toast('사진은 한 번에 4장까지 보낼 수 있어요.', 'err'); return; }
      state.pending.images.push(img);
      renderPending();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ---------------- send ---------------- */
function autoGrow() {
  const ta = el('chatInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
}

function buildContents(history, parts) {
  const recent = history.filter(m => (m.role === 'user' || m.role === 'model') && m.text != null).slice(-14);
  const contents = recent.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m.text || '').slice(0, 5000) }],
  }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  contents.push({ role: 'user', parts });
  return contents;
}

async function sendMessage(text, images, materials, { silentUser = false } = {}) {
  if (state.busy) return;
  if (!hasKey()) { toast('먼저 Gemini API 키를 연결해 주세요.', 'err'); openKeyModal(); return; }
  const question = (text || '').trim();
  if (!question && !images.length) { toast('질문을 입력하거나 사진을 첨부해 주세요.', 'err'); return; }

  const subject = currentSubject();
  const mode = state.settings.mode;

  const userMsg = {
    id: uid('m'), role: 'user', text: question, ts: Date.now(),
    images: images.map(i => ({ dataUrl: i.dataUrl, mimeType: i.mimeType, name: i.name })),
    atts: materials.map(m => m.name),
  };
  const list = msgs();
  list.push(userMsg);
  setMsgs(list);
  renderChat();

  el('chatInput').value = '';
  autoGrow();
  state.pending = { images: [], materials: [] };
  renderPending();

  const parts = [];
  let promptText = question || '첨부한 사진의 문제를 봐 주세요.';
  if (materials.length) promptText += materialContext(materials);
  parts.push({ text: promptText });
  images.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: String(img.dataUrl).split(',')[1] || '' } }));

  const contents = buildContents(list.slice(0, -1), parts);

  const aiMsg = { id: uid('m'), role: 'model', text: '', ts: Date.now() };
  list.push(aiMsg);
  setMsgs(list);

  const host = el('messages');
  const node = msgNode(aiMsg);
  const bubble = node.querySelector('.bubble');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  host.appendChild(node);
  scrollToBottom(el('chatScroll'));

  setBusy(true);
  controller = new AbortController();
  let acc = '';
  let lastRender = 0;

  const flush = (force = false) => {
    const now = Date.now();
    if (!force && now - lastRender < 90) return;
    lastRender = now;
    bubble.innerHTML = renderRich(acc || '') || '<span class="typing"><i></i><i></i><i></i></span>';
    scrollToBottom(el('chatScroll'));
  };

  try {
    const used = await streamChat({
      system: tutorSystem(subject.label, mode),
      contents,
      temperature: mode === 'summary' ? 0.5 : 0.75,
      signal: controller.signal,
      onChunk: (chunk) => { acc += chunk; flush(); },
    });
    aiMsg.text = acc.trim();
    aiMsg.model = used;
    aiMsg.ts = Date.now();
    // 대화 목록에서 방금 추가한 aiMsg 갱신
    const cur = msgs();
    const target = cur.find(m => m.id === aiMsg.id);
    if (target) { Object.assign(target, aiMsg); }
    setMsgs(cur);
    bubble.innerHTML = renderRich(aiMsg.text);
    node.replaceWith(msgNode(aiMsg));
    scrollToBottom(el('chatScroll'));

    awardXP(mode === 'summary' ? 3 : 5, mode === 'summary' ? '핵심 정리' : '튜터링');
    bump('turns');
    document.dispatchEvent(new CustomEvent('app:studied', { detail: { type: 'tutor' } }));

    if (state.settings.autoSpeak) speak(toSpeech(aiMsg.text), { rate: state.settings.ttsRate || 1 });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      aiMsg.text = acc.trim() || '(중지됨)';
      aiMsg.model = '';
      const cur = msgs();
      const t = cur.find(m => m.id === aiMsg.id);
      if (t) Object.assign(t, aiMsg);
      setMsgs(cur);
      node.replaceWith(msgNode(aiMsg));
      return;
    }
    const cur = msgs().filter(m => m.id !== aiMsg.id);
    cur.push({ id: uid('m'), role: 'error', text: (e && e.message) || '응답을 받지 못했어요.', ts: Date.now() });
    setMsgs(cur);
    renderChat();
    toast((e && e.message) || '응답을 받지 못했어요.', 'err', 4200);
  } finally {
    setBusy(false);
    controller = null;
  }
}

function setBusy(busy) {
  state.busy = busy;
  const send = el('sendBtn'), stop = el('stopBtn'), ta = el('chatInput');
  if (send) send.hidden = busy;
  if (stop) stop.hidden = !busy;
  if (ta) ta.disabled = false;
}

async function regenerate(aiMsgId) {
  if (state.busy) return;
  const list = msgs();
  const idx = list.findIndex(m => m.id === aiMsgId);
  if (idx < 0) return;
  // 직전 사용자 메시지 찾기
  let uIdx = idx - 1;
  while (uIdx >= 0 && list[uIdx].role !== 'user') uIdx--;
  if (uIdx < 0) return;
  const userMsg = list[uIdx];
  const newList = list.slice(0, uIdx);
  setMsgs(newList);
  renderChat();
  const materials = state.materials.filter(m => (userMsg.atts || []).includes(m.name));
  await sendMessage(userMsg.text, (userMsg.images || []).map(i => ({ dataUrl: i.dataUrl, mimeType: i.mimeType, name: i.name })), materials);
}

/* ---------------- voice ---------------- */
function toggleVoice() {
  const bar = el('voiceBar');
  if (recognition) { stopVoice(); return; }
  if (!sttSupported()) {
    toast('이 브라우저는 음성 인식을 지원하지 않아요. 텍스트로 질문해 주세요. (iOS는 설정 > Safari > 마이크 권한 필요)', 'err', 4000);
    return;
  }
  stopSpeaking();
  bar.hidden = false;
  el('voiceStatus').textContent = '듣는 중… 말씀하세요';
  let finalText = '';
  recognition = listen({
    onResult: ({ finalText: f, interim }) => {
      if (f) finalText += f;
      el('voiceStatus').textContent = (finalText + ' ' + interim).trim() || '듣는 중…';
      el('chatInput').value = (finalText + ' ' + interim).trim();
      autoGrow();
    },
    onError: (err) => {
      const msg = err === 'not-allowed' ? '마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.' :
        err === 'no-speech' ? '말소리를 듣지 못했어요. 다시 시도해 주세요.' : '음성 인식에 문제가 생겼어요. 텍스트로 입력해 주세요.';
      toast(msg, 'err', 3600);
      stopVoice();
    },
    onEnd: () => {
      const text = el('chatInput').value.trim();
      stopVoice();
      if (text) sendMessage(text, state.pending.images, state.pending.materials);
    },
  });
}
function stopVoice() {
  try { recognition && recognition.stop(); } catch (e) {}
  recognition = null;
  const bar = el('voiceBar');
  if (bar) bar.hidden = true;
}

/* ---------------- demo ---------------- */
function loadDemo() {
  const subject = currentSubject();
  const demoUser = { id: uid('m'), role: 'user', text: '이차방정식 $x^2 - 5x + 6 = 0$이 왜 인수분해로 풀리는지 모르겠어.', ts: Date.now() - 60000, demo: true };
  const demoAi = {
    id: uid('m'), role: 'model', demo: true, ts: Date.now() - 50000, model: '',
    text: `좋아요, 같이 풀어 봐요. 먼저 **무엇을 구하는지**부터 확인할게요.

**구하는 것**: $x^2 - 5x + 6 = 0$을 참으로 만드는 $x$ 값(근) 두 개예요.

**1단계 · 곱해서 6, 더해서 -5**
$(x + a)(x + b) = x^2 + (a+b)x + ab$ 이므로, 두 수 $a$, $b$는
$$a \\cdot b = 6, \\quad a + b = -5$$
를 만족해야 해요. 곱해서 $6$이 되는 두 수를 하나씩 말해 볼까요? ($1$과 $6$? $2$와 $3$?)

그중 더해서 $-5$가 되는 조합은 무엇일까요? 🙂`,
  };
  const list = msgs();
  setMsgs([...list, demoUser, demoAi]);
  renderChat();
  toast(`${subject.label} 예시 대화를 열었어요. 이어서 질문해 보세요.`);
}

/* ---------------- init ---------------- */
export function initTutor() {
  const modeSeg = el('modeSeg');
  const syncMode = () => {
    document.querySelectorAll('#modeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.settings.mode));
  };
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    state.settings.mode = b.dataset.mode;
    save(K.settings, state.settings);
    syncMode();
    toast(b.dataset.mode === 'socratic' ? '단계별 과외 모드로 바꿨어요' : '핵심 정리 모드로 바꿨어요', 'info', 1600);
  });
  syncMode();

  const ttsBtn = el('ttsToggle');
  const syncTts = () => {
    ttsBtn.classList.toggle('on', !!state.settings.autoSpeak);
    ttsBtn.textContent = state.settings.autoSpeak ? '🔊' : '🔈';
  };
  ttsBtn.addEventListener('click', () => {
    state.settings.autoSpeak = !state.settings.autoSpeak;
    save(K.settings, state.settings);
    syncTts();
    if (!state.settings.autoSpeak) stopSpeaking();
    toast(state.settings.autoSpeak ? '답변을 자동으로 읽어 줄게요' : '자동 읽기를 껐어요', 'info', 1600);
  });
  syncTts();

  el('voiceToggle').addEventListener('click', toggleVoice);
  el('voiceStopBtn').addEventListener('click', stopVoice);
  el('chatClearBtn').addEventListener('click', () => {
    if (!msgs().length) return;
    if (!confirm('이 과목의 대화를 모두 지울까요? (되돌릴 수 없어요)')) return;
    setMsgs([]);
    renderChat();
    toast('대화를 지웠어요');
  });

  el('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(el('chatInput').value, state.pending.images, state.pending.materials);
  });
  el('chatInput').addEventListener('input', autoGrow);
  el('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage(el('chatInput').value, state.pending.images, state.pending.materials);
    }
  });
  el('stopBtn').addEventListener('click', () => { if (controller) controller.abort(); });

  el('camBtn').addEventListener('click', () => el('camInput').click());
  el('imgBtn').addEventListener('click', () => el('imgInput').click());
  el('pdfBtn').addEventListener('click', openAttachMaterialPicker);
  el('camInput').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
  el('imgInput').addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
  el('pdfInput').addEventListener('change', async (e) => {
    for (const f of Array.from(e.target.files || [])) {
      try {
        const mat = await fileToMaterial(f);
        if (mat) { const { addMaterial } = await import('./ui.js?v=827d81c6'); addMaterial(mat); state.pending.materials.push(mat); renderPending(); }
      } catch (err) { toast(err.message, 'err'); }
    }
    e.target.value = '';
  });

  el('demoChatBtn').addEventListener('click', loadDemo);

  document.addEventListener('app:subject', () => {
    renderChat();
    renderSuggestions();
  });
  document.addEventListener('app:materials', () => { renderPending(); });
  document.addEventListener('app:key', () => {});

  renderChat();
  renderSuggestions();
  renderPending();

  onView('tutor', () => {
    scrollToBottom(el('chatScroll'));
    requestAnimationFrame(() => scrollToBottom(el('chatScroll')));
    setTimeout(() => scrollToBottom(el('chatScroll')), 160);
  });

  window.addEventListener('beforeunload', () => { try { stopSpeaking(); } catch (e) {} });
}

export function tutorHasKeyHint() { return hasKey(); }
