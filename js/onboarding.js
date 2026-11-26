/* =========================================================
   onboarding.js — 7단계 시작 마법사
   1 키 · 2 학교·학년·나이·학기 확인(AI 교육과정 선파악) · 3 수준·목표
   4 루틴 · 5 과목 확인(AI 리스트·추가/제거) · 6 단원 확인 · 7 저장
   ========================================================= */
import {
  K, state, SUBJECTS, subjectById, getSetup, saveSetup, setSubject, toast, escapeHtml,
  dday, dayKey, shiftDay, hasKey, getKey, setKey, clearKey, connectTest, generateJSON,
  currentSubject, getDifficulty, DIFFICULTY_LEVELS,
} from './core.js?v=e7de7f04';
import { showView, openKeyModal, renderKeyState } from './ui.js?v=e7de7f04';
import { getCourse, renderCourse, renderTopBar, applyCurriculum, courseId } from './course.js?v=e7de7f04';
import {
  buildCurriculum, basicCurriculum, subjectLabel, subjectIcon,
  verifySchool, ageForGrade, gradesFor, subjectIdFromName,
} from './curriculum.js?v=e7de7f04';
import { getSync, setSync, connectGoogle, driveSetupModal, isDriveReady } from './sync.js?v=e7de7f04';
import {
  createTimerWheel, recommendRoutine, minutesLabel, clampMinutes,
} from './routine.js?v=e7de7f04';

const el = (id) => document.getElementById(id);
const el$ = (sel, root = document) => root.querySelector(sel);

let step = 0;
let draft = null;
let keyOk = false;
let curToken = 0;

const TOTAL = 7;

function defaults() {
  return Object.assign({
    country: '대한민국',
    level: '고등학교',
    grade: '1학년',
    age: 16,
    semester: '1학기',
    school: '',
    schoolNote: '',
    schoolInfo: null,
    subjects: ['korean', 'english', 'math', 'social', 'science', 'history', 'ai'],
    subjectNames: {},
    levelSelf: '보통',
    examDate: shiftDay(dayKey(), 21),
    goalPct: 70,
    dailyMinutes: 60,
    done: false,
    createdAt: 0,
  }, getSetup() || {});
}

export function openOnboarding(force = false) {
  const setup = getSetup();
  if (!force && setup && setup.done) return false;
  draft = defaults();
  if (!Array.isArray(draft.subjects) || !draft.subjects.length) draft.subjects = defaults().subjects.slice();
  draft.subjectNames = Object.assign({}, draft.subjectNames || {});
  if (!draft.age) draft.age = ageForGrade(draft.level, draft.grade);
  step = 0;
  keyOk = hasKey();
  curToken++;
  draft.curriculums = null;
  el('onboarding').hidden = false;
  render();
  return true;
}

export function initOnboarding() {
  el('onbBack').addEventListener('click', () => { if (step > 0) { step--; render(); } });
  el('onbNext').addEventListener('click', next);
  el('onbSkip').addEventListener('click', skip);
}

const STEP_TITLES = ['AI 연결', '학교·학기', '수준·목표', '하루 루틴', '과목 확인', '단원 확인', '저장'];

function setStepChrome() {
  el('onbFill').style.width = ((step + 1) / TOTAL * 100) + '%';
  el('onbStep').textContent = `${step + 1} / ${TOTAL}`;
  el('onbStep').title = STEP_TITLES[step] || '';
  el('onbBack').disabled = step === 0;
  const nextBtn = el('onbNext');
  nextBtn.disabled = false;
  if (step === TOTAL - 1) nextBtn.textContent = '학습 시작하기';
  else if (step === TOTAL - 2) nextBtn.textContent = '이 교육과정으로 계속';
  else if (step === 0 && !keyOk) nextBtn.textContent = '키 연결하기';
  else if (step === 1) nextBtn.textContent = draft.schoolInfo ? '이 학교·학기로 계속' : '학교 확인 후 계속';
  else nextBtn.textContent = '다음';
  const skipBtn = el('onbSkip');
  if (step === 0) skipBtn.textContent = '키 없이 둘러보기';
  else if (step === TOTAL - 2) skipBtn.textContent = '기본 교육과정으로 시작';
  else skipBtn.textContent = '나중에 하기';
}

function render() {
  setStepChrome();
  const body = el('onbBody');
  const def = [stepKey, stepSchool, stepLevel, stepRoutine, stepSubjects, stepCurriculum, stepSync][step]();
  body.innerHTML = def.html();
  body.scrollTop = 0;
  def.bind(body);
}

