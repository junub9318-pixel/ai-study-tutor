/* =========================================================
   curriculum.js — 과목별 교육과정(단원 · 핵심 주제) 조회/생성
   · Gemini(교육과정 프롬프트 + Google 검색 grounding 시도)
   · 키가 없거나 오프라인일 때는 기본 교육과정 안내
   ========================================================= */
import {
  SUBJECTS, subjectById, learnerContextFrom, generateJSON, getKey, getSetup, fastModel,
} from './core.js?v=9e9b8848';

export const CUR_SCHEMA = {
  type: 'object',
  properties: {
    curriculumName: { type: 'string' },
    unitTitle: { type: 'string' },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, focus: { type: 'string' } },
        required: ['title'],
      },
    },
    note: { type: 'string' },
  },
  required: ['unitTitle', 'topics'],
};

/* ---------------------------------------------------------
   기본 교육과정 (키 없음 · 오프라인 fallback)
   --------------------------------------------------------- */
const BASIC = {
  korean: {
    curriculumName: '2022 개정 교육과정 · 공통국어',
    unitTitle: '공통국어 1 · 읽기와 표현의 기초',
    topics: [
      { title: '시의 표현과 정서', focus: '비유·상징·어조로 정서 읽기' },
      { title: '소설의 갈등과 시점', focus: '갈등 구조와 서술 시점의 효과' },
      { title: '설명하는 글의 구조', focus: '개요 짜기와 문단 전개' },
      { title: '주장하는 글과 논증', focus: '근거의 타당성과 반론 다루기' },
      { title: '문법: 음운과 문장', focus: '음운 변동, 품사와 문장 성분' },
      { title: '매체 자료 비판적 읽기', focus: '자료의 신뢰도와 관점 분석' },
      { title: '서술형 답안과 고쳐쓰기', focus: '채점 기준에 맞춘 답안 구성' },
    ],
  },
  english: {
    curriculumName: '2022 개정 교육과정 · 공통영어',
    unitTitle: '공통영어 1 · 독해와 문법의 기본기',
    topics: [
      { title: '문장의 기본 구조', focus: '5형식과 문장 성분 파악' },
      { title: '시제와 조동사', focus: '완료 시제·조동사 뉘앙스' },
      { title: '관계대명사·관계부사', focus: 'that/which/what 구별' },
      { title: '분사와 분사구문', focus: '능동·수동 분사구문 해석' },
      { title: '가정법과 조건문', focus: '가정법 과거·과거완료' },
      { title: '주제·요지 찾기', focus: '글의 구조 표지어 활용' },
      { title: '빈칸 추론과 어휘', focus: '문맥 속 어휘 추론 전략' },
    ],
  },
  math: {
    curriculumName: '2022 개정 교육과정 · 공통수학 1',
    unitTitle: '공통수학 1 · 다항식과 방정식',
    topics: [
      { title: '다항식의 연산과 항등식', focus: '곱셈 공식·항등식의 성질' },
      { title: '나머지정리와 인수분해', focus: '조립제법과 인수분해 공식' },
      { title: '복소수와 이차방정식', focus: '복소수 연산, 근의 공식' },
      { title: '판별식과 근과 계수', focus: '근의 판별·근과 계수의 관계' },
      { title: '이차함수의 그래프', focus: '꼭짓점·축·최대최소' },
      { title: '여러 가지 방정식', focus: '연립·고차·이차방정식 활용' },
      { title: '부등식의 풀이와 활용', focus: '절댓값·이차부등식' },
    ],
  },
  social: {
    curriculumName: '2022 개정 교육과정 · 통합사회',
    unitTitle: '통합사회 1 · 인간과 사회의 이해',
    topics: [
      { title: '인간과 사회의 관계', focus: '사회화와 사회적 존재로서의 인간' },
      { title: '정의의 의미와 유형', focus: '절차적·분배적·교정적 정의' },
      { title: '문화의 속성과 변동', focus: '문화 상대주의와 문화 변동 요인' },
      { title: '시장 경제와 합리적 선택', focus: '기회비용, 수요·공급 원리' },
      { title: '국제 사회의 이해', focus: '국제기구와 갈등 해결 방식' },
      { title: '자연환경과 인간 생활', focus: '기후·지형과 생활 양식' },
      { title: '지속가능한 사회', focus: '환경 문제와 지속가능발전' },
    ],
  },
  science: {
    curriculumName: '2022 개정 교육과정 · 통합과학',
    unitTitle: '통합과학 1 · 물질과 규칙성',
    topics: [
      { title: '우주와 원소의 생성', focus: '빅뱅·항성 진화와 원소' },
      { title: '지각과 생명체 구성 물질', focus: '광물·분자와 생체 물질' },
      { title: '역학적 시스템', focus: '뉴턴 운동 법칙과 운동량' },
      { title: '에너지의 전환과 보존', focus: '역학적·열에너지 전환' },
      { title: '화학 반응과 에너지', focus: '반응열과 화학 반응식' },
      { title: '생태계와 환경 변화', focus: '먹이그물·물질 순환' },
      { title: '탐구 설계와 자료 해석', focus: '변인 통제와 그래프 해석' },
    ],
  },
  history: {
    curriculumName: '2022 개정 교육과정 · 한국사',
    unitTitle: '한국사 · 전근대에서 근현대까지',
    topics: [
      { title: '선사 시대와 고대 국가', focus: '유물·유적으로 본 사회 변화' },
      { title: '고려의 통치와 문화', focus: '중앙·지방 제도와 문화유산' },
      { title: '조선의 성립과 유교 정치', focus: '통치 체제와 신분 질서' },
      { title: '조선 후기 사회·경제 변동', focus: '상품 화폐 경제와 농민 항쟁' },
      { title: '개항과 근대 개혁', focus: '개항 이후 개혁과 저항' },
      { title: '일제 강점과 민족 운동', focus: '3·1운동, 독립운동의 흐름' },
      { title: '광복 이후 현대 사회', focus: '민주화와 경제 성장' },
    ],
  },
  ai: {
    curriculumName: '2022 개정 교육과정 · 인공지능 기초',
    unitTitle: '인공지능기초 · AI의 원리와 활용',
    topics: [
      { title: '인공지능의 개념과 역사', focus: 'AI의 정의와 발전 과정' },
      { title: '데이터와 특성', focus: '수집·정제·편향' },
      { title: '지도학습과 예측', focus: '분류·회귀 모델의 원리' },
      { title: '비지도학습과 군집', focus: '군집화와 패턴 발견' },
      { title: '신경망과 딥러닝', focus: '퍼셉트론과 학습 과정' },
      { title: 'AI 서비스 기획', focus: '문제 정의와 모델 적용' },
      { title: 'AI 윤리와 개인정보', focus: '편향·책임·프라이버시' },
    ],
  },
};

