/* =========================================================
   onboarding.js — 7단계 시작 마법사
   ========================================================= */
import {
  K, state, SUBJECTS, subjectById, getSetup, saveSetup, setSubject, toast, escapeHtml,
  dday, dayKey, shiftDay, hasKey, getKey, setKey, clearKey, connectTest, generateJSON,
  saveMaterials, currentSubject,
} from './core.js?v=a59a745c';
import { showView, openKeyModal, addMaterial, fileToMaterial, renderKeyState } from './ui.js?v=a59a745c';
import { getCourse, renderCourse, renderTopBar } from './course.js?v=a59a745c';
import { getSync, setSync, connectGoogle, driveSetupModal, isDriveReady } from './sync.js?v=a59a745c';

const el = (id) => document.getElementById(id);
let step = 0;
let draft = null;
let keyOk = false;

const TOTAL = 7;
const el$ = (sel, root = document) => root.querySelector(sel);

function defaults() {
  return Object.assign({
    country: '대한민국',
    level: '고등학교',
    grade: '1학년',
    school: '',
    schoolNote: '',
    subjects: ['korean', 'english', 'math', 'social', 'science', 'history', 'ai'],
    levelSelf: '보통',
    examDate: shiftDay(dayKey(), 21),
    goalPct: 70,
    dailyMinutes: 60,
    done: false,
    noMaterial: false,
    createdAt: 0,
  }, getSetup() || {});
}

export function openOnboarding(force = false) {
  const setup = getSetup();
  if (!force && setup && setup.done) return false;
  draft = defaults();
  if (!Array.isArray(draft.subjects) || !draft.subjects.length) draft.subjects = defaults().subjects.slice();
  step = 0;
  keyOk = hasKey();
  el('onboarding').hidden = false;
  render();
  return true;
}

export function initOnboarding() {
  el('onbBack').addEventListener('click', () => { if (step > 0) { step--; render(); } });
  el('onbNext').addEventListener('click', next);
  el('onbSkip').addEventListener('click', skip);
}

function setStepChrome() {
  el('onbFill').style.width = ((step + 1) / TOTAL * 100) + '%';
  el('onbStep').textContent = `${step + 1} / ${TOTAL}`;
  el('onbBack').disabled = step === 0;
  el('onbNext').textContent = step === TOTAL - 1 ? '학습 시작하기' : (step === 0 && !keyOk) ? '키 연결하기' : '다음';
  el('onbSkip').textContent = step === 0 ? '키 없이 둘러보기' : '나중에 하기';
}

function render() {
  setStepChrome();
  const body = el('onbBody');
  const def = [stepKey, stepBasics, stepSubjects, stepLevel, stepRoutine, stepMaterials, stepSync][step]();
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
      <div class="row tight" style="margin-top:10px">
        <button class="ghost-btn small" id="onbKeyTest" type="button">연결 테스트</button>
      </div>
      <div class="status" id="onbKeyStatus" hidden></div>
      <p class="fine" style="margin-top:14px">학교 공용 기기라면 나중에 <b>설정 → Gemini API 키 → 키 삭제</b>를 눌러 주세요.</p>`,
    bind: (body) => {
      const status = el$('#onbKeyStatus', body);
      const testBtn = el$('#onbKeyTest', body);
      testBtn.addEventListener('click', async () => {
        const key = el$('#onbKeyInput', body).value.trim();
        if (!key) { status.hidden = false; status.className = 'status err'; status.textContent = '키를 입력해 주세요.'; return; }
        testBtn.disabled = true;
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="spinner"></span> 키를 확인하고 사용 가능한 모델을 찾는 중…';
        try {
          setKey(key);
          const r = await connectTest(key, (m) => { status.innerHTML = `<span class="spinner"></span> ${escapeHtml(m)}`; });
          keyOk = true;
          status.className = 'status ok';
          status.innerHTML = `✅ 연결됐어요! 사용 모델 <b>${escapeHtml(r.model)}</b>`;
          renderKeyState();
          setStepChrome();
          el('onbNext').textContent = '다음';
        } catch (e) {
          keyOk = false;
          clearKey();
          status.className = 'status err';
          status.textContent = '❌ ' + (e.message || '연결하지 못했어요.');
        } finally {
          testBtn.disabled = false;
        }
      });
    },
  };
}

/* ---------------- step 2 · basics ---------------- */
function stepBasics() {
  const levels = ['초등학교', '중학교', '고등학교', '대학교'];
  const grades = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년', '대학 1학년', '대학 2학년', '대학 3학년', '대학 4학년'];
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 2 · 기본 정보</p>
      <h2 class="onb-title">어디서, 무엇을<br/>배우고 있나요?</h2>
      <p class="onb-desc">국가·학교급·학년·학교를 알려 주면 AI가 그 교육과정에 맞는 단원과 설명 수준으로 수업을 구성해요.</p>
      <div class="onb-field"><label>공부하는 나라</label>
        <select class="onb-input" id="onbCountry">
          ${['대한민국', '미국', '일본', '중국', '베트남', '기타'].map(c => `<option ${draft.country === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="onb-field"><label>교육 단계</label>
        <div class="onb-grid" id="onbLevels">
          ${levels.map(l => `<button class="onb-choice ${draft.level === l ? 'on' : ''}" data-level="${l}" type="button">${l}<small>${l === '초등학교' ? '기초 개념부터' : l === '중학교' ? '내신 준비' : l === '고등학교' ? '내신·수능' : '전공·교양'}</small></button>`).join('')}
        </div>
      </div>
      <div class="onb-field"><label>학년</label>
        <select class="onb-input" id="onbGrade">
          ${grades.map(g => `<option ${draft.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="onb-field"><label>학교명 (선택이지만 넣으면 더 정확해요)</label>
        <input class="onb-input" id="onbSchool" placeholder="예: 세일고등학교" value="${escapeHtml(draft.school || '')}" />
      </div>
      <div class="onb-field"><label>학교 홈페이지 · 교육과정 메모 (선택)</label>
        <textarea class="onb-input" id="onbSchoolNote" rows="2" placeholder="예: 2022 개정 교육과정, 공통수학 1·2 / 학교 교육과정 편성표">${escapeHtml(draft.schoolNote || '')}</textarea>
      </div>`,
    bind: (body) => {
      el$('#onbLevels', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-level]');
        if (!b) return;
        draft.level = b.dataset.level;
        body.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
        const gradeSel = el$('#onbGrade', body);
        if (draft.level === '대학교') gradeSel.value = '대학 1학년';
        else if (!/^[1-6]학년$/.test(draft.grade)) gradeSel.value = '1학년';
      });
    },
  };
}

