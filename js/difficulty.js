/* =========================================================
   difficulty.js — 수업 후 난이도 평가 → 과목별 저장 → 모든 AI 프롬프트에 반영
   ========================================================= */
import {
  K, load, save, DIFFICULTY_LEVELS, getDifficulty, setDifficulty, escapeHtml, toast, openModal,
} from './core.js?v=a7eabd5b';
import { subjectLabel, subjectIcon } from './curriculum.js?v=a7eabd5b';

const THROTTLE_MS = 6 * 60 * 1000; // 같은 과목에서 연속으로 묻지 않도록
const PROMPT_AT_KEY = 'aitutor.v1.diffPromptAt';

function promptAt(subjectId) {
  const map = load(PROMPT_AT_KEY, {});
  return Number(map[subjectId]) || 0;
}
function markPromptAt(subjectId) {
  const map = load(PROMPT_AT_KEY, {});
  map[subjectId] = Date.now();
  save(PROMPT_AT_KEY, map);
}

/**
 * "이번 수업은 어땠나요?" 모달.
 * @param {object} opts
 * @param {string} opts.subjectId 대상 과목
 * @param {string} [opts.lessonTitle] 방금 끝난 수업 이름
 * @param {boolean} [opts.manual] 난이도 칩에서 직접 열었는지
 * @param {Function} [opts.onPick]
 */
export function openDifficultyPrompt({ subjectId, lessonTitle = '', manual = false, onPick } = {}) {
  if (!subjectId) return null;
  const label = subjectLabel(subjectId);
  const prev = getDifficulty(subjectId);
  const prevItem = prev.level ? DIFFICULTY_LEVELS[prev.level] : null;

  const modal = openModal(`
    <div class="modal-head">
      <h2>${manual ? 'AI 난이도 설정' : '이번 수업은 어땠나요?'}</h2>
      <button class="icon-btn" data-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">
      <div class="diff-intro">
        <span class="diff-sbj">${subjectIcon(subjectId)} ${escapeHtml(label)}</span>
        ${lessonTitle ? `<span class="diff-lesson">${escapeHtml(lessonTitle.replace(/^\d+\.\s*/, ''))}</span>` : ''}
      </div>
      <p class="diff-q">${manual ? '이 과목 수업의 난이도를 직접 골라 주세요.' : '한 마디만 골라 주시면, 다음 수업부터 AI가 설명과 문제 난이도를 맞춰요.'}</p>
      <div class="diff-choices" role="group" aria-label="난이도 평가">
        ${['hard', 'normal', 'easy'].map(id => {
          const d = DIFFICULTY_LEVELS[id];
          const on = prev.level === id ? ' on' : '';
          return `<button class="diff-choice${on}" data-diff="${id}" type="button">
            <span class="dc-ico">${d.icon}</span>
            <b>${d.label}</b>
            <small>${d.desc}</small>
          </button>`;
        }).join('')}
      </div>
      ${prevItem ? `<p class="diff-prev">최근 평가: <b>${prevItem.icon} ${prevItem.label}</b> · ${new Date(prev.updatedAt).toLocaleDateString('ko-KR')} (${prev.count}회 저장)</p>` : '<p class="diff-prev">아직 저장된 난이도가 없어요. 고르면 과목별로 저장됩니다.</p>'}
      <div class="row tight" style="margin-top:14px">
        <button class="ghost-btn small" data-close type="button">${manual ? '닫기' : '건너뛰기'}</button>
      </div>
    </div>`);

  modal.root.querySelectorAll('[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.diff;
      const item = DIFFICULTY_LEVELS[level];
      if (!item) return;
      setDifficulty(subjectId, level);
      markPromptAt(subjectId);
      modal.root.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === btn));
      const saved = modal.root.querySelector('.diff-prev');
      if (saved) saved.innerHTML = `저장됨: <b>${item.icon} ${item.label}</b> · 다음 수업부터 바로 반영돼요.`;
      toast(`${label} · ${item.label} → ${item.toast}`, level === 'hard' ? 'info' : 'xp', 2600);
      onPick && onPick(level);
      setTimeout(() => { try { modal.close(); } catch (e) {} }, level === 'normal' ? 700 : 900);
    });
  });
  requestAnimationFrame(() => {
    const first = modal.root.querySelector('.diff-choice');
    if (first) first.focus();
  });
  return modal;
}

/* ---------------- 수업 종료 감지 ---------------- */
const SESSION_TYPES = new Set(['quiz', 'exam', 'cards', 'oral', 'podcast', 'sim']);

function modalOpen() {
  return !!document.querySelector('#modalRoot .modal-back');
}

/**
 * 앱의 'app:studied' 이벤트로 수업 종료를 감지한다.
 * - 레슨이 실제로 완료됐으면(app:lesson-complete) 바로 평가를 묻는다.
 * - 한 번짜리 세션(퀴즈·모의고사·카드·구술·팟캐스트·시뮬레이션)도 평가를 묻되,
 *   같은 과목에서 짧은 시간 안에 반복해서 묻지 않는다.
 */
export function initDifficulty() {
  document.addEventListener('app:lesson-complete', (e) => {
    const d = e.detail || {};
    if (!d.subjectId) return;
    if (modalOpen()) return;
    markPromptAt(d.subjectId);
    setTimeout(() => openDifficultyPrompt({ subjectId: d.subjectId, lessonTitle: d.lessonTitle || '' }), 420);
  });

  document.addEventListener('app:studied', (e) => {
    const type = e && e.detail ? e.detail.type : '';
    if (!SESSION_TYPES.has(type)) return;
    if (modalOpen()) return;
    const subjectId = courseSubjectKey();
    if (!subjectId) return;
    if (Date.now() - promptAt(subjectId) < THROTTLE_MS) return;
    markPromptAt(subjectId);
    setTimeout(() => {
      if (!modalOpen()) openDifficultyPrompt({ subjectId });
    }, 900);
  });

  document.addEventListener('app:difficulty', () => {
    const view = document.querySelector('.view[data-view="course"]');
    if (view && !view.hidden) document.dispatchEvent(new CustomEvent('app:difficulty-ui'));
  });
}

/* 현재 과목 키 (course.js 의 courseId 와 같은 규칙) */
function courseSubjectKey() {
  try {
    const raw = load(K.subject, 'math');
    if (raw === 'custom') return 'custom:' + String(load(K.custom, '') || '');
    return String(raw);
  } catch (e) { return 'math'; }
}
