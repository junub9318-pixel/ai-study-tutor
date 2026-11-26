/* =========================================================
   app.js — 앱 초기화
   ========================================================= */
import {
  K, state, hasKey, save, $, $$, openModal, escapeHtml, toast, getSetup,
  learnerContext, getDifficulty, getScope, difficultyPrompt,
} from './core.js?v=759cc446';
import {
  initTheme, initTabs, initSubject, initKey, showView, openMaterialsModal,
  renderMaterialCount, onView, renderKeyState,
} from './ui.js?v=759cc446';
import { renderHeaderChips } from './gamify.js?v=759cc446';
import { initTutor } from './tutor.js?v=759cc446';
import { initQuiz } from './quiz.js?v=759cc446';
import { initPlan } from './plan.js?v=759cc446';
import { initCards } from './cards.js?v=759cc446';
import { initAudio } from './audio.js?v=759cc446';
import { initSim } from './sim.js?v=759cc446';
import { initLeague, handleFriendLink } from './league.js?v=759cc446';
import { initCourse, renderCourse } from './course.js?v=759cc446';
import { initSettings } from './settings.js?v=759cc446';
import { initOnboarding, openOnboarding } from './onboarding.js?v=759cc446';
import { initDifficulty } from './difficulty.js?v=759cc446';
import { initScope } from './scope.js?v=759cc446';

/* ---------------- 개발용 오류 표시 (?debug=1) ---------------- */
window.__errors = [];
const DEBUG = /(?:^|[?&])debug=1(?:&|$)/.test(location.search);
/* ?debug=1 에서만: 프롬프트에 난이도·시험 범위가 실제로 들어가는지 확인용 */
if (DEBUG) {
  window.__aiTutor = {
    learnerContext, getDifficulty, getScope, difficultyPrompt, getSetup,
    storage: () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('aitutor.v1.')) o[k] = localStorage.getItem(k); } return o; },
  };
}
function reportError(msg) {
  window.__errors.push(String(msg));
  if (!DEBUG) return;
  let box = document.querySelector('.debug-errors');
  if (!box) {
    box = document.createElement('div');
    box.className = 'debug-errors';
    document.body.appendChild(box);
  }
  box.textContent = window.__errors.slice(-6).join('\n');
}
window.addEventListener('error', (e) => reportError((e.message || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => reportError('promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

/* ---------------- boot ---------------- */
function boot() {
  if (window.pdfjsLib) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    } catch (e) {}
  }

  initTheme();
  initTabs();
  initSubject();
  initKey();
  renderMaterialCount();
  renderHeaderChips();

  initTutor();
  initQuiz();
  initPlan();
  initCards();
  initAudio();
  initSim();
  initLeague();
  initCourse();
  initSettings();
  initOnboarding();
  initDifficulty();
  initScope();

  // 상단 XP 칩 → 랭킹, 스트릭 칩 → 랭킹
  document.getElementById('xpChip')?.addEventListener('click', () => showView('league'));
  document.getElementById('streakChipBtn')?.addEventListener('click', () => showView('league'));

  document.addEventListener('app:materials', renderMaterialCount);
  document.addEventListener('app:setup', () => { renderCourse(); });

  const started = openOnboarding(false);
  if (!started) {
    showView('course');
    renderCourse();
  }
  handleFriendLink();

  onView('quiz', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('plan', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('cards', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('audio', () => document.dispatchEvent(new CustomEvent('app:materials')));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

void state; void $; void $$; void openModal; void escapeHtml; void toast; void getSetup; void K; void save; void hasKey; void openMaterialsModal;
