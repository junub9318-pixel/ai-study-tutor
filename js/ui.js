/* =========================================================
   ui.js — 테마 · 탭 · 과목 선택 · API 키 모달 · 자료 · 음성
   ========================================================= */
import {
  SUBJECTS, K, state, load, save, removeKey, currentSubject, setSubject,
  $, $$, el, escapeHtml, fmt, toast, openModal, hasKey, getKey, setKey, clearKey,
  connectTest, getModel, listModels, ApiError, saveSettings, saveMaterials, uid, dayKey,
} from './core.js?v=7639b443';
import { renderHeaderChips } from './gamify.js?v=7639b443';

/* ---------------- theme ---------------- */
export function initTheme() {
  const saved = load(K.theme, null) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
  document.addEventListener('app:theme', (e) => updateThemeIcon(e.detail));
}
function updateThemeIcon(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f6f4ef');
}

/* ---------------- views ---------------- */
const viewHooks = {};
export function onView(name, fn) { (viewHooks[name] = viewHooks[name] || []).push(fn); }
export function showView(name) {
  $$('.view').forEach(v => {
    const on = v.dataset.view === name;
    v.hidden = !on;
    v.classList.toggle('active', on);
  });
  const primary = name === 'league' ? 'league' : name === 'settings' ? 'settings' : 'course';
  $$('.bn-item').forEach(t => {
    const on = t.dataset.view === primary;
    t.classList.toggle('active', on);
    t.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const view = $(`.view[data-view="${name}"]`);
  if (view) view.scrollTop = 0;
  (viewHooks[name] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  document.dispatchEvent(new CustomEvent('app:view', { detail: name }));
  window.scrollTo(0, 0);
}
export function currentView() {
  const v = $('.view.active');
  return v ? v.dataset.view : 'home';
}

export function initTabs() {
  const nav = document.getElementById('bottomNav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('.bn-item');
      if (!b) return;
      showView(b.dataset.view);
    });
  }
  $$('[data-goto]').forEach(btn => {
    if (btn.dataset.gotoBound) return;
    btn.dataset.gotoBound = '1';
    btn.addEventListener('click', () => {
      showView(btn.dataset.goto);
      if (btn.dataset.audio) {
        document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: btn.dataset.audio }));
      }
    });
  });
  document.addEventListener('app:view', () => {
    $$('[data-goto]').forEach(btn => {
      if (btn.dataset.gotoBound) return;
      btn.dataset.gotoBound = '1';
      btn.addEventListener('click', () => {
        showView(btn.dataset.goto);
        if (btn.dataset.audio) document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: btn.dataset.audio }));
      });
    });
  });
}

/* ---------------- subject ---------------- */
export function renderSubjectUI() {
  const s = currentSubject();
  const icon = $('#subjectIcon'), label = $('#subjectLabel');
  if (icon) icon.textContent = s.icon;
  if (label) label.textContent = s.label;
  document.querySelectorAll('[data-subject-name]').forEach(n => { n.textContent = s.label; });
}

export function openSubjectPicker() {
  const items = SUBJECTS.map(s => `
    <button class="subj-item ${state.subject === s.id ? 'on' : ''}" data-sid="${s.id}" type="button">
      <span class="si-ico">${s.icon}</span>
      <span>${s.label}<small>${s.hint}</small></span>
    </button>`).join('');
  const modal = openModal(`
    <div class="modal-head"><h2>과목 선택</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <div class="subj-grid" id="subjGrid">${items}</div>
      <div class="custom-subj">
        <input id="customSubjInput" placeholder="직접 입력 (예: 경제, 제2외국어)" value="${escapeHtml(state.customLabel)}" maxlength="16" />
        <button class="ghost-btn small" id="customSubjBtn" type="button">사용</button>
      </div>
      <p class="fine">과목을 바꾸면 튜터의 설명 방식과 예시가 그 과목에 맞춰집니다. 대화·계획·카드는 과목별로 따로 저장돼요.</p>
    </div>`);
  modal.root.querySelector('#subjGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sid]');
    if (!b) return;
    setSubject(b.dataset.sid);
    renderSubjectUI();
    modal.close();
    toast(`${SUBJECTS.find(s => s.id === b.dataset.sid).label} 과목으로 바꿨어요`);
  });
  const useCustom = () => {
    const v = modal.root.querySelector('#customSubjInput').value.trim();
    if (!v) { toast('과목 이름을 입력해 주세요.', 'err'); return; }
    setSubject('custom', v);
    renderSubjectUI();
    modal.close();
    toast(`"${v}" 과목으로 바꿨어요`);
  };
  modal.root.querySelector('#customSubjBtn').addEventListener('click', useCustom);
  modal.root.querySelector('#customSubjInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') useCustom(); });
}

