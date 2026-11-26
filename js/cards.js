/* =========================================================
   cards.js — 플래시카드 (앞/뒤 · 암기 상태 저장)
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, renderRich, generateJSON, CARDS_SCHEMA,
  currentSubject, materialContext, uid, toast,
} from './core.js?v=fa63af88';
import { loading, setStatus, errorStatus, renderMaterialPicker, selectedMaterials } from './ui.js?v=fa63af88';
import { awardXP, bump } from './gamify.js?v=fa63af88';

const STATUS = {
  unknown: { label: '모르겠음', icon: '❓', cls: 's0', xp: 2 },
  unsure: { label: '헷갈림', icon: '🤔', cls: 's1', xp: 2 },
  known: { label: '완벽히 암기', icon: '✨', cls: 's2', xp: 2 },
};

let matSel = new Set();
let deck = null;
let index = 0;
let flipped = false;
const el = (id) => document.getElementById(id);

function decks() { return load(K.decks, []); }
function saveDecks(list) { save(K.decks, list.slice(0, 15)); }

async function generateDeck() {
  const subject = currentSubject();
  const topic = (el('cardTopic').value || '').trim();
  const count = Number(el('cardCount').value || 12);
  const status = el('cardStatus');
  if (!topic && !matSel.size) { setStatus(status, '주제를 적거나 자료를 선택해 주세요.', 'err'); return; }
  el('cardGen').disabled = true;
  loading(status, '암기 카드를 만드는 중…');
  try {
    const system = `너는 한국 고등학생을 위한 암기 카드(플래시카드) 제작자다.
과목과 주제, 자료를 바탕으로 서로 다른 핵심 개념·용어·공식·연표를 카드로 만든다.
규칙:
- front는 질문 또는 용어 한 줄 (짧게, 30자 이내 권장).
- back는 답. 2~4줄, 필요하면 예시·공식 포함. 수식은 LaTeX($...$)로.
- hint는 기억을 돕는 짧은 힌트 한 줄(선택).
- 카드 수를 정확히 맞추고 중복 개념은 넣지 않는다.
- 한국어로 쓴다.`;
    const user = `과목: ${subject.label}
주제/단원: ${topic || '(자료 참고)'}
카드 수: ${count}
${materialContext(selectedMaterials(matSel))}`;
    const data = await generateJSON({ system, parts: [{ text: user }], schema: CARDS_SCHEMA, temperature: 0.55, maxTokens: 8192 });
    const cards = (data.cards || []).slice(0, count).map(c => ({
      id: uid('c'),
      front: String(c.front || '').trim(),
      back: String(c.back || '').trim(),
      hint: String(c.hint || '').trim(),
      status: 'new',
      reviews: 0,
    })).filter(c => c.front && c.back);
    if (!cards.length) throw new Error('카드를 만들지 못했어요. 주제를 더 구체적으로 적어 주세요.');

    const newDeck = {
      id: uid('dk'),
      subject: subject.label,
      subjectId: state.subject,
      title: String(data.title || topic || `${subject.label} 카드`).trim(),
      topic,
      cards,
      createdAt: Date.now(),
      lastStudied: 0,
      demo: false,
    };
    const list = decks();
    list.unshift(newDeck);
    saveDecks(list);
    setStatus(status, null);
    toast(`카드 ${cards.length}장을 만들었어요`, 'xp');
    startDeck(newDeck.id);
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('cardGen').disabled = false;
  }
}

/* ---------------- runner ---------------- */
function startDeck(deckId, onlyUnknown = false) {
  const list = decks();
  const found = list.find(d => d.id === deckId);
  if (!found) return;
  deck = found;
  if (onlyUnknown) {
    deck.cards = deck.cards.filter(c => c.status !== 'known');
    deck.cards.forEach(c => { c.status = 'new'; });
    saveDecks(list);
  }
  index = Math.max(0, deck.cards.findIndex(c => c.status === 'new'));
  if (index < 0) index = 0;
  flipped = false;
  el('cardsSetup').hidden = true;
  el('deckRunner').hidden = false;
  renderCard();
}

function deckStats(d) {
  return {
    known: d.cards.filter(c => c.status === 'known').length,
    unsure: d.cards.filter(c => c.status === 'unsure').length,
    unknown: d.cards.filter(c => c.status === 'unknown').length,
  };
}

