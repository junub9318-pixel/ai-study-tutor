/* =========================================================
   routine.js — 하루 학습 시간: 아이폰 타이머 휠 + 즉시 계산 추천
   · 30분 단위 · 최소 30분 ~ 최대 12시간
   · 온보딩 '하루 루틴' 단계와 설정 > 하루 학습 시간이 같은 컴포넌트를 쓴다
   ========================================================= */
import { dday } from './core.js?v=5b70a238';

export const STEP_MIN = 30;
export const MIN_MINUTES = 30;
export const MAX_MINUTES = 12 * 60;

const CELL = 40; // px — style.css의 .tw-cell 높이와 같아야 한다

/** 분 → "3시간 30분" */
export function minutesLabel(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/** 30분 단위로 반올림하고 30분~12시간 안으로 맞춘다 */
export function clampMinutes(value) {
  const n = Math.round((Number(value) || 0) / STEP_MIN) * STEP_MIN;
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, n));
}

/**
 * 시험 D-day · 목표 · 현재 수준 · 과목 수로 권장 시간을 바로 계산한다 (AI 없이 즉시).
 * @returns {{minutes:number, routine:string, reason:string}}
 */
export function recommendRoutine({ examDate, goalPct, levelSelf, subjectCount } = {}) {
  const dd = examDate ? Math.max(0, dday(examDate)) : 21;
  const goal = Number(goalPct) || 70;
  const count = Number(subjectCount) || 0;

  const base = goal >= 90 ? 120 : goal >= 70 ? 90 : 60;
  const urgency = dd <= 3 ? 120 : dd <= 7 ? 90 : dd <= 14 ? 60 : dd <= 28 ? 30 : 0;
  const level = levelSelf === '기초' ? 30 : levelSelf === '심화' ? 30 : 0;
  const subjects = Math.min(120, Math.max(0, count - 3) * 15);

  const minutes = clampMinutes(Math.min(360, base + urgency + level + subjects));
  const concept = Math.round((minutes * 0.4) / 5) * 5;
  const practice = Math.round((minutes * 0.4) / 5) * 5;
  const review = minutes - concept - practice;

  return {
    minutes,
    routine: `개념 ${concept}분 → 문제 ${practice}분 → 오답·암기 ${review}분`,
    reason: `시험 ${examDate ? `D-${dd}` : '미정'} · 목표 ${goal}% · ${levelSelf || '보통'} 수준${count ? ` · 과목 ${count}개` : ''}`,
  };
}

function wheelMarkup() {
  const hours = Array.from({ length: 13 }, (_, i) => i);
  const cellsH = hours.map(h => `<button class="tw-cell" type="button" role="option" aria-selected="false" data-v="${h}">${h}시간</button>`).join('');
  const cellsM = [0, 30].map(m => `<button class="tw-cell" type="button" role="option" aria-selected="false" data-v="${m}">${String(m).padStart(2, '0')}분</button>`).join('');
  return `
    <div class="tw-readout" aria-live="polite"></div>
    <div class="tw-frame">
      <div class="tw-band" aria-hidden="true"></div>
      <div class="tw-cols">
        <div class="tw-col" data-unit="h" role="listbox" aria-label="시간" tabindex="0">
          <div class="tw-pad" aria-hidden="true"></div>${cellsH}<div class="tw-pad" aria-hidden="true"></div>
        </div>
        <div class="tw-sep" aria-hidden="true">:</div>
        <div class="tw-col" data-unit="m" role="listbox" aria-label="분" tabindex="0">
          <div class="tw-pad" aria-hidden="true"></div>${cellsM}<div class="tw-pad" aria-hidden="true"></div>
        </div>
      </div>
      <div class="tw-fade tw-fade-top" aria-hidden="true"></div>
      <div class="tw-fade tw-fade-bot" aria-hidden="true"></div>
    </div>
    <p class="tw-hint">위아래로 넘겨 고르거나 숫자를 눌러도 돼요 · 30분 단위</p>`;
}

/**
 * 아이폰 시계/타이머 모양의 세로 휠 피커를 host에 만든다.
 * @param {HTMLElement} host
 * @param {{value?:number, onChange?:(minutes:number)=>void}} opts
 */