export function initSubject() {
  renderSubjectUI();
  document.addEventListener('app:subject', renderSubjectUI);
}

/* ---------------- API key ---------------- */
export function renderKeyState() {
  const ok = hasKey();
  const dot = $('#keyDot'), banner = $('#keyBanner');
  if (dot) dot.classList.toggle('ok', ok);
  if (banner) banner.hidden = ok;
  document.dispatchEvent(new CustomEvent('app:key', { detail: ok }));
}

export function openKeyModal() {
  const ok = hasKey();
  const modelLine = getModel() ? `${getModel()}` : '자동 선택 (연결 시 Flash 모델 탐색)';
  const modal = openModal(`
    <div class="modal-head"><h2>Gemini API 키 연결</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">이 앱은 <b>각자 무료 Google AI Studio 키</b>로 Gemini를 브라우저에서 직접 호출합니다. 키는 서버를 거치지 않고 <b>이 기기 브라우저(localStorage)에만</b> 저장돼요. 친구에게 앱을 공유해도 키는 각자 것을 씁니다.</p>
      <ol class="steps">
        <li><span class="num">1</span><div><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> 에 접속해 Google 계정으로 로그인</div></li>
        <li><span class="num">2</span><div><b>Create API key</b> → 프로젝트 선택 → 키 생성 (무료, 카드 등록 없음)</div></li>
        <li><span class="num">3</span><div>만들어진 키(<code>AIza…</code>)를 복사해 아래에 붙여넣고 <b>저장하고 연결 테스트</b></div></li>
      </ol>
      <label class="field"><span>API 키</span>
        <input id="apiKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="AIza..." value="${escapeHtml(getKey())}" />
      </label>
      <div class="status" id="keyStatus" hidden></div>
      <div class="key-foot">
        <button class="primary" id="keySave" type="button">저장하고 연결 테스트</button>
        <button class="ghost-btn danger" id="keyDelete" type="button">키 삭제</button>
      </div>
      <p class="fine">사용 모델: <b id="modelInfo">${escapeHtml(modelLine)}</b><br/>
      무료 키는 모델별 사용량 한도가 있어요. 한도에 걸리면 다른 Flash 모델로 자동 전환합니다.<br/>
      학교 공용 PC에서는 사용 후 키를 삭제하세요.</p>
    </div>`);

  const input = modal.root.querySelector('#apiKeyInput');
  const status = modal.root.querySelector('#keyStatus');
  const saveBtn = modal.root.querySelector('#keySave');
  const delBtn = modal.root.querySelector('#keyDelete');

  const setStatus = (html, cls = '') => {
    status.hidden = false;
    status.className = 'status ' + cls;
    status.innerHTML = html;
  };

  saveBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) { setStatus('키를 입력해 주세요.', 'err'); return; }
    if (!/^AIza[0-9A-Za-z_\-]{10,}$/.test(key) && key.length < 20) {
      setStatus('키 형식이 조금 이상해요. <b>AIza…</b>로 시작하는 전체 키를 붙여넣어 주세요.', 'err');
      return;
    }
    saveBtn.disabled = true;
    setStatus('<span class="spinner"></span> 키를 확인하고 사용 가능한 모델을 찾는 중…');
    try {
      setKey(key);
      const result = await connectTest(key, (msg) => setStatus(`<span class="spinner"></span> ${escapeHtml(msg)}`));
      setStatus(`✅ 연결됐어요! 사용 모델: <b>${escapeHtml(result.model)}</b> · 사용 가능한 Flash 모델 ${result.models.filter(m => /flash/i.test(m)).length}개`, 'ok');
      modal.root.querySelector('#modelInfo').textContent = result.model;
      renderKeyState();
      toast('Gemini 연결 완료', 'xp');
      setTimeout(() => modal.close(), 1200);
    } catch (e) {
      clearKey();
      renderKeyState();
      setStatus('❌ ' + escapeHtml(e.message || '연결에 실패했어요.'), 'err');
    } finally {
      saveBtn.disabled = false;
    }
  });

  delBtn.addEventListener('click', () => {
    if (!confirm('이 기기에 저장된 API 키를 삭제할까요?')) return;
    clearKey();
    renderKeyState();
    input.value = '';
    setStatus('키를 삭제했어요. 다시 사용하려면 새로 연결해 주세요.');
    modal.root.querySelector('#modelInfo').textContent = '자동 선택 (연결 시 Flash 모델 탐색)';
  });
}

