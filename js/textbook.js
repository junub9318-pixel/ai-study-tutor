/* =========================================================
   textbook.js — 교육과정 · 교과서 · 출판사 · 단원 선택 공용 헬퍼
   온보딩 Step 2(교육과정) · Step 5(교과서/출판사) · Step 6(단원 선택)
   와 설정의 '교과서 · 단원 편집'이 같은 규칙을 함께 쓴다.
   ========================================================= */
import { escapeHtml, getSetup, saveSetup } from './core.js?v=15b98fd0';

export const CUSTOM_CURRICULUM = '직접 입력';

export const CURRICULUM_OPTIONS = [
  { value: '2022 개정 교육과정', hint: '2025년 고1부터 적용' },
  { value: '2015 개정 교육과정', hint: '이전 입학생 · 재수생' },
];

/** 나라·학교급에 맞는 교육과정 후보 (대학·해외는 별도 항목) */
export function curriculumOptions(country = '대한민국', level = '') {
  const opts = CURRICULUM_OPTIONS.map(o => ({ ...o }));
  if (level === '대학교') opts.unshift({ value: '대학 교육과정', hint: '전공 · 교양 기준' });
  if (country && country !== '대한민국') opts.unshift({ value: `${country} 국가 교육과정`, hint: '국가 교육과정 기준' });
  return opts;
}

/**
 * 학년으로 교육과정을 추천한다 (2022 개정: 초등 2024학년도 입학생, 중·고등 2025학년도 입학생부터)
 */
export function recommendCurriculum({ country = '대한민국', level = '고등학교', grade = '1학년', year = new Date().getFullYear() } = {}) {
  if (level === '대학교') return '대학 교육과정';
  if (country && country !== '대한민국') return `${country} 국가 교육과정`;
  const n = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10) || 1;
  const entryYear = Number(year) - (n - 1);
  const startYear = level === '초등학교' ? 2024 : 2025;
  return entryYear >= startYear ? '2022 개정 교육과정' : '2015 개정 교육과정';
}

/** 추천 이유를 한 줄로 */
export function curriculumHint({ country = '대한민국', level = '고등학교', grade = '1학년' } = {}) {
  const rec = recommendCurriculum({ country, level, grade });
  if (level === '대학교') return '대학은 전공·교양 편성이라 교육과정 이름을 직접 적는 편이 정확해요.';
  if (country && country !== '대한민국') return `${country} 학제 기준이에요. 학교가 다른 과정을 쓰면 "직접 입력"으로 적어 주세요.`;
  return `${grade}이면 보통 "${rec}"이에요. 학교가 다른 과정을 쓰면 바꿔 주세요.`;
}

/* ---------------- 교과서 · 출판사 (과목별, setup에 저장) ---------------- */
export function getTextbooks() {
  const s = getSetup() || {};
  const map = s.textbooks;
  return (map && typeof map === 'object') ? map : {};
}

export function getTextbook(subjectId) {
  const t = getTextbooks()[subjectId] || {};
  return { name: String(t.name || ''), publisher: String(t.publisher || '') };
}

export function setTextbook(subjectId, patch = {}) {
  const map = JSON.parse(JSON.stringify(getTextbooks()));
  const prev = map[subjectId] || {};
  map[subjectId] = {
    name: String((patch.name != null ? patch.name : prev.name) || '').trim().slice(0, 40),
    publisher: String((patch.publisher != null ? patch.publisher : prev.publisher) || '').trim().slice(0, 20),
  };
  saveSetup({ textbooks: map });
  return map[subjectId];
}

/** "공통수학 1 · 비상교육" (없으면 빈 문자열) */
export function textbookLabel(subjectId) {
  const t = getTextbook(subjectId);
  return [t.name, t.publisher].filter(Boolean).join(' · ');
}

/* ---------------- 단원(토픽) 목록 공용 편집기 ---------------- */
/** {title, focus, on} 으로 정리한다. on=false 는 '선택 해제된 단원' */
export function normalizeTopics(list, max = 24) {
  return (Array.isArray(list) ? list : [])
    .map(t => ({
      title: String((t && t.title) || '').trim().slice(0, 60),
      focus: String((t && t.focus) || '').trim().slice(0, 80),
      on: !(t && t.on === false),
    }))
    .filter(t => t.title)
    .slice(0, max);
}

