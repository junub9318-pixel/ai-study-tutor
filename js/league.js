/* =========================================================
   league.js — 리그 티어 · 랭킹 · 친구 공유 · 배지
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, fmt, toast, openModal, dayKey, weekStartKey,
  currentSubject, removeKey as _rk,
} from './core.js?v=4203a19d';
import {
  TIERS, tierFor, weeklyXP, totalXP, currentStreak, bestStreak, profile, leaderboard,
  friends, removeFriend, addFriendByCode, myCode, myLink, BADGES, isBadgeOn,
  unlockedBadges, emit,
} from './gamify.js?v=4203a19d';
import { toastCopy } from './ui.js?v=4203a19d';

const el = (id) => document.getElementById(id);
const EMOJIS = ['🐣', '🐼', '🦊', '🐧', '🐯', '🦉', '🐨', '🦄', '🚀', '📚', '🎧', '🧠', '⭐', '🍀', '🎓', '🔥'];

export function renderLeague() {
  const p = profile();
  const wx = weeklyXP();
  const t = tierFor(wx);

  el('tierBadge').textContent = t.icon;
  el('tierName').textContent = `${t.name} 리그`;
  el('tierName').style.color = t.color;
  el('tierSub').textContent = t.next
    ? `이번 주 ${fmt(wx)} XP · ${TIERS[t.index + 1].name}까지 ${fmt(t.remaining)} XP`
    : `이번 주 ${fmt(wx)} XP · 최고 티어 달성! 🎉`;
  el('tierBar').style.width = t.progress + '%';

  // 티어 사다리
  let ladder = document.querySelector('.tier-ladder');
  if (!ladder) {
    ladder = document.createElement('div');
    ladder.className = 'tier-ladder';
    ladder.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:12px;font-size:10.5px;color:var(--muted)';
    document.querySelector('.league-hero').appendChild(ladder);
  }
  ladder.innerHTML = TIERS.map((x, i) => `
    <span style="padding:3px 7px;border-radius:7px;border:1px solid ${i === t.index ? x.color : 'var(--border)'};color:${i === t.index ? x.color : 'var(--muted)'};font-weight:${i === t.index ? 800 : 600}">
      ${x.icon} ${x.name} ${x.min}${x.next ? '' : '+'}
    </span>`).join('');

  const wk = weekStartKey();
  el('weekLabel').textContent = `${wk.slice(5).replace('-', '/')} 주간`;

  renderRank();
  renderFriends();
  renderBadges();
  renderStats();
  const nickEl = el('nickInput'); if (nickEl) nickEl.value = p.nick || '';
  const emojiEl = el('emojiPick'); if (emojiEl) emojiEl.textContent = p.emoji || '🐣';
  el('myCode').textContent = myCode();
}

function renderRank() {
  const rows = leaderboard();
  const friends = rows.filter(r => r.friend).length;
  el('rankList').innerHTML = rows.map(r => `
    <li class="rank-row ${r.me ? 'me' : ''}">
      <span class="pos ${r.rank <= 3 ? 'top' : ''}">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
      <span class="r-ava">${r.emoji || '🙂'}</span>
      <span class="r-name">${escapeHtml(r.name)}${r.me && r.name !== '나' ? ' <small>나</small>' : ''}${r.stale ? ' <small>· 갱신 필요</small>' : ''}</span>
      <span class="r-tier">${(r.tier && r.tier.icon) || '🥉'}</span>
      <span class="r-xp">${fmt(r.weeklyXP)} <small>XP</small></span>
    </li>`).join('') + (friends === 0 ? `
    <li class="rank-empty">친구 코드를 추가하면 이 보드에 함께 표시돼요.</li>` : '');
}

function renderFriends() {
  const list = friends();
  const host = el('friendList');
  if (!list.length) {
    host.innerHTML = '<li class="friend-item"><span class="f-meta">아직 추가한 친구가 없어요. 위 코드를 친구에게 보내 보세요.</span></li>';
    return;
  }
  host.innerHTML = list.map(f => `
    <li class="friend-item">
      <span>${f.emoji || '🙂'}</span>
      <span class="f-name">${escapeHtml(f.name)}</span>
      <span class="f-meta">${fmt(f.weeklyXP)} XP · 🔥${f.streak} · ${(TIERS.find(t => t.id === f.tierId) || {}).icon || '🥉'}</span>
      <button class="m-del" data-delfriend="${escapeHtml(f.code)}" type="button">삭제</button>
    </li>`).join('');
  host.querySelectorAll('[data-delfriend]').forEach(b => b.addEventListener('click', () => {
    removeFriend(b.dataset.delfriend);
    renderFriends();
    renderRank();
    toast('친구를 목록에서 뺐어요');
  }));
}

function renderBadges() {
  const unlocked = unlockedBadges();
  el('badgeCount').textContent = `${unlocked.length} / ${BADGES.length}`;
  el('badgeGrid').innerHTML = BADGES.map(b => `
    <div class="badge-tile ${isBadgeOn(b.id) ? 'on' : ''}">
      <span class="b-ico">${b.icon}</span>
      <b>${b.name}</b>
      <small>${b.desc}</small>
    </div>`).join('');
}

function renderStats() {
  const p = profile();
  const c = p.counters;
  const items = [
    ['총 XP', fmt(p.xpTotal)],
    ['이번 주 XP', fmt(weeklyXP())],
    ['연속 학습', `${currentStreak()}일`],
    ['최고 연속', `${bestStreak()}일`],
    ['푼 문제', fmt(c.quizAnswered)],
    ['튜터링', fmt(c.turns) + '회'],
    ['카드 복습', fmt(c.cards) + '장'],
    ['모의고사', fmt(c.exams) + '회'],
    ['구술 시험', fmt(c.oral) + '회'],
    ['팟캐스트', fmt(c.podcasts) + '개'],
    ['시뮬레이션', fmt(c.sims) + '회'],
    ['계획 체크', fmt(c.tasksDone) + '개'],
  ];
  el('statGrid').innerHTML = items.map(([k, v]) => `<div class="stat-box"><b>${v}</b><small>${k}</small></div>`).join('');
}

/* ---------------- actions ---------------- */
function addFriend() {
  const input = el('friendCodeInput');
  const raw = input.value.trim();
  if (!raw) { toast('친구 코드나 링크를 붙여넣어 주세요.', 'err'); return; }
  try {
    const f = addFriendByCode(raw);
    input.value = '';
    renderLeague();
    toast(`${f.name} 님을 랭킹에 추가했어요 (${fmt(f.weeklyXP)} XP · 🔥${f.streak})`, 'xp', 3200);
  } catch (e) {
    toast(e.message || '코드를 추가하지 못했어요.', 'err', 3200);
  }
}

