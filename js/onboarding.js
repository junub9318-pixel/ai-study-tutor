/* =========================================================
   onboarding.js — 7단계 시작 마법사
   1 키 · 2 학교·학년·나이·학기 확인(AI 교육과정 선파악) · 3 수준·목표
   4 루틴 · 5 과목 확인(AI 리스트·추가/제거) · 6 단원 확인 · 7 저장
   ========================================================= */
import {
  K, state, SUBJECTS, subjectById, getSetup, saveSetup, setSubject, toast, escapeHtml,
  dday, dayKey, shiftDay, hasKey, getKey, setKey, clearKey, connectTest, generateJSON,
  currentSubject, getDifficulty, DIFFICULTY_LEVELS,
  getProvider, getKeyFor, setKeyFor, clearKeyFor, canSearch, providerInfo,
} from './core.js?v=ce8e2714';
import { showView, openKeyModal, renderKeyState, providerPanelHtml, bindProviderPanel, providerName } from './ui.js?v=ce8e2714';
import { getCourse, renderCourse, renderTopBar, applyCurriculum, courseId } from './course.js?v=ce8e2714';
import {
  buildCurriculum, basicCurriculum, subjectLabel, subjectIcon,
  verifySchool, ageForGrade, gradesFor, subjectIdFromName, QUOTA_NOTICE,
} from './curriculum.js?v=ce8e2714';
import {
  CURRICULUM_OPTIONS, CUSTOM_CURRICULUM, curriculumOptions, recommendCurriculum, curriculumHint,
  normalizeTopics, bindUnitList, unitEditorHtml,
} from './textbook.js?v=ce8e2714';
import { getSync, setSync, connectGoogle, driveSetupModal, isDriveReady } from './sync.js?v=ce8e2714';
import {
  createTimerWheel, recommendRoutine, minutesLabel, clampMinutes,
} from './routine.js?v=ce8e2714';

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
    curriculum: '',
    curriculumPick: '',
    curriculumCustom: '',
    school: '',
    schoolNote: '',
    schoolInfo: null,
    subjects: ['korean', 'english', 'math', 'social', 'science', 'history', 'ai'],
    subjectNames: {},
    textbooks: {},
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
  draft.textbooks = Object.assign({}, draft.textbooks || {});
  if (!draft.age) draft.age = ageForGrade(draft.level, draft.grade);
  if (!draft.curriculumPick) {
    draft.curriculumPick = recommendCurriculum({ country: draft.country, level: draft.level, grade: draft.grade });
  }
  draft.curriculumTouched = !!draft.curriculum;
  if (!draft.curriculum) draft.curriculum = pickedCurriculum();
  step = 0;
  keyOk = hasKey();
  curToken++;
  draft.curriculums = null;
  draft.curriculumSig = '';
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

/** 지금 고른 교육과정 이름 (직접 입력이면 입력한 글자) */
function pickedCurriculum() {
  const pick = draft.curriculumPick || recommendCurriculum({ country: draft.country, level: draft.level, grade: draft.grade });
  if (pick === CUSTOM_CURRICULUM) return String(draft.curriculumCustom || '').trim() || CUSTOM_CURRICULUM;
  return pick;
}

/** 과목별 교과서·출판사 (draft) */
function draftTextbook(id) {
  const t = (draft.textbooks && draft.textbooks[id]) || {};
  return { name: String(t.name || '').trim(), publisher: String(t.publisher || '').trim() };
}

/** 과목·교과서·학습 조건이 바뀌면 단원을 다시 확인해야 한다 */
function curriculumSignature() {
  return JSON.stringify({
    c: pickedCurriculum(),
    s: draft.subjects.map(id => [id, draftTextbook(id).name, draftTextbook(id).publisher]),
    l: [draft.country, draft.level, draft.grade, draft.semester, draft.school, draft.schoolNote],
  });
}

