/* =========================================================
   ai.js — AI 제공자 통합 클라이언트
   · Google Gemini  : generateContent (+ Google 검색 grounding)
   · Groq           : OpenAI 호환 chat/completions (검색 없음)
   · OpenRouter     : OpenAI 호환 chat/completions (검색 없음)
   키·모델·제공자 선택은 이 브라우저(localStorage)에만 저장한다.
   ========================================================= */

/* ---------------------------------------------------------
   제공자 정보 · 무료 키 발급 안내
   --------------------------------------------------------- */
export const PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    short: 'Gemini',
    icon: '✦',
    site: 'aistudio.google.com/apikey',
    url: 'https://aistudio.google.com/apikey',
    apiBase: '',
    keyExample: 'AIzaSy… (AIza로 시작하는 39자)',
    placeholder: 'AIza...',
    search: true,
    lead: '무료 한도가 가장 넉넉하고, Google 검색으로 학교·교과서 목차까지 실제로 확인할 수 있어요.',
    steps: [
      '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> 를 열고 평소 쓰는 <b>Google 계정(Gmail)</b>으로 로그인해요.',
      '오른쪽 위 <b>Create API key</b>를 누르고 <b>Create key in new project</b>를 골라요. 프로젝트 이름은 아무거나(예: ai-tutor) 넣고 <b>Create</b>를 누르면 바로 만들어져요.',
      '목록에 생긴 키의 <b>복사 아이콘</b>을 눌러 <code>AIza…</code>로 시작하는 키를 복사하고, 아래 칸에 붙여넣은 뒤 <b>연결 테스트</b>를 눌러요. 카드 등록은 필요 없어요.',
    ],
    caution: '무료 키는 분당·일일 한도가 있어요. 한도(429)에 걸리면 검색 없이 답하고, 그마저 막히면 기본 단원으로 먼저 채워요.',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    vision: '',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    short: 'Groq',
    icon: '⚡',
    site: 'console.groq.com/keys',
    url: 'https://console.groq.com/keys',
    apiBase: 'https://api.groq.com/openai/v1',
    keyExample: 'gsk_… (gsk_로 시작)',
    placeholder: 'gsk_...',
    search: false,
    lead: '응답이 아주 빠르고 무료 한도가 넉넉해요. Google 검색은 지원하지 않아 학교·교과서 정보는 AI가 아는 내용으로 확인해요.',
    steps: [
      '<a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> 를 열고 <b>Continue with Google</b>(또는 GitHub·이메일)로 가입하고 로그인해요.',
      '<b>Create API Key</b>를 누르고 이름(예: ai-tutor)을 적은 뒤 <b>Submit</b>을 눌러요.',
      '화면에 <b>딱 한 번만</b> 보이는 <code>gsk_…</code> 키를 <b>Copy</b>로 복사해 아래 칸에 붙여넣고 <b>연결 테스트</b>를 눌러요. 창을 닫으면 다시 볼 수 없으니 꼭 먼저 복사해요.',
    ],
    caution: '카드 등록 없이 무료로 쓸 수 있어요. 다만 Google 검색이 없어 "검색 확인" 대신 AI 지식으로 단원을 만들어요.',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    short: 'OpenRouter',
    icon: '🔀',
    site: 'openrouter.ai/keys',
    url: 'https://openrouter.ai/keys',
    apiBase: 'https://openrouter.ai/api/v1',
    keyExample: 'sk-or-v1-… (sk-or-로 시작)',
    placeholder: 'sk-or-v1-...',
    search: false,
    lead: '여러 회사의 무료 모델(:free)을 골라 쓸 수 있어요. Google 검색은 지원하지 않아 학교·교과서 정보는 AI가 아는 내용으로 확인해요.',
    steps: [
      '<a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> 를 열고 <b>Sign in</b>에서 Google 계정으로 로그인해요(무료 가입).',
      '<b>Create Key</b>를 누르고 이름(예: ai-tutor)을 적은 뒤 <b>Create Key</b>를 눌러요.',
      '만들어진 <code>sk-or-v1-…</code> 키를 <b>Copy</b>로 복사해 아래 칸에 붙여넣고 <b>연결 테스트</b>를 눌러요. 무료 모델(<code>:free</code>)만 써도 결제 없이 사용할 수 있어요.',
    ],
    caution: '무료 모델은 인기가 많아 가끔 붐벼요. 그때는 다른 무료 모델로 자동 전환해요.',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'google/gemma-3-27b-it:free',
    ],
    vision: 'google/gemma-3-27b-it:free',
  },
};

