/* =========================================================
   course.js — Astra 다크 '시험' 학습 경로 + 과목 시트 + 상단바
   ========================================================= */
import {
  K, state, load, save, SUBJECTS, $, $$, escapeHtml, fmt, toast, openModal, dayKey, dday,
  currentSubject, setSubject, subjectById, saveMaterials, materialContext, generateJSON,
  getSetup, saveSetup, learnerContext, uid, getDifficulty, DIFFICULTY_LEVELS,
} from './core.js?v=618d59f9';
import { showView, openKeyModal } from './ui.js?v=618d59f9';
import { openDifficultyPrompt } from './difficulty.js?v=618d59f9';
import {
  weeklyXP, xpToday, goal, currentStreak, tierFor, leaderboard, profile, emit,
} from './gamify.js?v=618d59f9';
import { dailyChallengeSummary, startDaily } from './quiz.js?v=618d59f9';
import { buildCurriculum, basicCurriculum, subjectLabel, subjectIcon } from './curriculum.js?v=618d59f9';
import { getTextbook, normalizeTopics } from './textbook.js?v=618d59f9';

const el = (id) => document.getElementById(id);

/* ---------------- course data ---------------- */
const DEFAULT_UNITS = {
  korean: '문학 읽기와 표현의 기초',
  english: '독해와 문법의 기초',
  math: '함수와 방정식의 기초',
  social: '사회 구조와 경제의 이해',
  science: '물질과 에너지의 원리',
  history: '한국사의 흐름과 전환점',
  ai: '인공지능의 원리와 활용',
  custom: '나만의 학습 코스',
};

const LESSON_BLUEPRINT = [
  { type: 'tutor', icon: '💬', label: '개념 익히기', sub: 'AI 튜터와 1:1로' },
  { type: 'cards', icon: '🃏', label: '핵심 암기', sub: '플래시카드 8장' },
  { type: 'quiz', icon: '📝', label: '기본 문제', sub: '5문항 · 즉시 채점' },
  { type: 'sim', icon: '🔬', label: '직접 만져 보기', sub: '개념 시뮬레이션' },
  { type: 'podcast', icon: '🎧', label: '귀로 복습', sub: '5분 오디오' },
  { type: 'exam', icon: '⏱️', label: '실전 모의고사', sub: '시간 제한 · 약점 분석' },
  { type: 'oral', icon: '🎤', label: '말로 설명하기', sub: '구술 시험 3문항' },
];

export function courses() { return load(K.courses, {}); }
function saveCourses(map) { save(K.courses, map); }

export function courseId() {
  return state.subject === 'custom' ? 'custom:' + (state.customLabel || '') : state.subject;
}

function defaultCourse(subjectId) {
  const s = subjectById(subjectId) || currentSubject();
  const basic = basicCurriculum(subjectId);
  const unit = DEFAULT_UNITS[subjectId] || basic.unitTitle || `${s.label} 기초 과정`;
  return {
    subjectId,
    unitTitle: unit,
    curriculumName: basic.curriculumName,
    source: 'basic',
    updatedAt: 0,
    lessons: LESSON_BLUEPRINT.map((b, i) => ({
      id: 'l' + i,
      type: b.type,
      icon: b.icon,
      title: `${i + 1}. ${b.label}`,
      sub: b.sub,
      done: false,
      completedAt: 0,
    })),
    createdAt: Date.now(),
    ai: false,
  };
}

export function getCourse(subjectId = courseId()) {
  const map = courses();
  let c = map[subjectId];
  if (!c) {
    c = defaultCourse(subjectId);
    map[subjectId] = c;
    saveCourses(map);
  }
  return c;
}
function putCourse(c) {
  const map = courses();
  map[c.subjectId] = c;
  saveCourses(map);
}

export function courseProgress(subjectId = courseId()) {
  const c = getCourse(subjectId);
  const done = c.lessons.filter(l => l.done).length;
  return { done, total: c.lessons.length, pct: Math.round((done / Math.max(1, c.lessons.length)) * 100) };
}