/** 지금 선택된(남길) 단원만 */
export function pickedTopics(cur) {
  return normalizeTopics(cur && cur.topics).filter(t => t.on);
}

/** 단원 행 HTML (선택 토글 · ✕ 삭제) */
export function unitListHtml(cur) {
  const topics = normalizeTopics(cur && cur.topics);
  if (!topics.length) {
    return '<li class="unit-empty">확인된 단원이 없어요. 아래에 직접 추가해 주세요.</li>';
  }
  return topics.map((t, i) => `
    <li class="unit-row ${t.on ? 'on' : ''}">
      <button class="unit-check" data-unit-toggle="${i}" type="button" role="checkbox" aria-checked="${t.on}" aria-label="${escapeHtml(t.title)} 선택">
        <span>${t.on ? '✓' : ''}</span>
      </button>
      <span class="unit-body"><b>${escapeHtml(t.title)}</b>${t.focus ? `<small>${escapeHtml(t.focus)}</small>` : ''}</span>
      <button class="unit-x" data-unit-del="${i}" type="button" aria-label="${escapeHtml(t.title)} 삭제">✕</button>
    </li>`).join('');
}

/**
 * 단원 편집기를 붙인다. cur.topics 를 직접 고친다.
 * @returns {{draw:Function, setTopics:Function, getSelected:Function}}
 */
export function bindUnitList(root, cur, onChange) {
  if (!root) return null;
  const list = root.querySelector('.unit-list');
  const count = root.querySelector('.unit-count');
  const addInput = root.querySelector('.unit-add-input');

  const sync = () => {
    if (count) {
      const topics = normalizeTopics(cur.topics);
      const on = topics.filter(t => t.on).length;
      count.innerHTML = `선택한 단원 <b>${on}</b> / ${topics.length}`;
    }
  };
  const draw = () => {
    if (list) list.innerHTML = unitListHtml(cur);
    sync();
  };
  const commit = () => { draw(); if (onChange) onChange(cur); };
  const addTopic = (title) => {
    const v = String(title || '').trim().slice(0, 60);
    if (!v) return false;
    cur.topics = normalizeTopics(cur.topics);
    if (cur.topics.some(t => t.title === v)) { commit(); return false; }
    cur.topics.push({ title: v, focus: '', on: true });
    commit();
    return true;
  };

  root.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-unit-toggle]');
    if (tg) {
      const i = Number(tg.dataset.unitToggle);
      const topics = normalizeTopics(cur.topics);
      const t = topics[i];
      if (!t) return;
      t.on = !t.on;
      cur.topics = topics;
      commit();
      return;
    }
    const del = e.target.closest('[data-unit-del]');
    if (del) {
      const i = Number(del.dataset.unitDel);
      const topics = normalizeTopics(cur.topics);
      topics.splice(i, 1);
      cur.topics = topics;
      commit();
      return;
    }
    const bulk = e.target.closest('[data-unit-all]');
    if (bulk) {
      const on = bulk.dataset.unitAll === '1';
      cur.topics = normalizeTopics(cur.topics).map(t => ({ ...t, on }));
      commit();
      return;
    }
    const addBtn = e.target.closest('.unit-add-btn');
    if (addBtn && addInput) {
      if (addTopic(addInput.value)) addInput.value = '';
      else if (addInput.value.trim()) addInput.value = '';
      addInput.focus();
    }
  });
  if (addInput) {
    addInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (addTopic(addInput.value)) addInput.value = '';
    });
  }
  draw();
  return {
    draw,
    setTopics(list) { cur.topics = normalizeTopics(list); commit(); },
    getSelected() { return pickedTopics(cur); },
    addTopic,
  };
}

/** 편집기 공통 마크업 */
export function unitEditorHtml({ addPlaceholder = '단원 직접 추가 (예: 3. 도함수의 활용)' } = {}) {
  return `<div class="unit-editor">
    <div class="unit-top">
      <span class="unit-count"></span>
      <span class="unit-bulk">
        <button class="link-btn" data-unit-all="1" type="button">전체 선택</button>
        <button class="link-btn" data-unit-all="0" type="button">전체 해제</button>
      </span>
    </div>
    <ul class="unit-list"></ul>
    <div class="unit-add-row">
      <input class="unit-add-input" maxlength="50" placeholder="${escapeHtml(addPlaceholder)}" />
      <button class="ghost-btn small unit-add-btn" type="button">＋ 추가</button>
    </div>
  </div>`;
}
