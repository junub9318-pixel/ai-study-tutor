/* =========================================================
   ui.js — 테마 · 탭 · 과목 선택 · API 키 모달 · 자료 · 음성
   ========================================================= */
import {
  SUBJECTS, K, state, load, save, removeKey, currentSubject, setSubject,
  $, $$, el, escapeHtml, fmt, toast, openModal, hasKey, getKey, setKey, clearKey,
  connectTest, getModel, listModels, ApiError, saveSettings, saveMaterials, uid, dayKey,
  providerInfo, PROVIDER_IDS, getProvider, setProvider, getKeyFor, setKeyFor, clearKeyFor, getModelFor, canSearch,
} from './core.js?v=8e2ed827';
import { renderHeaderChips } from './gamify.js?v=8e2ed827';

/* ---------------- theme ---------------- */
export function initTheme() {
  const saved = load(K.theme, null) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
  document.addEventListener('app:theme', (e) => updateThemeIcon(e.detail));
}
function updateThemeIcon(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
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
  const active = getProvider();
  const modelLine = getModelFor(active) || '자동 선택 (연결 테스트 때 고름)';
  const modal = openModal(`
    <div class="modal-head"><h2>AI 연결 · 제공자 선택</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">Gemini · Groq · OpenRouter 중 <b>하나의 무료 키</b>만 있으면 이 앱의 모든 AI 수업(튜터·문제·카드·팟캐스트·시뮬레이션)을 쓸 수 있어요. 키는 서버를 거치지 않고 <b>이 기기 브라우저(localStorage)에만</b> 저장됩니다.</p>
      <div id="provPanel">${providerPanelHtml()}</div>
      <div class="key-foot">
        <button class="ghost-btn danger" id="keyDelete" type="button">이 제공자 키 삭제</button>
      </div>
      <p class="fine" id="modelInfo">사용 모델: <b>${escapeHtml(modelLine)}</b><br/>
      제공자를 누르면 그 제공자의 안내로 바뀌고, 키는 제공자별로 따로 저장돼요.<br/>
      학교 공용 PC에서는 사용 후 키를 삭제하세요.</p>
    </div>`);

  const host = modal.root.querySelector('#provPanel');
  const infoEl = modal.root.querySelector('#modelInfo');
  const infoHtml = (id) => {
    const mid = getModelFor(id) || '자동 선택 (연결 테스트 때 고름)';
    return `사용 모델: <b>${escapeHtml(mid)}</b><br/>제공자를 누르면 그 제공자의 안내로 바뀌고, 키는 제공자별로 따로 저장돼요.`;
  };
  const panel = bindProviderPanel(host, {
    onConnected: (r) => {
      infoEl.innerHTML = infoHtml(r.provider);
      toast(`${providerInfo(r.provider).short} 연결 완료`, 'xp');
    },
  });
  host.addEventListener('provider:change', (e) => { infoEl.innerHTML = infoHtml(e.detail); });

  modal.root.querySelector('#keyDelete').addEventListener('click', () => {
    const id = getProvider();
    if (!confirm(`${providerInfo(id).short} 키를 이 기기에서 삭제할까요?`)) return;
    clearKeyFor(id);
    renderKeyState();
    panel.refresh();
    infoEl.innerHTML = infoHtml(id);
    toast(`${providerInfo(id).short} 키를 삭제했어요`, 'info');
  });
}

export function initKey() {
  renderKeyState();
}

/* ---------------- AI 제공자 선택 · 무료 키 발급 안내 ---------------- */
function providerGuideHtml(id) {
  const p = providerInfo(id);
  return `
    <p class="prov-lead">${p.lead}</p>
    <ol class="prov-steps">
      ${p.steps.map((s, i) => `<li><span class="num">${i + 1}</span><div>${s}</div></li>`).join('')}
    </ol>
    <p class="prov-keyex">키 형식: <code>${escapeHtml(p.keyExample)}</code></p>
    <p class="prov-caution">${p.caution}</p>`;
}