/* ---------------- step 1 · API key ---------------- */
function stepKey() {
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 1 · AI 연결</p>
      <h2 class="onb-title">먼저, 내 AI 열쇠를<br/>연결해요</h2>
      <p class="onb-desc">Google AI Studio의 <b>무료 API 키</b> 하나로 이 앱의 모든 AI 수업(튜터·문제·카드·팟캐스트·시뮬레이션)을 쓸 수 있어요.<br/>키는 서버를 거치지 않고 <b>이 브라우저에만</b> 저장됩니다.</p>
      <div class="onb-key-steps">
        <div class="onb-key-step"><i>1</i><div><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> 에서 Google 로그인</div></div>
        <div class="onb-key-step"><i>2</i><div><b>Create API key</b> → 프로젝트 선택 → 키 생성 (카드 등록 없음)</div></div>
        <div class="onb-key-step"><i>3</i><div>만든 키(<code>AIza…</code>)를 아래에 붙여넣고 <b>연결 테스트</b></div></div>
      </div>
      <div class="onb-field">
        <label>Gemini API 키</label>
        <input class="onb-input" id="onbKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="AIza..." value="${escapeHtml(getKey())}" />
      </div>
      <div class="onb-key-row">
        <button class="onb-test-btn" id="onbKeyTest" type="button"><span class="onb-test-label">연결 테스트</span></button>
      </div>
      <div class="onb-status-slot">
        <div class="status" id="onbKeyStatus" hidden></div>
      </div>
      <p class="fine" style="margin-top:14px">학교 공용 기기라면 나중에 <b>설정 → Gemini API 키 → 키 삭제</b>를 눌러 주세요.</p>`,
    bind: (body) => {
      const status = el$('#onbKeyStatus', body);
      const testBtn = el$('#onbKeyTest', body);
      const label = el$('.onb-test-label', testBtn);
      const setLine = (html, cls = '') => {
        status.hidden = false;
        status.className = 'status' + (cls ? ' ' + cls : '');
        status.innerHTML = `<span class="status-line">${html}</span>`;
      };
      testBtn.addEventListener('click', async () => {
        const key = el$('#onbKeyInput', body).value.trim();
        if (!key) { setLine('키를 입력해 주세요.', 'err'); return; }
        testBtn.disabled = true;
        testBtn.classList.add('busy');
        if (label) label.textContent = '확인 중…';
        setLine('<span class="spinner"></span> 키를 확인하고 사용 가능한 모델을 찾는 중…');
        try {
          setKey(key);
          const r = await connectTest(key, (m) => setLine(`<span class="spinner"></span> ${escapeHtml(m)}`));
          keyOk = true;
          setLine(`✅ 연결됐어요! 사용 모델 <b>${escapeHtml(r.model)}</b>`, 'ok');
          renderKeyState();
          setStepChrome();
        } catch (e) {
          keyOk = false;
          clearKey();
          renderKeyState();
          setLine('❌ ' + escapeHtml(e.message || '연결하지 못했어요.'), 'err');
        } finally {
          testBtn.disabled = false;
          testBtn.classList.remove('busy');
          if (label) label.textContent = '연결 테스트';
        }
      });
    },
  };
}

/* ---------------- step 2 · 학교 · 학년 · 나이 · 학기 ---------------- */
const COUNTRIES = ['대한민국', '미국', '일본', '중국', '베트남', '영국', '호주', '캐나다', '기타'];
const LEVELS = ['초등학교', '중학교', '고등학교', '대학교'];

function schoolInfoSummaryHtml(info) {
  if (!info) return '';
  const ai = info.source === 'ai';
  return `
    <div class="school-card ${ai ? 'ai' : 'basic'}">
      <div class="school-head">
        <span class="school-ico">${info.found ? '🏫' : '📘'}</span>
        <div class="school-title">
          <b>${escapeHtml(info.schoolName || draft.school || '학교 정보 없이 진행')}</b>
          <small>${escapeHtml([info.region, info.schoolType].filter(Boolean).join(' · ') || draft.level + ' ' + draft.grade + ' · ' + draft.semester)}</small>
        </div>
        <span class="cur-badge ${ai ? '' : 'basic'}">${ai ? (info.found ? 'AI 학교 확인' : 'AI 교육과정') : '기본 안내'}</span>
      </div>
      <p class="school-sum">${escapeHtml(info.summary || '')}</p>
      ${info.semesterFocus ? `<p class="school-focus"><b>이번 학기</b> ${escapeHtml(info.semesterFocus)}</p>` : ''}
      <div class="school-subj">
        <span class="school-subj-label">${escapeHtml(info.curriculumName || '교육과정')} · 과목 ${info.subjects.length}개</span>
        <div class="school-chips">
          ${info.subjects.slice(0, 12).map(s => `<span class="school-chip">${escapeHtml(s.name)}</span>`).join('')}
        </div>
      </div>
      ${info.note ? `<p class="school-note">${escapeHtml(info.note)}</p>` : ''}
      ${info.error ? `<p class="school-note err">${escapeHtml(info.error)}</p>` : ''}
    </div>`;
}

function stepSchool() {
  const grades = gradesFor(draft.level);
  if (!grades.includes(draft.grade)) draft.grade = grades[0];
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 2 · 학교와 학기</p>
      <h2 class="onb-title">어디서, 몇 학기에<br/>무엇을 배우나요?</h2>
      <p class="onb-desc">국가·학년·나이·학기와 학교를 알려 주면, AI가 <b>그 학교의 이번 학기 교육과정을 먼저 확인</b>해 요약해 줘요. 확인한 내용은 과목과 단원을 정할 때 그대로 쓰입니다.</p>

      <div class="onb-field"><label>공부하는 나라</label>
        <select class="onb-input" id="onbCountry">
          ${COUNTRIES.map(c => `<option ${draft.country === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="onb-field"><label>교육 단계</label>
        <div class="onb-grid" id="onbLevels">
          ${LEVELS.map(l => `<button class="onb-choice ${draft.level === l ? 'on' : ''}" data-level="${l}" type="button">${l}<small>${l === '초등학교' ? '기초 개념부터' : l === '중학교' ? '내신 준비' : l === '고등학교' ? '내신·수능' : '전공·교양'}</small></button>`).join('')}
        </div>
      </div>

      <div class="onb-two">
        <div class="onb-field"><label>학년</label>
          <select class="onb-input" id="onbGrade">
            ${grades.map(g => `<option ${draft.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="onb-field"><label>나이 (만)</label>
          <select class="onb-input" id="onbAge">
            ${Array.from({ length: 20 }, (_, i) => i + 8).map(a => `<option value="${a}" ${Number(draft.age) === a ? 'selected' : ''}>만 ${a}세</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="fine onb-age-hint" id="onbAgeHint">학년에 맞춰 자동으로 맞춰요. 실제 나이와 다르면 바꿔 주세요.</p>

      <div class="onb-field"><label>학기</label>
        <div class="onb-semester" id="onbSemester">
          ${['1학기', '2학기'].map(s => `<button class="onb-sem-btn ${draft.semester === s ? 'on' : ''}" data-sem="${s}" type="button">${s}<small>${s === '1학기' ? '3월~8월 · 중간·기말' : '9월~2월 · 기말·수행'}</small></button>`).join('')}
        </div>
      </div>

      <div class="onb-field"><label>학교 검색 · 확인</label>
        <div class="onb-school-row">
          <input class="onb-input" id="onbSchool" placeholder="예: 세일고등학교" value="${escapeHtml(draft.school || '')}" />
          <button class="onb-check-btn" id="onbSchoolCheck" type="button">학교 확인</button>
        </div>
        <p class="fine">학교를 넣으면 AI가 학교와 이 학기 교육과정을 찾아 확인해요. 학교를 모르면 비워 두고 확인해도 돼요.</p>
        <div class="status" id="onbSchoolStatus" hidden></div>
      </div>

      <div class="onb-field"><label>학교 교육과정 메모 (선택)</label>
        <textarea class="onb-input" id="onbSchoolNote" rows="2" placeholder="예: 2022 개정 교육과정, 공통수학 1·2 / 학교 교육과정 편집표">${escapeHtml(draft.schoolNote || '')}</textarea>
      </div>

      <div id="onbSchoolInfo">${schoolInfoSummaryHtml(draft.schoolInfo)}</div>`,
    bind: (body) => {
      const countrySel = el$('#onbCountry', body);
      const gradeSel = el$('#onbGrade', body);
      const ageSel = el$('#onbAge', body);
      const schoolInput = el$('#onbSchool', body);
      const infoHost = el$('#onbSchoolInfo', body);
      const status = el$('#onbSchoolStatus', body);
      const checkBtn = el$('#onbSchoolCheck', body);

      const invalidate = () => {
        if (draft.schoolInfo) {
          draft.schoolInfo = null;
          infoHost.innerHTML = '';
          if (status) {
            status.hidden = false;
            status.className = 'status';
            status.innerHTML = '<span class="status-line">내용이 바뀌었어요. <b>학교 확인</b>을 다시 눌러 교육과정을 새로 확인해 주세요.</span>';
          }
          setStepChrome();
        }
      };

      const syncAge = () => {
        draft.age = ageForGrade(draft.level, draft.grade);
        ageSel.value = String(draft.age);
      };
      const rebuildGrades = () => {
        const list = gradesFor(draft.level);
        gradeSel.innerHTML = list.map(g => `<option ${draft.grade === g ? 'selected' : ''}>${g}</option>`).join('');
        if (!list.includes(draft.grade)) { draft.grade = list[0]; gradeSel.value = draft.grade; }
        syncAge();
      };

      countrySel.addEventListener('change', () => { draft.country = countrySel.value; invalidate(); });
      gradeSel.addEventListener('change', () => { draft.grade = gradeSel.value; syncAge(); invalidate(); });
      ageSel.addEventListener('change', () => { draft.age = Number(ageSel.value); invalidate(); });
      schoolInput.addEventListener('input', () => { draft.school = schoolInput.value.trim(); invalidate(); });
      el$('#onbSchoolNote', body).addEventListener('input', (e) => { draft.schoolNote = e.target.value.trim(); });

      el$('#onbLevels', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-level]');
        if (!b) return;
        draft.level = b.dataset.level;
        body.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
        rebuildGrades();
        invalidate();
      });
      el$('#onbSemester', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-sem]');
        if (!b) return;
        draft.semester = b.dataset.sem;
        body.querySelectorAll('[data-sem]').forEach(x => x.classList.toggle('on', x === b));
        invalidate();
      });

      checkBtn.addEventListener('click', async () => {
        draft.school = schoolInput.value.trim();
        draft.country = countrySel.value;
        draft.grade = gradeSel.value;
        draft.age = Number(ageSel.value) || ageForGrade(draft.level, draft.grade);
        checkBtn.disabled = true;
        checkBtn.classList.add('busy');
        checkBtn.textContent = '확인 중…';
        status.hidden = false;
        status.className = 'status';
        status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${hasKey() ? 'AI가 학교와 이 학기 교육과정을 확인하는 중…' : '기본 교육과정을 준비하는 중…'}</span>`;
        try {
          const info = await verifySchool({
            country: draft.country, level: draft.level, grade: draft.grade, age: draft.age,
            semester: draft.semester, school: draft.school, schoolNote: draft.schoolNote,
          });
          draft.schoolInfo = info;
          infoHost.innerHTML = schoolInfoSummaryHtml(info);
          try { infoHost.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          status.hidden = false;
          status.className = info.error ? 'status' : 'status ok';
          status.innerHTML = `<span class="status-line">${info.source === 'ai'
            ? (info.found ? '✅ 학교와 교육과정을 확인했어요. 아래 요약을 확인하고 다음으로 넘어가세요.' : '✅ 교육과정을 확인했어요. 학교는 확인되지 않아 입력한 이름으로 진행해요.')
            : '📘 기본 교육과정으로 확인했어요. AI 키를 연결하면 학교·학기에 맞춰 다시 확인해요.'}</span>`;
          draft.subjects = (info.subjects || []).map(s => s.id || subjectIdFromName(s.name)).filter(Boolean);
          draft.subjects = Array.from(new Set(draft.subjects));
          draft.subjectNames = {};
          (info.subjects || []).forEach(s => { const id = s.id || subjectIdFromName(s.name); if (id) draft.subjectNames[id] = s.name; });
          setStepChrome();
        } catch (e) {
          draft.schoolInfo = null;
          status.className = 'status err';
          status.innerHTML = `<span class="status-line">❌ ${escapeHtml(e.message || '학교를 확인하지 못했어요.')}</span>`;
        } finally {
          checkBtn.disabled = false;
          checkBtn.classList.remove('busy');
          checkBtn.textContent = '학교 확인';
        }
      });
    },
  };
}