export function nextLesson(subjectId = courseId()) {
  const c = getCourse(subjectId);
  return c.lessons.find(l => !l.done) || null;
}

/* ---------------- mark progress ---------------- */
export function markStudied(type) {
  const c = getCourse();
  const lesson = c.lessons.find(l => !l.done && l.type === type);
  if (!lesson) return;
  lesson.done = true;
  lesson.completedAt = Date.now();
  putCourse(c);
  emit();
  renderCourse();
  toast(`✅ 수업 완료: ${lesson.title}`, 'xp', 2200);
  document.dispatchEvent(new CustomEvent('app:lesson-complete', { detail: { type, lessonTitle: lesson.title, subjectId: c.subjectId } }));
}

/** 홈 화면 최상단의 수업 카드를 다시 그리는 외부용 진입점 */
export function redrawCourse() {
  renderCourse();
}

/* ---------------- render: top bar + course ---------------- */
export function renderTopBar() {
  const s = currentSubject();
  const p = profile();
  const prog = courseProgress();
  if (el('profEmoji')) el('profEmoji').textContent = p.emoji || '🐣';
  if (el('subjectIcon')) el('subjectIcon').textContent = s.icon;
  if (el('subjectLabel')) el('subjectLabel').textContent = s.label;
  if (el('subjectBarFill')) el('subjectBarFill').style.width = prog.pct + '%';
  if (el('streakChip')) el('streakChip').textContent = String(currentStreak());
  if (el('xpChipText')) el('xpChipText').textContent = fmt(weeklyXP());
  if (el('tbTier')) el('tbTier').textContent = tierFor(weeklyXP()).icon;

  const setup = getSetup();
  const bx = el('keyBanner');
  if (bx) bx.hidden = !!localStorage.getItem(K.key);
  void setup;
}

export function renderCourse() {
  renderTopBar();
  const s = currentSubject();
  const c = getCourse();
  const prog = courseProgress();
  const setup = getSetup() || {};

  if (el('courseSubject')) el('courseSubject').textContent = s.label;
  if (el('coursePct')) el('coursePct').textContent = prog.pct + '%';
  if (el('courseRingFg')) el('courseRingFg').style.strokeDashoffset = String(113 * (1 - prog.pct / 100));
  if (el('courseTitle')) el('courseTitle').textContent = c.unitTitle;

  const dd = setup.examDate ? dday(setup.examDate) : null;
  el('courseDday').textContent = dd == null ? '시험 날짜 미정' : dd > 0 ? `${dd}일 후` : dd === 0 ? '오늘 시험' : `시험 ${Math.abs(dd)}일 지남`;
  const goalPct = Number(setup.goalPct) || 70;
  el('courseGoalLeft').textContent = Math.max(0, goalPct - prog.pct) + '%';

  renderDifficultyPill(c.subjectId);
  renderLessonPath(c, prog);
  renderTodayStrip();
}

function renderDifficultyPill(subjectId) {
  const pill = el('diffPill');
  if (!pill) return;
  const rec = getDifficulty(subjectId);
  const item = rec.level ? DIFFICULTY_LEVELS[rec.level] : null;
  pill.innerHTML = item
    ? `${item.icon} 난이도 <b>${item.short}</b>`
    : '🎚️ 난이도 <b>자동</b>';
  pill.classList.toggle('on', !!item);
  pill.title = item ? `최근 평가: ${item.label} · 눌러서 바꿔요` : '수업 후 평가하면 AI가 난이도를 맞춰요';
}

