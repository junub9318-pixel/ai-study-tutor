/* =========================================================
   home.js — 대시보드 (오늘 목표 · 스트릭 · 리그 요약 · 챌린지)
   ========================================================= */
import { K, state, load, save, $, escapeHtml, fmt, toast, openModal, dayKey } from './core.js?v=2549316b';
import {
  profile, weeklyXP, xpToday, goal, setGoal, currentStreak, bestStreak, tierFor, TIERS,
  leaderboard, BADGES, isBadgeOn, dailySeries,
} from './gamify.js?v=2549316b';
import { dailyChallengeSummary, dailyDoneToday, startDaily } from './quiz.js?v=2549316b';
import { showView } from './ui.js?v=2549316b';

const el = (id) => document.getElementById(id);

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '늦은 밤에도 열공 중이네요 🌙';
  if (h < 11) return '좋은 아침이에요 ☀️';
  if (h < 17) return '오늘도 한 걸음 👟';
  if (h < 22) return '저녁 집중 시간이에요 🌆';
  return '오늘 하루 마무리 어때요? 🌙';
}

export function renderHome() {
  const p = profile();
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  el('homeDate').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
  el('homeGreeting').textContent = p.nick ? `${p.nick} 님, ${greeting()}` : greeting();

  const today = xpToday(), g = goal(), pct = Math.min(100, Math.round((today / g) * 100));
  const ring = el('ringFg');
  if (ring) ring.style.strokeDashoffset = String(169.6 * (1 - pct / 100));
  el('ringPct').textContent = pct + '%';
  el('homeSub').textContent = today >= g
    ? `오늘 목표 달성! ${currentStreak() > 1 ? `🔥 ${currentStreak()}일 연속 학습 중` : '🔥 연속 학습 시작!'}`
    : `목표까지 ${g - today} XP 남았어요. 튜터에게 한 문제만 물어봐도 5 XP!`;

  const wx = weeklyXP();
  const tier = tierFor(wx);
  el('statStreak').textContent = `${currentStreak()}일`;
  el('statXP').textContent = `${fmt(wx)} XP`;
  el('statTier').textContent = `${tier.icon} ${tier.name}`;
  el('statTierSub').textContent = tier.next ? `${TIERS[tier.index + 1].name}까지 ${fmt(tier.remaining)} XP` : '최고 티어';

  // 데일리 챌린지
  const done = dailyChallengeSummary();
  const chSub = el('chSub'), chDesc = el('chDesc'), chBtn = el('chStart');
  if (done) {
    chSub.textContent = `오늘 완료 · ${done.correct}/${done.total} 정답`;
    chDesc.textContent = `${done.subject} 챌린지를 마쳤어요. 내일 0시에 새 문제가 열려요.`;
    chBtn.textContent = '완료됨 ✓';
    chBtn.disabled = true;
  } else {
    chSub.textContent = '3문제 · +20 XP';
    chDesc.textContent = `오늘의 3문제. 1분이면 끝나요. +20 XP`;
    chBtn.textContent = '도전하기';
    chBtn.disabled = false;
  }

  // 미니 리그
  const rows = leaderboard({ includeBots: state.settings.showBots });
  const mini = el('miniRank');
  const top = rows.slice(0, 3);
  const me = rows.find(r => r.me);
  const showMe = me && !top.some(r => r.me);
  mini.innerHTML = [...top, ...(showMe ? [me] : [])].map(r => `
    <li class="${r.me ? 'me' : ''}">
      <span class="rk">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
      <span class="nm">${r.emoji || '🙂'} ${escapeHtml(r.name)}${r.me && p.nick ? ' (나)' : ''}</span>
      <span class="xp">${fmt(r.weeklyXP)} XP</span>
    </li>`).join('') || '<li class="xp">아직 기록이 없어요</li>';

  // 배지 미리보기
  const unlocked = BADGES.filter(b => isBadgeOn(b.id));
  const list = [...unlocked.slice(-6), ...BADGES.filter(b => !isBadgeOn(b.id)).slice(0, Math.max(0, 6 - unlocked.length))];
  el('badgePreview').innerHTML = (list.length ? list : BADGES.slice(0, 6)).map(b =>
    `<div class="badge-chip ${isBadgeOn(b.id) ? 'on' : ''}"><span class="b-ico">${b.icon}</span><small>${b.name}</small></div>`).join('');
}

/* 목표 변경 */
function openGoalPicker() {
  const modal = openModal(`
    <div class="modal-head"><h2>하루 목표 XP</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">하루 목표를 채우면 연속 학습일(🔥)이 이어져요. 부담 없이 매일 지킬 수 있는 양이 좋아요.</p>
      <div class="subj-grid">
        ${[20, 30, 50, 80, 120].map(n => `<button class="subj-item ${goal() === n ? 'on' : ''}" data-goal="${n}" type="button"><span class="si-ico">⚡</span><span>${n} XP<small>${n <= 30 ? '가볍게' : n <= 50 ? '표준' : '도전'}</small></span></button>`).join('')}
      </div>
      <p class="fine">최근 7일: ${dailySeries(7).map(d => d.xp).join(' · ')} XP</p>
    </div>`);
  modal.root.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => {
    setGoal(Number(b.dataset.goal));
    renderHome();
    modal.close();
    toast(`하루 목표를 ${b.dataset.goal} XP로 정했어요`);
  }));
}

export function initHome() {
  renderHome();
  el('chStart').addEventListener('click', () => { showView('quiz'); startDaily(); });
  el('goalRing').addEventListener('click', openGoalPicker);
  el('goalRing').style.cursor = 'pointer';
  document.addEventListener('gamify:update', renderHome);
  document.addEventListener('app:view', (e) => { if (e.detail === 'home') renderHome(); });
  document.addEventListener('app:quizdone', renderHome);
  document.addEventListener('app:subject', renderHome);
}
