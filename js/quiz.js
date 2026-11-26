/* =========================================================
   quiz.js — 퀴즈 · 실전 모의고사 · 데일리 챌린지
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, renderRich, generateJSON, QUIZ_SCHEMA,
  currentSubject, materialContext, uid, toast, dayKey, dateLabel, learnerContext,} from './core.js?v=15b98fd0';
import { loading, setStatus, errorStatus, renderMaterialPicker, selectedMaterials } from './ui.js?v=15b98fd0';
import { awardXP, awardBulk, bump } from './gamify.js?v=15b98fd0';

let active = null;      // 진행 중인 퀴즈
let timerId = null;
let matSel = new Set();
let mode = 'quiz';

const el = (id) => document.getElementById(id);

/* ---------------- generation ---------------- */
async function makeQuestions({ subject, scope, count, type, level, mode: qmode, materials }) {
  const typeText = type === 'mc' ? '객관식만' : type === 'short' ? '단답형만' : '객관식과 단답형을 섞어서';
  const examExtra = qmode === 'exam'
    ? `\n- 실전 모의고사이므로 난이도를 시험 수준으로 올리고, 단원을 고르게 섞으며, 함정 문제 1~2개를 포함한다.\n- 배점은 고르게, 한 문제에 여러 개념을 섞지 않는다.`
    : '\n- 연습 퀴즈이므로 개념 확인 위주로, 한 문제에 한 개념만 묻는다.';
  const system = `너는 한국 고등학교 시험 출제위원이다. ${subject} 과목의 문제를 교육과정 범위 안에서 정확하게 출제한다.
규칙:
- 모든 문제는 한국어. 수식은 LaTeX로 쓴다(인라인 $...$, 블록 $$...$$).
- 객관식은 보기 4개, 정답 1개. answerIndex는 0부터 시작하는 정수.
- 단답형은 정답이 짧고 명확하게(숫자·용어). answer에 정답을 쓰고 options는 빈 배열.
- explanation에는 "왜 정답인지"와 "헷갈리는 포인트"를 2~4문장으로 쓴다.
- unit에는 해당 단원명을 짧게 적는다.
- 표나 그래프가 필요하면 텍스트·수식으로 표현한다.
- 문제 지문에 답이 노출되지 않게 한다.${examExtra}`;

  const user = `과목: ${subject}
범위: ${scope || '해당 과목 전반'}
문항 수: ${count}
유형: ${typeText}
난이도: ${level}
${materialContext(materials)}`;

  const data = await generateJSON({
    system: system + '\n\n' + learnerContext(),
    parts: [{ text: user }],
    schema: QUIZ_SCHEMA,
    temperature: qmode === 'exam' ? 0.65 : 0.55,
    maxTokens: 8192,
  });

  const questions = (data.questions || []).slice(0, count).map((q, i) => {
    const type = q.type === '단답형' ? '단답형' : '객관식';
    let options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : 0;
    if (type === '객관식') {
      while (options.length < 4) options.push(`보기 ${options.length + 1}`);
      options = options.slice(0, 4);
      if (answerIndex < 0 || answerIndex > 3) answerIndex = 0;
    } else {
      options = [];
      answerIndex = -1;
    }
    return {
      id: 'q' + i + uid(''),
      type,
      unit: q.unit || subject,
      prompt: String(q.prompt || '').trim(),
      options,
      answerIndex,
      answer: type === '객관식' ? options[answerIndex] : String(q.answer || '').trim(),
      explanation: String(q.explanation || '').trim(),
    };
  }).filter(q => q.prompt);

  if (!questions.length) throw new Error('문제를 만들지 못했어요. 범위를 조금 더 구체적으로 적고 다시 시도해 주세요.');
  return questions;
}

/* ---------------- runner ---------------- */
function timeLimitSec() {
  const v = Number(el('qTime').value || 0);
  if (mode !== 'exam' || !v) return 0;
  return v * 60;
}