/* ---------------- step 3 · level/date/goal ---------------- */
function stepLevel() {
  const goals = [
    { v: 50, t: '50%', d: '핵심 주제 집중', s: '시험이 얼마 안 남았거나 최소한만 확실히' },
    { v: 70, t: '70%', d: '모든 주제 연습', s: '가장 균형 잡힌 기본 선택' },
    { v: 90, t: '90%', d: '어려운 문제까지 정복', s: '고득점 목표, 시간이 넉넉할 때' },
  ];
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 3 · 수준과 목표</p>
      <h2 class="onb-title">지금 실력과<br/>목표를 정해요</h2>
      <p class="onb-desc">같은 과목도 시작점에 따라 설명이 달라져요. 시험 날짜를 넣으면 D-day에 맞춰 계획이 자동으로 조정됩니다.</p>
      <div class="onb-field"><label>현재 얼마나 알고 있나요?</label>
        <div class="onb-grid" id="onbSelf">
          ${[['기초', '처음부터 차근차근'], ['보통', '기본은 알아요'], ['심화', '응용·심화 위주']].map(([v, s]) => `<button class="onb-choice ${draft.levelSelf === v ? 'on' : ''}" data-self="${v}" type="button">${v}<small>${s}</small></button>`).join('')}
        </div>
      </div>
      <div class="onb-field"><label>시험 날짜</label>
        <input class="onb-input" type="date" id="onbExam" value="${escapeHtml(draft.examDate || '')}" min="${dayKey()}" />
        <p class="fine" id="onbDday">${draft.examDate ? `D-${Math.max(0, dday(draft.examDate))}` : '날짜를 모르면 비워 두어도 돼요.'}</p>
      </div>
      <div class="onb-field"><label>목표</label>
        <div style="display:flex;flex-direction:column;gap:8px" id="onbGoals">
          ${goals.map(g => `<button class="onb-choice ${Number(draft.goalPct) === g.v ? 'on' : ''}" data-goal="${g.v}" type="button">${g.t} · ${g.d}<small>${g.s}</small></button>`).join('')}
        </div>
      </div>`,
    bind: (body) => {
      el$('#onbSelf', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-self]');
        if (!b) return;
        draft.levelSelf = b.dataset.self;
        body.querySelectorAll('[data-self]').forEach(x => x.classList.toggle('on', x === b));
      });
      el$('#onbGoals', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-goal]');
        if (!b) return;
        draft.goalPct = Number(b.dataset.goal);
        body.querySelectorAll('[data-goal]').forEach(x => x.classList.toggle('on', x === b));
      });
      el$('#onbExam', body).addEventListener('change', (e) => {
        draft.examDate = e.target.value;
        const dd = draft.examDate ? dday(draft.examDate) : null;
        el$('#onbDday', body).textContent = dd == null ? '날짜를 모르면 비워 두어도 돼요.' : dd >= 0 ? `D-${dd} · ${dd}일 남았어요` : '지난 날짜예요. 다시 골라 주세요.';
      });
    },
  };
}

/* ---------------- step 4 · routine ---------------- */
function stepRoutine() {
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 4 · 하루 루틴</p>
      <h2 class="onb-title">하루에 얼마나<br/>할 수 있나요?</h2>
      <p class="onb-desc">무리하면 이틀도 못 가요. 매일 지킬 수 있는 시간을 고르면 AI가 그 안에 맞춰 수업을 나눠요.<br/>30분 단위로 <b>최대 12시간</b>까지 정할 수 있어요.</p>
      <div class="onb-field"><label>하루 학습 시간</label>
        <div class="tw-onb" id="onbMinutesWheel"></div>
      </div>
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn" id="onbAiRec" type="button">✨ AI 추천 받기</button>
      </div>
      <div class="onb-preview" id="onbRecBox" hidden></div>`,
    bind: (body) => {
      const box = el$('#onbRecBox', body);
      const btn = el$('#onbAiRec', body);
      const wheel = createTimerWheel(el$('#onbMinutesWheel', body), {
        value: draft.dailyMinutes,
        onChange: (v) => { draft.dailyMinutes = v; },
      });

      btn.addEventListener('click', async () => {
        // ① 시험 D-day·목표·수준·과목 수로 바로 계산해 즉시 보여 주고, 휠을 부드럽게 옮긴다
        const rec = recommendRoutine({
          examDate: draft.examDate,
          goalPct: draft.goalPct,
          levelSelf: draft.levelSelf,
          subjectCount: draft.subjects.length,
        });
        draft.dailyMinutes = rec.minutes;
        draft.aiReason = rec.reason;
        if (wheel) wheel.setValue(rec.minutes, { animate: true });
        box.hidden = false;
        box.innerHTML = `<b>추천: 하루 ${minutesLabel(rec.minutes)}</b><br/>${escapeHtml(rec.routine)}<br/><span class="rec-why">${escapeHtml(rec.reason)}</span>${hasKey() ? '<span class="rec-ai" id="onbRecAi"><span class="spinner tiny"></span> AI 코멘트…</span>' : ''}`;
        toast(`하루 ${minutesLabel(rec.minutes)} 루틴을 추천했어요`, 'xp');
        if (!hasKey()) return;

        // ② 짧은 코멘트 한 줄만 초경량으로 덧붙인다 (실패·시간 초과는 조용히 넘어감)
        const slot = el$('#onbRecAi', box);
        try {
          const data = await generateJSON({
            system: '너는 학습 코치다. 아래 학습 조건과 권장 시간을 보고, 왜 이 시간이 지킬 만한지 한 문장으로 조언한다. 40자 이내, 존댓말, 이모지 없이.',
            parts: [{ text: `${rec.reason}\n권장: 하루 ${minutesLabel(rec.minutes)} (${rec.routine})` }],
            schema: { type: 'object', properties: { comment: { type: 'string' } }, required: ['comment'] },
            temperature: 0.4, maxTokens: 200, timeoutMs: 8000, fast: true,
          });
          if (slot) {
            const comment = String((data && data.comment) || '').trim();
            if (comment) slot.textContent = comment;
            else slot.remove();
          }
        } catch (e) {
          if (slot) slot.remove();
        }
      });
    },
  };
}