export const PROVIDER_IDS = ['gemini', 'groq', 'openrouter'];

export function providerInfo(id) {
  return PROVIDERS[id] || PROVIDERS.gemini;
}
export function isProviderId(id) {
  return !!PROVIDERS[id];
}

/* ---------------------------------------------------------
   저장소 (제공자별 키 · 모델 · 제공자 선택)
   --------------------------------------------------------- */
const K_PROVIDER = 'aitutor.v2.provider';
const keyName = (p) => `aitutor.v2.key.${p}`;
const modelName = (p) => `aitutor.v2.model.${p}`;
const modelsName = (p) => `aitutor.v2.models.${p}`;
const LEGACY_KEY = 'aitutor.v1.key';     // 예전 Gemini 전용 키
const LEGACY_MODEL = 'aitutor.v1.model';

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function lsJson(k, fallback) {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}

export function getProvider() {
  const p = lsGet(K_PROVIDER);
  return PROVIDERS[p] ? p : 'gemini';
}
export function setProvider(id) {
  if (!PROVIDERS[id] || id === getProvider()) return getProvider();
  lsSet(K_PROVIDER, id);
  try { document.dispatchEvent(new CustomEvent('app:provider', { detail: id })); } catch (e) {}
  return id;
}
export function currentProvider() { return providerInfo(getProvider()); }
/** 지금 고른 제공자가 Google 검색(grounding)을 쓸 수 있는지 */
export function canSearch() { return currentProvider().search === true; }

export function getKeyFor(p) {
  const v = lsGet(keyName(p));
  if (v) return v;
  if (p === 'gemini') return lsGet(LEGACY_KEY); // 예전 버전에서 저장한 Gemini 키
  return '';
}
export function setKeyFor(p, value) {
  const v = String(value || '').trim();
  lsSet(keyName(p), v);
  if (p === 'gemini') lsSet(LEGACY_KEY, v); // 다른 탭·예전 코드와 호환
}
export function clearKeyFor(p) {
  lsDel(keyName(p));
  lsDel(modelName(p));
  lsDel(modelsName(p));
  if (p === 'gemini') { lsDel(LEGACY_KEY); lsDel(LEGACY_MODEL); }
}
export function getKey() { return getKeyFor(getProvider()); }
export function setKey(value) { setKeyFor(getProvider(), value); }
export function clearKey() { clearKeyFor(getProvider()); }
export function hasKey() { return !!getKey(); }

export function getModelFor(p) { return lsGet(modelName(p)); }
export function setModelFor(p, id) { lsSet(modelName(p), String(id || '')); }
export function getModel() { return getModelFor(getProvider()); }
export function setModel(id) { setModelFor(getProvider(), id); }

function getModelsFor(p) { return lsJson(modelsName(p), []); }
function setModelsFor(p, list) { lsSet(modelsName(p), JSON.stringify((list || []).slice(0, 60))); }

/* ---------------------------------------------------------
   공통 오류
   --------------------------------------------------------- */
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

function unique(list) {
  const out = [];
  for (const v of list) if (v && !out.includes(v)) out.push(v);
  return out;
}

/** signal + 시간 제한을 하나로 묶는다 */
function timedSignal(signal, ms) {
  if (!ms) return { signal, timedOut: () => false, done() {} };
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done() { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); },
  };
}

/* ---------------------------------------------------------
   모델 이름 도우미 (제공자별)
   --------------------------------------------------------- */
const GEMINI_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
export const MODEL_CHAIN = GEMINI_CHAIN;

const BAD_GEMINI_MODEL = /(tts|image|audio|omni|robotics|computer-use|transcribe|embedding|embed|lyria|gemma|antigravity|deep-research|nano-banana)/i;

