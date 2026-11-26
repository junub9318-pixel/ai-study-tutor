/* =========================================================
   core.js — 상수, 저장소, 상태, 유틸, Gemini 클라이언트
   ========================================================= */

export const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const SUBJECTS = [
  { id: 'korean',  label: '국어',        icon: '📖', hint: '문학 · 독서 · 문법', suggestions: [
      '시조 "진달래꽃"의 표현법을 알려줘', '문법: 높임 표현에서 자주 틀리는 것', '비문학 지문 요약하는 법', '서술형 답안 쓰는 요령' ] },
  { id: 'english', label: '영어',        icon: '🔤', hint: '독해 · 문법 · 어휘', suggestions: [
      '가정법 과거 문제 같이 풀자', '관계대명사 that과 which의 차이', '빈칸 추론 문제 접근법', '수능 필수 영단어 20개로 퀴즈 내줘' ] },
  { id: 'math',    label: '수학',        icon: '📐', hint: '공통수학 · 수학 I·II', suggestions: [
      '이차방정식 근의 공식 유도부터 알려줘', '삼각함수 그래프 그리는 방법', '미분계수 개념을 쉽게', '이 문제 사진으로 보낼게' ] },
  { id: 'social',  label: '사회',        icon: '🌏', hint: '통합사회 · 한국지리 · 세계사', suggestions: [
      '정의의 네 가지 유형 정리', '한국지리 기후 그래프 해석', '세계사 산업혁명 흐름', '사회 문제 서술형 답안 구성' ] },
  { id: 'science', label: '과학',        icon: '🔬', hint: '통합과학 · 물리 · 화학 · 생명', suggestions: [
      '뉴턴 운동 제2법칙 문제 풀이', '몰 농도 계산 문제', '광합성 명반응과 암반응', '지구 온난화 피드백 과정' ] },
  { id: 'history', label: '한국사',      icon: '🏺', hint: '전근대 · 근현대 · 연표', suggestions: [
      '조선 후기 사회 변동 연표로 정리', '3·1운동 전개 과정', '헷갈리는 근현대 사건 구분법', '한국사 연표 암기 팁' ] },
  { id: 'ai',      label: '인공지능기초', icon: '🤖', hint: 'AI 원리 · 데이터 · 윤리', suggestions: [
      '지도학습과 비지도학습 차이', '신경망 역전파를 쉽게 설명해줘', 'AI 윤리 쟁점 토론', '데이터 편향 사례 알려줘' ] },
];

export const CUSTOM_SUBJECT = { id: 'custom', label: '내 과목', icon: '✏️', hint: '직접 입력한 과목' };

/* localStorage keys */
export const K = {
  key: 'aitutor.v1.key',
  model: 'aitutor.v1.model',
  models: 'aitutor.v1.models',
  theme: 'aitutor.v1.theme',
  subject: 'aitutor.v1.subject',
  custom: 'aitutor.v1.customSubject',
  chats: 'aitutor.v1.chats',
  materials: 'aitutor.v1.materials',
  plans: 'aitutor.v1.plans',
  quizzes: 'aitutor.v1.quizzes',
  decks: 'aitutor.v1.decks',
  podcasts: 'aitutor.v1.podcasts',
  sims: 'aitutor.v1.sims',
  oral: 'aitutor.v1.oral',
  profile: 'aitutor.v1.profile',
  friends: 'aitutor.v1.friends',
  settings: 'aitutor.v1.settings',
  daily: 'aitutor.v1.daily',
  setup: 'aitutor.v1.setup',
  courses: 'aitutor.v1.courses',
};

/* ---------------- storage ---------------- */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('[storage]', e && e.name); return false; }
}
export function removeKey(key) { try { localStorage.removeItem(key); } catch (e) {} }

/* ---------------- state ---------------- */
export const state = {
  subject: load(K.subject, 'math'),
  customLabel: load(K.custom, ''),
  materials: load(K.materials, []),
  pending: { images: [], materials: [] },
  settings: Object.assign({
    mode: 'socratic', autoSpeak: false, ttsRate: 1, showBots: true, dailyGoal: 50,
  }, load(K.settings, {})),
  modelCache: load(K.models, []),
  busy: false,
};
export function saveSettings() { save(K.settings, state.settings); }
export function saveMaterials() { save(K.materials, state.materials); }

