/* =========================================================
   audio.js — 복습 팟캐스트 · 구술 시험 · 음성 학습
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, renderRich, toSpeech, generateJSON, openModal,
  PODCAST_SCHEMA, ORAL_Q_SCHEMA, ORAL_GRADE_SCHEMA, currentSubject, materialContext,
  uid, toast, dayKey,
} from './core.js';
import {
  loading, setStatus, errorStatus, renderMaterialPicker, selectedMaterials,
  speak, stopSpeaking, listen, sttSupported, ttsSupported, koVoice,
} from './ui.js';
import { awardXP, awardBulk, bump } from './gamify.js';

const el = (id) => document.getElementById(id);
let podMatSel = new Set();
let oralMatSel = new Set();
let pane = 'podcast';

/* ================= 팟캐스트 ================= */
const player = { deck: null, index: 0, playing: false, rate: 1, paused: false };

function podcasts() { return load(K.podcasts, []); }
function savePodcasts(list) { save(K.podcasts, list.slice(0, 12)); }

function speakerPitch(name) {
  const n = String(name || '');
  if (/진행|사회|MC/i.test(n)) return 1.08;
  return 0.94;
}
function speakerLabel(name) { return String(name || '선생님'); }

async function generatePodcast() {
  const subject = currentSubject();
  const topic = (el('podTopic').value || '').trim();
  const style = el('podStyle').value;
  const length = Number(el('podLength').value || 5);
  const level = el('podLevel').value;
  const status = el('podStatus');
  if (!topic && !podMatSel.size) { setStatus(status, '주제를 적거나 자료를 선택해 주세요.', 'err'); return; }
  el('podGen').disabled = true;
  loading(status, '오디오 대본을 쓰는 중…');
  try {
    const lineTarget = length === 3 ? 16 : length === 8 ? 40 : 26;
    const system = `너는 한국 고등학생용 학습 오디오 콘텐츠 작가다. "귀로 듣는 복습" 대본을 쓴다.
규칙:
- ${style === 'lecture' ? '선생님 단독 강의형. speaker는 "선생님"으로 통일.' : '대화형. speaker는 "진행자"와 "양선생" 두 사람만 사용. 진행자는 질문하고 요약하며, 양선생은 설명한다.'}
- 자연스러운 구어체. 짧은 문장. 말로 읽었을 때 편해야 한다.
- 각 line의 text는 1~2문장, 80자 이내.
- 마크다운, 이모지, 기호, LaTeX 금지. 수식은 말로 읽을 수 있게 쓴다. (예: "x의 제곱 더하기 일")
- 구성: 도입(오늘 볼 것) → 핵심 개념 3~5개(예시 포함) → 시험에 나오는 포인트 → 30초 요약.
- 전체 line 수는 약 ${lineTarget}개.`;
    const user = `과목: ${subject.label}
주제/단원: ${topic || '(자료 참고)'}
길이: 약 ${length}분
난이도: ${level}
${materialContext(selectedMaterials(podMatSel))}`;
    const data = await generateJSON({ system, parts: [{ text: user }], schema: PODCAST_SCHEMA, temperature: 0.75, maxTokens: 8192 });
    const lines = (data.lines || []).map(l => ({
      speaker: speakerLabel(l.speaker),
      text: String(l.text || '').trim(),
    })).filter(l => l.text);
    if (lines.length < 3) throw new Error('대본을 만들지 못했어요. 주제를 조금 더 구체적으로 적어 주세요.');

    const deckItem = {
      id: uid('pod'),
      title: String(data.title || topic || `${subject.label} 복습 오디오`).trim(),
      summary: String(data.summary || '').trim(),
      subject: subject.label,
      topic, style, length, level,
      lines, createdAt: Date.now(),
    };
    const list = podcasts();
    list.unshift(deckItem);
    savePodcasts(list);
    setStatus(status, null);
    awardXP(10, '팟캐스트 생성');
    bump('podcasts');
    loadPlayer(deckItem, true);
    renderPodLibrary();
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('podGen').disabled = false;
  }
}