function renderLessonPath(c, prog) {
  const cur = c.lessons.find(l => !l.done);
  const host = el('lessonPath');
  host.innerHTML = c.lessons.map((l, i) => {
    const stateCls = l.done ? 'done' : (cur && cur.id === l.id ? 'current' : 'locked');
    return `<div class="lesson ${stateCls}" data-lesson="${l.id}" role="button" tabindex="0">
      <span class="node">${l.done ? '✓' : cur && cur.id === l.id ? '' : '🔒'}</span>
      ${cur && cur.id === l.id ? `<span class="l-ico">${l.icon}</span>` : ''}
      <span class="l-body">
        <span class="l-title">${escapeHtml(l.title)}</span>
        <span class="l-sub">${escapeHtml(l.sub || '')}${l.done ? ' · 완료' : ''}</span>
      </span>
      <span class="l-go">${l.done ? '' : '›'}</span>
    </div>`;
  }).join('');
  host.querySelectorAll('[data-lesson]').forEach(node => {
    const go = () => {
      const lesson = c.lessons.find(x => x.id === node.dataset.lesson);
      if (!lesson) return;
      if (lesson.done) { toast('이미 완료한 수업이에요. 다시 복습할 수 있어요.', 'info', 2000); }
      startLesson(lesson);
    };
    node.addEventListener('click', go);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  const btn = el('startNext');
  if (cur) {
    btn.disabled = false;
    btn.textContent = c.lessons.every(l => l.done) ? '복습 이어서 하기' : '다음 수업 시작하기';
    if (el('lessonHint')) el('lessonHint').textContent = `다음: ${cur.title} · ${cur.sub || ''}`;
  } else {
    btn.disabled = false;
    btn.textContent = '코스 다시 복습하기';
    if (el('lessonHint')) el('lessonHint').textContent = '코스를 모두 마쳤어요! 복습하거나 새 과정을 추가해 보세요.';
  }
  void prog;
}

function renderTodayStrip() {
  const today = xpToday(), g = goal(), pct = Math.min(100, Math.round((today / g) * 100));
  if (el('todayFill')) el('todayFill').style.width = pct + '%';
  if (el('todaySub')) el('todaySub').textContent = `${today} / ${g} XP · 목표 ${pct}%`;
  const done = dailyChallengeSummary();
  const sub = el('chSub');
  const btn = el('chStart');
  if (sub) sub.textContent = done ? `오늘 완료 · ${done.correct}/${done.total}` : '3문제 · +20 XP';
  if (btn) btn.disabled = !!done;
}

/* ---------------- start a lesson ---------------- */
export function startLesson(lesson) {
  const c = getCourse();
  const topic = c.unitTitle;
  const t = lesson.type;
  const lessonTopic = String(lesson.title || '').replace(/^\d+\.\s*/, '').trim();
  const focus = (c.fromScope && lessonTopic) ? `${lessonTopic}${lesson.sub ? ' — ' + lesson.sub : ''}` : topic;
  if (t === 'tutor') {
    const input = el('chatInput');
    if (input && !input.value.trim()) {
      input.value = c.fromScope
        ? `이번 시험 범위(${topic}) 중 "${lessonTopic}" 부분을 처음부터 가르쳐 줘.${lesson.sub ? ' 특히 ' + lesson.sub + '.' : ''}`
        : `${topic} 중 "${lessonTopic}" 부분을 처음부터 가르쳐 줘.`;
    }
    showView('tutor');
    setTimeout(() => el('chatInput') && el('chatInput').focus(), 260);
  } else if (t === 'cards') {
    if (el('cardTopic')) el('cardTopic').value = focus;
    showView('cards');
  } else if (t === 'quiz') {
    if (el('qScope')) el('qScope').value = focus;
    if (lesson.kind === '심화' && el('qLevel')) el('qLevel').value = '심화';
    showView('quiz');
  } else if (t === 'exam') {
    if (el('qScope')) el('qScope').value = focus;
    if (el('qCount')) el('qCount').value = '10';
    showView('quiz');
    const examBtn = document.querySelector('#quizModeSeg [data-qmode="exam"]');
    if (examBtn) examBtn.click();
  } else if (t === 'oral') {
    if (el('oralScope')) el('oralScope').value = focus;
    showView('audio');
    document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: 'oral' }));
  } else if (t === 'podcast') {
    if (el('podTopic')) el('podTopic').value = focus;
    showView('audio');
    document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: 'podcast' }));
  } else if (t === 'sim') {
    showView('lab');
    if (el('simPrompt')) el('simPrompt').value = `${topic}의 핵심 개념을 직접 조작하며 이해할 수 있는 시뮬레이션`;
  } else if (t === 'plan') {
    showView('plan');
  }
}