function setStepChrome() {
  el('onbFill').style.width = ((step + 1) / TOTAL * 100) + '%';
  el('onbStep').textContent = `${step + 1} / ${TOTAL}`;
  el('onbStep').title = STEP_TITLES[step] || '';
  el('onbBack').disabled = step === 0;
  const nextBtn = el('onbNext');
  nextBtn.disabled = false;
  if (step === TOTAL - 1) nextBtn.textContent = '학습 시작하기';
  else if (step === TOTAL - 2) nextBtn.textContent = '이 교육과정으로 계속';
  else if (step === 4) nextBtn.textContent = '교과서로 단원 확인';
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

/* ---------------- step 1 · AI 연결 (제공자 선택 + 키) ---------------- */
function stepKey() {
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 1 · AI 연결</p>
      <h2 class="onb-title">먼저, 내 AI 열쇠를<br/>연결해요</h2>
      <p class="onb-desc"><b>Gemini · Groq · OpenRouter</b> 중 하나의 <b>무료 API 키</b>만 있으면 이 앱의 모든 AI 수업(튜터·문제·카드·팟캐스트·시뮬레이션)을 쓸 수 있어요.<br/>키는 서버를 거치지 않고 <b>이 브라우저에만</b> 저장됩니다.</p>
      <div id="onbProvPanel">${providerPanelHtml()}</div>
      <p class="fine" style="margin-top:14px">학교 공용 기기라면 나중에 <b>설정 → AI 연결</b>에서 키를 삭제해 주세요.</p>`,
    bind: (body) => {
      const host = el$('#onbProvPanel', body);
      bindProviderPanel(host, {
        onConnected: () => { keyOk = true; renderKeyState(); setStepChrome(); },
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
        <span class="cur-badge ${ai ? '' : 'basic'}">${ai ? (info.found ? (info.grounded ? 'Google 검색 확인' : 'AI 학교 확인') : 'AI 교육과정') : '기본 안내'}</span>
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
  const rec = recommendCurriculum({ country: draft.country, level: draft.level, grade: draft.grade });
  const pick = draft.curriculumPick || rec;
  const opts = curriculumOptions(draft.country, draft.level);
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 2 · 학교와 학기</p>
      <h2 class="onb-title">어디서, 몇 학기에<br/>무엇을 배우나요?</h2>
      <p class="onb-desc">교육과정을 먼저 정하고 학교를 확인해요. AI가 <b>그 학교의 이번 학기 교육과정과 과목</b>을 ${canSearch() ? 'Google 검색으로 찾아' : 'AI가 아는 정보로'} 요약해 주고, 확인한 내용은 과목·교과서·단원을 정할 때 그대로 쓰여요.${canSearch() ? '' : `<br/><span class="fine">지금 고른 ${escapeHtml(providerName())}는 Google 검색이 없어 AI 지식으로 확인해요.</span>`}</p>

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

      <div class="onb-field"><label>교육과정 <i class="field-hint">학교 검색 전에 먼저 정해요</i></label>
        <div class="onb-cur-pick" id="onbCurPick">
          ${opts.map(o => `<button class="onb-cur-btn ${pick === o.value ? 'on' : ''}" data-curpick="${escapeHtml(o.value)}" type="button">
            <b>${escapeHtml(o.value)}</b><small>${escapeHtml(o.hint || '')}</small>${rec === o.value ? '<i class="onb-cur-rec">추천</i>' : ''}
          </button>`).join('')}
          <button class="onb-cur-btn ${pick === CUSTOM_CURRICULUM ? 'on' : ''}" data-curpick="${CUSTOM_CURRICULUM}" type="button">
            <b>직접 입력</b><small>학교 자체 편성 · 기타 과정</small>
          </button>
        </div>
        <div class="onb-custom-row" id="onbCurCustomRow" ${pick === CUSTOM_CURRICULUM ? '' : 'hidden'}>
          <input class="onb-input" id="onbCurCustom" maxlength="30" placeholder="예: 2022 개정 교육과정 (학교 자율 편성)" value="${escapeHtml(draft.curriculumCustom || '')}" />
        </div>
        <p class="fine" id="onbCurHint">${escapeHtml(curriculumHint({ country: draft.country, level: draft.level, grade: draft.grade }))}</p>
      </div>

      <div class="onb-field"><label>학교 검색 · 확인</label>
        <div class="onb-school-row">
          <input class="onb-input" id="onbSchool" placeholder="예: 세일고등학교" value="${escapeHtml(draft.school || '')}" />
          <button class="onb-check-btn" id="onbSchoolCheck" type="button">학교 확인</button>
        </div>
        <p class="fine">${canSearch() ? 'AI가 Google 검색으로 학교와 이 학기 교육과정·과목을 찾아 확인해요. 정확히 찾느라 <b>20초 안팎</b> 걸릴 수 있어요.' : `AI가 ${escapeHtml(providerName())}로 이 학기 교육과정·과목을 정리해요. <b>10초 안팎</b> 걸려요.`} 학교를 모르면 비워 두고 확인해도 돼요.</p>
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
      const curPickHost = el$('#onbCurPick', body);
      const curCustomRow = el$('#onbCurCustomRow', body);
      const curCustomInput = el$('#onbCurCustom', body);
      const curHint = el$('#onbCurHint', body);

      /* 교육과정 선택 UI를 현재 학년·국가 추천에 맞춰 다시 그린다 */
      const syncCurUI = () => {
        const rec = recommendCurriculum({ country: draft.country, level: draft.level, grade: draft.grade });
        const pick = draft.curriculumPick || rec;
        curPickHost.querySelectorAll('[data-curpick]').forEach(x => x.classList.toggle('on', x.dataset.curpick === pick));
        if (curCustomRow) curCustomRow.hidden = pick !== CUSTOM_CURRICULUM;
        if (curHint) curHint.textContent = curriculumHint({ country: draft.country, level: draft.level, grade: draft.grade });
        curPickHost.querySelectorAll('.onb-cur-rec').forEach(i => i.remove());
        const recBtn = Array.from(curPickHost.querySelectorAll('[data-curpick]')).find(x => x.dataset.curpick === rec);
        if (recBtn) {
          const i = document.createElement('i');
          i.className = 'onb-cur-rec';
          i.textContent = '추천';
          recBtn.appendChild(i);
        }
        draft.curriculum = pickedCurriculum();
      };
      const refreshRecommendation = () => {
        if (draft.curriculumTouched) { syncCurUI(); return; }
        draft.curriculumPick = recommendCurriculum({ country: draft.country, level: draft.level, grade: draft.grade });
        syncCurUI();
      };

      curPickHost.addEventListener('click', (e) => {
        const b = e.target.closest('[data-curpick]');
        if (!b) return;
        draft.curriculumPick = b.dataset.curpick;
        draft.curriculumTouched = true;
        if (draft.curriculumPick === CUSTOM_CURRICULUM && curCustomInput && !curCustomInput.value && draft.curriculumCustom) {
          curCustomInput.value = draft.curriculumCustom;
        }
        syncCurUI();
        invalidate();
      });
      if (curCustomInput) {
        curCustomInput.addEventListener('input', () => {
          draft.curriculumCustom = curCustomInput.value.trim();
          syncCurUI();
          invalidate();
        });
      }

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

      countrySel.addEventListener('change', () => { draft.country = countrySel.value; refreshRecommendation(); invalidate(); });
      gradeSel.addEventListener('change', () => { draft.grade = gradeSel.value; syncAge(); refreshRecommendation(); invalidate(); });
      ageSel.addEventListener('change', () => { draft.age = Number(ageSel.value); invalidate(); });
      schoolInput.addEventListener('input', () => { draft.school = schoolInput.value.trim(); invalidate(); });
      el$('#onbSchoolNote', body).addEventListener('input', (e) => { draft.schoolNote = e.target.value.trim(); });

      el$('#onbLevels', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-level]');
        if (!b) return;
        draft.level = b.dataset.level;
        body.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
        rebuildGrades();
        refreshRecommendation();
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
        draft.curriculum = pickedCurriculum();
        checkBtn.disabled = true;
        checkBtn.classList.add('busy');
        checkBtn.textContent = '확인 중…';
        status.hidden = false;
        status.className = 'status';
        status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${hasKey() ? (canSearch() ? 'AI가 Google 검색으로 학교·교육과정·이번 학기 과목을 찾는 중… (20초 안팎 걸릴 수 있어요)' : `AI가 ${escapeHtml(providerName())}로 학교·교육과정·이번 학기 과목을 정리하는 중… (10초 안팎)`) : '기본 교육과정을 준비하는 중…'}</span>`;
        const setStage = (stage) => {
          if (!hasKey()) return;
          if (stage === 'quota') {
            status.innerHTML = `<span class="status-line"><span class="spinner"></span> Google 검색 무료 한도에 걸려, 검색 없이 AI 지식으로 확인하는 중…</span>`;
          } else if (stage === 'noground') {
            status.innerHTML = `<span class="status-line"><span class="spinner"></span> 검색 결과를 받지 못해 AI 지식으로 다시 확인하는 중…</span>`;
          }
        };
        try {
          const info = await verifySchool({
            country: draft.country, level: draft.level, grade: draft.grade, age: draft.age,
            semester: draft.semester, school: draft.school, schoolNote: draft.schoolNote,
            curriculum: draft.curriculum,
          }, { onProgress: setStage, timeoutMs: 22000 });
          draft.schoolInfo = info;
          infoHost.innerHTML = schoolInfoSummaryHtml(info);
          try { infoHost.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          status.hidden = false;
          const quotaFallback = info.reason === 'quota' || !!info.fallbackNotice;
          status.className = (info.error || quotaFallback) ? 'status' : 'status ok';
          status.innerHTML = `<span class="status-line">${quotaFallback
            ? `ℹ️ ${escapeHtml(info.fallbackNotice || QUOTA_NOTICE)}`
            : info.source === 'ai'
              ? (info.found ? `✅ 학교와 교육과정을 확인했어요${info.grounded ? ' (Google 검색)' : info.searchSkipped ? ' (검색 한도로 검색 없이)' : ''}. 아래 요약을 확인하고 다음으로 넘어가세요.` : '✅ 교육과정을 확인했어요. 학교는 확인되지 않아 입력한 이름으로 진행해요.')
              : '📘 기본 교육과정으로 확인했어요. AI 키를 연결하면 학교·학기에 맞춰 다시 확인해요.'}</span>`;
          draft.subjects = (info.subjects || []).map(s => s.id || subjectIdFromName(s.name)).filter(Boolean);
          draft.subjects = Array.from(new Set(draft.subjects));
          draft.subjectNames = {};
          (info.subjects || []).forEach(s => { const id = s.id || subjectIdFromName(s.name); if (id) draft.subjectNames[id] = s.name; });
          draft.curriculums = null;
          draft.curriculumSig = '';
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

/* ---------------- step 5 · 과목 확인 (학년·학기 기준 AI 리스트) ---------------- */
function subjectNameOf(id) {
  return draft.subjectNames[id] || subjectLabel(id);
}

function stepSubjects() {
  const gradeLine = `${draft.country} · ${draft.curriculum || pickedCurriculum()} · ${draft.level} ${draft.grade}${draft.age ? `(만 ${draft.age}세)` : ''} · ${draft.semester}`;
  const tbHtml = () => draft.subjects.length
    ? draft.subjects.map(id => {
      const tb = draftTextbook(id);
      return `<div class="tb-row" data-tbrow="${escapeHtml(id)}">
        <span class="tb-ico">${subjectIcon(id)}</span>
        <div class="tb-body">
          <b class="tb-subj">${escapeHtml(subjectNameOf(id))}</b>
          <div class="tb-inputs">
            <input class="onb-input tb-input" data-tb-name="${escapeHtml(id)}" placeholder="교과서명 (예: 공통수학 1)" maxlength="40" value="${escapeHtml(tb.name)}" />
            <input class="onb-input tb-input" data-tb-pub="${escapeHtml(id)}" placeholder="출판사 (예: 비상교육)" maxlength="20" value="${escapeHtml(tb.publisher)}" />
          </div>
        </div>
      </div>`;
    }).join('')
    : '';
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
      <div class="onb-field"><label>교과서 · 출판사 <i class="field-hint">모르면 비워 둬도 돼요</i></label>
        <p class="fine" style="margin:0 0 8px">교과서명과 출판사를 적으면 AI가 그 교과서의 <b>실제 목차(단원)</b>를 ${canSearch() ? 'Google 검색으로 찾아 확인해요' : `AI가 아는 목차로 정리해요 (${escapeHtml(providerName())}는 검색 미지원)`}. 확인을 누르면 다음 화면에서 배울 단원만 골라요.</p>
        <div class="tb-grid" id="onbTbGrid">${tbHtml()}</div>
      </div>
      <p class="onb-preview" id="onbSubPreview"></p>`,
    bind: (body) => {
      const list = el$('#onbSubjList', body);
      const addHost = el$('#onbSubjAdd', body);
      const preview = el$('#onbSubPreview', body);
      const tbGrid = el$('#onbTbGrid', body);

      const updatePreview = () => {
        if (!preview) return;
        const filled = draft.subjects.filter(id => draftTextbook(id).name).length;
        preview.innerHTML = draft.subjects.length
          ? `최종 <b>${draft.subjects.length}개</b> 과목 · 교과서 <b>${filled}개</b> 입력됨 — 학습 경로를 이 교과서 단원으로 만들어요.`
          : '';
      };

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
        if (tbGrid) tbGrid.innerHTML = tbHtml();
        updatePreview();
      };
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        draft.subjects = draft.subjects.filter(x => x !== b.dataset.remove);
        draft.curriculums = null;
        draft.curriculumSig = '';
        draw();
      });
      addHost.addEventListener('click', (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        if (!draft.subjects.includes(b.dataset.add)) draft.subjects.push(b.dataset.add);
        draft.subjectNames[b.dataset.add] = subjectLabel(b.dataset.add);
        draft.curriculums = null;
        draft.curriculumSig = '';
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
        draft.curriculumSig = '';
        draw();
      });
      el$('#onbCustomSub', body).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el$('#onbCustomAdd', body).click(); }
      });
      if (tbGrid) {
        tbGrid.addEventListener('input', (e) => {
          const nameIn = e.target.closest('[data-tb-name]');
          const pubIn = e.target.closest('[data-tb-pub]');
          if (!nameIn && !pubIn) return;
          const id = nameIn ? nameIn.dataset.tbName : pubIn.dataset.tbPub;
          const prev = draftTextbook(id);
          draft.textbooks[id] = {
            name: nameIn ? nameIn.value.trim() : prev.name,
            publisher: pubIn ? pubIn.value.trim() : prev.publisher,
          };
          if (draft.curriculums) delete draft.curriculums[id];
          draft.curriculumSig = '';
          updatePreview();
        });
      }
      draw();
    },
  };
}

/* ---------------- step 6 · 단원 확인(선택 · 삭제) ---------------- */
function curTbLine(id, cur) {
  const tb = cur.textbook || draftTextbook(id);
  const name = (tb && tb.name) || '';
  const pub = (tb && tb.publisher) || '';
  if (!name && !pub) return '';
  return `<p class="cur-tb">📗 ${escapeHtml(name || '교과서 미입력')}${pub ? ' · ' + escapeHtml(pub) : ''}${cur.confirmed ? '<span class="cur-ok">목차 확인</span>' : ''}</p>`;
}

function curCardHtml(id, cur) {
  const badge = cur.source === 'ai'
    ? (cur.grounded ? '<span class="cur-badge">검색 확인</span>' : '<span class="cur-badge">AI 확인</span>')
    : '<span class="cur-badge basic">기본</span>';
  return `<div class="cur-card" data-cur="${escapeHtml(id)}">
    <div class="cur-head">
      <span class="cur-ico">${subjectIcon(id)}</span>
      <div class="cur-title"><b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b><small>${escapeHtml(cur.unitTitle || '')}</small></div>
      ${badge}
    </div>
    ${curTbLine(id, cur)}
    ${unitEditorHtml({ addPlaceholder: '단원 직접 추가 (예: 3. 도함수의 활용)' })}
    ${cur.curriculumName ? `<p class="cur-src">${escapeHtml(cur.curriculumName)}</p>` : ''}
  </div>`;
}

function curLoadingHtml(id) {
  const tb = draftTextbook(id);
  const what = tb.name ? `'${tb.name}' 교과서 목차를 검색하는 중…` : '교육과정을 확인하는 중…';
  return `<div class="cur-card loading" data-cur="${escapeHtml(id)}">
    <div class="cur-head">
      <span class="cur-ico">${subjectIcon(id)}</span>
      <div class="cur-title"><b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b><small>${escapeHtml(what)}</small></div>
      <span class="spinner"></span>
    </div>
    <div class="cur-skel"><i></i><i></i><i></i></div>
  </div>`;
}

function updateCurSummary() {
  const box = el('onbCurSummary');
  if (!box) return;
  const ids = draft.subjects.slice();
  let total = 0;
  let on = 0;
  ids.forEach(id => {
    const cur = draft.curriculums && draft.curriculums[id];
    if (!cur) return;
    const topics = normalizeTopics(cur.topics);
    total += topics.length;
    on += topics.filter(t => t.on).length;
  });
  box.innerHTML = `과목 <b>${ids.length}개</b> · 배울 단원 <b>${on}개</b> 선택됨${total && on < total ? ` <span class="cur-off-count">(제외 ${total - on}개)</span>` : ''}`;
}

function drawCurriculum(list, status, note) {
  const ids = draft.subjects.slice();
  if (!list) return;
  list.innerHTML = ids.map(id => {
    const cur = draft.curriculums && draft.curriculums[id];
    return cur ? curCardHtml(id, cur) : curLoadingHtml(id);
  }).join('');
  // 과목별 단원 편집기(선택/해제 · ✕ 삭제 · 직접 추가)
  list.querySelectorAll('.cur-card[data-cur]').forEach(card => {
    const id = card.dataset.cur;
    const cur = draft.curriculums && draft.curriculums[id];
    if (!cur) return;
    const host = card.querySelector('.unit-editor');
    if (host) bindUnitList(host, cur, updateCurSummary);
  });
  updateCurSummary();

  const built = draft.curriculums ? ids.filter(id => draft.curriculums[id]).length : 0;
  const ai = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].source === 'ai').length : 0;
  const grounded = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].grounded).length : 0;
  const quotaIds = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].reason === 'quota') : [];
  const quotaNames = quotaIds.map(id => draft.subjectNames[id] || subjectLabel(id)).join(', ');
  if (status) {
    if (built < ids.length) {
      status.hidden = false;
      status.className = 'status';
      const txt = hasKey() ? 'AI가 교육과정과 교과서 목차를 확인하는 중…' : '기본 교육과정을 준비하는 중…';
      status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${txt} <b>${built} / ${ids.length}</b></span>`;
    } else if (ai > 0) {
      status.hidden = false;
      status.className = 'status ok';
      status.innerHTML = `<span class="status-line">✅ <b>${ai}개 과목</b>의 단원을 확인했어요${grounded ? ` (Google 검색 ${grounded}개)` : ''}${ai < ids.length ? ` · ${ids.length - ai}개는 기본 안내` : ''} — 배울 단원만 남겨 주세요.</span>`;
    } else if (quotaIds.length) {
      status.hidden = false;
      status.className = 'status';
      status.innerHTML = `<span class="status-line">ℹ️ ${escapeHtml(QUOTA_NOTICE)}</span>`;
    } else {
      status.hidden = false;
      status.className = 'status';
      status.innerHTML = '<span class="status-line">📘 지금은 <b>기본 교육과정 안내</b>로 채웠어요. AI 키를 연결하면 교과서 목차까지 확인해요.</span>';
    }
  }
  if (note) {
    const failed = draft.curriculums ? ids.filter(id => draft.curriculums[id] && draft.curriculums[id].error && draft.curriculums[id].reason !== 'quota') : [];
    if (quotaIds.length && ai > 0) {
      note.textContent = `일부 과목(${quotaNames})은 Google 검색 무료 한도에 걸려 기본 단원으로 먼저 채웠어요. 1분 뒤 위의 "AI로 다시 확인"을 누르면 새로 시도해요.`;
    } else if (failed.length) {
      note.textContent = `일부 과목(${failed.map(id => draft.subjectNames[id] || subjectLabel(id)).join(', ')})은 AI 확인에 실패해 기본 교육과정으로 채웠어요. 다시 확인해 보세요.`;
    } else {
      note.textContent = '단원을 누르면 선택/해제, ✕는 목록에서 지우기, 아래 칸은 직접 추가예요. 고른 단원만 홈 학습 경로에 쓰여요.';
    }
  }
}

function stepCurriculum() {
  const learnerLine = () => `${draft.country || '대한민국'} · ${escapeHtml(draft.curriculum || pickedCurriculum())} · ${[draft.level, draft.grade].filter(Boolean).join(' ')} · ${draft.semester}${draft.school ? ' · ' + escapeHtml(draft.school) : ''}`;
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 6 · 단원 확인</p>
      <h2 class="onb-title">시작하기 전에,<br/>배울 단원만 골라요</h2>
      <p class="onb-desc">${learnerLine()} 기준으로 AI가 <b>교과서 목차의 단원</b>을 찾아 왔어요. 단원을 눌러 선택/해제하고, 이번에 배우지 않는 단원은 ✕로 지우세요. 고른 단원만 홈 학습 경로에 들어가요.</p>
      <div class="status" id="onbCurStatus" hidden></div>
      <p class="cur-summary" id="onbCurSummary"></p>
      <div class="onb-cur-list" id="onbCurList"></div>
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn small" id="onbCurRetry" type="button">🔄 AI로 다시 확인</button>
        <button class="ghost-btn small" id="onbCurEdit" type="button">◀ 과목·교과서 다시 고르기</button>
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
        if (!hasKey()) toast('API 키를 연결하면 AI가 교과서 목차까지 확인해요.', 'info', 3000);
        runCurriculum({ list, status, note, retry, force: true });
      });
      el$('#onbCurEdit', body)?.addEventListener('click', () => { step = 4; render(); });
      el$('#onbCurKey', body)?.addEventListener('click', () => { step = 0; render(); });
      if (ready && draft.curriculumSig === curriculumSignature()) drawCurriculum(list, status, note);
      else runCurriculum({ list, status, note, retry });
    },
  };
}

