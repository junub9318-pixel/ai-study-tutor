/* =========================================================
   scope.js — 홈(시험) 화면의 과목별 시험 범위 · 자료(PDF/필기 사진)
   · 자료를 읽어 시험 범위 파악 → 사전 질문 → 듀오링고식 레슨 경로 생성
   ========================================================= */
import {
  K, state, load, getSetup, saveSetup, getScope, saveScope, getDifficulty, DIFFICULTY_LEVELS,
  escapeHtml, toast, openModal, uid, dayKey, dday, hasKey, saveMaterials,
} from './core.js?v=759cc446';
import { addMaterial, fileToMaterial, readImageFile, openMaterialsModal } from './ui.js?v=759cc446';
import { extractScope, buildLessonPath, subjectLabel, subjectIcon, gradesFor } from './curriculum.js?v=759cc446';
import { applyLessonPath, renderCourse } from './course.js?v=759cc446';

const el = (id) => document.getElementById(id);

/* course.js 의 courseId() 와 같은 규칙 */
function subjectKey() {
  try {
    const raw = load(K.subject, 'math');
    if (raw === 'custom') return 'custom:' + String(load(K.custom, '') || '');
    return String(raw);
  } catch (e) { return 'math'; }
}

function scopeMaterials(key) {
  return (state.materials || []).filter(m => (m.subjectId || '') === key || (!m.subjectId && m._shared));
}

function kindIcon(m) {
  return m.kind === 'pdf' ? '📕' : m.kind === 'img' ? '🖼️' : m.kind === 'txt' ? '📄' : '📝';
}

function srcLabel(src) {
  return src === 'pdf' ? 'PDF' : src === 'photo' ? '필기 사진' : src === 'txt' ? 'TXT' : src === 'manual' ? '직접 입력' : src === 'note' ? '직접 입력' : '자료';
}

/* ---------------- render ---------------- */
export function renderScopeCard() {
  const host = el('scopeCard');
  if (!host) return;
  const key = subjectKey();
  const sc = getScope(key);
  const mats = scopeMaterials(key);
  const label = subjectLabel(key);
  const rec = getDifficulty(key);
  const diffItem = rec.level ? DIFFICULTY_LEVELS[rec.level] : null;

  const badge = sc.scopeText
    ? `<span class="scope-badge on">${escapeHtml(srcLabel(sc.source))} 확인</span>`
    : '<span class="scope-badge">아직 없음</span>';

  host.innerHTML = `
    <div class="scope-head">
      <span class="scope-ico">${subjectIcon(key)}</span>
      <div class="scope-title">
        <b>${escapeHtml(label)} 시험 범위 · 자료</b>
        <small>${sc.scopeText ? escapeHtml(sc.pathTitle || '시험 범위를 확인했어요') : '자료를 올리면 AI가 읽고 범위를 잡아요'}</small>
      </div>
      ${badge}
    </div>
    ${sc.scopeText ? `
      <div class="scope-current">
        <div class="sc-label">AI가 확인한 시험 범위</div>
        <p class="sc-text">${escapeHtml(sc.scopeText)}</p>
        ${(sc.units && sc.units.length) ? `<div class="sc-units">${sc.units.slice(0, 8).map(u => `<span>${escapeHtml(u)}</span>`).join('')}</div>` : ''}
        <div class="sc-meta">
          ${sc.examDate ? `<span>시험 ${escapeHtml(sc.examDate.replace(/-/g, '.'))}${(() => { const d = dday(sc.examDate); return d != null && d >= 0 ? ` · D-${d}` : ''; })()}</span>` : ''}
          ${sc.goalPct ? `<span>목표 ${sc.goalPct}%</span>` : ''}
          ${sc.understanding ? `<span>이해도 ${escapeHtml(sc.understanding)}</span>` : ''}
          ${diffItem ? `<span>난이도 ${diffItem.short}</span>` : ''}
        </div>
      </div>` : ''}
    <div class="scope-mats" id="scopeMats">
      ${mats.length ? mats.map(m => `
        <span class="scope-mat" data-mat="${escapeHtml(m.id)}">
          ${kindIcon(m)} ${escapeHtml(String(m.name).slice(0, 20))}
          <button class="sm-x" data-delmat="${escapeHtml(m.id)}" type="button" aria-label="자료 빼기">✕</button>
        </span>`).join('') : ''}
    </div>
    <div class="scope-actions">
      <button class="scope-btn" id="scopePdf" type="button"><span>📄</span>PDF 올리기</button>
      <button class="scope-btn" id="scopePhoto" type="button"><span>🖼️</span>필기 사진 올리기</button>
      <button class="scope-btn ghost" id="scopeNoFile" type="button"><span>✍️</span>PDF나 사진이 없어요</button>
      ${sc.scopeText ? '<button class="scope-btn ghost" id="scopeRegen" type="button"><span>🔄</span>사전 질문 다시 · 경로 재생성</button>' : ''}
    </div>
    <div class="status" id="scopeStatus" hidden></div>
    <p class="scope-fine" id="scopeFine">${sc.pathTitle ? `마지막 경로: ${escapeHtml(sc.pathTitle)}` : '자료 없이 시험 범위만 적어도 개념부터 문제까지 레슨을 만들어요.'}</p>
  `;
  bindScopeCard(host, key, sc);
}