export function initKey() {
  renderKeyState();
}

export function initMaterialsButton() {
  const b = document.getElementById('materialsBtn');
  if (b) b.addEventListener('click', () => openMaterialsModal(() => renderMaterialCount()));
}

/* ---------------- materials ---------------- */
export function renderMaterialCount() {
  const n = state.materials.length;
  const b = $('#matCount');
  if (b) b.textContent = String(n);
}

function kindIcon(kind) { return kind === 'pdf' ? '📕' : kind === 'txt' ? '📄' : '📝'; }

export function addMaterial(mat) {
  if (state.materials.length >= 12) {
    state.materials.shift();
    toast('자료는 최대 12개까지 보관돼요. 오래된 자료를 지웠어요.');
  }
  state.materials.push(mat);
  saveMaterials();
  renderMaterialCount();
  document.dispatchEvent(new CustomEvent('app:materials'));
}
export function removeMaterial(id) {
  state.materials = state.materials.filter(m => m.id !== id);
  saveMaterials();
  renderMaterialCount();
  document.dispatchEvent(new CustomEvent('app:materials'));
}

export function openMaterialsModal(afterChange) {
  const render = () => {
    const list = state.materials.length ? state.materials.map(m => `
      <div class="mat-item" data-mid="${m.id}">
        <span class="m-ico">${kindIcon(m.kind)}</span>
        <div class="m-main"><b>${escapeHtml(m.name)}</b><small>${fmt(m.chars)}자 · ${new Date(m.createdAt).toLocaleDateString('ko-KR')} 추가</small></div>
        <button class="m-del" data-view-mat="${m.id}" type="button">보기</button>
        <button class="m-del" data-del-mat="${m.id}" type="button">삭제</button>
      </div>`).join('')
      : '<p class="mat-empty">아직 자료가 없어요.<br/>시험 범위 PDF, 필기 사진, 정리한 TXT를 올려 두면 튜터·퀴즈·계획·팟캐스트가 이 내용을 참고합니다.</p>';
    host.innerHTML = list + `
      <div class="row">
        <button class="ghost-btn small" id="matAddFile" type="button">📄 PDF · TXT 올리기</button>
        <button class="ghost-btn small" id="matAddNote" type="button">✍️ 직접 붙여넣기</button>
      </div>`;
  };

  const modal = openModal(`
    <div class="modal-head"><h2>학습 자료</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body"><div id="matList"></div></div>`);
  const host = modal.root.querySelector('#matList');
  render();

  modal.root.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-mat]');
    if (del) {
      removeMaterial(del.dataset.delMat);
      render();
      afterChange && afterChange();
      return;
    }
    const view = e.target.closest('[data-view-mat]');
    if (view) {
      const m = state.materials.find(x => x.id === view.dataset.viewMat);
      if (!m) return;
      openModal(`
        <div class="modal-head"><h2>${escapeHtml(m.name)}</h2><button class="icon-btn" data-close type="button">✕</button></div>
        <div class="modal-body"><pre class="code-block">${escapeHtml(m.text.slice(0, 6000))}</pre></div>`);
      return;
    }
    if (e.target.closest('#matAddFile')) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.pdf,.txt,text/plain,application/pdf';
      inp.multiple = true;
      inp.addEventListener('change', async () => {
        for (const f of Array.from(inp.files || [])) {
          try {
            const mat = await fileToMaterial(f);
            if (mat) addMaterial(mat);
          } catch (err) { toast(err.message || '자료를 읽지 못했어요.', 'err'); }
        }
        render();
        afterChange && afterChange();
      });
      inp.click();
      return;
    }
    if (e.target.closest('#matAddNote')) {
      const noteModal = openModal(`
        <div class="modal-head"><h2>직접 붙여넣기</h2><button class="icon-btn" data-close type="button">✕</button></div>
        <div class="modal-body">
          <label class="field"><span>제목</span><input id="noteName" placeholder="예: 통합과학 2단원 정리" /></label>
          <label class="field" style="margin-top:10px"><span>내용</span><textarea id="noteText" rows="8" placeholder="필기나 정리한 내용을 붙여넣으세요."></textarea></label>
          <div class="row"><button class="primary" id="noteSave" type="button">자료로 저장</button></div>
        </div>`);
      noteModal.root.querySelector('#noteSave').addEventListener('click', () => {
        const name = noteModal.root.querySelector('#noteName').value.trim() || '직접 입력한 자료';
        const text = noteModal.root.querySelector('#noteText').value.trim();
        if (!text) { toast('내용을 입력해 주세요.', 'err'); return; }
        addMaterial({ id: uid('mat'), name, kind: 'note', chars: text.length, text: text.slice(0, 12000), createdAt: Date.now() });
        noteModal.close();
        render();
        afterChange && afterChange();
        toast('자료를 저장했어요');
      });
    }
  });
}

