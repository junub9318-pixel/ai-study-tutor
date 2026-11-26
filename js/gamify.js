/* =========================================================
   gamify.js — XP · 스트릭 · 리그 티어 · 배지 · 친구 랭킹
   ========================================================= */
import { K, load, save, dayKey, shiftDay, weekStartKey, fmt, toast, state } from './core.js?v=783d5ca2';

export const TIERS = [
  { id: 'bronze',   name: '브론즈',     icon: '🥉', min: 0,    next: 100,  color: '#c98a5b' },
  { id: 'silver',   name: '실버',       icon: '🥈', min: 100,  next: 250,  color: '#b9c2cf' },
  { id: 'gold',     name: '골드',       icon: '🥇', min: 250,  next: 500,  color: '#f4c451' },
  { id: 'sapphire', name: '사파이어',   icon: '💎', min: 500,  next: 900,  color: '#5b8def' },
  { id: 'ruby',     name: '루비',       icon: '❤️‍🔥', min: 900,  next: 1500, color: '#ef5b6b' },
  { id: 'diamond',  name: '다이아몬드', icon: '💠', min: 1500, next: null, color: '#7ee0ff' },
];

const COUNTER_DEFAULTS = {
  turns: 0, quizAnswered: 0, quizCorrect: 0, quizSets: 0, exams: 0,
  cards: 0, podcasts: 0, sims: 0, oral: 0, plans: 0, tasksDone: 0, dailyDone: 0, friends: 0,
};

function defaultProfile() {
  return {
    nick: '', emoji: '🐣',
    xpTotal: 0,
    daily: {},            // 'YYYY-MM-DD' -> xp
    streak: 0, best: 0,
    lastGoal: '',         // 마지막으로 일일 목표를 달성한 날
    counters: { ...COUNTER_DEFAULTS },
    badges: {},           // id -> 'YYYY-MM-DD'
    createdAt: new Date().toISOString(),
  };
}

let _profile = load(K.profile, null);
function ensure() {
  if (!_profile || typeof _profile !== 'object') _profile = defaultProfile();
  _profile.counters = Object.assign({ ...COUNTER_DEFAULTS }, _profile.counters || {});
  _profile.daily = _profile.daily || {};
  _profile.badges = _profile.badges || {};
  return _profile;
}
export function profile() { return ensure(); }
function persist() { save(K.profile, _profile); }

/* ---------------- XP / streak ---------------- */
export function xpToday() {
  const p = ensure();
  return p.daily[dayKey()] || 0;
}
export function goal() { return Number(state.settings.dailyGoal) || 50; }
export function setGoal(n) {
  state.settings.dailyGoal = Number(n) || 50;
  save(K.settings, state.settings);
  evalStreak();
  emit();
}
export function weeklyXP() {
  const p = ensure();
  let start = weekStartKey();
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(start, i);
    sum += p.daily[d] || 0;
  }
  return sum;
}
export function dailySeries(days = 7) {
  const p = ensure();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDay(dayKey(), -i);
    out.push({ date: d, xp: p.daily[d] || 0 });
  }
  return out;
}
export function currentStreak() {
  const p = ensure();
  if (!p.lastGoal) return 0;
  const today = dayKey();
  if (p.lastGoal === today || p.lastGoal === shiftDay(today, -1)) return p.streak;
  return 0;
}
export function bestStreak() { return ensure().best; }
export function totalXP() { return ensure().xpTotal; }

export function tierFor(xp) {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (xp >= TIERS[i].min) idx = i;
  const t = TIERS[idx];
  const span = t.next == null ? 0 : t.next - t.min;
  const pct = t.next == null ? 100 : Math.max(0, Math.min(100, Math.round(((xp - t.min) / span) * 100)));
  return {
    ...t, index: idx,
    progress: pct,
    remaining: t.next == null ? 0 : Math.max(0, t.next - xp),
  };
}

function evalStreak(silent = false) {
  const p = ensure();
  const today = dayKey();
  if ((p.daily[today] || 0) < goal()) return false;
  if (p.lastGoal === today) return false;
  const prev = shiftDay(today, -1);
  p.streak = p.lastGoal === prev ? (p.streak || 0) + 1 : 1;
  p.lastGoal = today;
  p.best = Math.max(p.best || 0, p.streak);
  if (!silent) {
    if (p.streak > 1) toast(`🔥 ${p.streak}일 연속 학습!`, 'streak', 3000);
    else toast('🔥 오늘 목표 달성! 연속 학습 시작', 'streak', 3000);
  }
  return true;
}

