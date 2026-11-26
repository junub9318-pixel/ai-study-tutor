/* =========================================================
   sim.js — 인터랙티브 개념 시뮬레이션 (내장 + AI 생성)
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, generateText, currentSubject, uid, toast,
} from './core.js?v=422ee01a';
import { loading, setStatus, errorStatus, toastCopy } from './ui.js?v=422ee01a';
import { awardXP, bump } from './gamify.js?v=422ee01a';

const el = (id) => document.getElementById(id);
let currentSim = 'quadratic';
let vals = {};
let anim = null;
let awarded = new Set();

/* ---------------- canvas helpers ---------------- */
function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(280, rect.width || canvas.parentElement.clientWidth || 600);
  const h = Math.max(180, rect.height || 300);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function colors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue('--text').trim() || '#e9edf9',
    muted: cs.getPropertyValue('--muted').trim() || '#93a0bd',
    border: cs.getPropertyValue('--border').trim() || '#263152',
    accent: cs.getPropertyValue('--accent').trim() || '#6d8bff',
    mint: cs.getPropertyValue('--mint').trim() || '#35d3b0',
    danger: cs.getPropertyValue('--danger').trim() || '#ff6b7d',
    warn: cs.getPropertyValue('--warn').trim() || '#f6b756',
  };
}
function grid(ctx, w, h, map) {
  const c = colors();
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.border;
  ctx.globalAlpha = 0.5;
  const { xmin, xmax, ymin, ymax } = map;
  for (let x = Math.ceil(xmin); x <= xmax; x++) {
    const px = map.X(x);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (let y = Math.ceil(ymin); y <= ymax; y++) {
    const py = map.Y(y);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1.6;
  if (map.Y(0) >= 0 && map.Y(0) <= h) { ctx.beginPath(); ctx.moveTo(0, map.Y(0)); ctx.lineTo(w, map.Y(0)); ctx.stroke(); }
  if (map.X(0) >= 0 && map.X(0) <= w) { ctx.beginPath(); ctx.moveTo(map.X(0), 0); ctx.lineTo(map.X(0), h); ctx.stroke(); }
  ctx.fillStyle = c.muted;
  ctx.font = '11px sans-serif';
  ctx.fillText('x', w - 14, map.Y(0) - 6);
  ctx.fillText('y', map.X(0) + 6, 14);
  ctx.restore();
}
function makeMap(w, h, xmin, xmax, ymin, ymax, pad = 26) {
  return {
    xmin, xmax, ymin, ymax,
    X: (x) => pad + ((x - xmin) / (xmax - xmin)) * (w - pad * 2),
    Y: (y) => h - pad - ((y - ymin) / (ymax - ymin)) * (h - pad * 2),
  };
}
function curve(ctx, map, fn, color, width = 2.6) {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const steps = 480;
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const x = map.xmin + (i / steps) * (map.xmax - map.xmin);
    const y = fn(x);
    if (!Number.isFinite(y)) { started = false; continue; }
    const px = map.X(x), py = map.Y(Math.max(map.ymin - 5, Math.min(map.ymax + 5, y)));
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}
function dot(ctx, map, x, y, color, r = 5) {
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(map.X(x), map.Y(y), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------------- built-in sims ---------------- */
const SIMS = {
  quadratic: {
    title: '이차함수 $y = ax^2 + bx + c$',
    desc: '계수를 바꾸며 그래프의 폭, 축, 꼭짓점이 어떻게 움직이는지 보세요.',
    controls: [
      { key: 'a', label: 'a (이차항)', min: -2, max: 2, step: 0.1, value: 1 },
      { key: 'b', label: 'b (일차항)', min: -6, max: 6, step: 0.2, value: 0 },
      { key: 'c', label: 'c (상수항)', min: -8, max: 8, step: 0.5, value: 0 },
    ],
    draw(ctx, w, h, v) {
      const map = makeMap(w, h, -7, 7, -9, 9);
      grid(ctx, w, h, map);
      const c = colors();
      curve(ctx, map, (x) => v.a * x * x + v.b * x + v.c, c.accent);
      if (Math.abs(v.a) > 1e-6) {
        const vx = -v.b / (2 * v.a), vy = v.a * vx * vx + v.b * vx + v.c;
        dot(ctx, map, vx, vy, c.mint, 5);
        ctx.save();
        ctx.strokeStyle = c.mint; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(map.X(vx), 0); ctx.lineTo(map.X(vx), h); ctx.stroke();
        ctx.restore();
      }
      const D = v.b * v.b - 4 * v.a * v.c;
      if (Math.abs(v.a) > 1e-6 && D >= 0) {
        const r1 = (-v.b + Math.sqrt(D)) / (2 * v.a), r2 = (-v.b - Math.sqrt(D)) / (2 * v.a);
        if (Math.abs(r1) < 20) dot(ctx, map, r1, 0, c.warn, 4.5);
        if (Math.abs(r2) < 20) dot(ctx, map, r2, 0, c.warn, 4.5);
      }
      if (Math.abs(v.a) < 1e-6) {
        ctx.save(); ctx.fillStyle = c.muted; ctx.font = '12px sans-serif';
        ctx.fillText('a = 0 이면 일차함수(직선)가 됩니다', 14, 20); ctx.restore();
      }
    },
    readout(v) {
      const D = v.b * v.b - 4 * v.a * v.c;
      const vx = Math.abs(v.a) > 1e-6 ? -v.b / (2 * v.a) : null;
      const vy = vx != null ? v.a * vx * vx + v.b * vx + v.c : null;
      const roots = Math.abs(v.a) > 1e-6 && D >= 0
        ? `${((-v.b - Math.sqrt(D)) / (2 * v.a)).toFixed(2)}, ${((-v.b + Math.sqrt(D)) / (2 * v.a)).toFixed(2)}`
        : '없음(실근 X)';
      return [
        ['판별식 D', D.toFixed(2)],
        ['축', vx != null ? `x = ${vx.toFixed(2)}` : '—'],
        ['꼭짓점', vy != null ? `(${vx.toFixed(2)}, ${vy.toFixed(2)})` : '—'],
        ['근', roots],
        ['모양', Math.abs(v.a) > 1 ? '좁다' : Math.abs(v.a) < 1 ? '넓다' : '기본'],
      ];
    },
  },

  trig: {
    title: '삼각함수 $y = A\\sin(Bx + C) + D$',
    desc: '진폭 A, 주기 2π/B, 위상 C, 평행이동 D가 그래프에 미치는 영향을 확인하세요.',
    controls: [
      { key: 'A', label: 'A (진폭)', min: 0.2, max: 3, step: 0.1, value: 1 },
      { key: 'B', label: 'B (주기)', min: 0.2, max: 4, step: 0.1, value: 1 },
      { key: 'C', label: 'C (위상, rad)', min: -3.2, max: 3.2, step: 0.1, value: 0 },
      { key: 'D', label: 'D (평행이동)', min: -3, max: 3, step: 0.1, value: 0 },
    ],
    draw(ctx, w, h, v) {
      const map = makeMap(w, h, -7, 7, -4.5, 4.5);
      grid(ctx, w, h, map);
      const c = colors();
      curve(ctx, map, (x) => v.A * Math.sin(v.B * x + v.C) + v.D, c.accent);
      ctx.save();
      ctx.strokeStyle = c.border; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, map.Y(v.D)); ctx.lineTo(w, map.Y(v.D)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, map.Y(v.D + v.A)); ctx.lineTo(w, map.Y(v.D + v.A)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, map.Y(v.D - v.A)); ctx.lineTo(w, map.Y(v.D - v.A)); ctx.stroke();
      ctx.restore();
    },
    readout(v) {
      const period = (2 * Math.PI) / Math.abs(v.B);
      const phase = -v.C / v.B;
      return [
        ['진폭 |A|', Math.abs(v.A).toFixed(2)],
        ['주기 2π/B', period.toFixed(2)],
        ['최댓값', (v.D + v.A).toFixed(2)],
        ['최솟값', (v.D - v.A).toFixed(2)],
        ['위상 이동', `${phase.toFixed(2)} rad`],
      ];
    },
  },

  projectile: {
    title: '포물선 운동',
    desc: '던지는 속도와 각도를 바꿔 최고점·도달거리·비행시간이 어떻게 달라지는지 보세요.',
    controls: [
      { key: 'v0', label: '처음 속도 v₀ (m/s)', min: 5, max: 40, step: 1, value: 20 },
      { key: 'angle', label: '발사 각도 (°)', min: 10, max: 80, step: 1, value: 45 },
      { key: 'g', label: '중력 g (m/s²)', min: 1.6, max: 20, step: 0.1, value: 9.8 },
    ],
    animate: true,
    reset(v) { return { t: 0, playing: true }; },
    draw(ctx, w, h, v, a) {
      const rad = (v.angle * Math.PI) / 180;
      const vx = v.v0 * Math.cos(rad), vy = v.v0 * Math.sin(rad);
      const T = (2 * vy) / v.g;
      const range = vx * T;
      const maxH = (vy * vy) / (2 * v.g);
      const xmax = Math.max(5, range * 1.15);
      const ymax = Math.max(2, maxH * 1.3);
      const c = colors();
      const padL = 34, padB = 30;
      const X = (x) => padL + (x / xmax) * (w - padL - 18);
      const Y = (y) => h - padB - (y / ymax) * (h - padB - 18);
      ctx.save();
      ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.globalAlpha = .45;
      for (let x = 0; x <= xmax; x += Math.max(1, Math.round(xmax / 8))) {
        ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h - padB); ctx.stroke();
      }
      for (let y = 0; y <= ymax; y += Math.max(1, Math.round(ymax / 6))) {
        ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(w - 8, Y(y)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.muted; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - 8, Y(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, 8); ctx.lineTo(padL, Y(0)); ctx.stroke();
      ctx.fillStyle = c.muted; ctx.font = '10px sans-serif';
      ctx.fillText(`${xmax.toFixed(0)}m`, w - 42, Y(0) + 16);
      ctx.fillText(`${ymax.toFixed(0)}m`, 4, Y(ymax) + 10);

      // 궤적
      ctx.beginPath();
      ctx.strokeStyle = c.border; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * T;
        const x = vx * t, y = vy * t - 0.5 * v.g * t * t;
        const px = X(x), py = Y(Math.max(0, y));
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);

      // 지나온 궤적
      const tNow = Math.min(a.t, T);
      ctx.beginPath(); ctx.strokeStyle = c.accent; ctx.lineWidth = 2.8;
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * tNow;
        const x = vx * t, y = vy * t - 0.5 * v.g * t * t;
        const px = X(x), py = Y(Math.max(0, y));
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();

      const bx = vx * tNow, by = Math.max(0, vy * tNow - 0.5 * v.g * tNow * tNow);
      ctx.beginPath(); ctx.fillStyle = c.mint;
      ctx.arc(X(bx), Y(by), 7, 0, Math.PI * 2); ctx.fill();
      // 최고점 표시
      if (tNow > T / 2) {
        ctx.beginPath(); ctx.strokeStyle = c.warn; ctx.lineWidth = 1.4;
        ctx.arc(X(range / 2), Y(maxH), 4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = c.warn; ctx.font = '10px sans-serif';
        ctx.fillText(`최고점 ${maxH.toFixed(1)}m`, Math.min(w - 100, X(range / 2) + 6), Y(maxH) - 6);
      }
      ctx.restore();
    },
    readout(v) {
      const rad = (v.angle * Math.PI) / 180;
      const vy = v.v0 * Math.sin(rad), vx = v.v0 * Math.cos(rad);
      const T = (2 * vy) / v.g;
      return [
        ['비행 시간', `${T.toFixed(2)}s`],
        ['최고점', `${((vy * vy) / (2 * v.g)).toFixed(2)}m`],
        ['수평 도달', `${(vx * T).toFixed(2)}m`],
        ['수평 속도', `${vx.toFixed(2)}m/s`],
      ];
    },
  },

  normal: {
    title: '정규분포',
    desc: '평균 μ와 표준편차 σ를 바꾸며 곡선의 위치와 퍼짐, 68·95·99.7 법칙을 확인하세요.',
    controls: [
      { key: 'mu', label: '평균 μ', min: -4, max: 4, step: 0.1, value: 0 },
      { key: 'sigma', label: '표준편차 σ', min: 0.3, max: 3, step: 0.1, value: 1 },
    ],
    draw(ctx, w, h, v) {
      const map = makeMap(w, h, v.mu - 4 * v.sigma - 1, v.mu + 4 * v.sigma + 1, 0, 0.45);
      grid(ctx, w, h, map);
      const c = colors();
      const f = (x) => (1 / (v.sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - v.mu) ** 2) / (2 * v.sigma * v.sigma));
      // ±1σ 영역
      ctx.save();
      const x1 = map.X(v.mu - v.sigma), x2 = map.X(v.mu + v.sigma);
      ctx.beginPath();
      ctx.moveTo(x1, map.Y(0));
      for (let i = 0; i <= 100; i++) {
        const x = v.mu - v.sigma + (2 * v.sigma * i) / 100;
        ctx.lineTo(map.X(x), map.Y(f(x)));
      }
      ctx.lineTo(x2, map.Y(0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(109,139,255,.22)';
      ctx.fill();
      ctx.restore();
      curve(ctx, map, f, c.accent, 2.8);
      ctx.save();
      ctx.strokeStyle = c.mint; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(map.X(v.mu), map.Y(0)); ctx.lineTo(map.X(v.mu), map.Y(f(v.mu))); ctx.stroke();
      ctx.restore();
      dot(ctx, map, v.mu, f(v.mu), c.mint, 4.5);
    },
    readout(v) {
      const p = (k) => (2 * (0.5 * (1 + erf(k / Math.SQRT2))) - 1) * 100;
      return [
        ['평균', v.mu.toFixed(1)],
        ['표준편차', v.sigma.toFixed(1)],
        ['μ±1σ', `${p(1).toFixed(1)}%`],
        ['μ±2σ', `${p(2).toFixed(1)}%`],
        ['μ±3σ', `${p(3).toFixed(1)}%`],
      ];
    },
  },
};

function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/* ---------------- render ---------------- */
function renderSimChips() {
  el('simChips').innerHTML = Object.entries(SIMS).map(([id, s]) =>
    `<button class="sim-chip ${id === currentSim ? 'on' : ''}" data-sim="${id}" type="button">${stripTex(s.title)}</button>`).join('');
  el('simChips').querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => loadSim(b.dataset.sim)));
}
function stripTex(s) {
  return String(s)
    .replace(/\\(sin|cos|tan|log|ln|lim|sum|int)/g, '$1')
    .replace(/\\cdot/g, '·')
    .replace(/\$/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ');
}

function loadSim(id) {
  currentSim = id;
  const sim = SIMS[id];
  if (!sim) return;
  vals = {};
  sim.controls.forEach(c => { vals[c.key] = c.value; });
  el('simTitle').textContent = stripTex(sim.title);
  el('simDesc').textContent = sim.desc;
  renderSimChips();
  el('simControls').innerHTML = sim.controls.map(c => `
    <label class="slider">
      <span class="s-row"><span>${c.label}</span><b data-val="${c.key}">${vals[c.key]}</b></span>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${vals[c.key]}" data-key="${c.key}" />
    </label>`).join('') + (sim.animate ? `<div class="slider" style="justify-content:flex-end"><button class="ghost-btn small" id="simReplay" type="button">↻ 다시 던지기</button></div>` : '');

  el('simControls').querySelectorAll('input[type="range"]').forEach(inp => {
    inp.addEventListener('input', () => {
      vals[inp.dataset.key] = Number(inp.value);
      const label = el('simControls').querySelector(`[data-val="${inp.dataset.key}"]`);
      if (label) label.textContent = inp.value;
      if (sim.animate && anim) { anim = sim.reset(vals); }
      drawCurrent();
      awardSimOnce();
    });
  });
  const replay = el('simReplay');
  if (replay) replay.addEventListener('click', () => { anim = sim.reset(vals); drawCurrent(); });

  anim = sim.animate ? sim.reset(vals) : null;
  drawCurrent();
  renderReadout();
  startLoop();
}

function drawCurrent() {
  const sim = SIMS[currentSim];
  const canvas = el('simCanvas');
  if (!sim || !canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  try { sim.draw(ctx, w, h, vals, anim); } catch (e) { console.error(e); }
}

function renderReadout() {
  const sim = SIMS[currentSim];
  const host = el('simReadout');
  if (!sim || !host) return;
  try {
    host.innerHTML = sim.readout(vals).map(([k, v]) => `<span class="readout-pill">${k} <b>${v}</b></span>`).join('');
  } catch (e) { host.innerHTML = ''; }
}

let rafId = null;
let lastT = 0;
function startLoop() {
  cancelAnimationFrame(rafId);
  lastT = performance.now();
  const loop = (t) => {
    const sim = SIMS[currentSim];
    if (!sim) return;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (sim.animate && anim && anim.playing) {
      const rad = (vals.angle * Math.PI) / 180;
      const T = (2 * vals.v0 * Math.sin(rad)) / vals.g;
      anim.t += dt * 1.4;
      if (anim.t > T + 0.6) anim.t = 0;
      drawCurrent();
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function awardSimOnce() {
  const key = currentSim + dayKeyLocal();
  if (awarded.has(key)) return;
  awarded.add(key);
  awardXP(3, '실험실 탐구');
  bump('sims');
}
function dayKeyLocal() { return new Date().toISOString().slice(0, 10); }

/* ---------------- AI 시뮬레이션 ---------------- */
function extractHtml(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.search(/<!doctype html|<html/i);
  if (start < 0) return '';
  s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf('</html>');
  if (end > 0) s = s.slice(0, end + 7);
  return s;
}

async function generateSim() {
  const prompt = (el('simPrompt').value || '').trim();
  const status = el('simStatus');
  if (!prompt) { setStatus(status, '궁금한 개념을 적어 주세요.', 'err'); return; }
  if (!prompt.length) return;
  el('simGen').disabled = true;
  loading(status, '조작 가능한 시뮬레이션을 만드는 중… (20~40초)');
  try {
    const subject = currentSubject();
    const system = `너는 교육용 인터랙티브 시뮬레이션을 만드는 프런트엔드 개발자다.
학생이 개념을 직접 조작하며 이해할 수 있는 단일 HTML 문서를 만든다.
규칙:
- 완전한 HTML 문서 하나만 출력한다. <!doctype html>로 시작해 </html>로 끝난다.
- 설명, 인사, 마크다운, 코드펜스(\`\`\`)를 절대 넣지 않는다. 오직 HTML.
- 외부 리소스 금지: CDN, 웹폰트, 외부 이미지, 외부 스크립트 없이 인라인 CSS/JS만.
- canvas 또는 SVG로 시각화하고, range 슬라이더·버튼으로 변수를 조작하면 즉시 반영한다.
- 현재 값과 계산 결과를 숫자로 표시한다. 단위를 붙인다.
- 한국어 라벨. 모바일 화면에서도 넘치지 않게 반응형(min-width 고정 금지).
- 조작하면 왜 그렇게 변하는지 한 줄 설명(동적 문구)을 보여 준다.
- 과목: ${subject.label}. 학생은 고등학생이다. 개념을 정확히 반영한다.
- 다크 배경과 밝은 글자로 통일해도 되고, 흰 배경이어도 된다. 대비만 확보한다.`;
    const text = await generateText({
      system,
      parts: [{ text: `만들 시뮬레이션: ${prompt}\n\n위 개념을 직접 조작하며 이해할 수 있는 인터랙티브 HTML을 출력해.` }],
      temperature: 0.65,
      maxTokens: 8192,
    });
    const html = extractHtml(text);
    if (!html) throw new Error('시뮬레이션 코드를 받지 못했어요. 다시 시도해 주세요.');
    const item = { id: uid('sim'), prompt, subject: subject.label, html, createdAt: Date.now() };
    const list = load(K.sims, []);
    list.unshift(item);
    save(K.sims, list.slice(0, 12));
    showAiSim(item);
    renderSimLibrary();
    setStatus(status, null);
    awardXP(8, '맞춤 시뮬레이션');
    bump('sims');
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('simGen').disabled = false;
  }
}

function showAiSim(item) {
  el('aiSimWrap').hidden = false;
  el('aiSimTitle').textContent = item.prompt.length > 40 ? item.prompt.slice(0, 40) + '…' : item.prompt;
  const frame = el('simFrame');
  frame.srcdoc = item.html;
  el('simSourceBox').hidden = true;
  el('simSourceBox').textContent = item.html;
  el('aiSimWrap').dataset.id = item.id;
  el('aiSimWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSimLibrary() {
  const host = el('simLibrary');
  const list = load(K.sims, []);
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <h2 class="sect-title">내 시뮬레이션</h2>
    <div class="panel">
      ${list.map(s => `<div class="deck-item">
        <div class="d-main"><b>${escapeHtml(s.prompt)}</b><small>${escapeHtml(s.subject)} · ${new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</small></div>
        <button class="ghost-btn small" data-loadsim="${s.id}" type="button">열기</button>
        <button class="icon-btn" data-delsim="${s.id}" type="button" title="삭제">🗑️</button>
      </div>`).join('')}
    </div>`;
  host.querySelectorAll('[data-loadsim]').forEach(b => b.addEventListener('click', () => {
    const s = list.find(x => x.id === b.dataset.loadsim);
    if (s) showAiSim(s);
  }));
  host.querySelectorAll('[data-delsim]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 시뮬레이션을 삭제할까요?')) return;
    save(K.sims, load(K.sims, []).filter(x => x.id !== b.dataset.delsim));
    renderSimLibrary();
  }));
}

/* ---------------- init ---------------- */
export function initSim() {
  document.querySelectorAll('#labSeg .seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      const ai = b.dataset.lab === 'ai';
      document.querySelectorAll('#labSeg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      el('labBuiltin').hidden = ai;
      el('labAI').hidden = !ai;
      if (!ai) drawCurrent();
    });
  });
  el('simGen').addEventListener('click', generateSim);
  el('simPrompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); generateSim(); } });
  el('simReload').addEventListener('click', () => {
    const id = el('aiSimWrap').dataset.id;
    const item = load(K.sims, []).find(x => x.id === id);
    if (item) { el('simPrompt').value = item.prompt; generateSim(); }
  });
  el('simSource').addEventListener('click', () => {
    const box = el('simSourceBox');
    box.hidden = !box.hidden;
    if (!box.hidden) toastCopy(box.textContent, '코드를 복사했어요');
  });
  el('simSuggest').innerHTML = [
    '삼각함수 그래프에서 주기가 변하면?',
    '이차함수 판별식에 따라 근의 개수가 어떻게 달라질까?',
    '몰 농도와 부피의 관계',
    'DNA 염기쌍 결합 원리',
    '확률의 덧셈정리 시각화',
  ].map(t => `<button type="button" data-sug="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  el('simSuggest').querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => { el('simPrompt').value = b.dataset.sug; }));
  renderSimChips();
  loadSim('quadratic');
  renderSimLibrary();
  window.addEventListener('resize', () => {
    if (el('labBuiltin') && !el('labBuiltin').hidden) drawCurrent();
  });
  document.addEventListener('app:theme', () => { if (el('labBuiltin') && !el('labBuiltin').hidden) drawCurrent(); });
  onViewLab();
}

function onViewLab() {
  document.addEventListener('app:view', (e) => { if (e.detail === 'lab') setTimeout(drawCurrent, 60); });
}
