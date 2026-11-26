/* =========================================================
   app.js — 앱 초기화
   ========================================================= */
import {
  K, state, hasKey, save, $, $$, openModal, escapeHtml, toast,
} from './core.js?v=422ee01a';
import {
  initTheme, initTabs, initSubject, initKey, showView, openMaterialsModal,
  renderMaterialCount, onView,
} from './ui.js?v=422ee01a';
import { renderHeaderChips } from './gamify.js?v=422ee01a';
import { initHome } from './home.js?v=422ee01a';
import { initTutor } from './tutor.js?v=422ee01a';
import { initQuiz } from './quiz.js?v=422ee01a';
import { initPlan } from './plan.js?v=422ee01a';
import { initCards } from './cards.js?v=422ee01a';
import { initAudio } from './audio.js?v=422ee01a';
import { initSim } from './sim.js?v=422ee01a';
import { initLeague, handleFriendLink } from './league.js?v=422ee01a';

/* ---------------- 개발용 오류 표시 (?debug=1) ---------------- */
window.__errors = [];
const DEBUG = /(?:^|[?&])debug=1(?:&|$)/.test(location.search);
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
  if (window.pdfjsLib && window['pdfjs-dist/build/pdf.worker.min.js'] === undefined) {
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

  document.getElementById('materialsBtn').addEventListener('click', () => openMaterialsModal(() => renderMaterialCount()));

  initHome();
  initTutor();
  initQuiz();
  initPlan();
  initCards();
  initAudio();
  initSim();
  initLeague();

  document.addEventListener('app:materials', renderMaterialCount);
  document.addEventListener('app:key', () => {
    const banner = document.getElementById('keyBanner');
    if (banner) banner.hidden = hasKey();
  });

  showView('home');
  handleFriendLink();

  // 카드·계획·퀴즈의 자료 칩은 화면을 열 때 다시 그리기
  onView('quiz', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('plan', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('cards', () => document.dispatchEvent(new CustomEvent('app:materials')));
  onView('audio', () => document.dispatchEvent(new CustomEvent('app:materials')));

  // 테마 변경 시 캔버스 다시 그리기 등
  document.addEventListener('app:theme', () => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