export function awardXP(amount, reason = '') {
  const n = Math.round(Number(amount) || 0);
  if (!n) return;
  const p = ensure();
  const today = dayKey();
  p.xpTotal = (p.xpTotal || 0) + n;
  p.daily[today] = (p.daily[today] || 0) + n;
  evalStreak();
  persist();
  toast(`+${n} XP${reason ? ' · ' + reason : ''}`, 'xp', 1600);
  checkBadges();
  emit();
}

export function bump(key, n = 1) {
  const p = ensure();
  p.counters[key] = (p.counters[key] || 0) + n;
  persist();
  checkBadges();
  emit();
}

/** 여러 XP를 한 번에, 토스트 한 번으로 */
export function awardBulk(amount, reason = '') {
  const n = Math.round(Number(amount) || 0);
  if (!n) return;
  const p = ensure();
  const today = dayKey();
  p.xpTotal = (p.xpTotal || 0) + n;
  p.daily[today] = (p.daily[today] || 0) + n;
  evalStreak();
  persist();
  toast(`+${n} XP${reason ? ' · ' + reason : ''}`, 'xp', 1600);
  checkBadges();
  emit();
}

/* ---------------- badges ---------------- */
export const BADGES = [
  { id: 'first_ask', icon: '💬', name: '첫 질문', desc: '튜터에게 첫 질문', check: p => p.counters.turns >= 1 },
  { id: 'streak3',   icon: '🔥', name: '3일 연속', desc: '3일 연속 목표 달성', check: p => (p.best || 0) >= 3 },
  { id: 'streak7',   icon: '📅', name: '일주일 개근', desc: '7일 연속 학습', check: p => (p.best || 0) >= 7 },
  { id: 'streak30',  icon: '🏆', name: '한 달 개근', desc: '30일 연속 학습', check: p => (p.best || 0) >= 30 },
  { id: 'goal1',     icon: '🎯', name: '목표 달성', desc: '하루 목표를 처음 달성', check: p => !!p.lastGoal },
  { id: 'quiz10',    icon: '✅', name: '퀴즈 10문제', desc: '퀴즈에서 10문제 정답', check: p => p.counters.quizCorrect >= 10 },
  { id: 'quiz50',    icon: '📝', name: '퀴즈 50문제', desc: '퀴즈에서 50문제 정답', check: p => p.counters.quizCorrect >= 50 },
  { id: 'exam1',     icon: '⏱️', name: '모의고사 첫 응시', desc: '시간제한 모의고사 완료', check: p => p.counters.exams >= 1 },
  { id: 'cards50',   icon: '🃏', name: '카드 50장', desc: '플래시카드 50장 복습', check: p => p.counters.cards >= 50 },
  { id: 'pod1',      icon: '🎧', name: '오디오 학습', desc: '복습 팟캐스트 생성', check: p => p.counters.podcasts >= 1 },
  { id: 'sim5',      icon: '🔬', name: '실험실 탐험가', desc: '시뮬레이션 5회 조작', check: p => p.counters.sims >= 5 },
  { id: 'oral1',     icon: '🎤', name: '말로 설명하기', desc: '구술 시험 1회 완료', check: p => p.counters.oral >= 1 },
  { id: 'silver',    icon: '🥈', name: '실버 리그', desc: '주간 실버 리그 도달', check: () => tierFor(weeklyXP()).index >= 1 },
  { id: 'gold',      icon: '🥇', name: '골드 리그', desc: '주간 골드 리그 도달', check: () => tierFor(weeklyXP()).index >= 2 },
  { id: 'xp1000',    icon: '⚡', name: 'XP 1000', desc: '누적 1,000 XP', check: p => p.xpTotal >= 1000 },
  { id: 'friend1',   icon: '🤝', name: '친구와 함께', desc: '친구를 랭킹에 추가', check: p => p.counters.friends >= 1 },
  { id: 'daily7',    icon: '🎁', name: '챌린지 7회', desc: '데일리 챌린지 7회 완료', check: p => p.counters.dailyDone >= 7 },
];

export function unlockedBadges() {
  const p = ensure();
  return BADGES.filter(b => {
    try { return !!b.check(p); } catch (e) { return false; }
  });
}
export function isBadgeOn(id) {
  return !!ensure().badges[id];
}