function bindScopeCard(host, key, sc) {
  const status = () => host.querySelector('#scopeStatus');
  const setStatus = (html, cls = '') => {
    const node = status();
    if (!node) return;
    node.hidden = false;
    node.className = 'status ' + cls;
    node.innerHTML = html;
  };
  const clearStatus = () => { const n = status(); if (n) n.hidden = true; };

  host.querySelector('#scopePdf')?.addEventListener('click', () => pickFiles('pdf', key, setStatus, clearStatus));
  host.querySelector('#scopePhoto')?.addEventListener('click', () => pickFiles('photo', key, setStatus, clearStatus));
  host.querySelector('#scopeNoFile')?.addEventListener('click', () => openScopeQuestion(key));
  host.querySelector('#scopeRegen')?.addEventListener('click', () => openScopeQuestions({
    key, scopeText: sc.scopeText, units: sc.units, title: sc.pathTitle || sc.title, source: sc.source,
  }));
  host.querySelectorAll('[data-delmat]').forEach(b => b.addEventListener('click', () => {
    state.materials = state.materials.filter(m => m.id !== b.dataset.delmat);
    saveMaterials();
    toast('자료를 뺐어요');
    renderScopeCard();
  }));

  const openMats = host.querySelector('#scopeMats');
  if (openMats && sc.scopeText) {
    openMats.querySelectorAll('[data-mat]').forEach(chip => chip.addEventListener('click', (e) => {
      if (e.target.closest('[data-delmat]')) return;
      openScopeQuestions({ key, scopeText: sc.scopeText, units: sc.units, title: sc.pathTitle, source: sc.source });
    }));
  }
}

/* ---------------- 파일 선택 → 자료 등록 → 범위 파악 ---------------- */
function pickFiles(kind, key, setStatus, clearStatus) {
  const input = el(kind === 'pdf' ? 'scopePdfInput' : 'scopePhotoInput');
  if (!input) return;
  input.value = '';
  const onChange = async () => {
    input.removeEventListener('change', onChange);
    const files = Array.from(input.files || []);
    if (!files.length) return;
    for (const f of files) {
      try {
        let mat;
        if (kind === 'photo' || /^image\//.test(f.type || '')) {
          const img = await readImageFile(f);
          mat = {
            id: uid('mat'), name: f.name || '필기 사진', kind: 'img', chars: 0, text: '',
            dataUrl: img.dataUrl, mimeType: img.mimeType, subjectId: key, createdAt: Date.now(),
          };
        } else {
          mat = await fileToMaterial(f);
        }
        if (!mat) continue;
        mat.subjectId = key;
        addMaterial(mat);
        renderScopeCard();
        await readScope(mat, key);
      } catch (e) {
        toast(e.message || '자료를 읽지 못했어요.', 'err', 3600);
        if (setStatus) setStatus('❌ ' + escapeHtml(e.message || '자료를 읽지 못했어요.'), 'err');
      }
    }
    void clearStatus;
  };
  input.addEventListener('change', onChange);
  input.click();
}