function startQuiz({ questions, title, examMode, limit, daily = false }) {
  active = {
    id: uid('qz'),
    title: title || `${currentSubject().label} 퀴즈`,
    subject: currentSubject().label,
    subjectId: state.subject,
    exam: !!examMode,
    daily,
    questions,
    answers: {},
    graded: {},
    current: 0,
    limit: limit || 0,
    remaining: limit || 0,
    startedAt: Date.now(),
    finished: false,
  };
  el('quizSetup').hidden = true;
  el('quizRunner').hidden = false;
  el('quizRunner').scrollTop = 0;
  if (active.limit) {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!active || active.finished) return;
      active.remaining -= 1;
      updateTimer();
      if (active.remaining <= 0) { clearInterval(timerId); submitQuiz(true); }
    }, 1000);
  }
  renderQuestion();
}

function updateTimer() {
  const t = el('quizTimer');
  if (!t || !active || !active.limit) return;
  const s = Math.max(0, active.remaining);
  const m = Math.floor(s / 60), sec = String(s % 60).padStart(2, '0');
  t.textContent = `⏱ ${m}:${sec}`;
  t.classList.toggle('warn', s <= 60);
}

function renderQuestion() {
  if (!active) return;
  const q = active.questions[active.current];
  const total = active.questions.length;
  const answered = Object.keys(active.answers).length;
  const host = el('quizRunner');
  const showResult = active.exam ? false : !!active.graded[q.id];
  const sel = active.answers[q.id];

  host.innerHTML = `
    <div class="quiz-top">
      <button class="ghost-btn small" id="quizQuit" type="button">나가기</button>
      <div class="quiz-progress"><i style="width:${(answered / total) * 100}%"></i></div>
      <b style="font-size:12px;white-space:nowrap">${active.current + 1} / ${total}</b>
      ${active.limit ? `<span class="timer" id="quizTimer"></span>` : ''}
      ${active.exam ? `<button class="primary small" id="quizSubmitTop" type="button">제출</button>` : ''}
    </div>
    <div class="q-card panel">
      <div class="q-meta">
        <span class="q-pill">${q.type}</span>
        <span class="q-pill">${escapeHtml(q.unit || '')}</span>
        ${active.daily ? '<span class="q-pill">오늘의 챌린지</span>' : ''}
        ${active.exam ? `<span style="margin-left:auto;color:var(--muted)">답한 문항 ${answered}/${total}</span>` : ''}
      </div>
      <div class="q-prompt">${renderRich(q.prompt)}</div>
      ${q.type === '객관식' ? `
        <div class="opts" id="optList">
          ${q.options.map((o, i) => `
            <button class="opt ${sel === i ? 'sel' : ''} ${showResult ? (i === q.answerIndex ? 'correct' : (sel === i ? 'wrong' : '')) : ''}"
              data-opt="${i}" type="button" ${showResult ? 'disabled' : ''}>
              <span class="o-num">${i + 1}</span><span>${renderRich(o)}</span>
            </button>`).join('')}
        </div>`
      : `<input class="short-input" id="shortAnswer" placeholder="답을 입력하세요" value="${escapeHtml(sel == null ? '' : sel)}" ${showResult ? 'disabled' : ''} autocomplete="off" />`}
      ${!showResult && q.type === '단답형' ? `<div class="row"><button class="primary small" id="shortSubmit" type="button">확인</button></div>` : ''}
      ${showResult ? explanationHtml(q, active.graded[q.id]) : ''}
    </div>
    <div class="quiz-nav">
      <button class="ghost-btn small" id="quizPrev" type="button" ${active.current === 0 ? 'disabled' : ''}>← 이전</button>
      <div class="q-dots">${active.questions.map((qq, i) => `<span class="q-dot ${active.graded[qq.id] || active.answers[qq.id] != null ? 'done' : ''} ${i === active.current ? 'cur' : ''}"></span>`).join('')}</div>
      ${active.exam
        ? `<button class="primary small" id="quizNext" type="button" ${active.current === total - 1 ? 'disabled' : ''}>다음 →</button>`
        : (active.current < total - 1
            ? `<button class="primary small" id="quizNext" type="button" ${active.graded[q.id] ? '' : 'disabled'}>다음 문제 →</button>`
            : `<button class="primary small" id="quizFinish" type="button" ${active.graded[q.id] ? '' : 'disabled'}>결과 보기</button>`)}
    </div>`;

  updateTimer();
  bindQuestion(q);
}