function renderCard() {
  const host = el('deckRunner');
  if (!deck) return;
  const card = deck.cards[index];
  const stats = deckStats(deck);
  const done = deck.cards.filter(c => c.status !== 'new').length;
  host.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <button class="ghost-btn small" id="deckQuit" type="button">← 목록</button>
        <span>카드 ${index + 1} / ${deck.cards.length}</span>
        <span>✨ ${stats.known} · 🤔 ${stats.unsure} · ❓ ${stats.unknown}</span>
      </div>
      <div class="flash-card" id="flashCard">
        <div class="flash-inner">
          <div class="face front">
            <span class="f-label">앞면 · 문제</span>
            <div class="f-text">${renderRich(card.front)}</div>
            ${card.hint ? `<div class="f-hint">힌트: ${escapeHtml(card.hint)}</div>` : ''}
            <div class="f-hint" style="margin-top:auto;padding-top:14px">탭해서 정답 보기</div>
          </div>
          <div class="face back">
            <span class="f-label">뒷면 · 정답</span>
            <div class="f-text">${renderRich(card.back)}</div>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="flash-btn s0" data-st="unknown" type="button">❓ 모르겠음<small>다시 볼래요</small></button>
        <button class="flash-btn s1" data-st="unsure" type="button">🤔 헷갈림<small>조금 더</small></button>
        <button class="flash-btn s2" data-st="known" type="button">✨ 완벽히 암기<small>이제 알아요</small></button>
      </div>
      <div class="flash-nav">
        <button class="ghost-btn small" id="cardPrev" type="button" ${index === 0 ? 'disabled' : ''}>← 이전</button>
        <span class="sub">${done} / ${deck.cards.length} 복습 완료</span>
        <button class="ghost-btn small" id="cardNext" type="button" ${index >= deck.cards.length - 1 ? 'disabled' : ''}>다음 →</button>
      </div>
    </div>`;

  const cardEl = host.querySelector('#flashCard');
  cardEl.classList.toggle('flipped', flipped);
  cardEl.addEventListener('click', () => {
    flipped = !flipped;
    cardEl.classList.toggle('flipped', flipped);
  });
  host.querySelector('#deckQuit').addEventListener('click', quitDeck);
  host.querySelector('#cardPrev').addEventListener('click', () => { index = Math.max(0, index - 1); flipped = false; renderCard(); });
  host.querySelector('#cardNext').addEventListener('click', () => { index = Math.min(deck.cards.length - 1, index + 1); flipped = false; renderCard(); });
  host.querySelectorAll('[data-st]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setCardStatus(card, b.dataset.st);
    });
  });
}

function setCardStatus(card, status) {
  card.status = status;
  card.reviews = (card.reviews || 0) + 1;
  const list = decks();
  const d = list.find(x => x.id === deck.id);
  if (d) {
    const target = d.cards.find(c => c.id === card.id);
    if (target) { target.status = status; target.reviews = card.reviews; }
    d.lastStudied = Date.now();
    saveDecks(list);
  }
  awardXP(STATUS[status].xp, '카드 복습');
  bump('cards');
  flipped = false;
  const nextNew = deck.cards.findIndex((c, i) => i > index && c.status === 'new');
  if (nextNew >= 0) { index = nextNew; renderCard(); }
  else if (deck.cards.every(c => c.status !== 'new')) { finishDeck(); }
  else {
    const any = deck.cards.findIndex(c => c.status === 'new');
    if (any >= 0) { index = any; renderCard(); }
    else finishDeck();
  }
}

function finishDeck() {
  const stats = deckStats(deck);
  const host = el('deckRunner');
  const pct = Math.round((stats.known / Math.max(1, deck.cards.length)) * 100);
  host.innerHTML = `
    <div class="panel" style="max-width:640px;margin:16px auto">
      <div class="result-score">
        <div class="big">${pct}<small>%</small></div>
        <p>이번 덱 복습 완료 · 완벽히 암기 ${stats.known}장</p>
      </div>
      <div class="weak-list" style="justify-content:center">
        ${stats.unknown ? `<span class="weak-tag">❓ 모르겠음 ${stats.unknown}</span>` : ''}
        ${stats.unsure ? `<span class="weak-tag" style="background:rgba(246,183,86,.12);border-color:rgba(246,183,86,.35);color:#ffd08a">🤔 헷갈림 ${stats.unsure}</span>` : ''}
        ${stats.known ? `<span class="weak-tag" style="background:rgba(70,209,138,.12);border-color:rgba(70,209,138,.35);color:#9aebbd">✨ 완벽 ${stats.known}</span>` : ''}
      </div>
      <div class="row" style="justify-content:center">
        ${deck.cards.some(c => c.status !== 'known') ? `<button class="primary" id="retryWeak" type="button">모르는 카드만 다시</button>` : ''}
        <button class="ghost-btn" id="backList" type="button">목록으로</button>
      </div>
    </div>`;
  host.querySelector('#retryWeak')?.addEventListener('click', () => {
    const list = decks();
    const d = list.find(x => x.id === deck.id);
    if (!d) return;
    d.cards = d.cards.filter(c => c.status !== 'known');
    d.cards.forEach(c => { c.status = 'new'; });
    saveDecks(list);
    deck = d;
    index = 0; flipped = false;
    renderCard();
  });
  host.querySelector('#backList').addEventListener('click', quitDeck);
}

function quitDeck() {
  deck = null;
  el('deckRunner').hidden = true;
  el('cardsSetup').hidden = false;
  renderDeckList();
}

/* ---------------- deck list ---------------- */
function renderDeckList() {
  const host = el('deckList');
  const list = decks();
  if (!list.length) { host.innerHTML = ''; return; }
  host.innerHTML = `
    <h2 class="sect-title">내 카드 덱</h2>
    <div class="panel">
      ${list.map(d => {
        const s = deckStats(d);
        const pct = Math.round((s.known / Math.max(1, d.cards.length)) * 100);
        return `<div class="deck-item">
          <div class="d-main">
            <b>${escapeHtml(d.title)}</b>
            <small>${escapeHtml(d.subject)} · 카드 ${d.cards.length}장 · ✨ ${s.known} 🤔 ${s.unsure} ❓ ${s.unknown}</small>
            <div class="bar" style="height:5px;margin-top:6px"><i style="width:${pct}%"></i></div>
          </div>
          <button class="ghost-btn small" data-study="${d.id}" type="button">복습</button>
          <button class="icon-btn" data-deldeck="${d.id}" type="button" title="삭제">🗑️</button>
        </div>`;
      }).join('')}
    </div>`;
  host.querySelectorAll('[data-study]').forEach(b => b.addEventListener('click', () => startDeck(b.dataset.study)));
  host.querySelectorAll('[data-deldeck]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 카드 덱을 삭제할까요?')) return;
    saveDecks(decks().filter(d => d.id !== b.dataset.deldeck));
    renderDeckList();
  }));
}

/* ---------------- demo ---------------- */
function demoDeck() {
  const subject = currentSubject();
  const cards = [
    { front: '이차방정식의 근의 공식', back: '$x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$', hint: '분모가 2a' },
    { front: '판별식 $D$가 음수이면?', back: '실근이 없다. ($x^2+2x+5=0$ 처럼)', hint: '그래프가 x축과 만나지 않음' },
    { front: 'sin²θ + cos²θ', back: '$1$ (삼각함수 기본 항등식)', hint: '' },
    { front: '등차수열의 합 $S_n$', back: '$S_n = \\dfrac{n(a_1 + a_n)}{2}$', hint: '첫항+끝항 × 개수 ÷ 2' },
    { front: '미분계수의 정의', back: "$f'(a) = \\lim_{h \\to 0} \\dfrac{f(a+h) - f(a)}{h}$", hint: '평균변화율의 극한' },
    { front: '조선 건국 연도', back: '1392년 (태조 이성계)', hint: '고려 멸망 2년 뒤' },
  ].map(c => ({ ...c, id: uid('c'), status: 'new', reviews: 0 }));
  const d = {
    id: uid('dk'), subject: subject.label, subjectId: state.subject,
    title: `${subject.label} 예시 카드`, topic: '예시', cards, createdAt: Date.now(), lastStudied: 0, demo: true,
  };
  const list = decks();
  list.unshift(d);
  saveDecks(list);
  startDeck(d.id);
  toast('예시 카드예요. 탭해서 뒤집고 상태를 골라 보세요.');
}

/* ---------------- init ---------------- */
export function initCards() {
  el('cardGen').addEventListener('click', generateDeck);
  el('cardDemo').addEventListener('click', demoDeck);
  renderMaterialPicker(el('cardMats'), matSel);
  document.addEventListener('app:materials', () => renderMaterialPicker(el('cardMats'), matSel));
  renderDeckList();
}