function learnerSummary() {
  const dd = draft.examDate ? dday(draft.examDate) : null;
  return `국가: ${draft.country}\n학교급: ${draft.level} ${draft.grade} (만 ${draft.age}세)\n학기: ${draft.semester}\n학교: ${draft.school || '(미입력)'}\n현재 수준: ${draft.levelSelf}\n시험: ${draft.examDate || '미정'}${dd != null ? ` (D-${dd})` : ''}\n목표: ${draft.goalPct}%`;
}

/* ---------------- step 5 · 과목 확인 (학년·학기 기준 AI 리스트) ---------------- */
function subjectNameOf(id) {
  return draft.subjectNames[id] || subjectLabel(id);
}

function stepSubjects() {
  const gradeLine = `${draft.country} · ${draft.level} ${draft.grade}${draft.age ? `(만 ${draft.age}세)` : ''} · ${draft.semester}`;
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 5 · 과목 확인</p>
      <h2 class="onb-title">이 학기에 배우는<br/>과목이에요</h2>
      <p class="onb-desc">${escapeHtml(gradeLine)} 기준으로 ${draft.school ? escapeHtml(draft.school) + '의 ' : ''}교육과정에서 확인한 과목이에요.<br/>빼고 싶은 과목은 ✕로 지우고, 더 배울 과목을 아래에서 추가하세요.</p>
      <div class="onb-subj-list" id="onbSubjList"></div>
      <div class="onb-field"><label>과목 추가</label>
        <div class="onb-chips" id="onbSubjAdd"></div>
        <div class="onb-custom-row">
          <input class="onb-input" id="onbCustomSub" placeholder="직접 입력 (예: 경제, 일본어, 정보)" maxlength="16" />
          <button class="ghost-btn" id="onbCustomAdd" type="button">추가</button>
        </div>
      </div>
      <p class="onb-preview" id="onbSubPreview"></p>`,
    bind: (body) => {
      const list = el$('#onbSubjList', body);
      const addHost = el$('#onbSubjAdd', body);
      const preview = el$('#onbSubPreview', body);

      const draw = () => {
        list.innerHTML = draft.subjects.length
          ? draft.subjects.map(id => `<div class="onb-subj-item" data-subj="${escapeHtml(id)}">
              <span class="os-ico">${subjectIcon(id)}</span>
              <span class="os-name">${escapeHtml(subjectNameOf(id))}</span>
              <button class="os-x" data-remove="${escapeHtml(id)}" type="button" aria-label="${escapeHtml(subjectNameOf(id))} 빼기">✕</button>
            </div>`).join('')
          : '<p class="onb-empty">남은 과목이 없어요. 아래에서 하나 이상 추가해 주세요.</p>';
        const remain = SUBJECTS.filter(s => !draft.subjects.includes(s.id));
        addHost.innerHTML = remain.map(s => `<button class="onb-chip" data-add="${s.id}" type="button">＋ ${s.icon} ${s.label}</button>`).join('');
        preview.innerHTML = draft.subjects.length
          ? `최종 <b>${draft.subjects.length}개</b> 과목으로 학습 경로를 만들어요.`
          : '';
      };
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        draft.subjects = draft.subjects.filter(x => x !== b.dataset.remove);
        draft.curriculums = null;
        draw();
      });
      addHost.addEventListener('click', (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        if (!draft.subjects.includes(b.dataset.add)) draft.subjects.push(b.dataset.add);
        draft.subjectNames[b.dataset.add] = subjectLabel(b.dataset.add);
        draft.curriculums = null;
        draw();
      });
      el$('#onbCustomAdd', body).addEventListener('click', () => {
        const inp = el$('#onbCustomSub', body);
        const v = inp.value.trim();
        if (!v) return;
        const id = 'custom:' + v;
        if (!draft.subjects.includes(id)) { draft.subjects.push(id); draft.subjectNames[id] = v; }
        inp.value = '';
        draft.curriculums = null;
        draw();
      });
      el$('#onbCustomSub', body).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el$('#onbCustomAdd', body).click(); }
      });
      draw();
    },
  };
}

/* ---------------- step 6 · 단원 확인 ---------------- */
function curCardHtml(id, cur) {
  const badge = cur.source === 'ai'
    ? '<span class="cur-badge">AI 확인</span>'
    : '<span class="cur-badge basic">기본</span>';
  const topics = (cur.topics || []).map((t, i) => `
    <li><span class="n">${i + 1}</span><div><b>${escapeHtml(t.title || '')}</b>${t.focus ? `<span>${escapeHtml(t.focus)}</span>` : ''}</div></li>`).join('');
  return `<div class="cur-card" data-cur="${escapeHtml(id)}">
    <div class="cur-head">
      <span class="cur-ico">${subjectIcon(id)}</span>
      <div class="cur-title"><b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b><small>${escapeHtml(cur.unitTitle || '')}</small></div>
      ${badge}
    </div>
    <ol class="cur-topics">${topics}</ol>
    ${cur.curriculumName ? `<p class="cur-src">${escapeHtml(cur.curriculumName)}</p>` : ''}
  </div>`;
}

function curLoadingHtml(id) {
  return `<div class="cur-card loading" data-cur="${escapeHtml(id)}">
    <div class="cur-head">
      <span class="cur-ico">${subjectIcon(id)}</span>
      <div class="cur-title"><b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b><small>교육과정을 확인하는 중…</small></div>
      <span class="spinner"></span>
    </div>
    <div class="cur-skel"><i></i><i></i><i></i></div>
  </div>`;
}

function drawCurriculum(list, status, note) {
  const ids = draft.subjects.slice();
  if (!list) return;
  list.innerHTML = ids.map(id => {
    const cur = draft.curriculums && draft.curriculums[id];
    return cur ? curCardHtml(id, cur) : curLoadingHtml(id);
  }).join('');
  const built = draft.curriculums ? ids.filter(id => draft.curriculums[id]).length : 0;
  const ai = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].source === 'ai').length : 0;
  if (status) {
    if (built < ids.length) {
      status.hidden = false;
      status.className = 'status';
      status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${hasKey() ? 'AI가 학년·학기 교육과정을 확인하는 중…' : '기본 교육과정을 준비하는 중…'} <b>${built} / ${ids.length}</b></span>`;
    } else if (ai > 0) {
      status.hidden = false;
      status.className = 'status ok';
      status.innerHTML = `<span class="status-line">✅ <b>${ai}개 과목</b>의 교육과정을 AI로 확인했어요${ai < ids.length ? ` · ${ids.length - ai}개는 기본 안내` : ''}</span>`;
    } else {
      status.hidden = false;
      status.className = 'status';
      status.innerHTML = '<span class="status-line">📘 지금은 <b>기본 교육과정 안내</b>로 채웠어요. AI 키를 연결하면 학교·학년·학기에 맞춰 바로 다시 확인해요.</span>';
    }
  }
  if (note) {
    const failed = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].error) : [];
    note.textContent = failed.length
      ? `일부 과목(${failed.map(id => draft.subjectNames[id] || subjectLabel(id)).join(', ')})은 AI 확인에 실패해 기본 교육과정으로 채웠어요. 다시 확인해 보세요.`
      : '확인한 단원은 시작한 뒤에도 설정 → AI 교육과정에서 언제든 다시 볼 수 있어요.';
  }
}