function explanationHtml(q, g) {
  const ok = g && g.correct;
  return `
    <div class="explain">
      <div class="verdict ${ok ? 'ok' : 'no'}">${ok ? '✅ 정답!' : '❌ 오답'}</div>
      <div class="answer-line">정답: <b>${renderRich(q.answer || (q.options[q.answerIndex] || '-'))}</b></div>
      <div>${renderRich(q.explanation)}</div>
      ${!ok && g && g.selfGrade ? `<div class="row tight" style="margin-top:8px">
        <button class="ghost-btn small" data-self="1" type="button">내 답도 맞았어요</button>
      </div>` : ''}
    </div>`;
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '')
    .replace(/[.,;:!?'"()\[\]{}]/g, '')
    .replace(/\$/g, '').replace(/\\[a-zA-Z]+/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
function shortMatches(user, answer) {
  const variants = String(answer || '').split(/[\/|,·]|또는|or/).map(normalize).filter(v => v.length > 0);
  const u = normalize(user);
  if (!u) return false;
  return variants.some(v => v === u || (v.length >= 3 && (u.includes(v) || v.includes(u))));
}

function bindQuestion(q) {
  const host = el('quizRunner');
  host.querySelector('#quizQuit')?.addEventListener('click', () => {
    if (confirm('퀴즈를 그만둘까요? 지금까지의 답은 저장되지 않아요.')) quitQuiz();
  });
  host.querySelector('#quizPrev')?.addEventListener('click', () => { active.current = Math.max(0, active.current - 1); renderQuestion(); });
  host.querySelector('#quizNext')?.addEventListener('click', () => {
    if (active.current < active.questions.length - 1) { active.current++; renderQuestion(); }
  });
  host.querySelector('#quizFinish')?.addEventListener('click', () => submitQuiz(false));
  host.querySelector('#quizSubmitTop')?.addEventListener('click', () => {
    if (confirm('답한 문항으로 채점할까요?')) submitQuiz(false);
  });

  host.querySelectorAll('[data-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.opt);
      active.answers[q.id] = i;
      if (active.exam) { renderQuestion(); return; }
      gradeChoice(q, i);
    });
  });

  const shortInput = host.querySelector('#shortAnswer');
  const submitShort = () => {
    const v = (shortInput.value || '').trim();
    if (!v) { toast('답을 입력해 주세요.', 'err'); return; }
    active.answers[q.id] = v;
    if (active.exam) { renderQuestion(); return; }
    gradeShort(q, v);
  };
  if (submitShort) {
    host.querySelector('#shortSubmit')?.addEventListener('click', submitShort);
    shortInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitShort(); } });
  }

  host.querySelector('[data-self]')?.addEventListener('click', () => {
    const g = active.graded[q.id];
    if (!g) return;
    g.correct = true;
    g.selfGrade = false;
    bump('quizCorrect');
    awardXP(10, '퀴즈 정답');
    renderQuestion();
  });
}

function gradeChoice(q, i) {
  const correct = i === q.answerIndex;
  active.graded[q.id] = { correct };
  bump('quizAnswered');
  if (correct) { bump('quizCorrect'); awardXP(10, '퀴즈 정답'); }
  renderQuestion();
}

function gradeShort(q, text) {
  const correct = shortMatches(text, q.answer);
  active.graded[q.id] = { correct, selfGrade: !correct };
  bump('quizAnswered');
  if (correct) { bump('quizCorrect'); awardXP(10, '퀴즈 정답'); }
  renderQuestion();
  if (!correct) {
    toast('정답과 비교해 직접 채점할 수 있어요.', 'info', 2600);
  }
}