/** 제공자 탭 · 무료 키 발급 안내 · 키 입력 · 연결 테스트 (온보딩·설정 공용) */
export function providerPanelHtml() {
  const active = getProvider();
  return `
    <div class="prov-pick" role="tablist" aria-label="AI 제공자 선택">
      ${PROVIDER_IDS.map(id => {
        const p = providerInfo(id);
        return `<button type="button" class="prov-card${id === active ? ' on' : ''}" data-prov="${id}" role="tab" aria-selected="${id === active}">
          <span class="prov-ico">${p.icon}</span>
          <span class="prov-name">${escapeHtml(p.short)}</span>
          <span class="prov-sub">${p.search ? 'Google · 검색' : (p.id === 'groq' ? 'Groq · 무료' : 'OpenRouter · 무료')}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="prov-guide" id="provGuide">${providerGuideHtml(active)}</div>
    <div class="onb-field">
      <label id="provKeyLabel">${escapeHtml(providerInfo(active).short)} API 키</label>
      <input class="onb-input" id="provKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(providerInfo(active).placeholder)}" value="${escapeHtml(getKeyFor(active))}" />
    </div>
    <div class="onb-key-row">
      <button class="onb-test-btn" id="provKeyTest" type="button"><span class="onb-test-label">연결 테스트</span></button>
    </div>
    <div class="onb-status-slot"><div class="status" id="provKeyStatus" hidden></div></div>`;
}

/** providerPanelHtml 로 그린 화면에 동작을 붙인다 */
export function bindProviderPanel(host, { onConnected } = {}) {
  const cards = Array.from(host.querySelectorAll('[data-prov]'));
  const guide = host.querySelector('#provGuide');
  const label = host.querySelector('#provKeyLabel');
  const input = host.querySelector('#provKeyInput');
  const testBtn = host.querySelector('#provKeyTest');
  const btnLabel = testBtn ? testBtn.querySelector('.onb-test-label') : null;
  const status = host.querySelector('#provKeyStatus');

  const setStatus = (html, cls = '') => {
    if (!status) return;
    status.hidden = false;
    status.className = 'status' + (cls ? ' ' + cls : '');
    status.innerHTML = `<span class="status-line">${html}</span>`;
  };

  const paint = (id) => {
    const p = providerInfo(id);
    cards.forEach(c => {
      const on = c.dataset.prov === id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (guide) guide.innerHTML = providerGuideHtml(id);
    if (label) label.textContent = `${p.short} API 키`;
    if (input) { input.placeholder = p.placeholder; input.value = getKeyFor(id) || ''; }
    if (status) { status.hidden = true; status.innerHTML = ''; }
    setProvider(id);
    try { host.dispatchEvent(new CustomEvent('provider:change', { detail: id })); } catch (e) {}
  };

  cards.forEach(c => c.addEventListener('click', () => paint(c.dataset.prov)));
  paint(getProvider());

  if (testBtn) testBtn.addEventListener('click', async () => {
    const id = getProvider();
    const key = input ? input.value.trim() : '';
    if (!key) { setStatus('키를 입력해 주세요.', 'err'); return; }
    testBtn.disabled = true;
    testBtn.classList.add('busy');
    if (btnLabel) btnLabel.textContent = '확인 중…';
    setStatus('<span class="spinner"></span> 키를 확인하고 사용할 수 있는 모델을 찾는 중…');
    try {
      setKeyFor(id, key);
      const r = await connectTest(key, (m) => setStatus(`<span class="spinner"></span> ${escapeHtml(m)}`), id);
      setStatus(`✅ ${escapeHtml(providerInfo(id).short)} 연결됐어요! 사용 모델: <b>${escapeHtml(r.model)}</b>`, 'ok');
      renderKeyState();
      if (onConnected) onConnected(r);
    } catch (e) {
      clearKeyFor(id);
      renderKeyState();
      setStatus('❌ ' + escapeHtml((e && e.message) || '연결에 실패했어요.'), 'err');
    } finally {
      testBtn.disabled = false;
      testBtn.classList.remove('busy');
      if (btnLabel) btnLabel.textContent = '연결 테스트';
    }
  });

  return { refresh: () => paint(getProvider()) };
}

/** 지금 고른 제공자 이름 (버튼·상태 문구용) */
export function providerName() {
  return providerInfo(getProvider()).short;
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