export function checkBadges(silent = false) {
  const p = ensure();
  let changed = false;
  for (const b of BADGES) {
    if (p.badges[b.id]) continue;
    let ok = false;
    try { ok = !!b.check(p); } catch (e) { ok = false; }
    if (ok) {
      p.badges[b.id] = new Date().toISOString();
      changed = true;
      if (!silent) toast(`🏅 배지 획득: ${b.name}`, 'xp', 2400);
    }
  }
  if (changed) persist();
  return changed;
}

/* ---------------- friends & share code ---------------- */
export function friends() {
  const list = load(K.friends, []);
  return Array.isArray(list) ? list : [];
}
function saveFriends(list) { save(K.friends, list); }

export function mySharePayload() {
  const p = ensure();
  const t = tierFor(weeklyXP());
  return {
    v: 1,
    n: p.nick || '친구',
    e: p.emoji || '🐣',
    w: weekStartKey(),
    x: weeklyXP(),
    s: currentStreak(),
    t: p.xpTotal || 0,
    ti: t.id,
    c: (p.counters.quizAnswered || 0) + (p.counters.turns || 0) + (p.counters.cards || 0),
  };
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(code) {
  const s = String(code).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function myCode() { return b64encode(JSON.stringify(mySharePayload())); }
export function myLink() {
  const base = location.origin + location.pathname;
  return `${base}?friend=${myCode()}`;
}
export function parseShare(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('코드가 비어 있어요.');
  const m = raw.match(/[?&]friend=([^&\s]+)/);
  if (m) raw = decodeURIComponent(m[1]);
  else if (/^https?:\/\//.test(raw)) throw new Error('링크에서 friend 코드를 찾지 못했어요.');
  let json;
  try { json = JSON.parse(b64decode(raw)); } catch (e) { throw new Error('코드를 읽지 못했어요. 복사한 그대로 붙여넣어 주세요.'); }
  if (!json || json.v !== 1 || !json.n) throw new Error('이 앱의 친구 코드가 아니에요.');
  return {
    name: String(json.n).slice(0, 16),
    emoji: json.e || '🙂',
    weekKey: json.w || '',
    weeklyXP: Math.max(0, Number(json.x) || 0),
    streak: Math.max(0, Number(json.s) || 0),
    totalXP: Math.max(0, Number(json.t) || 0),
    tierId: json.ti || 'bronze',
    code: raw,
    addedAt: new Date().toISOString(),
  };
}

export function addFriendByCode(input) {
  const f = parseShare(input);
  const list = friends();
  if (list.some(x => x.name === f.name && x.code === f.code)) throw new Error('이미 추가된 친구예요.');
  const idx = list.findIndex(x => x.name === f.name);
  if (idx >= 0) list[idx] = f; else list.push(f);
  saveFriends(list);
  bump('friends');
  emit();
  return f;
}
export function removeFriend(code) {
  const list = friends().filter(f => f.code !== code);
  saveFriends(list);
  emit();
}

/* ---------------- leaderboard ---------------- */
export function leaderboard() {
  const p = ensure();
  const wx = weeklyXP();
  const rows = [{
    id: 'me', me: true,
    name: p.nick || '나', emoji: p.emoji || '🐣',
    weeklyXP: wx, streak: currentStreak(), tier: tierFor(wx),
  }];
  for (const f of friends()) {
    rows.push({
      id: f.code, friend: true,
      name: f.name, emoji: f.emoji, weeklyXP: f.weeklyXP, streak: f.streak,
      tier: tierFor(f.weeklyXP), stale: !!(f.weekKey && f.weekKey !== weekStartKey()),
    });
  }
  rows.sort((a, b) => (b.weeklyXP - a.weeklyXP) || (b.streak - a.streak) || a.name.localeCompare(b.name));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function emit() {
  document.dispatchEvent(new CustomEvent('gamify:update'));
}

/* ---------------- header chips ---------------- */
export function renderHeaderChips() {
  const s = document.getElementById('streakChip');
  const x = document.getElementById('xpChipText');
  const st = currentStreak();
  if (s) s.textContent = String(st);
  if (x) x.textContent = fmt(weeklyXP());
  const tier = document.getElementById('tbTier');
  if (tier) tier.textContent = tierFor(weeklyXP()).icon;
}

document.addEventListener('gamify:update', renderHeaderChips);