function submitQuiz(auto = false) {
  if (!active || active.finished) return;
  clearInterval(timerId);

  // 채점 안 된 문항 처리 (모의고사)
  active.questions.forEach(q => {
    if (active.exam) {
      const a = active.answers[q.id];
      if (a == null) { active.graded[q.id] = { correct: false, blank: true }; return; }
      const correct = q.type === '객관식' ? a === q.answerIndex : shortMatches(a, q.answer);
      active.graded[q.id] = { correct, selfGrade: q.type === '단답형' && !correct };
    } else if (!active.graded[q.id]) {
      active.graded[q.id] = { correct: false, blank: true };
    }
  });

  const questions = active.questions;
  const total = questions.length;
  const correct = questions.filter(q => active.graded[q.id] && active.graded[q.id].correct).length;
  const weakMap = {};
  questions.forEach(q => {
    if (!active.graded[q.id].correct) {
      const u = q.unit || active.subject;
      weakMap[u] = (weakMap[u] || 0) + 1;
    }
  });
  const weak = Object.entries(weakMap).sort((a, b) => b[1] - a[1]).map(([unit, n]) => ({ unit, n }));

  const record = {
    id: active.id, title: active.title, subject: active.subject, mode: active.exam ? 'exam' : 'quiz',
    daily: active.daily, createdAt: Date.now(), total, correct, weak,
    questions, answers: active.answers, graded: active.graded,
  };
  const hist = load(K.quizzes, []);
  hist.unshift(record);
  save(K.quizzes, hist.slice(0, 30));

  if (active.exam) {
    awardBulk(30 + correct * 5, '모의고사 완료');
    bump('exams');
    bump('quizSets');
  } else if (active.daily) {
    awardBulk(20, '데일리 챌린지');
    bump('dailyDone');
    bump('quizSets');
    const d = load(K.daily, {});
    d[dayKey()] = { subject: currentSubject().label, correct, total, at: Date.now() };
    save(K.daily, d);
  } else {
    bump('quizSets');
  }

  active.finished = true;
  document.dispatchEvent(new CustomEvent('app:studied', { detail: { type: active.exam ? 'exam' : 'quiz' } }));
  showResult(record, auto);
  document.dispatchEvent(new CustomEvent('app:quizdone'));
}