async function runCurriculum({ list, status, note, retry }) {
  const token = ++curToken;
  const ids = draft.subjects.slice();
  const sig = curriculumSignature();
  draft.curriculums = {};
  if (retry) retry.disabled = true;
  drawCurriculum(list, status, note);
  try {
    for (const id of ids) {
      if (token !== curToken || !el('onbCurList')) return;
      const tb = draftTextbook(id);
      const cur = await buildCurriculum(id, {
        learner: { ...draft, curriculum: draft.curriculum || pickedCurriculum() },
        materials: [],
        textbook: tb.name,
        publisher: tb.publisher,
        onProgress: (stage) => {
          if (token !== curToken || !status) return;
          if (stage === 'quota') {
            status.hidden = false;
            status.className = 'status';
            status.innerHTML = `<span class="status-line"><span class="spinner"></span> Google 검색 무료 한도에 걸려, 검색 없이 단원을 만드는 중… <b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b></span>`;
          } else if (stage === 'noground') {
            status.hidden = false;
            status.className = 'status';
            status.innerHTML = `<span class="status-line"><span class="spinner"></span> 검색 결과가 없어 AI 지식으로 단원을 구성하는 중… <b>${escapeHtml(draft.subjectNames[id] || subjectLabel(id))}</b></span>`;
          }
        },
      });
      if (token !== curToken) return;
      cur.topics = normalizeTopics(cur.topics);
      if (!cur.textbook && (tb.name || tb.publisher)) cur.textbook = tb;
      draft.curriculums[id] = cur;
      drawCurriculum(el('onbCurList'), el('onbCurStatus'), el('onbCurNote'));
    }
    draft.curriculumSig = sig;
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
        <div><span>교육과정</span><b>${escapeHtml(draft.curriculum || pickedCurriculum())}</b></div>
        <div><span>과목</span><b>${draft.subjects.length}개 · ${draft.subjects.slice(0, 4).map(id => escapeHtml(subjectNameOf(id))).join(', ')}${draft.subjects.length > 4 ? ' 외' : ''}</b></div>
        <div><span>교과서</span><b>${(() => { const list = draft.subjects.map(draftTextbook).filter(t => t.name); return list.length ? `${list.length}개 과목 · ${escapeHtml([list[0].name, list[0].publisher].filter(Boolean).join(' · '))}${list.length > 1 ? ' 외' : ''}` : '미입력'; })()}</b></div>
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
    draft.curriculum = pickedCurriculum();
  } else if (step === 2) {
    draft.examDate = el$('#onbExam', body)?.value || '';
  }
}