function loadPlayer(deckItem, autoplay = false) {
  stopPodcast();
  player.deck = deckItem;
  player.index = 0;
  const host = el('podPlayer');
  host.hidden = false;
  host.innerHTML = `
    <div class="panel">
      <div class="player-head">
        <div>
          <h3>${escapeHtml(deckItem.title)}</h3>
          <small>${escapeHtml(deckItem.subject)} · ${deckItem.style === 'lecture' ? '강의형' : '대화형'} · ${deckItem.lines.length}줄 · 약 ${deckItem.length}분</small>
        </div>
        <div class="player-ctrl">
          <button class="pbtn" id="podPrev" type="button" aria-label="이전">⏮</button>
          <button class="pbtn main" id="podPlay" type="button" aria-label="재생">▶</button>
          <button class="pbtn" id="podNext" type="button" aria-label="다음">⏭</button>
        </div>
      </div>
      ${deckItem.summary ? `<p class="sub" style="margin-top:8px">${escapeHtml(deckItem.summary)}</p>` : ''}
      <div class="row tight" style="margin-top:10px">
        <select class="speed-select" id="podSpeed">
          <option value="0.8">0.8배속</option><option value="1" selected>1배속</option>
          <option value="1.25">1.25배속</option><option value="1.5">1.5배속</option>
        </select>
        <button class="ghost-btn small" id="podOutline" type="button">대본 전체 보기</button>
        <span class="week-label" id="podProgress">0 / ${deckItem.lines.length}</span>
      </div>
      <div class="pod-lines" id="podLines">
        ${deckItem.lines.map((l, i) => `
          <div class="pod-line" data-line="${i}">
            <span class="spk">${escapeHtml(l.speaker)}</span>
            <span>${escapeHtml(l.text)}</span>
          </div>`).join('')}
      </div>
      <p class="pod-progress">🔊 소리가 나지 않으면 기기 음량과 무음 모드를 확인하세요. (브라우저 음성 기능 사용)</p>
    </div>`;

  host.querySelector('#podPlay').addEventListener('click', togglePlay);
  host.querySelector('#podPrev').addEventListener('click', () => { playFrom(Math.max(0, player.index - 1)); });
  host.querySelector('#podNext').addEventListener('click', () => { playFrom(Math.min(deckItem.lines.length - 1, player.index + 1)); });
  host.querySelector('#podSpeed').addEventListener('change', (e) => {
    player.rate = Number(e.target.value) || 1;
    if (player.playing) playFrom(player.index);
  });
  host.querySelector('#podOutline').addEventListener('click', () => {
    openModal(`<div class="modal-head"><h2>${escapeHtml(deckItem.title)}</h2><button class="icon-btn" data-close type="button">✕</button></div>
      <div class="modal-body">
        ${deckItem.summary ? `<p class="sub" style="margin-bottom:10px">${escapeHtml(deckItem.summary)}</p>` : ''}
        <div class="pod-lines">${deckItem.lines.map(l => `<div class="pod-line"><span class="spk">${escapeHtml(l.speaker)}</span><span>${escapeHtml(l.text)}</span></div>`).join('')}</div>
      </div>`);
  });
  host.querySelectorAll('[data-line]').forEach(node => {
    node.addEventListener('click', () => playFrom(Number(node.dataset.line)));
  });
  player.playing = false;
  player.paused = false;
  updatePlayButton();
  if (autoplay) playFrom(0);
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function highlightLine(i) {
  document.querySelectorAll('#podLines .pod-line').forEach(n => n.classList.toggle('active', Number(n.dataset.line) === i));
  const active = document.querySelector('#podLines .pod-line.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const prog = el('podProgress');
  if (prog && player.deck) prog.textContent = `${i + 1} / ${player.deck.lines.length}`;
}

function updatePlayButton() {
  const b = el('podPlay');
  if (!b) return;
  b.textContent = player.playing && !player.paused ? '⏸' : '▶';
}

function playFrom(i) {
  if (!player.deck) return;
  const lines = player.deck.lines;
  if (i >= lines.length) { stopPodcast(true); return; }
  player.index = i;
  player.playing = true;
  player.paused = false;
  highlightLine(i);
  updatePlayButton();
  const line = lines[i];
  speak(line.text, {
    rate: player.rate,
    pitch: speakerPitch(line.speaker),
    onEnd: () => {
      if (!player.playing || player.paused) return;
      if (player.index + 1 < lines.length) playFrom(player.index + 1);
      else { player.playing = false; updatePlayButton(); }
    },
  });
}

function togglePlay() {
  if (!player.deck) return;
  if (!player.playing) { playFrom(player.index); return; }
  if (player.paused) {
    try { window.speechSynthesis.resume(); } catch (e) {}
    player.paused = false;
  } else {
    try { window.speechSynthesis.pause(); } catch (e) {}
    player.paused = true;
  }
  updatePlayButton();
}

function stopPodcast(ended = false) {
  player.playing = false;
  player.paused = false;
  stopSpeaking();
  updatePlayButton();
  if (ended) highlightLine(0);
}

function renderPodLibrary() {
  const host = el('podLibrary');
  const list = podcasts();
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <h2 class="sect-title">내 오디오</h2>
    <div class="panel">
      ${list.map(p => `<div class="deck-item">
        <div class="d-main">
          <b>${escapeHtml(p.title)}</b>
          <small>${escapeHtml(p.subject)} · 약 ${p.length}분 · ${p.lines.length}줄 · ${new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</small>
        </div>
        <button class="ghost-btn small" data-playpod="${p.id}" type="button">재생</button>
        <button class="icon-btn" data-delpod="${p.id}" type="button" title="삭제">🗑️</button>
      </div>`).join('')}
    </div>`;
  host.querySelectorAll('[data-playpod]').forEach(b => b.addEventListener('click', () => {
    const p = podcasts().find(x => x.id === b.dataset.playpod);
    if (p) loadPlayer(p, true);
  }));
  host.querySelectorAll('[data-delpod]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 오디오 대본을 삭제할까요?')) return;
    savePodcasts(podcasts().filter(p => p.id !== b.dataset.delpod));
    renderPodLibrary();
  }));
}

/* ================= 구술 시험 ================= */
const oral = { questions: [], index: 0, results: [], limit: 90, mode: 'voice', rec: null, timerId: null, remaining: 0, started: false };

async function startOral() {
  const subject = currentSubject();
  const scope = (el('oralScope').value || '').trim();
  const count = Number(el('oralCount').value || 3);
  const level = el('oralLevel').value;
  const modeVal = el('oralMode').value;
  oral.limit = Number(el('oralTime').value || 90);
  oral.mode = modeVal;
  const status = el('oralStatus');
  if (modeVal === 'voice' && !sttSupported()) {
    toast('이 브라우저는 음성 인식이 안 돼 텍스트 모드로 진행할게요.', 'err', 3200);
    oral.mode = 'text';
  }
  if (!scope && !oralMatSel.size) { setStatus(status, '범위를 적거나 자료를 선택해 주세요.', 'err'); return; }
  el('oralGen').disabled = true;
  loading(status, '구술 질문을 준비하는 중…');
  try {
    const system = `너는 한국 고등학교 수행평가·면접을 보는 구술 시험관이다.
과목과 범위에 맞춰 학생이 말로 설명해야 하는 개념 질문을 만든다.
규칙:
- "설명해 보세요" 형태의 개방형 질문. 단순 암기 확인보다 이유·과정·예를 묻는다.
- 한 질문에 하나의 개념만. 30초~1분 30초 동안 말할 수 있는 분량.
- keyPoints: 답변에 반드시 들어가야 하는 핵심 포인트 3~5개 (짧은 구).
- modelAnswer: 3~5문장의 모범 답안.`;
    const user = `과목: ${subject.label}
범위: ${scope || '(자료 참고)'}
문항 수: ${count}
난이도: ${level}
${materialContext(selectedMaterials(oralMatSel))}`;
    const data = await generateJSON({ system, parts: [{ text: user }], schema: ORAL_Q_SCHEMA, temperature: 0.7, maxTokens: 4096 });
    const questions = (data.questions || []).map(q => ({
      prompt: String(q.prompt || '').trim(),
      keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints.map(String) : [],
      modelAnswer: String(q.modelAnswer || '').trim(),
    })).filter(q => q.prompt);
    if (!questions.length) throw new Error('질문을 만들지 못했어요. 범위를 더 구체적으로 적어 주세요.');
    oral.questions = questions;
    oral.index = 0;
    oral.results = [];
    setStatus(status, null);
    el('oralSetup').hidden = true;
    el('oralRunner').hidden = false;
    renderOralQuestion();
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('oralGen').disabled = false;
  }
}

function renderOralQuestion() {
  const q = oral.questions[oral.index];
  const total = oral.questions.length;
  const host = el('oralRunner');
  host.innerHTML = `
    <div class="oral-q">
      <div class="oral-meta">
        <span class="q-pill">질문 ${oral.index + 1} / ${total}</span>
        <span class="q-pill">${oral.mode === 'voice' ? '🎤 말하기' : '⌨️ 쓰기'}</span>
        <button class="link-btn" id="oralQuit" type="button" style="margin-left:auto">그만하기</button>
      </div>
      <div class="panel">
        <div class="oral-prompt">${renderRich(q.prompt)}</div>
        <div class="row">
          <button class="ghost-btn small" id="oralSpeakQ" type="button">🔊 질문 듣기</button>
          <span class="week-label" id="oralTimer">제한 ${Math.floor(oral.limit / 60)}분 ${oral.limit % 60 ? (oral.limit % 60) + '초' : ''}</span>
        </div>
      </div>
      <div class="panel answer-box">
        ${oral.mode === 'voice' ? `
          <div class="row tight" style="justify-content:space-between">
            <b style="font-size:13px">내 답변 (음성)</b>
            <button class="primary small" id="oralMic" type="button">🎤 답변 시작</button>
          </div>
          <div class="transcript" id="oralTranscript" style="margin-top:10px"></div>
          <p class="fine">말이 끝나면 자동으로 인식이 멈춥니다. 인식이 안 되면 텍스트로 입력할 수 있어요.</p>
          <textarea id="oralText" class="short-input" rows="3" placeholder="(선택) 음성 인식이 어려우면 여기에 직접 입력" style="display:none"></textarea>
        ` : `
          <b style="font-size:13px">내 답변</b>
          <textarea id="oralText" class="short-input" rows="6" placeholder="답변을 글로 쓰세요. 말하듯이 쓰면 좋아요."></textarea>
        `}
        <div class="row">
          <button class="primary" id="oralGrade" type="button">채점하기</button>
          <button class="ghost-btn small" id="oralSkip" type="button">건너뛰기</button>
        </div>
      </div>
      <div id="oralResult"></div>
    </div>`;
  host.querySelector('#oralQuit').addEventListener('click', quitOral);
  host.querySelector('#oralSpeakQ').addEventListener('click', () => speak(toSpeech(q.prompt), { rate: 1 }));
  host.querySelector('#oralGrade').addEventListener('click', gradeOralAnswer);
  host.querySelector('#oralSkip').addEventListener('click', () => {
    oral.results.push({ score: 0, skipped: true, gaps: ['응답하지 않음'], question: q.prompt });
    nextOral();
  });
  const micBtn = host.querySelector('#oralMic');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (oral.rec) { stopOralRec(); return; }
      startOralRec();
    });
  }
}

function startOralRec() {
  const transcript = el('oralTranscript');
  const micBtn = el('oralMic');
  if (!transcript) return;
  transcript.textContent = '';
  stopSpeaking();
  oral.started = true;
  micBtn.textContent = '⏹ 녹음 중지';
  micBtn.classList.add('on');
  let finalText = '';
  oral.rec = listen({
    onResult: ({ finalText: f, interim }) => {
      if (f) finalText += f;
      transcript.textContent = (finalText + ' ' + interim).trim();
    },
    onError: (err) => {
      if (err === 'not-allowed') toast('마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.', 'err', 3600);
      else if (err !== 'no-speech') toast('음성 인식에 문제가 생겼어요. 텍스트로 입력해 주세요.', 'err', 3000);
      const ta = el('oralText');
      if (ta) ta.style.display = 'block';
      stopOralRec();
    },
    onEnd: () => {
      if (transcript && finalText.trim()) transcript.textContent = finalText.trim();
      stopOralRec();
    },
  });
  startOralTimer();
}

function stopOralRec() {
  try { oral.rec && oral.rec.stop(); } catch (e) {}
  oral.rec = null;
  const micBtn = el('oralMic');
  if (micBtn) { micBtn.textContent = '🎤 다시 말하기'; micBtn.classList.remove('on'); }
  stopOralTimer();
}

function startOralTimer() {
  stopOralTimer();
  oral.remaining = oral.limit;
  oral.timerId = setInterval(() => {
    oral.remaining -= 1;
    const t = el('oralTimer');
    if (t) {
      const m = Math.floor(Math.max(0, oral.remaining) / 60), s = String(Math.max(0, oral.remaining) % 60).padStart(2, '0');
      t.textContent = `⏱ ${m}:${s}`;
      t.style.color = oral.remaining <= 10 ? 'var(--danger)' : '';
    }
    if (oral.remaining <= 0) {
      stopOralRec();
      toast('답변 시간이 끝났어요. 채점하기를 눌러 주세요.', 'info', 2600);
    }
  }, 1000);
}
function stopOralTimer() { clearInterval(oral.timerId); oral.timerId = null; }

async function gradeOralAnswer() {
  const q = oral.questions[oral.index];
  const transcript = (el('oralTranscript') || {}).textContent || '';
  const ta = el('oralText');
  const answer = ((ta && ta.value) || transcript || '').trim();
  if (!answer) { toast('먼저 답변을 말하거나 입력해 주세요.', 'err'); return; }
  stopOralRec();
  const btn = el('oralGrade');
  btn.disabled = true;
  const target = el('oralResult');
  target.innerHTML = '<div class="panel"><div class="status"><span class="spinner"></span> 답변을 채점하는 중…</div></div>';
  try {
    const system = `너는 한국 고등학교 구술 시험 채점관이다. 학생의 말하기 답변을 공정하게 채점한다.
평가 기준: (1) 핵심 개념 포함, (2) 논리적 흐름(원인-과정-결과), (3) 정확성, (4) 예시/근거.
점수는 0~100 정수. 90 이상은 모범 답안 수준, 60 미만은 핵심 개념이 빠진 경우.
strengths와 gaps는 각 1~3개, 짧은 구로. coachTip은 다음에 어떻게 말하면 좋을지 한두 문장.
한국어로 답한다.`;
    const user = `[질문]\n${q.prompt}\n\n[평가 핵심 포인트]\n${q.keyPoints.map(p => '- ' + p).join('\n')}\n\n[모범 답안]\n${q.modelAnswer}\n\n[학생 답변]\n${answer}`;
    const result = await generateJSON({ system, parts: [{ text: user }], schema: ORAL_GRADE_SCHEMA, temperature: 0.3, maxTokens: 2048 });
    const score = Math.max(0, Math.min(100, Number(result.score) || 0));
    oral.results.push({ score, verdict: result.verdict, strengths: result.strengths || [], gaps: result.gaps || [], tip: result.coachTip || '', question: q.prompt, answer });
    awardXP(Math.round(score / 10), '구술 답변');
    target.innerHTML = `
      <div class="panel" style="margin-top:12px">
        <div class="panel-head tight"><b>채점 결과</b><span class="score-badge">${score}<small>점</small></span></div>
        <p style="font-size:13.5px">${escapeHtml(result.verdict || '')}</p>
        ${(result.strengths || []).length ? `<div style="margin-top:10px"><b style="font-size:12px;color:var(--ok)">✅ 잘한 점</b><ul class="kp-list">${result.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
        ${(result.gaps || []).length ? `<div style="margin-top:8px"><b style="font-size:12px;color:var(--danger)">🔧 보완할 점</b><ul class="kp-list">${result.gaps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
        ${result.coachTip ? `<div class="explain" style="margin-top:10px"><b style="font-size:12px">🎤 코치 팁</b><p style="margin-top:4px">${escapeHtml(result.coachTip)}</p></div>` : ''}
        <div class="explain" style="margin-top:10px">
          <b style="font-size:12px">모범 답안</b>
          <p style="margin-top:4px">${escapeHtml(q.modelAnswer)}</p>
        </div>
        <div class="row"><button class="primary" id="oralNext" type="button">${oral.index + 1 < oral.questions.length ? '다음 질문 →' : '결과 보기'}</button></div>
      </div>`;
    target.querySelector('#oralNext').addEventListener('click', nextOral);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    target.innerHTML = `<div class="status err">❌ ${escapeHtml(e.message || '채점하지 못했어요.')}</div>`;
    btn.disabled = false;
  }
}

function nextOral() {
  oral.index += 1;
  if (oral.index >= oral.questions.length) { finishOral(); return; }
  renderOralQuestion();
  el('oralRunner').scrollTop = 0;
}

function finishOral() {
  const results = oral.results;
  const answered = results.filter(r => !r.skipped);
  const avg = answered.length ? Math.round(answered.reduce((s, r) => s + r.score, 0) / answered.length) : 0;
  const gaps = results.flatMap(r => r.gaps || []);
  const hist = load(K.oral, []);
  hist.unshift({
    id: uid('oral'), subject: currentSubject().label, createdAt: Date.now(),
    avg, count: results.length, gaps: Array.from(new Set(gaps)).slice(0, 6),
  });
  save(K.oral, hist.slice(0, 12));
  awardBulk(25, '구술 시험 완료');
  bump('oral');
  el('oralRunner').innerHTML = `
    <div class="panel" style="margin-top:14px">
      <div class="result-score">
        <div class="big">${avg}<small>점</small></div>
        <p>구술 시험 ${results.length}문항 완료 · 평균 점수</p>
      </div>
      ${gaps.length ? `<div class="weak-list" style="justify-content:center">${Array.from(new Set(gaps)).slice(0, 6).map(g => `<span class="weak-tag">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
      <div class="result-list">
        ${results.map((r, i) => `<div class="result-item ${r.score >= 70 ? 'ok' : 'no'}">
          <div class="ri-head"><span>${i + 1}번</span><span style="margin-left:auto">${r.skipped ? '건너뜀' : r.score + '점'}</span></div>
          <div class="ri-q">${renderRich(r.question)}</div>
          ${(r.gaps || []).length ? `<div class="ri-a">보완: ${r.gaps.map(escapeHtml).join(', ')}</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="row">
        <button class="primary" id="oralAgain" type="button">다시 연습하기</button>
        <button class="ghost-btn" id="oralDone" type="button">오디오 화면으로</button>
      </div>
    </div>`;
  el('oralRunner').querySelector('#oralAgain').addEventListener('click', () => {
    el('oralRunner').hidden = true;
    el('oralSetup').hidden = false;
    renderOralHistory();
  });
  el('oralRunner').querySelector('#oralDone').addEventListener('click', () => {
    el('oralRunner').hidden = true;
    el('oralSetup').hidden = false;
    renderOralHistory();
  });
  renderOralHistory();
}

function quitOral() {
  stopOralRec();
  stopSpeaking();
  if (!confirm('구술 시험을 그만둘까요?')) return;
  oral.questions = []; oral.results = []; oral.index = 0;
  el('oralRunner').hidden = true;
  el('oralSetup').hidden = false;
  renderOralHistory();
}

function renderOralHistory() {
  const host = el('oralHistory');
  const hist = load(K.oral, []);
  if (!hist.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <h2 class="sect-title">구술 기록</h2>
    <div class="panel">
      ${hist.slice(0, 6).map(h => `<div class="history-item">
        <span class="h-score">${h.avg}점</span>
        <span class="h-meta">${escapeHtml(h.subject)} · ${h.count}문항 · ${new Date(h.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
        ${h.gaps.length ? `<span class="week-label">보완 ${h.gaps.length}</span>` : ''}
      </div>`).join('')}
    </div>`;
}

/* ================= 탭 전환 / 초기화 ================= */
export function switchAudioPane(next) {
  pane = next === 'oral' ? 'oral' : 'podcast';
  el('podcastPane').hidden = pane !== 'podcast';
  el('oralPane').hidden = pane !== 'oral';
  document.querySelectorAll('#audioSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.audio === pane));
  if (pane === 'oral') renderOralHistory();
  stopPodcast();
}

export function initAudio() {
  el('audioSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (b) switchAudioPane(b.dataset.audio);
  });
  document.addEventListener('app:audio-pane', (e) => switchAudioPane(e.detail));

  el('podGen').addEventListener('click', generatePodcast);
  renderMaterialPicker(el('podMats'), podMatSel);
  document.addEventListener('app:materials', () => renderMaterialPicker(el('podMats'), podMatSel));
  renderPodLibrary();

  el('oralGen').addEventListener('click', startOral);
  renderMaterialPicker(el('oralMats'), oralMatSel);
  document.addEventListener('app:materials', () => renderMaterialPicker(el('oralMats'), oralMatSel));
  renderOralHistory();

  document.addEventListener('app:view', (e) => { if (e.detail !== 'audio') stopPodcast(); });
}