/* ---------------- subject sheet ---------------- */
function applySubject(id) {
  if (typeof id === 'string' && id.startsWith('custom:')) setSubject('custom', id.slice(7));
  else setSubject(id);
}
export function openSubjectSheet() {
  const host = el('subjectSheet');
  host.hidden = false;
  renderSubjectSheet();
}
export function closeSheets() {
  document.querySelectorAll('.sheet-back').forEach(n => { n.hidden = true; });
}

function subjectTiles(ids, { selected, addTile = false } = {}) {
  return ids.map(id => {
    const s = subjectById(id) || { id, label: String(id).replace(/^custom:/, ''), icon: '✏️' };
    const on = selected === id;
    return `<button class="course-tile ${on ? 'change' : ''}" data-sid="${id}" type="button">
      <span class="ct-ico">${s.icon}</span><b>${escapeHtml(s.label)}</b>
    </button>`;
  }).join('') + (addTile ? `<button class="course-tile add" data-add-subject type="button">
      <span class="ct-ico">＋</span><b>과목 추가</b>
    </button>` : '');
}

export function renderSubjectSheet() {
  const setup = getSetup() || {};
  let ids = Array.isArray(setup.subjects) && setup.subjects.length ? setup.subjects.slice() : ['korean', 'english', 'math', 'social', 'science', 'history', 'ai'];
  const current = courseId();
  if (!ids.includes(current)) ids.push(current);
  el('coursesRow').innerHTML = subjectTiles(ids, { selected: current });
  const others = SUBJECTS.map(s => s.id).filter(id => !ids.includes(id));
  el('newCoursesRow').innerHTML = subjectTiles(others, { selected: '' , addTile: true });

  const prog = courseProgress(current);
  const s = currentSubject();
  const c = getCourse(current);
  el('courseProgressCard').innerHTML = `
    <div class="cc-top">
      <span class="cc-num">${prog.done}</span>
      <span class="cc-track"><i style="width:${prog.pct}%"></i></span>
      <span class="cc-of">${prog.total}</span>
    </div>
    <p class="cc-text">${escapeHtml(s.label)} 코스 진도는 <b>${prog.pct}%</b>입니다.<br/><span style="color:var(--muted);font-size:11.5px">${escapeHtml(c.unitTitle)}</span></p>
    <button class="cc-link" id="courseInfoBtn" type="button">코스 설명 · 단원 다시 짜기</button>`;

  el('coursesRow').querySelectorAll('[data-sid]').forEach(b => {
    b.addEventListener('click', () => {
      applySubject(b.dataset.sid);
      getCourse(b.dataset.sid);
      renderSubjectSheet();
      renderCourse();
      toast(`${subjectLabel(b.dataset.sid)} 코스로 바꿨아요`, 'info', 1600);
    });
  });
  el('newCoursesRow').querySelectorAll('[data-sid]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.sid;
      const next = (getSetup().subjects || []).slice();
      if (!next.includes(id)) next.push(id);
      saveSetup({ subjects: next });
      applySubject(id);
      getCourse(id);
      renderSubjectSheet();
      renderCourse();
      toast(`${subjectLabel(id)}을(를) 내 과정에 추가했어요`, 'xp');
    });
  });
  el('newCoursesRow').querySelector('[data-add-subject]')?.addEventListener('click', openAddSubjectModal);
  el('courseInfoBtn')?.addEventListener('click', openCourseInfo);
}