function stepCurriculum() {
  const learnerLine = () => `${draft.country || '대한민국'} · ${[draft.level, draft.grade].filter(Boolean).join(' ')} · ${draft.semester}${draft.school ? ' · ' + escapeHtml(draft.school) : ''}`;
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 6 · 단원 확인</p>
      <h2 class="onb-title">시작하기 전에,<br/>배울 단원부터 볼게요</h2>
      <p class="onb-desc">${learnerLine()} 기준으로 과목별 교육과정(단원·핵심 주제)을 확인했어요. 구성이 다르면 다시 확인하거나, 시작한 뒤 설정에서 바꿀 수 있어요.</p>
      <div class="status" id="onbCurStatus" hidden></div>
      <div class="onb-cur-list" id="onbCurList"></div>
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn small" id="onbCurRetry" type="button">🔄 AI로 다시 확인</button>
        <button class="ghost-btn small" id="onbCurEdit" type="button">◀ 과목 다시 고르기</button>
        ${hasKey() ? '' : '<button class="ghost-btn small" id="onbCurKey" type="button">🔑 AI 키 연결</button>'}
      </div>
      <p class="fine" id="onbCurNote"></p>`,
    bind: (body) => {
      const list = el$('#onbCurList', body);
      const status = el$('#onbCurStatus', body);
      const note = el$('#onbCurNote', body);
      const retry = el$('#onbCurRetry', body);
      const ready = draft.curriculums && draft.subjects.every(id => draft.curriculums[id]);
      retry?.addEventListener('click', () => {
        if (!hasKey()) toast('API 키를 연결하면 AI가 학교·학년·학기에 맞춰 다시 확인해요.', 'info', 3000);
        runCurriculum({ list, status, note, retry });
      });
      el$('#onbCurEdit', body)?.addEventListener('click', () => { step = 4; render(); });
      el$('#onbCurKey', body)?.addEventListener('click', () => { step = 0; render(); });
      if (ready) drawCurriculum(list, status, note);
      else runCurriculum({ list, status, note, retry });
    },
  };
}

async function runCurriculum({ list, status, note, retry }) {
  const token = ++curToken;
  const ids = draft.subjects.slice();
  draft.curriculums = {};
  if (retry) retry.disabled = true;
  drawCurriculum(list, status, note);
  try {
    for (const id of ids) {
      if (token !== curToken || !el('onbCurList')) return;
      const cur = await buildCurriculum(id, { learner: draft, materials: [] });
      if (token !== curToken) return;
      draft.curriculums[id] = cur;
      drawCurriculum(el('onbCurList'), el('onbCurStatus'), el('onbCurNote'));
    }
  } finally {
    if (token === curToken && retry) retry.disabled = false;
  }
}

/* ---------------- step 7 · google sync ---------------- */
function stepSync() {
  const sync = getSync();
  const diff = getDifficulty(draft.subjects[0] || 'math');
  const diffItem = diff.level ? DIFFICULTY_LEVELS[diff.level] : null;
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 7 · 저장</p>
      <h2 class="onb-title">기기를 바꿔도<br/>이어서 공부하려면</h2>
      <p class="onb-desc">지금도 모든 기록은 이 기기에 저장돼요. Google 계정을 연결하면 내 Drive의 앱 전용 폴더에 백업되어, 다른 기기에서도 같은 기록으로 이어갈 수 있어요.</p>
      <div class="onb-google">
        ${isDriveReady()
          ? `<button class="gbtn" id="onbGoogle" type="button"><span style="font-weight:900;color:#4285F4">G</span> Google로 로그인해 동기화</button>`
          : `<button class="gbtn off" id="onbGoogleSetup" type="button">🔑 OAuth Client ID 설정하고 동기화</button>`}
        <button class="ghost-btn" id="onbLocal" type="button">이 기기에만 저장하고 시작</button>
      </div>
      <div class="status" id="onbSyncStatus" hidden></div>
      <div class="onb-sum">
        <div><span>국가 · 학교</span><b>${escapeHtml(draft.country)} · ${escapeHtml(draft.school || '학교 미입력')}</b></div>
        <div><span>학년 · 학기</span><b>${escapeHtml(draft.level)} ${escapeHtml(draft.grade)} · ${escapeHtml(draft.semester)}${draft.age ? ` (만 ${draft.age}세)` : ''}</b></div>
        <div><span>과목</span><b>${draft.subjects.length}개 · ${draft.subjects.slice(0, 4).map(id => escapeHtml(subjectNameOf(id))).join(', ')}${draft.subjects.length > 4 ? ' 외' : ''}</b></div>
        <div><span>시험</span><b>${draft.examDate ? `${escapeHtml(draft.examDate)} (D-${Math.max(0, dday(draft.examDate))})` : '미정'}</b></div>
        <div><span>목표 · 하루 시간</span><b>${draft.goalPct}% · ${minutesLabel(draft.dailyMinutes)}</b></div>
        <div><span>난이도</span><b>${diffItem ? `${diffItem.icon} ${diffItem.label}` : '수업 후 평가로 자동 조절'}</b></div>
      </div>
      <p class="fine">동기화는 진짜 Google 로그인으로만 동작해요. 가짜 로그인이나 자동 로그인은 쓰지 않습니다.<br/>API 키는 백업에 포함되지 않아 새 기기에서 다시 연결해야 해요.<br/>시험 범위 PDF·필기 사진은 시작한 뒤 <b>홈 → 과목 → 시험 범위·자료</b>에서 올리면 AI가 읽고 레슨을 만들어 줘요.</p>`,
    bind: (body) => {
      const status = el$('#onbSyncStatus', body);
      const btn = el$('#onbGoogle', body);
      if (btn) btn.addEventListener('click', async () => {
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="status-line"><span class="spinner"></span> Google 로그인 창을 여는 중…</span>';
        try {
          const r = await connectGoogle();
          status.className = 'status ok';
          status.innerHTML = `<span class="status-line">✅ ${escapeHtml(r.email || 'Google 계정')} 연결됨 · 학습을 시작하면 자동으로 백업할 수 있어요.</span>`;
        } catch (e) {
          status.className = 'status err';
          status.innerHTML = `<span class="status-line">❌ ${escapeHtml(e.message || '연결하지 못했어요.')}</span>`;
        }
      });
      el$('#onbGoogleSetup', body)?.addEventListener('click', driveSetupModal);
      el$('#onbLocal', body).addEventListener('click', () => finish());
      void sync;
    },
  };
}