async function readScope(mat, key) {
  const host = el('scopeCard');
  const status = host && host.querySelector('#scopeStatus');
  const label = subjectLabel(key);
  const setup = getSetup() || {};
  if (status) {
    status.hidden = false;
    status.className = 'status';
    status.innerHTML = `<span><span class="spinner"></span> ${hasKey() ? `${escapeHtml(mat.name)}을(를) 읽고 시험 범위를 파악하는 중…` : '자료를 정리하는 중…'}</span>`;
  }
  const res = await extractScope({ subjectLabel: label, learner: setup, material: mat });
  const units = res.units || [];
  let scopeText = res.scopeText || '';
  let source = mat.kind === 'img' ? 'photo' : mat.kind === 'pdf' ? 'pdf' : mat.kind === 'txt' ? 'txt' : 'note';
  if (!scopeText) {
    // 키가 없거나 읽지 못한 경우: 자료 이름과 앞부분으로 최소한의 범위를 만든다
    const head = String(mat.text || '').replace(/\s+/g, ' ').slice(0, 300);
    scopeText = head || String(mat.name || '').replace(/\.[a-z0-9]+$/i, '');
    if (!mat.text) source = 'note';
  }
  saveScope(key, {
    scopeText,
    units,
    title: res.title || `${label} 시험 범위`,
    summary: res.summary || '',
    source,
    materialIds: [mat.id],
    note: res.note || (res.error ? res.error : ''),
  });
  if (status) {
    status.hidden = false;
    status.className = res.error ? 'status' : 'status ok';
    status.innerHTML = res.error
      ? `<span>📎 자료를 목록에 추가했어요. 범위를 직접 확인해 주세요. (${escapeHtml(res.error)})</span>`
      : `<span>✅ ${escapeHtml(mat.name)}에서 시험 범위를 확인했어요. 이제 사전 질문만 답하면 레슨이 만들어져요.</span>`;
  }
  renderScopeCard();
  openScopeQuestions({ key, scopeText, units, title: res.title || `${label} 시험 범위`, source, summary: res.summary || '', note: res.note || '' });
}

/* ---------------- "PDF나 사진이 없어요" → 범위 질문 ---------------- */
export function openScopeQuestion(key = subjectKey()) {
  const label = subjectLabel(key);
  const setup = getSetup() || {};
  const modal = openModal(`
    <div class="modal-head">
      <h2>시험 범위가 무엇인가요?</h2>
      <button class="icon-btn" data-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">
      <p class="hint">${escapeHtml(label)}에서 이번 시험에 나오는 범위를 적어 주세요. 단원·장 이름이나 교재 범위면 충분해요.</p>
      <label class="field"><span>시험 범위</span>
        <input id="sqScope" placeholder="예: 고1 공통과학 2단원~3단원 (Ⅱ. 시스템과 상호작용)" maxlength="200" />
      </label>
      <div class="scope-examples">
        ${['고1 공통과학 2단원~3단원', '공통수학 1 · Ⅱ. 방정식과 부등식', '중3 영어 교과서 3~5과', '한국사 전 범위']
          .map(t => `<button class="ex-chip" data-ex="${escapeHtml(t)}" type="button">${escapeHtml(t)}</button>`).join('')}
      </div>
      <div class="row">
        <button class="primary" id="sqNext" type="button">이 범위로 레슨 만들기</button>
      </div>
      <p class="fine">${escapeHtml(setup.grade || '')} ${escapeHtml(setup.semester || '1학기')} 기준으로 개념 학습부터 문제 풀이까지 경로를 만들어요.</p>
    </div>`);
  const input = modal.root.querySelector('#sqScope');
  modal.root.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.ex; input.focus(); }));
  const go = () => {
    const scopeText = String(input.value || '').trim();
    if (!scopeText) { toast('시험 범위를 적어 주세요.', 'err'); input.focus(); return; }
    saveScope(key, { scopeText, units: [], source: 'manual', title: scopeText.slice(0, 40), summary: '', materialIds: [] });
    modal.close();
    renderScopeCard();
    openScopeQuestions({ key, scopeText, units: [], title: scopeText.slice(0, 40), source: 'manual' });
  };
  modal.root.querySelector('#sqNext').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  requestAnimationFrame(() => input.focus());
}