export function openAddSubjectModal() {
  const setup = getSetup();
  const chosen = new Set(setup.subjects || []);
  const modal = openModal(`
    <div class="modal-head"><h2>과목 추가</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">여러 과목을 한 번에 추가할 수 있어요. 추가한 과목은 상단 과목 바에 나란히 표시됩니다.</p>
      <div class="subj-grid" id="addGrid">
        ${SUBJECTS.map(s => `<button class="subj-item ${chosen.has(s.id) ? 'on' : ''}" data-asid="${s.id}" type="button">
          <span class="si-ico">${s.icon}</span><span>${s.label}<small>${s.hint}</small></span></button>`).join('')}
      </div>
      <div class="custom-subj">
        <input id="addCustom" placeholder="직접 입력 (예: 경제, 일본어)" maxlength="16" />
        <button class="ghost-btn small" id="addCustomBtn" type="button">추가</button>
      </div>
      <div class="row"><button class="primary" id="addConfirm" type="button">선택한 과목 추가</button></div>
    </div>`);
  modal.root.querySelector('#addGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-asid]');
    if (!b) return;
    const id = b.dataset.asid;
    if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
    b.classList.toggle('on');
  });
  modal.root.querySelector('#addCustomBtn').addEventListener('click', () => {
    const v = modal.root.querySelector('#addCustom').value.trim();
    if (!v) return;
    const id = 'custom:' + v;
    chosen.add(id);
    modal.root.querySelector('#addCustom').value = '';
    toast(`"${v}"을(를) 추가했어요`);
  });
  modal.root.querySelector('#addConfirm').addEventListener('click', () => {
    const prevIds = (getSetup().subjects || []).slice();
    saveSetup({ subjects: Array.from(chosen) });
    modal.close();
    const cur = courseId();
    if (!chosen.has(cur) && chosen.size) {
      applySubject(Array.from(chosen)[0]);
    }
    getCourse();
    renderSubjectSheet();
    renderCourse();
    toast('과목을 저장했어요', 'xp');
    const added = Array.from(chosen).filter(id => !prevIds.includes(id));
    if (added.length) {
      setTimeout(async () => {
        toast('새 과목 교육과정을 확인하고 있어요', 'info', 2400);
        await refreshCurricula(added);
      }, 200);
    }
  });
}

function openCourseInfo() {
  const c = getCourse();
  const s = currentSubject();
  const src = c.source === 'ai' ? 'AI 확인' : '기본 교육과정';
  const when = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('ko-KR') : '—';
  const modal = openModal(`
    <div class="modal-head"><h2>${escapeHtml(s.label)} 코스</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">지금 단원: <b>${escapeHtml(c.unitTitle)}</b><br/>${c.curriculumName ? escapeHtml(c.curriculumName) + ' · ' : ''}${src} · ${when}<br/>수업 ${c.lessons.length}개 중 ${c.lessons.filter(l => l.done).length}개 완료</p>
      <ol style="margin:10px 0 0; padding-left:20px; font-size:12.5px; color:var(--text-2)">
        ${c.lessons.map(l => `<li style="margin:4px 0">${escapeHtml(l.title)} <span style="color:var(--muted)">${l.done ? '· 완료' : ''}</span></li>`).join('')}
      </ol>
      <div class="row">
        <button class="primary" id="curGen" type="button">AI로 단원 다시 짜기</button>
        <button class="ghost-btn" id="curReset" type="button">진도 초기화</button>
      </div>
      <p class="fine">${escapeHtml((getSetup() || {}).grade || '')} ${escapeHtml((getSetup() || {}).school || '')} 교육과정과 시험 범위, 올린 자료를 반영해 AI가 단원을 다시 구성합니다.</p>
    </div>`);
  modal.root.querySelector('#curGen').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = '단원 구성 중…';
    try {
      await generateCurriculum();
      modal.close();
    } catch (e) {
      toast(e.message || '단원을 구성하지 못했어요.', 'err', 3200);
      btn.disabled = false;
      btn.textContent = 'AI로 단원 다시 짜기';
    }
  });
  modal.root.querySelector('#curReset').addEventListener('click', () => {
    if (!confirm('이 과목의 수업 진도를 초기화할까요?')) return;
    const nc = defaultCourse(courseId());
    putCourse(nc);
    modal.close();
    renderCourse();
    toast('진도를 초기화했어요');
  });
}