function exportData() {
  const out = { exportedAt: new Date().toISOString(), app: 'ai-study-tutor', version: 1, data: {} };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('aitutor.v1.')) continue;
      if (k === K.key) continue; // API 키는 내보내지 않음
      out.data[k] = localStorage.getItem(k);
    }
  } catch (e) {}
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ai-study-tutor-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('기록을 파일로 내보냈어요 (API 키는 제외)');
}

function resetAll() {
  if (!confirm('모든 학습 기록(대화·계획·카드·리그·배지)을 지울까요?\nAPI 키도 함께 삭제됩니다.')) return;
  if (!confirm('정말로 지웁니다. 되돌릴 수 없어요.')) return;
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aitutor.v1.')) keys.push(k);
    }
  } catch (e) {}
  keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  location.reload();
}

/* ---------------- init ---------------- */
export function initLeague() {
  el('addFriendBtn').addEventListener('click', addFriend);
  el('friendCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFriend(); });
  el('copyCode').addEventListener('click', () => toastCopy(myCode(), '친구 코드를 복사했어요'));
  el('copyLink').addEventListener('click', () => toastCopy(myLink(), '친구 링크를 복사했어요'));
  el('saveProfile')?.addEventListener('click', () => {
    const p = profile();
    p.nick = el('nickInput').value.trim().slice(0, 12);
    save(K.profile, p);
    emit();
    toast(p.nick ? `닉네임을 "${p.nick}"으로 저장했어요` : '닉네임을 지웠어요');
  });
  el('emojiPick')?.addEventListener('click', () => {
    const list = el('emojiList');
    list.hidden = !list.hidden;
    if (!list.innerHTML) {
      list.innerHTML = EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
      list.querySelectorAll('[data-emoji]').forEach(b => b.addEventListener('click', () => {
        const p = profile();
        p.emoji = b.dataset.emoji;
        save(K.profile, p);
        el('emojiPick').textContent = p.emoji;
        list.hidden = true;
        emit();
      }));
    }
  });
  el('exportBtn')?.addEventListener('click', exportData);
  el('resetBtn')?.addEventListener('click', resetAll);

  document.addEventListener('gamify:update', () => {
    if (document.querySelector('.view[data-view="league"]') && !document.querySelector('.view[data-view="league"]').hidden) renderLeague();
  });
  document.addEventListener('app:view', (e) => {
    if (e.detail === 'league') renderLeague();
    if (e.detail === 'home') { /* home이 자체 갱신 */ }
  });
  renderLeague();
}

/* 친구 링크(?friend=CODE) 진입 처리 */
export function handleFriendLink() {
  try {
    const m = location.search.match(/[?&]friend=([^&]+)/);
    if (!m) return;
    const code = decodeURIComponent(m[1]);
    const modal = openModal(`
      <div class="modal-head"><h2>친구 기록 추가</h2><button class="icon-btn" data-close type="button">✕</button></div>
      <div class="modal-body">
        <p class="hint">링크에 담긴 친구의 이번 주 기록을 이 기기의 랭킹에 추가할까요?<br/>추가해도 친구 기기로는 아무것도 전송되지 않아요.</p>
        <div id="friendPreview" class="status"></div>
        <div class="key-foot">
          <button class="primary" id="friendAccept" type="button">랭킹에 추가</button>
          <button class="ghost-btn" data-close type="button">나중에</button>
        </div>
      </div>`);
    const preview = modal.root.querySelector('#friendPreview');
    try {
      const parsed = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4)));
      const icon = (TIERS.find(t => t.id === parsed.ti) || {}).icon || '🥉';
      preview.innerHTML = `${parsed.e || '🙂'} <b>${escapeHtml(parsed.n || '친구')}</b> · 이번 주 ${fmt(parsed.x || 0)} XP · 🔥${parsed.s || 0}일 · ${icon}`;
    } catch (e) {
      preview.innerHTML = '코드를 읽지 못했어요.';
    }
    modal.root.querySelector('#friendAccept').addEventListener('click', () => {
      try {
        const f = addFriendByCode(code);
        toast(`${f.name} 님을 랭킹에 추가했어요`, 'xp');
        modal.close();
        renderLeague();
        history.replaceState(null, '', location.pathname);
      } catch (e) {
        toast(e.message || '추가하지 못했어요.', 'err');
      }
    });
  } catch (e) { /* noop */ }
}