const CUSTOM_TOPICS = [
  { title: '핵심 개념과 용어', focus: '단원의 큰 그림 잡기' },
  { title: '기본 원리 이해', focus: '왜 그런지 설명하기' },
  { title: '대표 유형 문제', focus: '교과서·기출 기본 유형' },
  { title: '응용·심화 문제', focus: '조건이 바뀐 문제 풀이' },
  { title: '시험 빈출 주제', focus: '자주 나오는 포인트 정리' },
  { title: '오답 분석과 복습', focus: '틀린 이유 분류하기' },
  { title: '서술형·수행 평가', focus: '말과 글로 설명하기' },
];

export function subjectLabel(id) {
  if (String(id).startsWith('custom:')) return String(id).slice(7) || '내 과목';
  const s = subjectById(id);
  return s ? s.label : String(id);
}
export function subjectIcon(id) {
  if (String(id).startsWith('custom:')) return '✏️';
  const s = subjectById(id);
  return s ? s.icon : '📘';
}

/** 키가 없거나 AI가 실패했을 때 쓰는 기본 교육과정 */
export function basicCurriculum(subjectId) {
  const base = BASIC[subjectId];
  if (base) return { ...clone(base), source: 'basic' };
  const label = subjectLabel(subjectId);
  return {
    curriculumName: '기본 교육과정 안내',
    unitTitle: `${label} · 1학기 핵심 단원`,
    topics: clone(CUSTOM_TOPICS),
    source: 'basic',
  };
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

/* ---------------------------------------------------------
   AI 교육과정 생성
   --------------------------------------------------------- */
function learnerLines(learner) {
  const s = learner || getSetup() || {};
  return [
    `- 국가·교육과정: ${s.country || '대한민국'}`,
    `- 학교급·학년: ${[s.level, s.grade].filter(Boolean).join(' ') || '고등학교 1학년'}`,
    `- 학기: ${s.semester || '1학기'}`,
    s.age ? `- 나이: 만 ${s.age}세` : '',
    (s.schoolInfo && s.schoolInfo.summary) ? `- 학교 교육과정 메모: ${String(s.schoolInfo.summary).slice(0, 300)}` : '',
    s.school ? `- 학교: ${s.school}` : '',
    s.schoolNote ? `- 학교 교육과정 메모: ${s.schoolNote}` : '',
    s.levelSelf ? `- 학생 수준: ${s.levelSelf}` : '',
    s.examDate ? `- 시험일: ${s.examDate}` : '',
  ].filter(Boolean).join('\n');
}

const CUR_SYSTEM = `너는 학교 교육과정에 정통한 학습 설계자다. 학생의 국가·학교급·학년·학교 정보를 보고, 한 과목에서 지금 배우는(또는 곧 배울) 단원과 핵심 주제를 정리한다.

규칙:
- 그 나라의 실제 교육과정(대한민국이면 2022 개정 교육과정 등)의 단원 구성과 용어를 따른다. 학교명·교육과정 메모가 있으면 그 학교의 편성(예: 공통수학 1·2)을 우선한다.
- curriculumName: 근거가 되는 교육과정 이름 (예: "2022 개정 교육과정 · 공통수학 1"). 30자 이내.
- unitTitle: 지금 배우는 단원(또는 학기 범위)의 이름. 25자 이내, 교과서 단원명처럼.
- topics: 핵심 주제 7개. 앞에서 뒤로 갈수록 심화된다. title은 22자 이내, focus는 한 줄 설명(20자 이내). 실제 단원명·개념명을 쓴다.
- note: 이 구성이 어떤 근거인지 한 문장(선택).
- 확실하지 않은 내용은 일반적인 교과 단원 구성으로 채우고, 지어낸 학교별 정보를 만들지 않는다.`;

let groundingSupported = null; // null = 아직 모름, false = 이 키/모델에서 검색 grounding 불가

function normalize(data, subjectId) {
  const topics = (data && Array.isArray(data.topics) ? data.topics : [])
    .map(t => ({ title: String((t && t.title) || '').trim(), focus: String((t && t.focus) || '').trim() }))
    .filter(t => t.title)
    .slice(0, 7);
  if (!topics.length) throw new Error('교육과정 주제를 받지 못했어요.');
  const fallback = basicCurriculum(subjectId);
  return {
    curriculumName: String((data && data.curriculumName) || fallback.curriculumName || '교육과정').trim().slice(0, 40),
    unitTitle: String((data && data.unitTitle) || fallback.unitTitle).trim().slice(0, 40),
    topics,
    note: String((data && data.note) || '').trim().slice(0, 120),
    source: 'ai',
  };
}

async function requestAI(subjectId, learner, materials, signal) {
  const label = subjectLabel(subjectId);
  const mat = (materials || []).slice(0, 3)
    .map(m => `- ${m.name}: ${String(m.text || '').slice(0, 700)}`)
    .join('\n');
  const user = [
    `과목: ${label}`,
    '학생 정보:',
    learnerLines(learner),
    mat ? `\n학생이 올린 자료(단원명이 있으면 우선 반영):\n${mat}` : '',
  ].join('\n');
  const base = { system: CUR_SYSTEM, parts: [{ text: user }], schema: CUR_SCHEMA, temperature: 0.35, maxTokens: 1200, signal };

  if (groundingSupported !== false) {
    try {
      const out = await generateJSON({ ...base, tools: [{ google_search: {} }] });
      groundingSupported = true;
      return normalize(out, subjectId);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (e && (e.code === 'bad_key' || e.code === 'no_key' || e.code === 'forbidden')) throw e;
      if (e && (e.code === 'quota' || e.code === 'server' || e.code === 'network')) throw e;
      groundingSupported = false; // 이 환경에서는 검색 도구를 쓰지 않고 프롬프트만으로
    }
  }
  const out = await generateJSON(base);
  return normalize(out, subjectId);
}

/**
 * 한 과목의 교육과정을 만든다. 절대 throw 하지 않는다(실패 시 기본 교육과정 + error).
 * @returns {Promise<{curriculumName,unitTitle,topics,source,note,error?}>}
 */
export async function buildCurriculum(subjectId, { learner, materials = [], signal } = {}) {
  if (!getKey()) {
    const b = basicCurriculum(subjectId);
    b.reason = 'no-key';
    return b;
  }
  try {
    const cur = await requestAI(subjectId, learner, materials, signal);
    return cur;
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    const b = basicCurriculum(subjectId);
    b.reason = 'error';
    b.error = (e && e.message) || 'AI 교육과정을 받지 못했어요.';
    return b;
  }
}

/** 여러 과목을 차례로 만들어 진행 상황을 알려 준다 */
export async function buildCurricula(subjectIds, { learner, materials = [], onProgress, signal } = {}) {
  const ids = (subjectIds || []).slice();
  const out = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    onProgress && onProgress({ phase: 'start', subjectId: id, label: subjectLabel(id), index: i, total: ids.length });
    const cur = await buildCurriculum(id, { learner, materials, signal });
    out[id] = cur;
    onProgress && onProgress({ phase: 'done', subjectId: id, label: subjectLabel(id), index: i, total: ids.length, cur });
  }
  return out;
}