/* ---------------- AI curriculum ---------------- */
/** 듀오링고식 레슨 종류 → 앱 레슨 타입 */
export const KIND_TYPE = {
  '개념': 'tutor', '암기': 'cards', '문제': 'quiz', '심화': 'quiz',
  '모의고사': 'exam', '구술': 'oral', '오디오': 'podcast', '실험': 'sim',
};
const TYPE_BLUEPRINT = {};
LESSON_BLUEPRINT.forEach(b => { TYPE_BLUEPRINT[b.type] = b; });

function blueprintFor(type, kind) {
  const b = TYPE_BLUEPRINT[type] || LESSON_BLUEPRINT[0];
  if (type === 'quiz' && kind === '심화') return { ...b, sub: '심화·응용 문제 · 즉시 채점' };
  if (type === 'exam') return { ...b, sub: '시간 제한 · 약점 분석' };
  return b;
}

/**
 * 시험 범위·자료에서 새로 만든 레슨 경로를 과목 코스에 적용한다.
 * 이미 완료한 레슨은 제목이 같은 경우 완료 상태를 유지한다.
 */
export function applyLessonPath(subjectId, path, meta = {}) {
  if (!path || !Array.isArray(path.steps) || !path.steps.length) return null;
  const prev = getCourse(subjectId);
  const doneByTitle = {};
  (prev.lessons || []).forEach(l => {
    const key = String(l.title || '').replace(/^\d+\.\s*/, '').trim();
    if (l.done) doneByTitle[key] = true;
  });
  const lessons = path.steps.slice(0, 12).map((step, i) => {
    const kind = step.kind && KIND_TYPE[step.kind] ? step.kind : '개념';
    const type = KIND_TYPE[kind] || 'tutor';
    const b = blueprintFor(type, kind);
    const base = String(step.title || b.label).trim();
    return {
      id: 'l' + i,
      type,
      kind,
      icon: b.icon,
      title: `${i + 1}. ${base}`,
      sub: String(step.sub || b.sub || '').trim(),
      done: !!doneByTitle[base],
      completedAt: 0,
    };
  });
  const c = {
    subjectId,
    unitTitle: String(path.title || meta.title || prev.unitTitle || '나의 학습 코스').trim(),
    curriculumName: String(meta.curriculumName || prev.curriculumName || '').trim(),
    source: meta.source || (path.source === 'ai' ? 'ai' : 'basic'),
    scopeSource: meta.scopeSource || '',
    fromScope: true,
    updatedAt: Date.now(),
    lessons,
    createdAt: prev.createdAt || Date.now(),
    ai: path.source === 'ai',
  };
  putCourse(c);
  return c;
}