export function createTimerWheel(host, { value = 60, onChange } = {}) {
  if (!host) return null;
  let current = clampMinutes(value);
  host.classList.add('tw');
  host.innerHTML = wheelMarkup();

  const readout = host.querySelector('.tw-readout');
  const colH = host.querySelector('[data-unit="h"]');
  const colM = host.querySelector('[data-unit="m"]');
  const cellsH = Array.from(colH.querySelectorAll('.tw-cell'));
  const cellsM = Array.from(colM.querySelectorAll('.tw-cell'));
  const cellsOf = (unit) => (unit === 'h' ? cellsH : cellsM);
  const colOf = (unit) => (unit === 'h' ? colH : colM);

  /** 열 안에서 그 칸이 가운데 오는 scrollTop (실제 레이아웃 기준) */
  function cellTop(col, idx) {
    const cell = cellsOf(col === colH ? 'h' : 'm')[idx];
    if (!cell) return idx * CELL;
    return Math.max(0, cell.offsetTop + cell.offsetHeight / 2 - col.clientHeight / 2);
  }

  /** 지금 가운데 가장 가까운 칸의 인덱스 */
  function nearestIndex(col, unit) {
    const cells = cellsOf(unit);
    const center = col.scrollTop + col.clientHeight / 2;
    let best = 0;
    let bestD = Infinity;
    cells.forEach((c, i) => {
      const d = Math.abs(c.offsetTop + c.offsetHeight / 2 - center);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // 프로그램으로 옮기는 동안, 그리고 사용자가 직접 만지기 전에는 스크롤 위치를 값으로 반영하지 않는다
  let syncing = false;
  let interacted = false;
  let syncTimer = null;
  function hold(ms) {
    syncing = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncing = false; }, ms);
  }

  function paint() {
    const h = Math.floor(current / 60);
    const m = current % 60;
    host.dataset.value = String(current);
    if (readout) readout.textContent = minutesLabel(current);
    cellsH.forEach(c => {
      const on = Number(c.dataset.v) === h;
      c.classList.toggle('is-center', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    cellsM.forEach(c => {
      const v = Number(c.dataset.v);
      const on = v === m;
      const off = h === 12 && v === 30; // 12시간을 넘길 수 없다
      c.classList.toggle('is-center', on);
      c.disabled = off;
      c.setAttribute('aria-disabled', off ? 'true' : 'false');
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function scrollCol(unit, animate) {
    const col = colOf(unit);
    if (!col) return;
    const idx = unit === 'h' ? Math.floor(current / 60) : (current % 60) / 30;
    const top = cellTop(col, idx);
    hold(animate ? 520 : 120);
    if (Math.abs(col.scrollTop - top) < 2) return;
    try { col.scrollTo({ top, behavior: animate ? 'smooth' : 'auto' }); }
    catch (e) { col.scrollTop = top; }
  }

  function emit() {
    if (typeof onChange === 'function') onChange(current);
  }

  /** 30분 단위 값으로 맞추고 휠을 옮긴다 */
  function setValue(next, { animate = false, silent = false } = {}) {
    current = clampMinutes(next);
    paint();
    scrollCol('h', animate);
    scrollCol('m', animate);
    if (!silent) emit();
  }

  /** 인덱스 → 값 (30분 단위 · 0시간 0분 불가 · 12시간 넘김 불가) */
  function applyIndex(unit, idx) {
    const maxIdx = unit === 'h' ? 12 : 1;
    const i = Math.max(0, Math.min(maxIdx, idx));
    let h = unit === 'h' ? i : Math.floor(current / 60);
    let m = unit === 'm' ? i * 30 : current % 60;
    if (h === 12) m = 0;
    if (h === 0 && m === 0) m = 30;
    const next = h * 60 + m;
    if (next !== current) {
      current = next;
      paint();
      emit();
    }
  }

  /** 스크롤이 멈춘 열의 인덱스를 값으로 반영 */
  function commit(unit) {
    if (syncing) return;
    const col = colOf(unit);
    if (!col) return;
    applyIndex(unit, nearestIndex(col, unit));
    // 네이티브 스냅이 어긋났거나 보정이 필요하면 제자리로
    scrollCol('h', false);
    scrollCol('m', false);
  }

  ['h', 'm'].forEach(unit => {
    const col = colOf(unit);
    if (!col) return;
    const touch = () => { interacted = true; };
    col.addEventListener('pointerdown', touch, { passive: true });
    col.addEventListener('touchstart', touch, { passive: true });
    col.addEventListener('wheel', touch, { passive: true });
    col.addEventListener('keydown', () => { interacted = true; });
 
    let timer = null;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 처음 그려질 때 브라우저 스냅이 위치를 되돌리는 경우가 있어,
        // 사용자가 직접 만지기 전까지는 값 대신 위치만 다시 맞춘다
        if (!interacted) {
          syncing = false;
          scrollCol('h', false);
          scrollCol('m', false);
          return;
        }
        commit(unit);
      }, 90);
    };
    col.addEventListener('scroll', settle, { passive: true });
    col.addEventListener('scrollend', () => {
      if (!interacted) {
        if (!syncing) { syncing = false; scrollCol('h', false); scrollCol('m', false); }
        return;
      }
      commit(unit);
    });
    col.addEventListener('keydown', (e) => {
      const maxIdx = unit === 'h' ? 12 : 1;
      let idx = syncing ? (unit === 'h' ? Math.floor(current / 60) : (current % 60) / 30) : nearestIndex(col, unit);
      if (e.key === 'ArrowDown') idx += 1;
      else if (e.key === 'ArrowUp') idx -= 1;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = maxIdx;
      else return;
      e.preventDefault();
      interacted = true;
      idx = Math.max(0, Math.min(maxIdx, idx));
      applyIndex(unit, idx);
      syncing = false;
      col.scrollTo({ top: cellTop(col, idx), behavior: 'smooth' });
      hold(340);
    });
    cellsOf(unit).forEach(c => {
      c.addEventListener('click', () => {
        if (c.disabled) return;
        const v = Number(c.dataset.v);
        if (unit === 'h') {
          const m = v === 12 ? 0 : (current % 60);
          setValue(v * 60 + (v === 0 && m === 0 ? 30 : m), { animate: true });
        } else {
          if (Math.floor(current / 60) === 0 && v === 0) return; // 0시간 0분은 없다
          setValue(Math.floor(current / 60) * 60 + v, { animate: true });
        }
      });
    });
  });

  paint();
  // 첫 레이아웃·스냅이 자리를 잡은 뒤 위치를 맞춘다
  const apply = () => {
    syncing = false;
    if (!interacted) { scrollCol('h', false); scrollCol('m', false); }
  };
  requestAnimationFrame(apply);
  setTimeout(apply, 120);
  setTimeout(apply, 320);
  setTimeout(apply, 700);

  return {
    getValue: () => current,
    setValue: (v, o) => setValue(v, o),
    get el() { return host; },
  };
}