function showResult(record, auto) {
  const pct = Math.round((record.correct / record.total) * 100);
  const msg = pct >= 90 ? '완벽에 가까워요! 🎉' : pct >= 70 ? '좋아요, 약점만 다지면 돼요 💪' : pct >= 40 ? '기본을 다시 확인해 봐요 📘' : '개념부터 차근차근 다시 봐요 🌱';
  const host = el('quizRunner');
  host.innerHTML = `
    <div class="panel" style="margin-top:14px">
      <div class="result-score">
        <div class="big">${record.correct}<small> / ${record.total}</small></div>
        <p>${pct}점 · ${msg}${auto ? ' (시간 종료)' : ''}</p>
      </div>
      ${record.weak.length ? `<div class="weak-list">${record.weak.map(w => `<span class="weak-tag">약점 · ${escapeHtml(w.unit)} ${w.n}문항</span>`).join('')}</div>` : '<p class="sub" style="text-align:center">틀린 문항이 없어요. 훌륭해요!</p>'}
      <div class="result-list">
        ${record.questions.map((q, i) => {
          const g = record.graded[q.id] || {};
          return `<div class="result-item ${g.correct ? 'ok' : 'no'}">
            <div class="ri-head"><span>${i + 1}번</span><span class="q-pill">${q.type}</span><span>${escapeHtml(q.unit || '')}</span><span style="margin-left:auto">${g.correct ? '✅' : g.blank ? '⬜ 미응답' : '❌'}</span></div>
            <div class="ri-q">${renderRich(q.prompt)}</div>
            <div class="ri-a"><b>정답</b> ${renderRich(q.answer || q.options[q.answerIndex] || '-')}${!g.correct && record.answers[q.id] != null ? ` · <b>내 답</b> ${escapeHtml(record.answers[q.id] === undefined ? '' : (q.type === '객관식' ? q.options[record.answers[q.id]] || '' : record.answers[q.id]))}` : ''}</div>
            <div class="ri-a" style="margin-top:4px;color:var(--muted)">${renderRich(q.explanation)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="row">
        ${record.weak.length ? `<button class="primary" id="retryWrong" type="button">오답만 다시 풀기</button>` : ''}
        <button class="ghost-btn" id="newQuiz" type="button">새 퀴즈 만들기</button>
      </div>
    </div>`;
  host.scrollTop = 0;
  host.querySelector('#newQuiz')?.addEventListener('click', () => {
    active = null;
    el('quizRunner').hidden = true;
    el('quizSetup').hidden = false;
    renderHistory();
  });
  host.querySelector('#retryWrong')?.addEventListener('click', () => {
    const wrong = record.questions.filter(q => !(record.graded[q.id] && record.graded[q.id].correct));
    startQuiz({ questions: wrong, title: record.title + ' (오답)', examMode: false, limit: 0 });
  });
}

function quitQuiz() {
  clearInterval(timerId);
  active = null;
  el('quizRunner').hidden = true;
  el('quizSetup').hidden = false;
  renderHistory();
}

/* ---------------- history ---------------- */
function renderHistory() {
  const host = el('quizHistory');
  const hist = load(K.quizzes, []);
  if (!hist.length) { host.innerHTML = ''; return; }

  const wrongItems = [];
  for (const h of hist) {
    for (const q of h.questions || []) {
      const g = (h.graded || {})[q.id];
      if (g && !g.correct) {
        const mine = (h.answers || {})[q.id];
        wrongItems.push({
          q, g, mine,
          mineText: mine == null ? '(미응답)' : q.type === '객관식' ? (q.options[mine] || '') : String(mine),
          when: h.createdAt,
        });
      }
    }
  }

  host.innerHTML = `
    <div class="panel">
      <div class="panel-head tight"><b>최근 기록</b><span class="week-label">${hist.length}개</span></div>
      ${hist.slice(0, 6).map(h => `
        <div class="history-item">
          <span class="h-score">${h.correct}/${h.total}</span>
          <span class="h-meta">${escapeHtml(h.subject)} · ${h.mode === 'exam' ? '모의고사' : h.daily ? '데일리' : '퀴즈'} · ${new Date(h.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
          ${h.weak.length ? `<span class="week-label">약점 ${h.weak.length}</span>` : '<span class="week-label">완벽 ✅</span>'}
        </div>`).join('')}
    </div>
    ${wrongItems.length ? `<div class="panel">
      <div class="panel-head tight"><b>오답 노트</b><span class="week-label">${wrongItems.length}문항 · 기기에 저장됨</span></div>
      ${wrongItems.slice(0, 6).map(w => `
        <div class="result-item no" style="margin-bottom:8px">
          <div class="ri-head"><span class="q-pill">${escapeHtml(w.q.unit || '')}</span><span style="margin-left:auto">${new Date(w.when).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span></div>
          <div class="ri-q">${renderRich(w.q.prompt)}</div>
          <div class="ri-a"><b>내 답</b> ${escapeHtml(w.mineText)} · <b>정답</b> ${renderRich(w.q.answer || w.q.options[w.q.answerIndex] || '-')}</div>
          <div class="ri-a" style="color:var(--muted)">${renderRich(w.q.explanation)}</div>
        </div>`).join('')}
    </div>` : ''}`;
}

/* ---------------- public ---------------- */
export async function generateAndStart({ mode: qmode = 'quiz', daily = false } = {}) {
  const status = el('quizStatus');
  const subject = currentSubject();
  const count = daily ? 3 : Number(el('qCount').value || 5);
  const scope = daily ? '' : (el('qScope').value || '').trim();
  if (!daily && qmode === 'exam' && Number(el('qCount').value) < 5 && Number(el('qTime').value) > 0) {
    // 그대로 진행 (사용자 선택 존중)
  }
  el('quizGen').disabled = true;
  el('quizDemo').disabled = true;
  loading(status, daily ? '오늘의 챌린지 문제를 만드는 중…' : `문제를 만드는 중… (${count}문항)`);
  try {
    const questions = await makeQuestions({
      subject: subject.label,
      scope,
      count,
      type: daily ? 'mixed' : el('qType').value,
      level: daily ? '기본' : el('qLevel').value,
      mode: daily ? 'quiz' : qmode,
      materials: daily ? [] : selectedMaterials(matSel),
    });
    setStatus(status, null);
    const limit = (!daily && qmode === 'exam') ? Number(el('qTime').value || 0) * 60 : 0;
    startQuiz({
      questions,
      title: daily ? `${subject.label} 오늘의 챌린지` : `${subject.label} ${scope || '전체'} ${qmode === 'exam' ? '모의고사' : '퀴즈'}`,
      examMode: !daily && qmode === 'exam',
      limit,
      daily,
    });
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('quizGen').disabled = false;
    el('quizDemo').disabled = false;
  }
}

export function startDaily() {
  if (dailyDoneToday()) { toast('오늘의 챌린지는 이미 완료했어요. 내일 또 만나요!', 'info', 2600); return; }
  generateAndStart({ mode: 'quiz', daily: true });
}

export function dailyDoneToday() {
  const d = load(K.daily, {});
  return !!d[dayKey()];
}

export function dailyChallengeSummary() {
  const d = load(K.daily, {});
  return d[dayKey()] || null;
}

/* ---------------- demo ---------------- */
function startDemo() {
  const subject = currentSubject();
  const questions = [
    {
      id: uid('q'), type: '객관식', unit: '이차방정식', prompt: '$x^2 - 5x + 6 = 0$의 두 근의 합은?',
      options: ['5', '6', '-5', '-6'], answerIndex: 0, answer: '5',
      explanation: '근과 계수의 관계에서 두 근의 합은 $-b/a = 5$입니다. 곱은 $c/a = 6$이에요.',
    },
    {
      id: uid('q'), type: '단답형', unit: '이차방정식', prompt: '$x^2 = 9$의 양의 근을 구하세요.',
      options: [], answerIndex: -1, answer: '3',
      explanation: '$x = \\pm 3$이고 양의 근은 $3$입니다.',
    },
    {
      id: uid('q'), type: '객관식', unit: '판별식', prompt: '$x^2 + 2x + 5 = 0$의 판별식 $D$의 값은?',
      options: ['-16', '16', '-24', '24'], answerIndex: 0, answer: '-16',
      explanation: '$D = b^2 - 4ac = 4 - 20 = -16 < 0$이므로 실근이 없습니다.',
    },
  ];
  startQuiz({ questions, title: `${subject.label} 예시 퀴즈`, examMode: false, limit: 0 });
  toast('예시 문제예요. API 키 없이도 채점 화면을 볼 수 있어요.');
}

/* ---------------- init ---------------- */
export function initQuiz() {
  el('quizModeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    mode = b.dataset.qmode;
    document.querySelectorAll('#quizModeSeg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    el('qTime').closest('.field').style.opacity = mode === 'exam' ? '1' : '.45';
  });
  el('qTime').closest('.field').style.opacity = '.45';
  el('quizGen').addEventListener('click', () => generateAndStart({ mode }));
  el('quizDemo').addEventListener('click', startDemo);
  renderMaterialPicker(el('quizMats'), matSel);
  document.addEventListener('app:materials', () => renderMaterialPicker(el('quizMats'), matSel));
  document.addEventListener('app:subject', () => renderMaterialPicker(el('quizMats'), matSel));
  renderHistory();
}