/* ---- file → material ---- */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
    r.readAsDataURL(file);
  });
}

export async function fileToMaterial(file) {
  const name = file.name || '자료';
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') {
    const text = await extractPdfText(file);
    if (!text.trim()) throw new Error(`"${name}"에서 글자를 찾지 못했어요. 스캔 PDF는 사진으로 찍어 올려 주세요.`);
    return { id: uid('mat'), name, kind: 'pdf', chars: text.length, text: text.slice(0, 16000), createdAt: Date.now() };
  }
  if (/\.txt$/i.test(name) || /^text\//.test(file.type)) {
    const text = await file.text();
    return { id: uid('mat'), name, kind: 'txt', chars: text.length, text: text.slice(0, 16000), createdAt: Date.now() };
  }
  const dataUrl = await fileToDataUrl(file);
  return { id: uid('mat'), name, kind: 'img', chars: 0, text: '', dataUrl, createdAt: Date.now() };
}

async function extractPdfText(file) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('PDF 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({
    data: buf,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;
  const pages = Math.min(pdf.numPages, 30);
  let out = '';
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map(it => it.str).join(' ') + '\n';
    if (out.length > 16000) break;
  }
  return out;
}

/** 폼 안의 자료 체크 칩 */
export function renderMaterialPicker(container, selected) {
  if (!container) return;
  const set = selected || new Set();
  container.innerHTML = '';
  state.materials.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mat-opt' + (set.has(m.id) ? ' on' : '');
    b.innerHTML = `${kindIcon(m.kind)} ${escapeHtml(m.name.length > 18 ? m.name.slice(0, 18) + '…' : m.name)}`;
    b.addEventListener('click', () => {
      if (set.has(m.id)) set.delete(m.id); else set.add(m.id);
      b.classList.toggle('on');
      container.dispatchEvent(new CustomEvent('matchange'));
    });
    container.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'mat-opt';
  add.innerHTML = '＋ 자료 추가';
  add.addEventListener('click', () => openMaterialsModal(() => renderMaterialPicker(container, set)));
  container.appendChild(add);
}
export function selectedMaterials(set) {
  return state.materials.filter(m => set.has(m.id));
}