function scoreGeminiModel(id) {
  if (!/flash/i.test(id)) return -Infinity;
  if (BAD_GEMINI_MODEL.test(id)) return -Infinity;
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

function geminiCandidates() {
  return getModelsFor('gemini').filter(id => scoreGeminiModel(id) > -Infinity)
    .sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
}

/** 연결 테스트에서 이미 골라 둔 모델을 그대로 쓰는 "짧은 호출용" 모델 */
function geminiFastModel() {
  const saved = getModelFor('gemini');
  if (saved && scoreGeminiModel(saved) > -Infinity) return saved;
  return geminiCandidates()[0] || GEMINI_CHAIN[0];
}
/** 한도가 더 여유 있는 Flash-lite (429 폴백용) */
function geminiLiteModel() {
  const saved = getModelFor('gemini');
  if (saved && /lite/i.test(saved) && scoreGeminiModel(saved) > -Infinity) return saved;
  const cached = getModelsFor('gemini').filter(id => /lite/i.test(id) && scoreGeminiModel(id) > -Infinity);
  return cached[0] || 'gemini-2.5-flash-lite';
}

/** 지금 제공자(또는 지정한 제공자)에서 기본으로 쓸 모델 */
export function fastModel(provider) {
  const p = provider || getProvider();
  if (p === 'gemini') return geminiFastModel();
  const info = providerInfo(p);
  return getModelFor(p) || (info.models && info.models[0]) || '';
}
/** 한도가 더 여유 있는(가벼운) 모델 */
export function liteModel(provider) {
  const p = provider || getProvider();
  if (p === 'gemini') return geminiLiteModel();
  const info = providerInfo(p);
  return (info.models && info.models[1]) || (info.models && info.models[0]) || '';
}

/** Gemini 모델 후보 체인 (선호 → 저장된 모델 → 캐시 → 기본 목록) */
export function candidateChain(preferred) {
  return unique([preferred, getModelFor('gemini'), ...geminiCandidates().slice(0, 5), ...GEMINI_CHAIN]).filter(Boolean);
}

/* =========================================================
   Google Gemini — generateContent (+ Google 검색 grounding)
   ========================================================= */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function geminiFriendly(status, apiMessage) {
  const msg = String(apiMessage || '');
  if (/api key not valid|API_KEY_INVALID|API key not valid/i.test(msg)) {
    return { text: 'Gemini API 키가 올바르지 않습니다. aistudio.google.com/apikey 에서 키를 다시 확인해 주세요.', code: 'bad_key', retryable: false };
  }
  if (status === 403) return { text: '이 키로는 요청이 거부되었습니다(403). 키에 Generative Language API 사용이 허용되어 있는지 확인해 주세요.', code: 'forbidden', retryable: false };
  if (status === 429) return { text: 'Gemini 무료 사용량 한도를 넘었어요. 검색 없이 다시 시도하거나 1분 뒤에 다시 확인해 주세요.', code: 'quota', retryable: true };
  if (status === 404) return { text: '이 모델을 이 키에서 사용할 수 없습니다. 다른 모델로 시도할게요.', code: 'no_model', retryable: true };
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

async function geminiError(res) {
  let apiMessage = '';
  try {
    const data = await res.json();
    apiMessage = data && data.error ? (data.error.message || '') : '';
  } catch (e) {
    try { apiMessage = await res.text(); } catch (e2) {}
  }
  const f = geminiFriendly(res.status, apiMessage);
  return new ApiError(f.text, { status: res.status, code: f.code, retryable: f.retryable, raw: apiMessage });
}

function geminiBody({ system, parts, contents, temperature = 0.7, maxTokens = 4096, json = false, schema, tools }) {
  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  if (schema) generationConfig.responseSchema = schema;
  return {
    contents: contents || [{ role: 'user', parts }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools && tools.length ? { tools } : {}),
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
}

function geminiExtract(data) {
  if (!data) return '';
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new ApiError('요청이 안전 정책으로 차단되었습니다. 표현을 바꿔 다시 보내 주세요.', { code: 'safety', retryable: false });
  }
  const cand = (data.candidates || [])[0];
  if (!cand) return '';
  const parts = (cand.content && cand.content.parts) || [];
  return parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
}

async function geminiRequest(path, { method = 'POST', body, key, signal } = {}) {
  let res;
  try {
    res = await fetch(GEMINI_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError('네트워크 연결을 확인해 주세요. (요청이 서버에 닿지 않았습니다)', { code: 'network', retryable: true });
  }
  if (!res.ok) throw await geminiError(res);
  return res;
}

async function geminiGenerate(opts) {
  const key = getKeyFor('gemini');
  const full = (Array.isArray(opts.chain) && opts.chain.length
    ? unique(opts.chain)
    : (opts.fast ? unique([opts.model || geminiFastModel(), geminiLiteModel()]) : candidateChain(opts.model))).filter(Boolean);
  // 429(무료 한도)를 만났을 때 모델을 갈아타며 계속 두드리면 한도만 더 빨리 소진된다.
  // opts.attempts 로 시도 모델 수를, opts.stopOnQuota 로 429 즉시 중단을 정한다.
  const limit = Math.max(1, Math.min(Number(opts.attempts) || full.length, full.length));
  const chain = full.slice(0, limit);
  const clock = timedSignal(opts.signal, opts.timeoutMs);
  let lastErr = null;
  try {
    for (const id of chain) {
      let res;
      try {
        res = await geminiRequest(`/models/${id}:generateContent`, { body: geminiBody(opts), key, signal: clock.signal });
        const data = await res.json();
        const text = geminiExtract(data);
        if (!text) {
          lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
          continue;
        }
        if (!getModelFor('gemini')) setModelFor('gemini', id);
        return text;
      } catch (e) {
        if (clock.timedOut()) {
          throw new ApiError('AI 응답이 늦어 기본값으로 처리했어요.', { code: 'timeout', retryable: true });
        }
        if (e.name === 'AbortError') throw e;
        lastErr = e;
        if (e.code === 'bad_key' || e.code === 'forbidden' || !e.retryable) throw e;
        if (opts.stopOnQuota && e.code === 'quota') break;
      }
    }
  } finally {
    clock.done();
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

async function geminiStream(opts) {
  const key = getKeyFor('gemini');
  const chain = candidateChain();
  let lastErr = null;
  for (const id of chain) {
    let res;
    try {
      res = await geminiRequest(`/models/${id}:streamGenerateContent?alt=sse`, {
        body: geminiBody(opts), key, signal: opts.signal,
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
            const chunk = geminiExtract(json);
            if (chunk) { got = true; opts.onChunk && opts.onChunk(chunk); }
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
    if (!getModelFor('gemini')) setModelFor('gemini', id);
    if (!got) {
      lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
      continue;
    }
    return id;
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

async function geminiListModels(key) {
  const res = await geminiRequest('/models?pageSize=200', { method: 'GET', key });
  const data = await res.json();
  return (data.models || []).map(m => String(m.name || '').replace(/^models\//, ''))
    .filter(id => id && scoreGeminiModel(id) > -Infinity);
}

/* =========================================================
   Groq · OpenRouter — OpenAI 호환 chat/completions
   ========================================================= */
const JSON_RULE = '\n\n[출력 형식] 설명이나 코드블록 없이 JSON 객체 하나만 출력한다.';

function openaiFriendly(providerId, status, apiMessage) {
  const name = providerInfo(providerId).short;
  const msg = String(apiMessage || '');
  if (status === 401 || /invalid.*(api )?key|unauthorized|no auth/i.test(msg)) {
    return { text: `${name} API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.`, code: 'bad_key', retryable: false };
  }
  if (status === 403) return { text: `${name}에서 이 키의 요청을 거부했어요(403). 키 권한을 확인해 주세요.`, code: 'forbidden', retryable: false };
  if (status === 429) return { text: `${name} 무료 사용량 한도에 걸렸어요. 다른 모델로 넘어가거나 잠시 뒤 다시 시도해 주세요.`, code: 'quota', retryable: true };
  if (status === 404) return { text: `${name}에서 이 모델을 쓸 수 없어요. 다른 모델로 시도할게요.`, code: 'no_model', retryable: true };
  if (status === 400 || status === 422) {
    if (/image|vision|multimodal|image_url/i.test(msg)) {
      return { text: `${name}의 지금 모델은 사진을 읽지 못해요. 사진 대신 문제를 글로 적어 주시면 풀어 드릴게요.`, code: 'vision', retryable: false };
    }
    if (/model/i.test(msg)) return { text: `${name}에서 이 모델을 쓸 수 없어요. 다른 모델로 시도할게요.`, code: 'no_model', retryable: true };
    if (/json/i.test(msg)) return { text: 'JSON 형식 요청이 거부되었어요. 다시 시도해 주세요.', code: 'bad_request', retryable: true };
    return { text: `요청을 처리하지 못했습니다(${status}). ${msg.slice(0, 160)}`, code: 'bad_request', retryable: false };
  }
  if (status >= 500) return { text: `${name} 서버가 잠시 혼잡합니다. 잠시 후 다시 시도해 주세요.`, code: 'server', retryable: true };
  if (!status) return { text: '네트워크 연결을 확인해 주세요. (요청이 서버에 닿지 않았습니다)', code: 'network', retryable: true };
  return { text: `요청에 실패했습니다 (${status}). ${msg.slice(0, 160)}`, code: 'unknown', retryable: status >= 500 };
}

async function openaiError(providerId, res) {
  let apiMessage = '';
  try {
    const data = await res.json();
    apiMessage = (data && data.error && (data.error.message || data.error.code)) || '';
  } catch (e) {
    try { apiMessage = await res.text(); } catch (e2) {}
  }
  const f = openaiFriendly(providerId, res.status, apiMessage);
  return new ApiError(f.text, { status: res.status, code: f.code, retryable: f.retryable, raw: apiMessage });
}

function partsHaveImage(parts) {
  return (parts || []).some(p => p && p.inline_data && p.inline_data.data);
}

function partsToOpenAIContent(parts) {
  const list = parts || [];
  if (!partsHaveImage(list)) {
    return list.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  }
  const content = [];
  const text = list.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  if (text) content.push({ type: 'text', text });
  list.forEach(p => {
    if (p && p.inline_data && p.inline_data.data) {
      const mime = p.inline_data.mime_type || 'image/jpeg';
      content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${p.inline_data.data}` } });
    }
  });
  return content;
}

function openaiMessages(opts) {
  const system = String(opts.system || '') + (opts.json ? JSON_RULE : '');
  const msgs = [];
  if (system.trim()) msgs.push({ role: 'system', content: system.trim() });
  else if (opts.json) msgs.push({ role: 'system', content: 'JSON 객체 하나만 출력한다.' + JSON_RULE });
  const contents = Array.isArray(opts.contents) && opts.contents.length
    ? opts.contents
    : [{ role: 'user', parts: opts.parts || [] }];
  contents.forEach(c => {
    const role = c.role === 'model' ? 'assistant' : (c.role === 'assistant' ? 'assistant' : 'user');
    msgs.push({ role, content: partsToOpenAIContent(c.parts) });
  });
  return msgs;
}

function openaiBody(providerId, model, opts, { stream = false, jsonMode = true } = {}) {
  const body = {
    model,
    messages: openaiMessages(opts),
    temperature: opts.temperature == null ? 0.7 : opts.temperature,
    max_tokens: opts.maxTokens || 4096,
  };
  if (stream) body.stream = true;
  // Groq 은 JSON 모드를 지원한다. 실패하면 jsonMode=false 로 한 번 더 시도한다.
  if (!stream && opts.json && jsonMode && providerId === 'groq') body.response_format = { type: 'json_object' };
  return body;
}

function openaiHeaders(providerId, key) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (providerId === 'openrouter') {
    h['HTTP-Referer'] = 'https://junub9318-pixel.github.io/ai-study-tutor/';
    h['X-Title'] = 'AI Study Tutor';
  }
  return h;
}

function openaiChain(providerId, opts) {
  const info = providerInfo(providerId);
  const wantImage = partsHaveImage(opts.parts) || (opts.contents || []).some(c => partsHaveImage(c.parts));
  const base = Array.isArray(opts.chain) && opts.chain.length
    ? opts.chain.slice()
    : (opts.fast
      ? [opts.model || getModelFor(providerId) || info.models[0], (info.models[1] || info.models[0])]
      : [opts.model, getModelFor(providerId), ...(info.models || [])]);
  const pool = wantImage ? [info.vision, ...base] : base;
  const full = unique(pool).filter(Boolean);
  const limit = Math.max(1, Math.min(Number(opts.attempts) || full.length, full.length));
  return full.slice(0, limit);
}

async function openaiRequest(providerId, model, key, opts, { signal, stream = false, jsonMode = true } = {}) {
  const info = providerInfo(providerId);
  let res;
  try {
    res = await fetch(info.apiBase + '/chat/completions', {
      method: 'POST',
      headers: openaiHeaders(providerId, key),
      body: JSON.stringify(openaiBody(providerId, model, opts, { stream, jsonMode })),
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError('네트워크 연결을 확인해 주세요. (요청이 서버에 닿지 않았습니다)', { code: 'network', retryable: true });
  }
  if (!res.ok) throw await openaiError(providerId, res);
  return res;
}

async function openaiGenerate(providerId, opts) {
  const key = getKeyFor(providerId);
  const chain = openaiChain(providerId, opts);
  const clock = timedSignal(opts.signal, opts.timeoutMs);
  let lastErr = null;
  try {
    for (const id of chain) {
      try {
        let data;
        try {
          const res = await openaiRequest(providerId, id, key, opts, { signal: clock.signal });
          data = await res.json();
        } catch (e) {
          // Groq JSON 모드가 거부되면 같은 모델로 한 번만 일반 모드 재시도
          if (e && e.status === 400 && opts.json && providerId === 'groq') {
            const res = await openaiRequest(providerId, id, key, opts, { signal: clock.signal, jsonMode: false });
            data = await res.json();
          } else throw e;
        }
        const text = String(((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '')).trim();
        if (!text) {
          lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
          continue;
        }
        if (!getModelFor(providerId)) setModelFor(providerId, id);
        return text;
      } catch (e) {
        if (clock.timedOut()) {
          throw new ApiError('AI 응답이 늦어 기본값으로 처리했어요.', { code: 'timeout', retryable: true });
        }
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
        if (!e || e.code === 'bad_key' || e.code === 'forbidden' || !e.retryable) throw e;
        if (opts.stopOnQuota && e.code === 'quota') break;
      }
    }
  } finally {
    clock.done();
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

async function openaiStream(providerId, opts) {
  const key = getKeyFor(providerId);
  const chain = openaiChain(providerId, { ...opts, fast: false });
  let lastErr = null;
  for (const id of chain) {
    let res;
    try {
      res = await openaiRequest(providerId, id, key, opts, { signal: opts.signal, stream: true });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastErr = e;
      if (!e || e.code === 'bad_key' || e.code === 'forbidden' || !e.retryable) throw e;
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
            const chunk = json && json.choices && json.choices[0] && json.choices[0].delta
              ? (json.choices[0].delta.content || '') : '';
            if (chunk) { got = true; opts.onChunk && opts.onChunk(chunk); }
          }
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (got) throw e;
      lastErr = e;
      if (!e || e.code === 'bad_key' || e.code === 'forbidden') throw e;
      continue;
    }
    if (!getModelFor(providerId)) setModelFor(providerId, id);
    if (!got) {
      lastErr = new ApiError('모델이 빈 응답을 보냈습니다. 다시 시도해 주세요.', { retryable: true, code: 'empty' });
      continue;
    }
    return id;
  }
  throw lastErr || new ApiError('응답을 받지 못했습니다.', { code: 'unknown', retryable: true });
}

const BAD_OPENAI_MODEL = /(whisper|tts|guard|embed|moderation|rerank)/i;

async function openaiListModels(providerId, key) {
  const info = providerInfo(providerId);
  const base = info.apiBase + '/models';
  const res = await fetch(base, { headers: openaiHeaders(providerId, key) });
  if (!res.ok) throw await openaiError(providerId, res);
  const data = await res.json();
  const ids = (data.data || data.models || []).map(m => String(m.id || m.name || '')).filter(Boolean);
  if (providerId === 'openrouter') {
    const free = ids.filter(id => /:free$/i.test(id) && /(instruct|chat|llama|qwen|gemma|mistral|deepseek|gpt-oss)/i.test(id) && !BAD_OPENAI_MODEL.test(id));
    const rank = (id) => (/llama-3\.3|llama-4|qwen3?|gemma-3/i.test(id) ? 0 : 1);
    return free.sort((a, b) => rank(a) - rank(b)).slice(0, 24);
  }
  return ids.filter(id => !BAD_OPENAI_MODEL.test(id)).slice(0, 40);
}

/* =========================================================
   통합 API
   ========================================================= */
/** 지금 선택된 제공자로 텍스트를 만든다 (Gemini options 와 동일) */
export async function generateText(opts = {}) {
  const p = opts.provider || getProvider();
  if (!getKeyFor(p)) throw new ApiError('API 키를 먼저 연결해 주세요.', { code: 'no_key' });
  return p === 'gemini' ? geminiGenerate(opts) : openaiGenerate(p, opts);
}

/** 스트리밍 채팅 (제공자 공통, Gemini contents 형식 그대로 받는다) */
export async function streamChat(opts = {}) {
  const p = opts.provider || getProvider();
  if (!getKeyFor(p)) throw new ApiError('API 키를 먼저 연결해 주세요.', { code: 'no_key' });
  return p === 'gemini' ? geminiStream(opts) : openaiStream(p, opts);
}

export async function listModels(key = getKey(), provider = getProvider()) {
  if (provider === 'gemini') return geminiListModels(key || getKeyFor('gemini'));
  return openaiListModels(provider, key || getKeyFor(provider));
}

/**
 * 키 연결 테스트: 사용할 수 있는 모델을 찾아 저장한다.
 * @returns {Promise<{provider, model, models: string[]}>}
 */
export async function connectTest(key, onProgress, provider = getProvider()) {
  const p = isProviderId(provider) ? provider : getProvider();
  const info = providerInfo(p);
  const token = String(key || '').trim();
  if (!token) throw new ApiError('API 키를 먼저 입력해 주세요.', { code: 'no_key' });
  setKeyFor(p, token);

  if (p === 'gemini') {
    onProgress && onProgress('키 확인 중…');
    const models = await geminiListModels(token);
    setModelsFor('gemini', models);
    const chain = unique([...models.slice(0, 6), ...GEMINI_CHAIN]);
    if (!chain.length) throw new ApiError('이 키에서 사용할 수 있는 Flash 모델을 찾지 못했습니다.', { code: 'no_model' });
    let lastErr = null;
    for (const id of chain) {
      try {
        onProgress && onProgress(`${id} 확인 중…`);
        const res = await geminiRequest(`/models/${id}:generateContent`, {
          key: token,
          body: {
            contents: [{ role: 'user', parts: [{ text: '연결 확인. "ok"라고만 답해.' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 32 },
          },
        });
        await res.json();
        setModelFor('gemini', id);
        return { provider: p, model: id, models };
      } catch (e) {
        lastErr = e;
        if (e.code === 'bad_key' || e.code === 'forbidden') throw e;
      }
    }
    throw lastErr || new ApiError('연결 테스트에 실패했습니다.', { code: 'unknown', retryable: true });
  }

  // Groq · OpenRouter: 모델 목록(가능하면) + 짧은 채팅 1회로 확인
  onProgress && onProgress('키 확인 중…');
  let listed = [];
  try { listed = await openaiListModels(p, token); } catch (e) { if (e.code === 'bad_key' || e.code === 'forbidden') throw e; }
  if (listed.length) setModelsFor(p, listed);
  const chain = unique([...listed.slice(0, 3), ...(info.models || [])]);
  let lastErr = null;
  for (const id of chain) {
    try {
      onProgress && onProgress(`${id} 확인 중…`);
      const res = await openaiRequest(p, id, token, {
        system: '연결 확인용 도우미다.', parts: [{ text: 'ok 라고만 답해.' }], temperature: 0, maxTokens: 16,
      });
      await res.json();
      setModelFor(p, id);
      return { provider: p, model: id, models: listed.length ? listed : chain };
    } catch (e) {
      lastErr = e;
      if (e.code === 'bad_key' || e.code === 'forbidden') throw e;
    }
  }
  throw lastErr || new ApiError('연결 테스트에 실패했습니다.', { code: 'unknown', retryable: true });
}