/* ---------------- step 3 · subjects ---------------- */
function stepSubjects() {
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 3 · 과목</p>
      <h2 class="onb-title">공부할 과목을<br/>모두 골라 주세요</h2>
      <p class="onb-desc">여러 개를 한 번에 고를 수 있어요. 고른 과목은 상단 과목 바에 나란히 등록되고, 과목마다 학습 경로가 만들어집니다.</p>
      <div class="onb-chips" id="onbSubjects">
        ${SUBJECTS.map(s => `<button class="onb-chip ${draft.subjects.includes(s.id) ? 'on' : ''}" data-subject="${s.id}" type="button">${s.icon} ${s.label}</button>`).join('')}
      </div>
      <div class="onb-field"><label>직접 입력 (선택)</label>
        <div style="display:flex;gap:8px">
          <input class="onb-input" id="onbCustomSub" placeholder="예: 경제, 일본어, 정보" maxlength="16" />
          <button class="ghost-btn" id="onbCustomAdd" type="button" style="flex:none">추가</button>
        </div>
        <div class="onb-chips" id="onbCustomList" style="margin-top:10px"></div>
      </div>
      <div class="onb-preview" id="onbSubPreview"></div>`,
    bind: (body) => {
      const list = el$('#onbCustomList', body);
      const preview = el$('#onbSubPreview', body);
      const drawCustom = () => {
        const custom = draft.subjects.filter(id => id.startsWith('custom:'));
        list.innerHTML = custom.map(id => `<span class="onb-chip on" data-custom="${escapeHtml(id)}">✏️ ${escapeHtml(id.slice(7))} <button data-delcustom="${escapeHtml(id)}" type="button" style="margin-left:6px;color:var(--muted)">✕</button></span>`).join('');
        list.querySelectorAll('[data-delcustom]').forEach(b => b.addEventListener('click', () => {
          draft.subjects = draft.subjects.filter(x => x !== b.dataset.delcustom);
          drawCustom(); drawPreview();
        }));
      };
      const drawPreview = () => {
        const names = draft.subjects.map(id => (subjectById(id) || { label: id.replace('custom:', ''), icon: '✏️' }));
        preview.innerHTML = draft.subjects.length
          ? `선택한 과목 <b>${draft.subjects.length}개</b> · ${names.map(s => s.icon + ' ' + escapeHtml(s.label)).join(' · ')}`
          : '과목을 하나 이상 골라 주세요.';
      };
      el$('#onbSubjects', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-subject]');
        if (!b) return;
        const id = b.dataset.subject;
        if (draft.subjects.includes(id)) draft.subjects = draft.subjects.filter(x => x !== id);
        else draft.subjects.push(id);
        b.classList.toggle('on');
        drawPreview();
      });
      el$('#onbCustomAdd', body).addEventListener('click', () => {
        const inp = el$('#onbCustomSub', body);
        const v = inp.value.trim();
        if (!v) return;
        const id = 'custom:' + v;
        if (!draft.subjects.includes(id)) draft.subjects.push(id);
        inp.value = '';
        drawCustom(); drawPreview();
      });
      el$('#onbCustomSub', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el$('#onbCustomAdd', body).click(); } });
      drawCustom(); drawPreview();
    },
  };
}

/* ---------------- step 4 · level/date/goal ---------------- */
function stepLevel() {
  const goals = [
    { v: 50, t: '50%', d: '핵심 주제 집중', s: '시험이 얼마 안 남았거나 최소한만 확실히' },
    { v: 70, t: '70%', d: '모든 주제 연습', s: '가장 균형 잡힌 기본 선택' },
    { v: 90, t: '90%', d: '어려운 문제까지 정복', s: '고득점 목표, 시간이 넉넉할 때' },
  ];
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 4 · 수준과 목표</p>
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

/* ---------------- step 5 · routine ---------------- */
function stepRoutine() {
  const presets = [20, 30, 45, 60, 90, 120];
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 5 · 하루 루틴</p>
      <h2 class="onb-title">하루에 얼마나<br/>할 수 있나요?</h2>
      <p class="onb-desc">무리하면 이틀도 못 가요. 매일 지킬 수 있는 시간을 고르면 AI가 그 안에 맞춰 수업을 나눠요.</p>
      <div class="onb-field"><label>하루 학습 시간</label>
        <div class="onb-chips" id="onbMinutes">
          ${presets.map(m => `<button class="onb-chip ${Number(draft.dailyMinutes) === m ? 'on' : ''}" data-min="${m}" type="button">${m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분'}</button>`).join('')}
        </div>
      </div>
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn" id="onbAiRec" type="button">✨ AI 추천 받기</button>
      </div>
      <div class="onb-preview" id="onbRecBox" hidden></div>`,
    bind: (body) => {
      el$('#onbMinutes', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-min]');
        if (!b) return;
        draft.dailyMinutes = Number(b.dataset.min);
        body.querySelectorAll('[data-min]').forEach(x => x.classList.toggle('on', x === b));
      });
      const box = el$('#onbRecBox', body);
      el$('#onbAiRec', body).addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        box.hidden = false;
        box.innerHTML = '<span class="spinner"></span> 시험일·목표·수준을 보고 루틴을 짜는 중…';
        try {
          let minutes, routine;
          if (hasKey()) {
            const system = `너는 학습 코치다. 학생의 시험일·목표·현재 수준·과목 수를 보고 "하루에 실제로 지킬 수 있는" 학습 시간(분)과 루틴을 추천한다.
- minutes는 15~180 사이 5분 단위 정수. 남은 날이 적고 목표가 높을수록 늘리되, 하루 180분을 넘기지 않는다.
- routine은 한 문장으로: 어떤 순서로 무엇을 할지 (예: 개념 20분 → 문제 20분 → 오답 10분).
- reason은 왜 이 시간인지 한 문장.`;
            const user = `${learnerSummary()}\n과목 수: ${draft.subjects.length}`;
            const data = await generateJSON({
              system, parts: [{ text: user }],
              schema: { type: 'object', properties: { minutes: { type: 'integer' }, routine: { type: 'string' }, reason: { type: 'string' } }, required: ['minutes', 'routine'] },
              temperature: 0.4, maxTokens: 512,
            });
            minutes = Math.max(15, Math.min(180, Number(data.minutes) || 60));
            routine = String(data.routine || '').trim();
            draft.aiReason = String(data.reason || '').trim();
          } else {
            const dd = draft.examDate ? Math.max(1, dday(draft.examDate)) : 21;
            const base = draft.goalPct >= 90 ? 90 : draft.goalPct >= 70 ? 70 : 50;
            const urgency = dd <= 7 ? 30 : dd <= 14 ? 20 : 0;
            const lvl = draft.levelSelf === '기초' ? 10 : draft.levelSelf === '심화' ? 15 : 0;
            minutes = Math.min(150, base + urgency + lvl);
            routine = `개념 ${Math.round(minutes * 0.4)}분 → 문제 ${Math.round(minutes * 0.4)}분 → 오답·암기 ${Math.round(minutes * 0.2)}분`;
            draft.aiReason = hasKey() ? '' : 'AI 키를 연결하지 않아 기본 규칙으로 계산했어요.';
          }
          draft.dailyMinutes = minutes;
          body.querySelectorAll('[data-min]').forEach(x => x.classList.toggle('on', Number(x.dataset.min) === minutes));
          box.hidden = false;
          box.innerHTML = `<b>추천: 하루 ${minutes}분</b><br/>${escapeHtml(routine)}${draft.aiReason ? `<br/><span style="color:var(--muted);font-size:11.5px">${escapeHtml(draft.aiReason)}</span>` : ''}`;
          toast(`하루 ${minutes}분 루틴을 추천했어요`, 'xp');
        } catch (e) {
          box.innerHTML = '❌ ' + escapeHtml(e.message || '추천을 받지 못했어요.');
        } finally {
          btn.disabled = false;
        }
      });
    },
  };
}

function learnerSummary() {
  const dd = draft.examDate ? dday(draft.examDate) : null;
  return `국가: ${draft.country}\n학교급: ${draft.level} ${draft.grade}\n학교: ${draft.school || '(미입력)'}\n현재 수준: ${draft.levelSelf}\n시험: ${draft.examDate || '미정'}${dd != null ? ` (D-${dd})` : ''}\n목표: ${draft.goalPct}%`;
}

/* ---------------- step 6 · materials ---------------- */
function stepMaterials() {
  return {
    html: () => `
      <p class="onb-eyebrow">STEP 6 · 자료</p>
      <h2 class="onb-title">필기나 시험 범위를<br/>올려 두면 정확해져요</h2>
      <p class="onb-desc">PDF·이미지·TXT를 올리면 AI가 그 내용을 읽고 단원과 문제를 맞춰요. 자료가 없어도 괜찮아요.</p>
      <div class="onb-drop" id="onbDrop">
        <b>📄 필기·교재 올리기</b>
        PDF · TXT · 사진(JPG/PNG)<br/>
        <button class="ghost-btn small" id="onbFile" type="button" style="margin-top:10px">파일 선택</button>
      </div>
      <div class="onb-mats" id="onbMats"></div>
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn small" id="onbNoMat" type="button">자료 없음 · AI와 채팅으로 범위 설정</button>
      </div>
      <p class="fine" id="onbNoMatNote" hidden style="color:var(--accent-strong)">학습을 시작하면 튜터와의 대화로 시험 범위를 정할 수 있어요.</p>`,
    bind: (body) => {
      const list = el$('#onbMats', body);
      const draw = () => {
        list.innerHTML = state.materials.length
          ? state.materials.map(m => `<div class="onb-mat"><span>${m.kind === 'pdf' ? '📕' : m.kind === 'img' ? '🖼️' : '📄'} ${escapeHtml(m.name)}</span><small style="color:var(--muted)">${fmtChars(m.chars)}</small></div>`).join('')
          : '';
      };
      draw();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.txt,text/plain,application/pdf,image/*';
      input.multiple = true;
      input.addEventListener('change', async () => {
        for (const f of Array.from(input.files || [])) {
          try {
            if (/^image\//.test(f.type)) {
              const { readImageFile } = await import('./ui.js?v=a59a745c');
              const img = await readImageFile(f);
              addMaterial({ id: 'mat' + Date.now() + Math.random().toString(36).slice(2, 6), name: f.name || '사진', kind: 'img', chars: 0, text: '', dataUrl: img.dataUrl, createdAt: Date.now() });
            } else {
              const mat = await fileToMaterial(f);
              if (mat) addMaterial(mat);
            }
          } catch (e) { toast(e.message || '파일을 읽지 못했어요.', 'err'); }
        }
        draw();
      });
      el$('#onbFile', body).addEventListener('click', () => input.click());
      el$('#onbDrop', body).addEventListener('click', (e) => { if (e.target.id === 'onbDrop') input.click(); });
      el$('#onbNoMat', body).addEventListener('click', () => {
        draft.noMaterial = true;
        el$('#onbNoMatNote', body).hidden = false;
        toast('튜터와의 대화로 범위를 정할게요');
      });
    },
  };
}
function fmtChars(n) { return n ? `${Number(n).toLocaleString()}자` : '이미지'; }

/* ---------------- step 7 · google sync ---------------- */
function stepSync() {
  const sync = getSync();
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
        <div><span>국가 · 학교</span><b>${escapeHtml(draft.country)} · ${escapeHtml(draft.level)} ${escapeHtml(draft.grade)}${draft.school ? ' · ' + escapeHtml(draft.school) : ''}</b></div>
        <div><span>과목</span><b>${draft.subjects.length}개</b></div>
        <div><span>시험</span><b>${draft.examDate ? `${escapeHtml(draft.examDate)} (D-${Math.max(0, dday(draft.examDate))})` : '미정'}</b></div>
        <div><span>목표 · 하루 시간</span><b>${draft.goalPct}% · ${draft.dailyMinutes}분</b></div>
        <div><span>자료</span><b>${state.materials.length}개</b></div>
      </div>
      <p class="fine">동기화는 진짜 Google 로그인으로만 동작해요. 가짜 로그인이나 자동 로그인은 쓰지 않습니다.<br/>API 키는 백업에 포함되지 않아 새 기기에서 다시 연결해야 해요.</p>`,
    bind: (body) => {
      const status = el$('#onbSyncStatus', body);
      const btn = el$('#onbGoogle', body);
      if (btn) btn.addEventListener('click', async () => {
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="spinner"></span> Google 로그인 창을 여는 중…';
        try {
          const r = await connectGoogle();
          status.className = 'status ok';
          status.innerHTML = `✅ ${escapeHtml(r.email || 'Google 계정')} 연결됨 · 학습을 시작하면 자동으로 백업할 수 있어요.`;
        } catch (e) {
          status.className = 'status err';
          status.innerHTML = '❌ ' + escapeHtml(e.message || '연결하지 못했어요.');
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
    draft.country = el$('#onbCountry', body)?.value || '대한민국';
    draft.grade = el$('#onbGrade', body)?.value || draft.grade;
    draft.school = (el$('#onbSchool', body)?.value || '').trim();
    draft.schoolNote = (el$('#onbSchoolNote', body)?.value || '').trim();
  } else if (step === 3) {
    draft.examDate = el$('#onbExam', body)?.value || '';
  }
}

async function next() {
  if (step === 0) {
    const key = el$('#onbKeyInput') ? el$('#onbKeyInput').value.trim() : '';
    if (!keyOk) {
      if (!key) {
        toast('API 키를 연결하거나, 아래 "키 없이 둘러보기"를 눌러 주세요.', 'err', 3200);
        return;
      }
      setKey(key);
      const status = el('onbKeyStatus');
      if (status) {
        status.hidden = false; status.className = 'status';
        status.innerHTML = '<span class="spinner"></span> 연결을 확인하는 중…';
      }
      try {
        const r = await connectTest(key, (m) => { if (status) status.innerHTML = `<span class="spinner"></span> ${escapeHtml(m)}`; });
        keyOk = true;
        if (status) { status.className = 'status ok'; status.innerHTML = `✅ 연결됨 · ${escapeHtml(r.model)}`; }
        renderKeyState();
      } catch (e) {
        keyOk = false;
        clearKey();
        if (status) { status.className = 'status err'; status.textContent = '❌ ' + (e.message || '연결하지 못했어요.'); }
        return;
      }
    }
  } else if (step === 2) {
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
    // 키 없이 둘러보기: 이후 단계는 그대로 진행
    step = 1;
    render();
    return;
  }
  finish(true);
}

export async function finish(skipped = false) {
  collect();
  if (!Array.isArray(draft.subjects) || !draft.subjects.length) draft.subjects = defaults().subjects.slice();
  const patch = {
    country: draft.country,
    level: draft.level,
    grade: draft.grade,
    school: draft.school,
    schoolNote: draft.schoolNote,
    subjects: draft.subjects,
    levelSelf: draft.levelSelf,
    examDate: draft.examDate || '',
    goalPct: Number(draft.goalPct) || 70,
    dailyMinutes: Number(draft.dailyMinutes) || 60,
    noMaterial: !!draft.noMaterial,
    done: true,
    createdAt: (getSetup() || {}).createdAt || Date.now(),
  };
  saveSetup(patch);
  if (!draft.subjects.includes(state.subject)) setSubject(draft.subjects[0]);
  draft.subjects.forEach(id => getCourse(id));
  el('onboarding').hidden = true;
  renderTopBar();
  renderCourse();
  showView('course');
  toast(skipped ? '기본 설정으로 시작할게요. 설정에서 언제든 바꿀 수 있어요.' : '준비 완료! 오늘의 첫 수업을 시작해 봐요.', 'xp', 3200);

  if (draft.noMaterial && !skipped) {
    setTimeout(() => {
      showView('tutor');
      const input = el('chatInput');
      if (input) {
        input.value = '자료가 없어. 내 시험 범위를 같이 정해 줄래? 먼저 어떤 과목·단원이 시험에 나오는지 물어봐 줘.';
        input.focus();
      }
    }, 700);
  }
  void currentSubject; void saveMaterials;
}