/** 저장된 교육과정이 기본(fallback)으로만 채워졌는지 */
export function isBasicOnly(map) {
  const list = Object.values(map || {});
  return list.length > 0 && list.every(c => c && c.source !== 'ai');
}

/* =========================================================
   학교·학년·학기 확인 → 교육과정 선파악
   ========================================================= */
export const SCHOOL_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    schoolName: { type: 'string' },
    region: { type: 'string' },
    schoolType: { type: 'string' },
    curriculumName: { type: 'string' },
    summary: { type: 'string' },
    semesterFocus: { type: 'string' },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, kind: { type: 'string' } },
        required: ['name'],
      },
    },
    note: { type: 'string' },
  },
  required: ['summary', 'subjects'],
};

const SUBJECT_NAME_MAP = [
  [/국어|문학|독서|화법|작문/, 'korean'],
  [/영어/, 'english'],
  [/수학|미적분|기하|확률과/, 'math'],
  [/사회|지리|경제|윤리|정치|법|세계사/, 'social'],
  [/과학|물리|화학|생물|생명|지구/, 'science'],
  [/한국사|역사/, 'history'],
  [/인공지능|정보|코딩|컴퓨터|소프트웨어/, 'ai'],
];

/** 과목 이름을 앱의 과목 id로 (없으면 custom:이름) */
export function subjectIdFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const direct = SUBJECTS.find(s => s.label === raw || s.id === raw);
  if (direct) return direct.id;
  for (const [re, id] of SUBJECT_NAME_MAP) if (re.test(raw)) return id;
  return 'custom:' + raw;
}