/** 기존 진도를 지키면서 새 교육과정(단원·주제)을 코스에 적용한다 */
export function applyCurriculum(subjectId, cur) {
  if (!cur || !Array.isArray(cur.topics) || !cur.topics.length) return null;
  const prev = getCourse(subjectId);
  const doneByTitle = {};
  (prev.lessons || []).forEach(l => {
    const key = (l.type || '') + '|' + String(l.title || '').replace(/^\d+\.\s*/, '').trim();
    doneByTitle[key] = !!l.done;
  });
  const topics = cur.topics.slice(0, LESSON_BLUEPRINT.length);
  const lessons = LESSON_BLUEPRINT.map((b, i) => {
    const t = topics[i % topics.length] || {};
    const base = String(t.title || b.label).trim();
    const prevKey = b.type + '|' + base;
    return {
      id: 'l' + i,
      type: b.type,
      icon: b.icon,
      title: `${i + 1}. ${base}`,
      sub: `${b.sub}${t.focus ? ' · ' + String(t.focus).trim() : ''}`,
      done: !!doneByTitle[prevKey],
      completedAt: 0,
    };
  });
  const tb = cur.textbook || null;
  const c = {
    subjectId,
    unitTitle: String(cur.unitTitle || prev.unitTitle || '나의 학습 코스').trim(),
    curriculumName: String(cur.curriculumName || '').trim(),
    source: cur.source === 'ai' ? 'ai' : 'basic',
    textbookName: String((tb && tb.name) || cur.textbookName || '').trim(),
    publisher: String((tb && tb.publisher) || cur.publisher || '').trim(),
    confirmed: !!cur.confirmed,
    grounded: !!cur.grounded,
    // 단원 선택/삭제에 쓸 수 있게 선택된 목록과 전체 목록을 함께 둔다
    topics: normalizeTopics(cur.topics),
    allTopics: normalizeTopics(cur.allTopics && cur.allTopics.length ? cur.allTopics : cur.topics),
    updatedAt: Date.now(),
    lessons,
    createdAt: prev.createdAt || Date.now(),
    ai: cur.source === 'ai',
  };
  putCourse(c);
  return c;
}

/** 코스에 저장된 교육과정 요약 */
export function courseCurriculum(subjectId = courseId()) {
  const c = getCourse(subjectId);
  const topics = (c.lessons || []).map(l => ({
    title: String(l.title || '').replace(/^\d+\.\s*/, ''),
    sub: l.sub || '',
  }));
  return {
    subjectId,
    label: subjectLabel(subjectId),
    icon: subjectIcon(subjectId),
    unitTitle: c.unitTitle,
    curriculumName: c.curriculumName || '',
    source: c.source || (c.ai ? 'ai' : 'basic'),
    updatedAt: c.updatedAt || 0,
    textbookName: c.textbookName || '',
    publisher: c.publisher || '',
    confirmed: !!c.confirmed,
    grounded: !!c.grounded,
    allTopics: Array.isArray(c.allTopics) && c.allTopics.length ? c.allTopics : topics,
    topics,
  };
}

/** 여러 과목 교육과정을 만들고 코스에 적용 (설정 · 온보딩 공용) */
export async function refreshCurricula(subjectIds, { learner, onProgress } = {}) {
  const ids = (subjectIds && subjectIds.length) ? subjectIds.slice() : (getSetup() || {}).subjects || [courseId()];
  const out = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const label = subjectLabel(id);
    onProgress && onProgress({ phase: 'start', subjectId: id, label, index: i, total: ids.length });
    const tb = getTextbook(id);
    const cur = await buildCurriculum(id, {
      learner: learner || getSetup(), materials: state.materials,
      textbook: tb.name, publisher: tb.publisher,
    });
    out[id] = applyCurriculum(id, cur) || cur;
    onProgress && onProgress({ phase: 'done', subjectId: id, label, index: i, total: ids.length, cur: out[id] });
  }
  renderCourse();
  if (el('subjectSheet') && !el('subjectSheet').hidden) renderSubjectSheet();
  return out;
}

export async function generateCurriculum() {
  const id = courseId();
  const tb = getTextbook(id);
  const cur = await buildCurriculum(id, { materials: state.materials, textbook: tb.name, publisher: tb.publisher });
  if (!cur || !cur.topics || !cur.topics.length) throw new Error('단원을 만들지 못했어요. 다시 시도해 주세요.');
  applyCurriculum(id, cur);
  renderCourse();
  toast(cur.source === 'ai'
    ? 'AI가 교육과정에 맞춰 단원을 다시 짰어요'
    : (cur.reason === 'quota' ? (cur.fallbackNotice || '무료 한도에 걸려 기본 단원으로 먼저 채웠어요.')
      : 'API 키가 없어 기본 교육과정으로 단원을 채웠어요'), cur.source === 'ai' ? 'xp' : 'info', 3400);
  return cur;
}