/* ---------------- 사전 질문 → 레슨 경로 생성 ---------------- */
export function openScopeQuestions({ key = subjectKey(), scopeText = '', units = [], title = '', source = 'manual', summary = '', note = '' } = {}) {
  const setup = getSetup() || {};
  const label = subjectLabel(key);
  const sc = getScope(key);
  const examDate = sc.examDate || setup.examDate || dayKey();
  const goalPct = Number(sc.goalPct || setup.goalPct || 70);
  const understanding = sc.understanding || setup.levelSelf || '보통';
  const level = setup.level || '고등학교';
  const grades = gradesFor(level);
  const grade = setup.grade || grades[0];
  const semester = setup.semester || '1학기';

  const modal = openModal(`
    <div class="modal-head">
      <h2>시험 준비, 몇 가지 먼저 물어볼게요</h2>
      <button class="icon-btn" data-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">
      <div class="sq-scope">
        <span class="sq-badge">${escapeHtml(srcLabel(source))}</span>
        <b>${escapeHtml(title || scopeText.slice(0, 40))}</b>
        <p>${escapeHtml(scopeText)}</p>
      </div>
      <label class="field"><span>시험 범위 (고칠 수 있어요)</span>
        <textarea id="sqScopeEdit" rows="2" placeholder="예: 고1 공통과학 2단원~3단원">${escapeHtml(scopeText)}</textarea>
      </label>
      <label class="field"><span>1. 시험까지 남은 날짜</span>
        <input type="date" id="sqDate" value="${escapeHtml(examDate)}" min="${dayKey()}" />
        <p class="fine" id="sqDday"></p>
      </label>
      <div class="field"><span>2. 목표는 어디까지?</span>
        <div class="sq-goals" id="sqGoals">
          ${[[50, '50%', '핵심 주제 집중'], [70, '70%', '범위 전체 연습'], [90, '90%', '심화·서술형까지']]
            .map(([v, t, d]) => `<button class="sq-goal ${Number(goalPct) === v ? 'on' : ''}" data-goal="${v}" type="button"><b>${t}</b><small>${d}</small></button>`).join('')}
        </div>
      </div>
      <div class="field"><span>3. 지금 이해도는?</span>
        <div class="sq-goals" id="sqUnder">
          ${[['기초', '거의 처음'], ['보통', '기본은 알아요'], ['심화', '응용까지 가능']]
            .map(([v, d]) => `<button class="sq-goal ${understanding === v ? 'on' : ''}" data-under="${v}" type="button"><b>${v}</b><small>${d}</small></button>`).join('')}
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>4. 학년</span>
          <select id="sqGrade">${grades.map(g => `<option ${g === grade ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}</select>
        </label>
        <label class="field"><span>학기</span>
          <select id="sqSemester">${['1학기', '2학기'].map(s => `<option ${s === semester ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </label>
      </div>
      <div class="row">
        <button class="primary" id="sqBuild" type="button">개념부터 문제까지 레슨 만들기</button>
      </div>
      <div class="status" id="sqStatus" hidden></div>
      <p class="fine">${escapeHtml(label)} · 만들면 홈의 학습 경로가 새 경로로 바뀌어요(완료한 수업은 유지).</p>
    </div>`);

  const dateInput = modal.root.querySelector('#sqDate');
  const ddayLine = modal.root.querySelector('#sqDday');
  const refreshDday = () => {
    const v = dateInput.value;
    if (!v) { ddayLine.textContent = '날짜를 모르면 오늘로 계산해요.'; return; }
    const d = dday(v);
    ddayLine.textContent = d > 0 ? `D-${d} · ${d}일 남았어요` : d === 0 ? '오늘 시험이에요' : '지난 날짜예요. 다시 골라 주세요.';
  };
  refreshDday();
  dateInput.addEventListener('change', refreshDday);

  let goal = goalPct;
  let under = understanding;
  modal.root.querySelector('#sqGoals').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goal]'); if (!b) return;
    goal = Number(b.dataset.goal);
    modal.root.querySelectorAll('[data-goal]').forEach(x => x.classList.toggle('on', x === b));
  });
  modal.root.querySelector('#sqUnder').addEventListener('click', (e) => {
    const b = e.target.closest('[data-under]'); if (!b) return;
    under = b.dataset.under;
    modal.root.querySelectorAll('[data-under]').forEach(x => x.classList.toggle('on', x === b));
  });

  const buildBtn = modal.root.querySelector('#sqBuild');
  const status = modal.root.querySelector('#sqStatus');
  buildBtn.addEventListener('click', async () => {
    const examDateV = dateInput.value || dayKey();
    const gradeV = modal.root.querySelector('#sqGrade').value;
    const semesterV = modal.root.querySelector('#sqSemester').value;
    buildBtn.disabled = true;
    status.hidden = false;
    status.className = 'status';
    status.innerHTML = `<span><span class="spinner"></span> ${hasKey() ? 'AI가 시험 범위에 맞춰 개념부터 문제까지 경로를 짜는 중…' : '기본 경로를 만드는 중…'} (<span id="sqCount">0</span>초)</span>`;
    const t0 = Date.now();
    const tick = setInterval(() => {
      const c = document.getElementById('sqCount');
      if (c) c.textContent = String(Math.round((Date.now() - t0) / 1000));
    }, 500);
    try {
      const days = dday(examDateV);
      const rec = getDifficulty(key);
      const diff = rec.level ? DIFFICULTY_LEVELS[rec.level] : null;
      const mats = scopeMaterials(key);
      const scopeEdited = String(modal.root.querySelector('#sqScopeEdit').value || '').trim() || scopeText;
      const path = await buildLessonPath({
        label,
        scopeText: scopeEdited,
        units,
        days: days >= 0 ? days : 0,
        goalPct: goal,
        understanding: under,
        title,
        learner: Object.assign({}, setup, { grade: gradeV, semester: semesterV }),
        difficulty: diff ? { label: diff.label } : null,
        materials: mats,
      });
      if (!path || !Array.isArray(path.steps) || !path.steps.length) throw new Error('레슨 경로를 만들지 못했어요.');
      saveScope(key, {
        scopeText: scopeEdited, units, title: path.title || title,
        source, summary, note,
        examDate: examDateV, goalPct: goal, understanding: under,
        pathTitle: path.title || title, pathSource: path.source || 'basic', pathAt: Date.now(),
      });
      saveSetup({ examDate: examDateV, goalPct: goal, levelSelf: under, grade: gradeV, semester: semesterV });
      const c = applyLessonPath(key, path, {
        title: path.title || title,
        curriculumName: (getSetup() || {}).schoolInfo ? (getSetup().schoolInfo.curriculumName || '') : '',
        source: path.source === 'ai' ? 'ai' : 'basic',
        scopeSource: source,
      });
      clearInterval(tick);
      status.className = path.error ? 'status' : 'status ok';
      status.innerHTML = `<span>${path.error ? '⚠️ ' : '✅ '}레슨 ${c.lessons.length}개를 만들었어요${path.error ? ' (AI 대신 기본 경로)' : ''}. 홈에서 이어서 시작해 보세요.</span>`;
      renderCourse();
      renderScopeCard();
      document.dispatchEvent(new CustomEvent('app:scope', { detail: { subjectId: key } }));
      toast(`새 학습 경로 ${c.lessons.length}개 · 개념 → 문제 → 모의고사`, 'xp', 3000);
      setTimeout(() => { try { modal.close(); } catch (e) {} }, 1100);
      scrollToPath();
    } catch (e) {
      clearInterval(tick);
      status.className = 'status err';
      status.innerHTML = '❌ ' + escapeHtml(e.message || '경로를 만들지 못했어요.');
      buildBtn.disabled = false;
    }
  });
}

function scrollToPath() {
  const card = document.querySelector('.exam-card');
  if (!card) return;
  try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
}

/* ---------------- init ---------------- */
export function initScope() {
  renderScopeCard();
  document.addEventListener('app:subject', renderScopeCard);
  document.addEventListener('app:view', (e) => { if (e.detail === 'course') renderScopeCard(); });
  document.addEventListener('app:materials', renderScopeCard);
  document.addEventListener('app:scope', renderScopeCard);
  document.addEventListener('app:difficulty-ui', renderScopeCard);
  document.addEventListener('app:subject', () => { try { renderCourse(); } catch (e) {} });
  void openMaterialsModal;
}