const GRADE_STEPS = {
  '초등학교': ['1', '2', '3', '4', '5', '6'],
  '중학교': ['1', '2', '3'],
  '고등학교': ['1', '2', '3'],
  '대학교': ['1', '2', '3', '4'],
};

/** 학년 → 권장 만 나이 */
export function ageForGrade(level, grade) {
  const n = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10) || 1;
  if (level === '초등학교') return 6 + n;
  if (level === '중학교') return 12 + n;
  if (level === '고등학교') return 15 + n;
  if (level === '대학교') return 18 + n;
  return 15 + n;
}
export function gradesFor(level) {
  const nums = GRADE_STEPS[level] || GRADE_STEPS['고등학교'];
  return nums.map(n => (level === '대학교' ? `대학 ${n}학년` : `${n}학년`));
}

const BASIC_SUBJECTS_BY_LEVEL = {
  '초등학교': ['국어', '수학', '영어', '사회', '과학'],
  '중학교': ['국어', '영어', '수학', '사회', '과학', '역사'],
  '고등학교': ['공통국어', '공통수학', '공통영어', '통합사회', '통합과학', '한국사', '인공지능기초'],
  '대학교': ['전공 기초', '교양 글쓰기', '대학 영어'],
};

/** 키가 없을 때 쓰는 학교·교육과정 요약 (기본값) */
export function basicSchoolInfo(info = {}) {
  const country = info.country || '대한민국';
  const level = info.level || '고등학교';
  const grade = info.grade || '1학년';
  const semester = info.semester || '1학기';
  const names = BASIC_SUBJECTS_BY_LEVEL[level] || BASIC_SUBJECTS_BY_LEVEL['고등학교'];
  const curriculumName = country === '대한민국' ? (level === '고등학교' ? '2022 개정 교육과정' : '기본 교육과정') : `${country} 국가 교육과정`;
  return {
    found: false,
    verified: false,
    schoolName: info.school || '',
    region: '',
    schoolType: level,
    curriculumName,
    summary: `${country} ${level} ${grade} ${semester} 기준입니다. ${info.school ? info.school + '의 ' : ''}${curriculumName}에서 이 학기에 배우는 과목은 ${names.join('·')} 등입니다. AI 키를 연결하면 학교와 교육과정을 실제로 확인해 요약해 줘요.`,
    semesterFocus: `${semester} 중간·기말 범위는 학교 교육과정 편성표와 교과서 목차로 확정해요.`,
    subjects: names.map(n => ({ name: n, id: subjectIdFromName(n), kind: '기본' })),
    note: 'API 키 없이 만든 기본 안내입니다.',
    source: 'basic',
  };
}