async function next() {
  if (step === 0) {
    const panelInput = el$('#provKeyInput', el('onbBody'));
    const typed = panelInput ? panelInput.value.trim() : '';
    const prov = getProvider();
    const key = typed || getKeyFor(prov);
    if (!keyOk) {
      if (!key) {
        toast('API 키를 연결하거나, 아래 "키 없이 둘러보기"를 눌러 주세요.', 'err', 3200);
        return;
      }
      setKeyFor(prov, key);
      const status = el$('#provKeyStatus', el('onbBody')) || el('onbKeyStatus');
      const nextBtn = el('onbNext');
      if (status) {
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="status-line"><span class="spinner"></span> 연결을 확인하는 중…</span>';
      }
      nextBtn.disabled = true;
      const label = nextBtn.textContent;
      nextBtn.innerHTML = '<span class="spinner"></span> 확인 중…';
      try {
        const r = await connectTest(key, (m) => { if (status) status.innerHTML = `<span class="status-line"><span class="spinner"></span> ${escapeHtml(m)}</span>`; }, prov);
        keyOk = true;
        if (status) { status.className = 'status ok'; status.innerHTML = `<span class="status-line">✅ 연결됨 · ${escapeHtml(r.model)}</span>`; }
        renderKeyState();
      } catch (e) {
        keyOk = false;
        clearKeyFor(prov);
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
    draft.curriculum = pickedCurriculum();
    // 교과서·교육과정이 그대로면 이미 찾은 단원(과 고른 선택)을 그대로 둔다
    const same = draft.curriculums && draft.curriculumSig && draft.curriculumSig === curriculumSignature();
    if (!same) {
      draft.curriculums = null;
      draft.curriculumSig = '';
    }
  } else if (step === 5) {
    const empty = draft.subjects.filter(id => {
      const cur = draft.curriculums && draft.curriculums[id];
      return cur && normalizeTopics(cur.topics).filter(t => t.on).length === 0;
    });
    if (empty.length) {
      toast(`${empty.map(id => subjectNameOf(id)).join(', ')} 단원을 하나 이상 남겨 주세요.`, 'err', 3200);
      return;
    }
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
  const curriculum = draft.curriculum || pickedCurriculum();
  const patch = {
    country: draft.country,
    level: draft.level,
    grade: draft.grade,
    age: Number(draft.age) || ageForGrade(draft.level, draft.grade),
    semester: draft.semester || '1학기',
    curriculum,
    curriculumPick: draft.curriculumPick,
    curriculumCustom: draft.curriculumCustom,
    school: draft.school,
    schoolNote: draft.schoolNote,
    schoolInfo: draft.schoolInfo,
    subjects: draft.subjects,
    subjectNames: draft.subjectNames,
    textbooks: draft.textbooks || {},
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
    const tb = draftTextbook(id);
    if (cur && cur.topics && cur.topics.length) {
      // 고른 단원만 학습 경로에 남기고, 지운 단원은 allTopics 에 보관
      const all = normalizeTopics(cur.topics);
      const kept = all.filter(t => t.on);
      applyCurriculum(id, Object.assign({}, cur, {
        topics: kept.length ? kept : all,
        allTopics: all.map(t => ({ title: t.title, focus: t.focus, on: t.on })),
        textbook: cur.textbook || ((tb.name || tb.publisher) ? tb : null),
      }));
    } else {
      applyCurriculum(id, basicCurriculum(id));
    }
  });
  el('onboarding').hidden = true;
  renderTopBar();
  renderCourse();
  showView('course');
  document.dispatchEvent(new CustomEvent('app:scope', { detail: { subjectId: courseId() } }));
  toast(skipped ? '기본 설정으로 시작할게요. 설정에서 언제든 바꿀 수 있어요.' : '준비 완료! 홈에서 시험 범위를 알려 주면 개념부터 문제까지 경로를 만들어요.', 'xp', 3600);
  void currentSubject; void K;
}