/* ---------------- navigation ---------------- */
function collect() {
  const body = el('onbBody');
  if (step === 1) {
    draft.country = el$('#onbCountry', body)?.value || draft.country;
    draft.grade = el$('#onbGrade', body)?.value || draft.grade;
    draft.age = Number(el$('#onbAge', body)?.value) || draft.age;
    draft.school = (el$('#onbSchool', body)?.value || '').trim();
    draft.schoolNote = (el$('#onbSchoolNote', body)?.value || '').trim();
  } else if (step === 2) {
    draft.examDate = el$('#onbExam', body)?.value || '';
  }
}

async function next() {
  if (step === 0) {
    const key = el$('#onbKeyInput') ? el('onbKeyInput').value.trim() : '';
    if (!keyOk) {
      if (!key) {
        toast('API 키를 연결하거나, 아래 "키 없이 둘러보기"를 눌러 주세요.', 'err', 3200);
        return;
      }
      setKey(key);
      const status = el('onbKeyStatus');
      const nextBtn = el('onbNext');
      if (status) {
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="status-line"><span class="spinner"></span> 연결을 확인하는 중…</span>';
      }
      nextBtn.disabled = true;
      const label = nextBtn.textContent;
      nextBtn.innerHTML = '<span class="spinner"></span> 확인 중…';
      try {
        const r = await connectTest(key, (m) => { if (status) status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${escapeHtml(m)}</span>`; });
        keyOk = true;
        if (status) { status.className = 'status ok'; status.innerHTML = `<span class="status-line">✅ 연결됨 · ${escapeHtml(r.model)}</span>`; }
        renderKeyState();
      } catch (e) {
        keyOk = false;
        clearKey();
        renderKeyState();
        if (status) { status.className = 'status err'; status.innerHTML = `<span class="status-line">❌ ${escapeHtml(e.message || '연결하지 못했어요.')}</span>`; }
        nextBtn.disabled = false;
        nextBtn.textContent = label;
        return;
      }
      nextBtn.disabled = false;
      nextBtn.textContent = '다음';
    }
  } else if (step === 1) {
    collect();
    if (!draft.schoolInfo) {
      toast('"학교 확인"을 눌러 이 학기 교육과정을 먼저 확인해 주세요.', 'err', 3200);
      const btn = el('onbSchoolCheck');
      if (btn) { try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
      return;
    }
  } else if (step === 4) {
    if (!draft.subjects.length) { toast('과목을 하나 이상 골라 주세요.', 'err'); return; }
  } else {
    collect();
  }

  if (step === TOTAL - 1) { finish(); return; }
  step++;
  render();
}

function skip() {
  if (step === 0 && !hasKey()) {
    step = 1;
    render();
    return;
  }
  finish(true);
}

export async function finish(skipped = false) {
  collect();
  if (!Array.isArray(draft.subjects) || !draft.subjects.length) draft.subjects = defaults().subjects.slice();
  const map = draft.curriculums || {};
  const patch = {
    country: draft.country,
    level: draft.level,
    grade: draft.grade,
    age: Number(draft.age) || ageForGrade(draft.level, draft.grade),
    semester: draft.semester || '1학기',
    school: draft.school,
    schoolNote: draft.schoolNote,
    schoolInfo: draft.schoolInfo,
    subjects: draft.subjects,
    subjectNames: draft.subjectNames,
    levelSelf: draft.levelSelf,
    examDate: draft.examDate || '',
    goalPct: Number(draft.goalPct) || 70,
    dailyMinutes: clampMinutes(draft.dailyMinutes) || 60,
    done: true,
    curriculumAt: Date.now(),
    createdAt: (getSetup() || {}).createdAt || Date.now(),
  };
  saveSetup(patch);
  if (!draft.subjects.includes(state.subject)) setSubject(draft.subjects[0]);
  draft.subjects.forEach(id => {
    const cur = map[id];
    if (cur && cur.topics && cur.topics.length) applyCurriculum(id, cur);
    else applyCurriculum(id, basicCurriculum(id));
  });
  el('onboarding').hidden = true;
  renderTopBar();
  renderCourse();
  showView('course');
  document.dispatchEvent(new CustomEvent('app:scope', { detail: { subjectId: courseId() } }));
  toast(skipped ? '기본 설정으로 시작할게요. 설정에서 언제든 바꿀 수 있어요.' : '준비 완료! 홈에서 시험 범위를 알려 주면 개념부터 문제까지 경로를 만들어요.', 'xp', 3600);
  void currentSubject; void K;
}