/* 학교 확인용 — 검색 grounding 없이 짧은 프롬프트로 1~3초 안에 끝나게 한다 */
const SCHOOL_SYSTEM_FAST = `너는 각국 학교 교육과정에 정통한 학습 설계자다. 입력된 국가·학교급·학년·나이·학기·학교명으로 그 학기 교육과정을 짧게 요약한다. 아는 것만 쓰고 지어내지 않는다.
- found: 학교명이 실제 학교로 확인되면 true, 아니면 false.
- curriculumName 40자 이내 · summary 3문장 이내 · semesterFocus 50자 이내 · note 한 줄.
- subjects: 5~10개, name은 실제 교과명, kind는 "공통"·"선택"·"전공".`;

function normalizeSchool(data, info) {
  const base = basicSchoolInfo(info);
  const subjects = (data && Array.isArray(data.subjects) ? data.subjects : [])
    .map(s => ({
      name: String((s && s.name) || '').trim(),
      kind: String((s && s.kind) || '공통').trim(),
    }))
    .filter(s => s.name)
    .slice(0, 12)
    .map(s => Object.assign(s, { id: subjectIdFromName(s.name) }));
  return {
    found: !!(data && data.found),
    verified: true,
    schoolName: String((data && data.schoolName) || info.school || '').trim(),
    region: String((data && data.region) || '').trim(),
    schoolType: String((data && data.schoolType) || info.level || '').trim(),
    curriculumName: String((data && data.curriculumName) || base.curriculumName).trim().slice(0, 60),
    summary: String((data && data.summary) || base.summary).trim().slice(0, 700),
    semesterFocus: String((data && data.semesterFocus) || '').trim().slice(0, 160),
    subjects: subjects.length ? subjects : base.subjects,
    note: String((data && data.note) || '').trim().slice(0, 200),
    source: 'ai',
  };
}

/**
 * 학교·학년·학기 확인 + 교육과정 선파악. 절대 throw 하지 않는다.
 * 검색 grounding·모델 탐색 없이 이미 고른 Flash 모델을 바로 호출하고,
 * 8초 안에 답이 없으면 즉시 규칙 기반 기본 교육과정으로 넘긴다.
 * @returns {Promise<object>} {found, schoolName, region, curriculumName, summary, semesterFocus, subjects, source, error?}
 */