/* ---------------- exam search / all features ---------------- */
export function openExamSearch() {
  const items = [
    { view: 'tutor', icon: '💬', title: '1:1 튜터에게 질문', sub: '단계별 과외 · 사진·PDF · 음성' },
    { view: 'quiz', icon: '📝', title: '퀴즈 · 모의고사', sub: '즉시 채점 · 제한시간' },
    { view: 'cards', icon: '🃏', title: '플래시카드', sub: '암기 카드 복습' },
    { view: 'plan', icon: '🗓️', title: '시험 대비 계획', sub: 'D-day 학습 계획' },
    { view: 'audio', icon: '🎧', title: '복습 팟캐스트', sub: '귀로 듣는 복습' },
    { view: 'audio', icon: '🎤', title: '구술 시험', sub: '말로 설명하고 채점', pane: 'oral' },
    { view: 'lab', icon: '🔬', title: '실험실', sub: '개념 시뮬레이션' },
    { view: 'league', icon: '🏆', title: '리그 · 랭킹', sub: '친구와 겨루기' },
  ];
  const modal = openModal(`
    <div class="modal-head"><h2>무엇을 할까요?</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <div class="field-row" style="margin-top:0">
        <input id="examSearchInput" placeholder="궁금한 것을 적으면 튜터에게 물어봐요" />
        <button class="primary small" id="examSearchGo" type="button">질문</button>
      </div>
      <div style="margin-top:12px">
        ${items.map((it, i) => `<button class="task" style="width:100%;border-bottom:1px solid var(--border-soft)" data-go="${it.view}" data-pane="${it.pane || ''}" data-i="${i}" type="button">
          <span style="font-size:18px">${it.icon}</span>
          <span class="t-body"><span class="t-title">${it.title}</span><span class="t-sub">${it.sub}</span></span>
        </button>`).join('')}
      </div>
    </div>`);
  modal.root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const pane = b.dataset.pane;
    modal.close();
    showView(b.dataset.go);
    if (pane) document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: pane }));
  }));
  const go = () => {
    const q = modal.root.querySelector('#examSearchInput').value.trim();
    modal.close();
    showView('tutor');
    if (q) {
      const input = el('chatInput');
      if (input) { input.value = q; input.focus(); }
    }
  };
  modal.root.querySelector('#examSearchGo').addEventListener('click', go);
  modal.root.querySelector('#examSearchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

/* ---------------- init ---------------- */
export function initCourse() {
  el('subjectBtn').addEventListener('click', openSubjectSheet);
  el('examSearch').addEventListener('click', openExamSearch);
  el('examStats').addEventListener('click', () => showView('league'));
  el('startNext').addEventListener('click', () => {
    const c = getCourse();
    const next = c.lessons.find(l => !l.done) || c.lessons[0];
    startLesson(next);
  });
  el('startMore').addEventListener('click', openCourseInfo);
  el('chStart').addEventListener('click', () => { showView('quiz'); startDaily(); });
  el('keyBannerBtn').addEventListener('click', () => openKeyModal());
  el('profileBtn').addEventListener('click', () => showView('settings'));
  el('diffPill')?.addEventListener('click', () => {
    openDifficultyPrompt({ subjectId: courseId(), manual: true });
  });

  document.querySelectorAll('.sheet-back').forEach(back => {
    back.addEventListener('click', (e) => { if (e.target === back) closeSheets(); });
    back.querySelectorAll('[data-sheets-close]').forEach(b => b.addEventListener('click', closeSheets));
  });

  document.addEventListener('app:studied', (e) => { try { markStudied(e.detail.type); } catch (err) {} });
  document.addEventListener('app:difficulty', () => { try { renderDifficultyPill(courseId()); } catch (e) {} });
  document.addEventListener('gamify:update', () => { renderTopBar(); renderTodayStrip(); });
  document.addEventListener('app:subject', () => { renderCourse(); });
  document.addEventListener('app:view', (e) => {
    if (e.detail === 'course') renderCourse();
  });

  renderCourse();
  void leaderboard;
}