/* ---------------- image helpers ---------------- */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onload = () => {
        try {
          const max = 1400;
          const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), mimeType: 'image/jpeg', name: file.name || '사진' });
        } catch (e) {
          resolve({ dataUrl: src, mimeType: file.type || 'image/jpeg', name: file.name || '사진' });
        }
      };
      img.onerror = () => {
        if (/heic|heif/i.test(file.type || '') || /\.heic$/i.test(file.name || '')) {
          reject(new Error('아이폰 HEIC 사진은 브라우저에서 변환할 수 없어요. 설정 > 카메라 > 포맷을 "높은 호환성"으로 바꾸거나 스크린샷으로 올려 주세요.'));
        } else {
          resolve({ dataUrl: src, mimeType: file.type || 'image/jpeg', name: file.name || '사진' });
        }
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}

/* ---------------- speech (TTS / STT) ---------------- */
let voices = [];
function refreshVoices() {
  try { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (e) { voices = []; }
}
if ('speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
export function koVoice() {
  if (!voices.length) refreshVoices();
  return voices.find(v => /ko[-_]KR/i.test(v.lang)) || voices.find(v => /^ko/i.test(v.lang)) || null;
}
export function ttsSupported() { return 'speechSynthesis' in window; }
export function sttSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

let speakToken = 0;
export function stopSpeaking() {
  speakToken++;
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  document.dispatchEvent(new CustomEvent('tts:stop'));
}
function splitSpeech(text, max = 170) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?。？！])\s+/);
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > max) {
      if (cur) out.push(cur.trim());
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
        cur = '';
      } else cur = s;
    } else cur = (cur + ' ' + s).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}
export function speak(text, { rate = 1, pitch = 1, onEnd, onStart, onProgress } = {}) {
  if (!ttsSupported()) { toast('이 브라우저는 음성 읽기를 지원하지 않아요.', 'err'); return; }
  stopSpeaking();
  const token = ++speakToken;
  const chunks = splitSpeech(text);
  if (!chunks.length) { onEnd && onEnd(); return; }
  let i = 0;
  const next = () => {
    if (token !== speakToken) return;
    if (i >= chunks.length) { onEnd && onEnd(); return; }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    u.lang = 'ko-KR';
    u.rate = Math.max(0.5, Math.min(2, rate));
    u.pitch = Math.max(0.4, Math.min(2, pitch));
    const v = koVoice();
    if (v) u.voice = v;
    u.onend = () => { onProgress && onProgress(i, chunks.length); next(); };
    u.onerror = () => { if (token === speakToken) next(); };
    try { window.speechSynthesis.speak(u); } catch (e) {}
  };
  onStart && onStart();
  next();
}

export function listen({ onResult, onEnd, onError } = {}) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    toast('이 브라우저는 음성 인식을 지원하지 않아요. 텍스트로 입력해 주세요.', 'err');
    onError && onError('unsupported');
    return null;
  }
  const rec = new Rec();
  rec.lang = 'ko-KR';
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let finalText = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onResult && onResult({ finalText, interim });
  };
  rec.onerror = (e) => { onError && onError(e.error || 'error'); };
  rec.onend = () => { onEnd && onEnd(); };
  try { rec.start(); } catch (e) { onError && onError('start'); }
  return rec;
}

/* ---------------- small helpers ---------------- */
export function setStatus(node, html, cls = '') {
  if (!node) return;
  if (html == null) { node.hidden = true; return; }
  node.hidden = false;
  node.className = 'status ' + cls;
  node.innerHTML = html;
}
export function loading(node, msg) {
  setStatus(node, `<span class="spinner"></span> ${escapeHtml(msg)}`);
}
export function errorStatus(node, e) {
  setStatus(node, '❌ ' + escapeHtml(e && e.message ? e.message : '문제가 생겼어요.'), 'err');
}
export function scrollToBottom(node) {
  if (!node) return;
  node.scrollTop = node.scrollHeight;
}
export function toastCopy(text, label = '복사했어요') {
  navigator.clipboard.writeText(text).then(() => toast(label)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(label); } catch (e) { toast('복사하지 못했어요.', 'err'); }
    ta.remove();
  });
}