export async function verifySchool(info = {}, { signal, timeoutMs = 8000 } = {}) {
  if (!getKey()) return basicSchoolInfo(info);
  const user = [
    `국가: ${info.country || '대한민국'}`,
    `교육 단계: ${info.level || '고등학교'}`,
    `학년: ${info.grade || '1학년'}${info.age ? ` (만 ${info.age}세)` : ''}`,
    `학기: ${info.semester || '1학기'}`,
    `학교명: ${info.school || '(모름)'}`,
    info.schoolNote ? `학교 메모: ${info.schoolNote}` : '',
  ].filter(Boolean).join('\n');
  const base = {
    system: SCHOOL_SYSTEM_FAST, parts: [{ text: user }], schema: SCHOOL_SCHEMA,
    temperature: 0.3, maxTokens: 800, signal, timeoutMs, fast: true, model: fastModel(),
  };
  try {
    const out = await generateJSON(base);
    return normalizeSchool(out, info);
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    const b = basicSchoolInfo(info);
    b.fastFallback = true;
    b.summary = String(b.summary).replace(/\s*AI 키를 연결하면[^.]*?\.\s*$/, '').trim();
    b.note = '빠른 표시를 위해 기본 교육과정으로 먼저 채웠어요.';
    b.error = (e && e.code === 'timeout')
      ? '8초 안에 AI 응답이 오지 않아 기본 교육과정으로 먼저 보여 드렸어요. “학교 확인”을 다시 누르면 새로 시도해요.'
      : ((e && e.message) || 'AI가 학교를 확인하지 못했어요.');
    return b;
  }
}

/* =========================================================
   시험 범위 파악 · 레슨 경로(듀오링고식) 생성
   ========================================================= */
export const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    scopeText: { type: 'string' },
    units: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    summary: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['scopeText'],
};

export const LESSON_STEPS = ['개념', '암기', '문제', '심화', '모의고사', '구술', '오디오', '실험'];

export const PATH_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: LESSON_STEPS },
          title: { type: 'string' },
          sub: { type: 'string' },
        },
        required: ['kind', 'title'],
      },
    },
    note: { type: 'string' },
  },
  required: ['title', 'steps'],
};

const SCOPE_SYSTEM = `너는 시험 범위를 정리하는 학습 도우미다. 학생이 올린 자료(PDF 글자 또는 필기·교재 사진)를 읽고, 이번 시험에 들어갈 범위를 정확하게 뽑아낸다.

규칙:
- scopeText: 시험 범위를 한두 문장으로. 교과서 단원명·장·절 번호가 보이면 그대로 쓴다. 예: "공통수학 1 — Ⅱ. 방정식과 부등식 (1) 복소수, (2) 이차방정식".
- units: 범위 안의 단원·소단원 이름 3~10개.
- title: 이 범위를 한 줄로 부르는 이름 (25자 이내). 예: "공통수학 1 · 방정식과 부등식".
- summary: 자료에서 확인한 시험 범위 요약 2~3문장(페이지·문제 번호가 보이면 포함).
- 자료에 시험 범위가 명확히 없으면, 자료의 단원·주제를 근거로 가장 가까운 범위를 쓰고 note에 "자료에서 범위를 확정하지 못해 단원 기준으로 정리"라고 밝힌다.
- 자료에 없는 내용을 지어내지 않는다.`;

function normalizeScope(data, fallbackTitle) {
  const units = (data && Array.isArray(data.units) ? data.units : []).map(u => String(u || '').trim()).filter(Boolean).slice(0, 12);
  const scopeText = String((data && data.scopeText) || '').trim().slice(0, 900);
  if (!scopeText) throw new Error('자료에서 시험 범위를 읽지 못했어요.');
  return {
    scopeText,
    units,
    title: String((data && data.title) || fallbackTitle || '').trim().slice(0, 60),
    summary: String((data && data.summary) || '').trim().slice(0, 600),
    note: String((data && data.note) || '').trim().slice(0, 200),
  };
}