export function subjectById(id) {  return SUBJECTS.find(s => s.id === id) || null;
}
export function currentSubject() {
  if (state.subject === 'custom') {
    return { ...CUSTOM_SUBJECT, label: state.customLabel || '내 과목' };
  }
  return subjectById(state.subject) || SUBJECTS[2];
}
export function subjectKey() {
  const s = currentSubject();
  return s.id === 'custom' ? 'custom:' + (state.customLabel || '') : s.id;
}
export function setSubject(id, customLabel) {
  state.subject = id;
  if (customLabel != null) state.customLabel = customLabel;
  save(K.subject, state.subject);
  save(K.custom, state.customLabel);
  document.dispatchEvent(new CustomEvent('app:subject'));
}

/* ---------------- learner profile (온보딩) ---------------- */
export function getSetup() {
  return load(K.setup, null);
}
export function saveSetup(patch) {
  const next = Object.assign({}, getSetup() || {}, patch || {});
  save(K.setup, next);
  document.dispatchEvent(new CustomEvent('app:setup'));
  return next;
}
export function learnerLabel() {
  const s = getSetup() || {};
  if (!s.level && !s.grade) return '고등학생';
  return `${s.country || '대한민국'} ${s.level || ''} ${s.grade || ''}`.trim();
}
export function learnerContext() {
  const s = getSetup();
  if (!s) return '[학생 정보] 대한민국 고등학교 1학년. 한국 교육과정 기준으로 설명한다.';
  const dd = s.examDate ? dday(s.examDate) : null;
  const lines = [
    `[학생 정보]`,
    `- 국가·교육과정: ${s.country || '대한민국'}`,
    `- 학교급·학년: ${s.level || ''} ${s.grade || ''}`.trim(),
    s.school ? `- 학교: ${s.school}` : '',
    s.schoolNote ? `- 학교 교육과정 메모: ${s.schoolNote}` : '',
    `- 스스로 평가한 수준: ${s.levelSelf || '보통'}`,
    s.examDate ? `- 시험: ${s.examDate} (${dd != null ? 'D-' + Math.max(0, dd) : '예정'}), 목표: ${s.goalPct || 70}%` : `- 시험: 미정, 목표: ${s.goalPct || 70}%`,
    `- 하루 학습 가능 시간: ${s.dailyMinutes || 60}분`,
    '',
    `이 학생의 국가·학교급·학년 교육과정에 맞는 단원 범위와 설명 수준으로 답한다. 시험 범위가 있으면 그 범위를 우선한다.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/* ---------------- dom utils ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
export function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
export function uid(prefix = '') { return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function dayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}
export function weekStartKey(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - day);
  return dayKey(dt);
}
export function weekKey() { return weekStartKey(); }
export function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${m}/${d} (${wd})`;
}
export function dday(targetKey) {
  const [y, m, d] = targetKey.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - todayUtc) / 86400000);
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------------- rich text (markdown + KaTeX) ---------------- */
const PH = '\u0000';
function renderMathHtml(tex, display) {
  const k = window.katex;
  if (!k || !k.renderToString) return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
  try {
    return k.renderToString(tex, { displayMode: !!display, throwOnError: false, strict: false, trust: false, output: 'html' });
  } catch (e) {
    return `<code class="math-fallback">${escapeHtml(tex)}</code>`;
  }
}
function inlineFmt(s) {
  return s
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function splitRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map(c => c.trim());
}
function blocksToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length + 1, 6);
      out.push(`<h${lvl}>${inlineFmt(h[2])}</h${lvl}>`);
      i++; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inlineFmt(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${inlineFmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${blocksToHtml(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        let content = lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          content += ' ' + lines[i].trim(); i++;
        }
        items.push(`<li>${inlineFmt(content)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,6}\s|\s*([-*•]|\d+[.)])\s|>)/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isSep(lines[i + 1]))) {
      buf.push(lines[i]); i++;
    }
    if (buf.length) out.push(`<p>${inlineFmt(buf.join('\n')).replace(/\n/g, '<br>')}</p>`);
    else i++;
  }
  return out.join('');
}

export function renderRich(src) {
  if (!src) return '';
  let text = String(src);

  const codes = [];
  text = text.replace(/```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    codes.push({ lang, code: code.replace(/\n$/, '') });
    return `${PH}C${codes.length - 1}${PH}`;
  });

  const inlines = [];
  text = text.replace(/`([^`\n]+)`/g, (m, code) => {
    inlines.push(code); return `${PH}I${inlines.length - 1}${PH}`;
  });

  const maths = [];
  const pushMath = (tex, display) => { maths.push({ tex: tex.trim(), display }); return `${PH}M${maths.length - 1}${PH}`; };
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => pushMath(t, true));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (m, t) => pushMath(t, true));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (m, t) => pushMath(t, false));
  text = text.replace(/\$([^$\n]{1,400}?)\$/g, (m, t) => pushMath(t, false));

  let html = blocksToHtml(escapeHtml(text));

  html = html.replace(new RegExp(PH + 'M(\\d+)' + PH, 'g'), (m, idx) => {
    const item = maths[+idx]; return item ? renderMathHtml(item.tex, item.display) : '';
  });
  html = html.replace(new RegExp(PH + 'I(\\d+)' + PH, 'g'), (m, idx) =>
    `<code>${escapeHtml(inlines[+idx] == null ? '' : inlines[+idx])}</code>`);
  html = html.replace(new RegExp(PH + 'C(\\d+)' + PH, 'g'), (m, idx) =>
    `<pre class="code"><code>${escapeHtml(codes[+idx] ? codes[+idx].code : '')}</code></pre>`);
  return html;
}

/** 읽어 줄 수 있는 평문으로 변환 (수식·마크다운 제거) */
export function toSpeech(text) {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, ' 코드 블록 생략. ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' 수식. ')
    .replace(/\$[^$\n]*\$/g, ' 수식 ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' 수식. ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|]/g, ' ')
    .replace(/^\s*[-•]\s*/gm, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

/* ---------------- toast / modal ---------------- */
export function toast(message, type = 'info', ms = 2600) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  node.textContent = message;
  host.appendChild(node);
  while (host.children.length > 3) host.removeChild(host.firstElementChild);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 320);
  }, ms);
}

export function openModal(innerHtml, { className = '', onClose } = {}) {
  const root = document.getElementById('modalRoot');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  root.appendChild(back);
  const close = () => {
    if (!back.parentNode) return;
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { root: back, close };
}

/* =========================================================
   Gemini API client (BYOK · 브라우저 직접 호출)
   ========================================================= */
export const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', retryable = false, raw = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.raw = raw;
  }
}

export function getKey() { try { return localStorage.getItem(K.key) || ''; } catch (e) { return ''; } }
export function setKey(value) { localStorage.setItem(K.key, String(value).trim()); }
export function clearKey() { localStorage.removeItem(K.key); localStorage.removeItem(K.model); }
export function getModel() { try { return localStorage.getItem(K.model) || ''; } catch (e) { return ''; } }
export function setModel(id) { try { localStorage.setItem(K.model, id); } catch (e) {} }
export function hasKey() { return !!getKey(); }

function friendly(status, apiMessage) {
  const msg = String(apiMessage || '');
  if (/api key not valid|API_KEY_INVALID|API key not valid/i.test(msg)) {
    return { text: 'API 키가 올바르지 않습니다. aistudio.google.com/apikey 에서 키를 다시 확인해 주세요.', code: 'bad_key', retryable: false };
  }
  if (status === 403) return { text: '이 키로는 요청이 거부되었습니다(403). 키에 Generative Language API 사용이 허용되어 있는지 확인해 주세요.', code: 'forbidden', retryable: false };
  if (status === 429) return { text: '무료 사용량 한도를 넘었어요. 잠시(1분~하루) 뒤에 다시 시도하거나 다른 모델로 넘어갈게요.', code: 'quota', retryable: true };
  if (status === 404) return { text: '이 모델을 이 키에서 사용할 수 없습니다. 다른 Flash 모델로 시도할게요.', code: 'no_model', retryable: true };
  if (status === 400) {
    if (/safety|blocked|SAFETY/i.test(msg)) return { text: '요청이 안전 정책으로 차단되었습니다. 표현을 조금 바꿔 다시 보내 주세요.', code: 'safety', retryable: false };
    return { text: '요청을 처리하지 못했습니다(400). ' + (msg ? msg.slice(0, 160) : ''), code: 'bad_request', retryable: false };
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return { text: 'Gemini 서버가 잠시 혼잡합니다. 잠시 후 다시 시도해 주세요.', code: 'server', retryable: true };
  }
  if (!status) return { text: '네트워크 연결을 확인해 주세요. (요청이 서버에 닿지 않았습니다)', code: 'network', retryable: true };
  return { text: `요청에 실패했습니다 (${status}). ${msg.slice(0, 160)}`, code: 'unknown', retryable: status >= 500 };
}

async function toApiError(res) {
  let apiMessage = '';
  try {
    const data = await res.json();
    apiMessage = data && data.error ? (data.error.message || '') : '';
  } catch (e) {
    try { apiMessage = await res.text(); } catch (e2) {}
  }
  const f = friendly(res.status, apiMessage);
  return new ApiError(f.text, { status: res.status, code: f.code, retryable: f.retryable, raw: apiMessage });
}

async function apiRequest(path, { method = 'POST', body, key = getKey(), signal } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    const f = friendly(0, '');
    throw new ApiError(f.text, { code: f.code, retryable: true });
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function listModels(key = getKey()) {
  const res = await apiRequest('/models?pageSize=200', { method: 'GET', key });
  const data = await res.json();
  const models = (data.models || []).map(m => ({
    id: String(m.name || '').replace(/^models\//, ''),
    methods: m.supportedGenerationMethods || [],
    displayName: m.displayName || '',
  })).filter(m => m.id && m.methods.includes('generateContent'));
  return models;
}

const BAD_MODEL = /(tts|image|audio|omni|robotics|computer-use|transcribe|embedding|embed|lyria|gemma|antigravity|deep-research|nano-banana)/i;

function scoreModel(id) {
  if (!/flash/i.test(id)) return -Infinity;
  if (BAD_MODEL.test(id)) return -Infinity;
  let score = 0;
  const stable = !/(preview|exp|latest)/i.test(id);
  const lite = /lite/i.test(id);
  if (stable) score += 60;
  if (!lite) score += 45;
  const v = id.match(/gemini-(\d+(?:\.\d+)?)/);
  if (v) score += Math.min(parseFloat(v[1]), 6) * 3;
  if (/-flash$/.test(id)) score += 12;
  return score;
}

function unique(list) {
  const out = [];
  for (const v of list) if (v && !out.includes(v)) out.push(v);
  return out;
}

export function candidateChain(preferred) {
  const cached = (state.modelCache || []).filter(id => scoreModel(id) > -Infinity)
    .sort((a, b) => scoreModel(b) - scoreModel(a)).slice(0, 5);
  return unique([preferred, getModel(), ...cached, ...MODEL_CHAIN]);
}

function extractText(data, streamPart = false) {
  if (!data) return '';
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new ApiError('요청이 안전 정책으로 차단되었습니다. 표현을 바꿔 다시 보내 주세요.', { code: 'safety', retryable: false });
  }
  const cand = (data.candidates || [])[0];
  if (!cand) return '';
  const parts = (cand.content && cand.content.parts) || [];
  return parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
}

/** 모델 탐색 + 실제 호출 테스트 */
export async function connectTest(key = getKey(), onProgress) {
  if (!key) throw new ApiError('API 키를 먼저 입력해 주세요.', { code: 'no_key' });
  onProgress && onProgress('키 확인 중…');
  const models = await listModels(key);
  state.modelCache = models.map(m => m.id);
  save(K.models, state.modelCache);
  const flash = models.filter(m => scoreModel(m.id) > -Infinity)
    .sort((a, b) => scoreModel(b.id) - scoreModel(a.id))
    .map(m => m.id);
  const chain = unique([...flash.slice(0, 6), ...MODEL_CHAIN]);
  if (!chain.length) throw new ApiError('이 키에서 사용할 수 있는 Flash 모델을 찾지 못했습니다.', { code: 'no_model' });

  let lastErr = null;
  for (const id of chain) {
    try {
      onProgress && onProgress(`${id} 확인 중…`);
      const res = await apiRequest(`/models/${id}:generateContent`, {
        key,
        body: {
          contents: [{ role: 'user', parts: [{ text: '연결 확인. "ok"라고만 답해.' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 32 },
        },
      });
      await res.json();
      setModel(id);
      return { model: id, models: state.modelCache };
    } catch (e) {
      lastErr = e;
      if (e.code === 'bad_key' || e.code === 'forbidden') throw e;
    }
  }
  throw lastErr || new ApiError('연결 테스트에 실패했습니다.', { code: 'unknown', retryable: true });
}

function buildBody({ system, parts, contents, temperature = 0.7, maxTokens = 4096, json = false, schema }) {
  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  if (schema) generationConfig.responseSchema = schema;
  return {
    contents: contents || [{ role: 'user', parts }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
}

export async function generateText(opts) {
  if (!getKey()) throw new ApiError('API 키를 먼저 연결해 주세요.', { code: 'no_key' });
  const chain = candidateChain(opts.model);
  let lastErr = null;
  for (const id of chain) {
    let res;
    try {
      res = await apiRequest(`/models/${id}:generateContent`, { body: buildBody(opts), signal: opts.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (e.code === 'bad_key' || e.code === 'forbidden' || !e.retryable) throw e;
      continue;
    }
    const data = await res.json();
    const text = extractText(data);
    if (!text) {
      lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
      continue;
    }
    if (!getModel()) setModel(id);
    return text;
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

export async function generateJSON(opts) {
  const text = await generateText({ ...opts, json: true, temperature: opts.temperature == null ? 0.4 : opts.temperature });
  return parseJSON(text);
}

export function parseJSON(text) {
  if (!text) throw new ApiError('빈 응답을 받았습니다.', { code: 'empty' });
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) {}
  // 흔한 오류 보정: 후행 쉼표, 줄바꿈 포함 문자열
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (e) {}
  throw new ApiError('응답을 해석하지 못했습니다. 다시 시도해 주세요.', { code: 'parse', retryable: true });
}

/** 스트리밍 채팅 */
export async function streamChat({ system, contents, temperature = 0.75, maxTokens = 4096, signal, onChunk }) {
  if (!getKey()) throw new ApiError('API 키를 먼저 연결해 주세요.', { code: 'no_key' });
  const chain = candidateChain();
  let lastErr = null;
  for (const id of chain) {
    let res;
    try {
      res = await apiRequest(`/models/${id}:streamGenerateContent?alt=sse`, {
        body: buildBody({ system, contents, temperature, maxTokens }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (e.code === 'bad_key' || e.code === 'forbidden' || !e.retryable) throw e;
      continue;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let got = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let json;
            try { json = JSON.parse(payload); } catch (e) { continue; }
            const chunk = extractText(json);
            if (chunk) { got = true; onChunk && onChunk(chunk); }
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (got) throw e;
      lastErr = e;
      if (e.code === 'bad_key' || e.code === 'forbidden') throw e;
      continue;
    }
    if (!getModel()) setModel(id);
    if (!got) {
      lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
      continue;
    }
    return id;
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

/* ---------------- prompt builders ---------------- */
export function tutorSystem(subject, mode) {
  const head = `너는 ${learnerLabel()} 학생(${subject})을 1:1로 가르치는 ${subject} 과목 전문 튜터다.
학생은 시험 대비와 학교 수업 이해를 위해 너를 찾았다. 설명은 한국어로 하고, 학생의 학교급에 맞는 배경지식만 있다고 가정하고 쉬운 말로 쓴다.
수식은 반드시 LaTeX로 쓴다: 인라인은 $...$, 블록은 $$...$$. 마크다운(**강조**, 목록, 표, 코드블록)을 쓸 수 있다.

${learnerContext()}`;
  if (mode === 'summary') {
    return `${head}

[핵심 빠르게 정리 모드]
- 정답과 풀이를 바로 제공한다. 군더더기 없이 빠르게.
- 구성: "## 한 줄 요약" → "## 핵심 개념·공식" (불릿 3~6개) → 필요하면 "## 예시/풀이" → "## 자주 틀리는 함정" 1~2개.
- 전체 250단어 이내. 마지막 줄에 더 깊이 볼 부분을 묻는 짧은 질문 하나.`;
  }
  return `${head}

[단계별 1:1 과외 모드 — 기본]
1. 정답이나 완성된 풀이를 먼저 주지 않는다.
2. 첫 답변은 (a) 문제에서 구해야 하는 것 한 줄, (b) 학생이 이미 알고 있을 개념을 확인하는 질문 1~2개로 구성한다.
3. 한 번에 한 단계만 안내한다. 각 답변은 3~6문장 이내로 짧게 쓰고, 반드시 학생이 답할 수 있는 질문 하나로 끝낸다.
4. 학생이 틀리면 어디서 어긋났는지 짚고, 더 작은 힌트로 다시 묻는다. 비난하지 않고 격려한다.
5. 학생이 맞히면 "왜 그렇게 되는지" 자기 말로 설명하게 한 뒤 다음 단계로 넘어간다.
6. 학생이 "그냥 알려줘"라고 하거나 같은 지점에서 두 번 막히면 힌트 수준을 올리고, 그래도 원하면 풀이를 끝까지 보여준다. 그 뒤 같은 유형의 확인 문제 1개를 낸다.
7. 사진이나 PDF 자료가 오면 먼저 문제를 읽고 무엇을 묻는지 한 줄로 확인한 뒤 1번부터 시작한다.
8. 모르는 정보(시험 범위 등)는 추측하지 말고 짧게 되묻는다.
9. 학생이 힘들어하면 난이도를 낮추고, 잘하면 살짝 심화로 넓혀 준다.`;
}

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          unit: { type: 'string' },
          task: { type: 'string' },
          minutes: { type: 'integer' },
          method: { type: 'string' },
        },
        required: ['date', 'unit', 'task', 'minutes'],
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'tasks'],
};

export const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['객관식', '단답형'] },
          unit: { type: 'string' },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'integer' },
          answer: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['type', 'prompt', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

export const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          hint: { type: 'string' },
        },
        required: ['front', 'back'],
      },
    },
  },
  required: ['cards'],
};

export const PODCAST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['speaker', 'text'],
      },
    },
  },
  required: ['title', 'lines'],
};

export const ORAL_Q_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          modelAnswer: { type: 'string' },
        },
        required: ['prompt', 'keyPoints', 'modelAnswer'],
      },
    },
  },
  required: ['questions'],
};

export const ORAL_GRADE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    verdict: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    coachTip: { type: 'string' },
  },
  required: ['score', 'verdict'],
};

/** 자료 텍스트를 프롬프트용으로 잘라 넣기 */
export function materialContext(materials, limit = 9000) {
  if (!materials || !materials.length) return '';
  let out = '\n\n[학생이 올린 학습 자료]\n';
  let used = 0;
  for (const m of materials) {
    const text = String(m.text || '').slice(0, 4000);
    if (!text) continue;
    if (used + text.length > limit) {
      out += `\n--- ${m.name} (앞부분) ---\n${text.slice(0, Math.max(0, limit - used))}\n`;
      break;
    }
    out += `\n--- ${m.name} ---\n${text}\n`;
    used += text.length;
  }
  return out;
}
