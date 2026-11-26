/* =========================================================
   curriculum.js — 과목별 교육과정(단원 · 핵심 주제) 조회/생성
   · Gemini(교육과정 프롬프트 + Google 검색 grounding 시도)
   · 키가 없거나 오프라인일 때는 기본 교육과정 안내
   ========================================================= */
import {
  SUBJECTS, subjectById, learnerContextFrom, generateJSON, getKey, getSetup,
} from './core.js?v=825eb38c';

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

export const ALL_SUBJECT_IDS = SUBJECTS.map(s => s.id);
void learnerContextFrom;