/**
 * 자료(PDF 텍스트 · 필기 사진)를 읽어 시험 범위를 파악한다. throw 하지 않는다.
 */
export async function extractScope({ subjectLabel: label, learner, material, signal } = {}) {
  const parts = [{ text: [
    `과목: ${label || '과목'}`,
    learner ? `학생: ${learner.country || '대한민국'} ${learner.level || ''} ${learner.grade || ''} ${learner.semester || '1학기'}`.trim() : '',
    material ? `자료 이름: ${material.name || '자료'}` : '',
    material && material.text ? `\n[자료 내용]\n${String(material.text).slice(0, 12000)}` : '',
    material && material.dataUrl ? '\n[자료] 첨부한 필기·교재 사진을 읽고 시험 범위를 정리해 줘.' : '',
  ].filter(Boolean).join('\n') }];
  if (material && material.dataUrl) {
    parts.push({ inline_data: { mime_type: material.mimeType || 'image/jpeg', data: String(material.dataUrl).split(',')[1] || '' } });
  }
  try {
    const out = await generateJSON({ system: SCOPE_SYSTEM, parts, schema: SCOPE_SCHEMA, temperature: 0.25, maxTokens: 2000, signal });
    return normalizeScope(out, label ? `${label} 시험 범위` : '시험 범위');
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    return { error: (e && e.message) || '자료에서 시험 범위를 읽지 못했어요.', scopeText: '', units: [], title: '', summary: '', note: '' };
  }
}

const PATH_SYSTEM = `너는 듀오링고식 학습 경로를 설계하는 교사다. 학생의 과목·시험 범위·남은 날·목표·이해도·난이도 피드백을 보고, 개념 학습부터 문제 풀이까지 이어지는 레슨 경로를 만든다.

규칙:
- steps는 8~10개. 순서: 개념 이해(2개) → 암기 → 기본 문제 → 문제 풀이 → 응용·심화 → 실전 모의고사 → 오답/구술 정리.
- kind는 다음 중 하나: 개념, 암기, 문제, 심화, 모의고사, 구술, 오디오, 실험.
- title: 단원명이 드러나게 24자 이내. 앞에 번호를 붙이지 않는다(앱이 붙인다). 예: "이차방정식 근의 공식".
- sub: 그 레슨에서 실제로 하는 일 24자 이내. 예: "근의 공식 유도와 적용".
- 시험까지 남은 날이 7일 이하면 개념 수를 줄이고 문제·모의고사 비중을 늘린다. 21일 이상이면 개념을 충실히 나눈다.
- 목표 50%는 핵심 주제만, 70%는 범위 전체, 90%는 심화·서술형까지 포함한다.
- 이해도가 "기초"이면 첫 두 레슨을 아주 쉽게, "심화"이면 개념을 압축하고 문제 비중을 높인다.
- 난이도 피드백이 "어려웠어요"면 쉬운 문제부터, "쉬웠어요"면 심화를 더 넣는다.
- 모든 레슨은 주어진 시험 범위 안에서만 구성한다.`;

function deriveUnits(clean, units) {
  if (units && units.length) return units.map(String);
  const out = [];
  (clean.match(/\d+\.\s*[^\d().]{2,26}/g) || []).forEach(m => out.push(m.replace(/^\d+\.\s*/, '').trim()));
  (clean.match(/[ⅠⅡⅢⅣⅤⅥ]\.\s*[^\dⅠⅡⅢⅣⅤⅥ]{2,26}/g) || []).forEach(m => out.push(m.replace(/^[ⅠⅡⅢⅣⅤⅥ]\.\s*/, '').trim()));
  const picked = out.filter(s => s && s.length <= 26);
  if (picked.length) return picked.slice(0, 8);
  const clauses = String(clean || '').split(/[.,·\n]/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 26);
  return clauses.slice(0, 8);
}

