/* =========================================================
   course.js — Astra 다크 '시험' 학습 경로 + 과목 시트 + 상단바
   ========================================================= */
import {
  K, state, load, save, SUBJECTS, $, $$, escapeHtml, fmt, toast, openModal, dayKey, dday,
  currentSubject, setSubject, subjectById, saveMaterials, materialContext, generateJSON,
  getSetup, saveSetup, learnerContext, uid,
} from './core.js?v=7639b443';
import { showView, openKeyModal } from './ui.js?v=7639b443';
import {
  weeklyXP, xpToday, goal, currentStreak, tierFor, leaderboard, profile, emit,
} from './gamify.js?v=7639b443';
import { dailyChallengeSummary, startDaily } from './quiz.js?v=7639b443';

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
  const unit = DEFAULT_UNITS[subjectId] || `${s.label} 기초 과정`;
  return {
    subjectId,
    unitTitle: unit,
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

  renderLessonPath(c, prog);
  renderTodayStrip();
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
  if (t === 'tutor') {
    const input = el('chatInput');
    if (input && !input.value.trim()) input.value = `${topic} 중 "${lesson.title.replace(/^\d+\.\s*/, '')}" 부분을 처음부터 가르쳐 줘.`;
    showView('tutor');
    setTimeout(() => el('chatInput') && el('chatInput').focus(), 260);
  } else if (t === 'cards') {
    if (el('cardTopic')) el('cardTopic').value = topic;
    showView('cards');
  } else if (t === 'quiz') {
    if (el('qScope')) el('qScope').value = topic;
    showView('quiz');
  } else if (t === 'exam') {
    if (el('qScope')) el('qScope').value = topic;
    if (el('qCount')) el('qCount').value = '10';
    showView('quiz');
    const examBtn = document.querySelector('#quizModeSeg [data-qmode="exam"]');
    if (examBtn) examBtn.click();
  } else if (t === 'oral') {
    if (el('oralScope')) el('oralScope').value = topic;
    showView('audio');
    document.dispatchEvent(new CustomEvent('app:audio-pane', { detail: 'oral' }));
  } else if (t === 'podcast') {
    if (el('podTopic')) el('podTopic').value = topic;
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
      toast(`${subjectById(b.dataset.sid).label} 코스로 바꿨어요`, 'info', 1600);
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
      toast(`${subjectById(id).label}을(를) 내 과정에 추가했어요`, 'xp');
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
  });
}

function openCourseInfo() {
  const c = getCourse();
  const s = currentSubject();
  const modal = openModal(`
    <div class="modal-head"><h2>${escapeHtml(s.label)} 코스</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">지금 단원: <b>${escapeHtml(c.unitTitle)}</b><br/>수업 ${c.lessons.length}개 중 ${c.lessons.filter(l => l.done).length}개 완료</p>
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
const CUR_SCHEMA = {
  type: 'object',
  properties: {
    unitTitle: { type: 'string' },
    topics: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, focus: { type: 'string' } }, required: ['title'] } },
  },
  required: ['unitTitle', 'topics'],
};

export async function generateCurriculum() {
  const s = currentSubject();
  const setup = getSetup() || {};
  const system = `너는 한국 학교 교육과정에 정통한 학습 설계자다. 학생의 국가·학교급·학년·학교 교육과정과 시험 범위에 맞춰 한 과목의 단원을 설계한다.
규칙:
- unitTitle: 지금 배우는 한 단원(또는 시험 범위)의 이름. 20자 이내, 교과서 단원명처럼.
- topics: 그 단원의 핵심 주제 7개. 앞에서 뒤로 갈수록 심화된다. 각 title은 20자 이내, focus는 한 줄 설명.
- 학생 자료가 있으면 그 자료의 단원명을 우선 사용한다.
- ${learnerContext()}`;
  const materials = state.materials.slice(0, 4);
  const user = `과목: ${s.label}\n${materialContext(materials, 4000)}`;
  const data = await generateJSON({ system, parts: [{ text: user }], schema: CUR_SCHEMA, temperature: 0.5, maxTokens: 2048 });
  const topics = (data.topics || []).slice(0, 7);
  if (!topics.length) throw new Error('단원을 만들지 못했어요. 다시 시도해 주세요.');
  const lessons = LESSON_BLUEPRINT.map((b, i) => {
    const t = topics[i % topics.length];
    return {
      id: 'l' + i,
      type: b.type,
      icon: b.icon,
      title: `${i + 1}. ${String(t.title || b.label).trim()}`,
      sub: `${b.sub} · ${String(t.focus || '').trim()}`.replace(/ · $/, ''),
      done: false,
      completedAt: 0,
    };
  });
  const c = {
    subjectId: courseId(),
    unitTitle: String(data.unitTitle || DEFAULT_UNITS[state.subject] || s.label).trim(),
    lessons,
    createdAt: Date.now(),
    ai: true,
  };
  putCourse(c);
  renderCourse();
  toast('AI가 교육과정에 맞춰 단원을 다시 짰어요', 'xp', 3000);
  void setup;
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

  document.querySelectorAll('.sheet-back').forEach(back => {
    back.addEventListener('click', (e) => { if (e.target === back) closeSheets(); });
    back.querySelectorAll('[data-sheets-close]').forEach(b => b.addEventListener('click', closeSheets));
  });

  document.addEventListener('app:studied', (e) => { try { markStudied(e.detail.type); } catch (err) {} });
  document.addEventListener('gamify:update', () => { renderTopBar(); renderTodayStrip(); });
  document.addEventListener('app:subject', () => { renderCourse(); });
  document.addEventListener('app:view', (e) => {
    if (e.detail === 'course') renderCourse();
  });

  renderCourse();
  void leaderboard;
}