function fallbackPath({ label, scopeText, units, days, goalPct, title }) {
  const clean = String(scopeText || '').replace(/\s+/g, ' ').trim();
  const list = deriveUnits(clean, units);
  const short = (list.length ? list : [label ? `${label} 핵심 단원` : '시험 범위'])
    .map(s => (String(s).length > 20 ? String(s).slice(0, 20) + '…' : String(s)));
  const u = i => short[i % short.length];
  const steps = [
    { kind: '개념', title: `${u(0)} 개념 잡기`, sub: '큰 그림과 용어부터' },
    { kind: '개념', title: `${u(1)} 원리 이해`, sub: '왜 그런지 설명하기' },
    { kind: '암기', title: `${u(0)} 핵심 암기`, sub: '공식·용어 카드 8장' },
    { kind: '문제', title: `${u(0)} 기본 문제`, sub: '5문항 · 즉시 채점' },
    { kind: '문제', title: `${u(2)} 대표 유형`, sub: '교과서·기출 유형' },
    { kind: '심화', title: `${u(3)} 응용 문제`, sub: '조건이 바뀐 문제' },
    { kind: '실험', title: `${u(1)} 직접 만져 보기`, sub: '개념 시뮬레이션' },
    { kind: '모의고사', title: '실전 모의고사', sub: '시간 제한 · 약점 분석' },
    { kind: '구술', title: `${u(4)} 말로 설명하기`, sub: '구술 시험 3문항' },
  ];
  if (days != null && days >= 21 && goalPct >= 90) {
    steps.splice(6, 0, { kind: '오디오', title: `${u(5)} 귀로 복습`, sub: '5분 오디오' });
  }
  const givenTitle = String(title || '').trim();
  const isGenericTitle = !givenTitle || /시험 범위$/.test(givenTitle) || givenTitle.length > 34;
  const derived = list.length ? `${label || '과목'} · ${list[0]}`.slice(0, 40) : '';
  const fallbackTitle = (!isGenericTitle ? givenTitle : (derived || givenTitle || `${label || '과목'} 시험 대비`));
  return { title: fallbackTitle, steps, source: 'basic' };
}

/**
 * 시험 범위 + 사전 질문(남은 날·목표·이해도·학년·학기)으로 레슨 경로를 만든다. throw 하지 않는다.
 */
export async function buildLessonPath({
  label, scopeText, units, days, goalPct, understanding, learner, difficulty, materials, signal, title,
} = {}) {
  const fallback = fallbackPath({ label, scopeText, units, days, goalPct, title });
  if (!getKey()) return fallback;
  const diff = difficulty && difficulty.label ? `난이도 피드백: ${difficulty.label}` : '난이도 피드백: 없음';
  const user = [
    `과목: ${label || '과목'}`,
    `시험 범위: ${scopeText || '(자료의 단원 기준)'}`,
    units && units.length ? `범위 단원: ${units.join(', ')}` : '',
    `시험까지: ${days == null ? '미정' : days + '일'}`,
    `목표: ${goalPct || 70}%`,
    `이해도: ${understanding || '보통'}`,
    diff,
    learner ? `학생: ${learner.country || '대한민국'} ${learner.level || ''} ${learner.grade || ''} ${learner.semester || '1학기'}`.trim() : '',
    (materials && materials.length) ? `참고 자료: ${materials.map(m => m.name).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  try {
    const out = await generateJSON({ system: PATH_SYSTEM, parts: [{ text: user }], schema: PATH_SCHEMA, temperature: 0.5, maxTokens: 2400, signal });
    const steps = (out && Array.isArray(out.steps) ? out.steps : [])
      .map(s => ({
        kind: LESSON_STEPS.includes(s && s.kind) ? s.kind : '개념',
        title: String((s && s.title) || '').trim().slice(0, 40),
        sub: String((s && s.sub) || '').trim().slice(0, 40),
      }))
      .filter(s => s.title)
      .slice(0, 10);
    if (steps.length < 3) throw new Error('레슨 경로를 충분히 만들지 못했어요.');
    return { title: String((out.title || fallback.title)).trim().slice(0, 60), steps, note: String(out.note || '').slice(0, 200), source: 'ai' };
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    fallback.error = (e && e.message) || 'AI가 경로를 만들지 못했어요.';
    return fallback;
  }
}

export const ALL_SUBJECT_IDS = SUBJECTS.map(s => s.id);
void learnerContextFrom;

