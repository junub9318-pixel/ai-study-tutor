/* =========================================================
   plan.js — 시험 대비 학습 계획 (D-day · 체크리스트)
   ========================================================= */
import {
  K, state, load, save, $, escapeHtml, renderRich, generateJSON, PLAN_SCHEMA,
  currentSubject, materialContext, uid, toast, dayKey, dday, dateLabel, shiftDay,
} from './core.js?v=2ab59033';
import { loading, setStatus, errorStatus, renderMaterialPicker, selectedMaterials } from './ui.js?v=2ab59033';
import { awardXP, bump } from './gamify.js?v=2ab59033';

let matSel = new Set();
const el = (id) => document.getElementById(id);

function plans() { return load(K.plans, []); }
function savePlans(list) { save(K.plans, list.slice(0, 12)); }

async function generatePlan() {
  const subject = currentSubject();
  const dateVal = el('planDate').value;
  const scope = (el('planScope').value || '').trim();
  const minutes = Number(el('planMinutes').value || 60);
  const status = el('planStatus');

  if (!dateVal) { setStatus(status, '시험 날짜를 선택해 주세요.', 'err'); return; }
  const dd = dday(dateVal);
  if (dd < 0) { setStatus(status, '시험 날짜가 이미 지났어요. 미래 날짜를 선택해 주세요.', 'err'); return; }
  if (dd === 0) { setStatus(status, '오늘이 시험일이에요. 날짜를 다시 확인해 주세요.', 'err'); return; }
  if (!scope && !matSel.size) { setStatus(status, '시험 범위를 적거나 자료를 선택해 주세요.', 'err'); return; }

  el('planGen').disabled = true;
  loading(status, '시험 날짜에 맞춘 계획을 짜는 중…');
  try {
    const system = `너는 한국 고등학생의 시험 대비 학습 계획을 설계하는 학습 코치다.
입력으로 과목, 오늘 날짜, 시험 날짜, 남은 일수, 시험 범위, 하루 학습 가능 시간이 주어진다.
규칙:
- 오늘부터 시험 전날까지 날짜별 학습 계획을 만든다. (시험 당일은 넣지 않는다)
- 범위를 3~5개 단원으로 나누고, 각 단원을 "개념 정리 → 문제 풀이 → 오답 정리" 순서로 배치한다.
- 시험 2~3일 전은 전체 복습과 실전 모의고사, 시험 전날은 오답·핵심 공식 암기 위주로 한다.
- 하루 과제는 1~3개, 하루 총 학습 시간(분)은 입력값을 넘기지 않는다.
- date는 반드시 YYYY-MM-DD 형식. 오늘보다 이전 날짜는 넣지 않는다.
- 날짜가 부족하면 남은 날짜에 우선순위 높은 것만 압축한다.
- 학생 자료가 있으면 그 자료의 단원명을 그대로 사용한다.
- task는 "무엇을 어떻게" 하는지 구체적으로 쓴다. (예: "개념 정리: 도함수의 정의와 공식 5개 정리")
- method에는 추천 학습법을 짧게 쓴다. (예: "개념 노트 정리", "기출 10문제", "오답 노트")
- overview에는 이 계획의 핵심 전략을 2~3문장으로.
- tips에는 시험 대비 팁 3개.`;

    const user = `과목: ${subject.label}
오늘: ${dayKey()}
시험 날짜: ${dateVal} (D-${dd})
남은 일수: ${dd}일
하루 학습 가능 시간: ${minutes}분
시험 범위: ${scope || '(아래 자료 참고)'}
${materialContext(selectedMaterials(matSel))}`;

    const data = await generateJSON({
      system, parts: [{ text: user }], schema: PLAN_SCHEMA, temperature: 0.55, maxTokens: 8192,
    });

    const today = dayKey();
    const tasks = (data.tasks || []).map(t => {
      let date = String(t.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date >= dateVal) {
        date = today;
      }
      return {
        id: uid('t'),
        date,
        unit: String(t.unit || '').trim() || '학습',
        task: String(t.task || '').trim(),
        minutes: Math.max(5, Math.min(240, Number(t.minutes) || 30)),
        method: String(t.method || '').trim(),
        done: false,
      };
    }).filter(t => t.task);

    if (!tasks.length) throw new Error('계획을 만들지 못했어요. 범위를 조금 더 구체적으로 적어 주세요.');

    const plan = {
      id: uid('pl'),
      subject: subject.label,
      subjectId: state.subject,
      examDate: dateVal,
      scope,
      minutes,
      title: String(data.title || `${subject.label} 시험 대비 계획`).trim(),
      overview: String(data.overview || '').trim(),
      tips: Array.isArray(data.tips) ? data.tips.map(String).slice(0, 5) : [],
      tasks,
      createdAt: Date.now(),
    };
    const list = plans();
    list.unshift(plan);
    savePlans(list);
    setStatus(status, null);
    el('planDate').value = '';
    el('planScope').value = '';
    renderPlans();
    awardXP(5, '학습 계획 완성');
    bump('plans');
    toast(`D-${dd} 계획이 완성됐어요. 오늘부터 시작!`, 'xp', 3000);
    el('planList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    errorStatus(status, e);
  } finally {
    el('planGen').disabled = false;
  }
}

/* ---------------- render ---------------- */
function groupByDate(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date).push(t);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function planCard(plan) {
  const dd = dday(plan.examDate);
  const done = plan.tasks.filter(t => t.done).length;
  const pct = Math.round((done / Math.max(1, plan.tasks.length)) * 100);
  const today = dayKey();
  const groups = groupByDate(plan.tasks);
  const totalMin = plan.tasks.reduce((s, t) => s + (t.minutes || 0), 0);

  const dLabel = dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : `D+${Math.abs(dd)}`;
  return `
    <div class="panel plan-card" data-plan="${plan.id}">
      <div class="plan-head">
        <div>
          <span class="dday">${dLabel}</span>
          <h3>${escapeHtml(plan.title)}</h3>
          <p class="sub">${escapeHtml(plan.subject)} · 시험 ${dateLabel(plan.examDate)} · 하루 ${plan.minutes}분 · 과제 ${plan.tasks.length}개 · 총 ${Math.round(totalMin / 60 * 10) / 10}시간</p>
        </div>
        <div class="plan-actions">
          <button class="icon-btn" data-delplan="${plan.id}" type="button" title="계획 삭제">🗑️</button>
        </div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row tight" style="justify-content:space-between;margin-top:6px">
        <small style="color:var(--muted)">진행 ${done} / ${plan.tasks.length}</small>
        <small style="color:var(--muted)" data-pct="${plan.id}">${pct}%</small>
      </div>
      ${plan.overview ? `<p class="plan-overview">${renderRich(plan.overview)}</p>` : ''}
      <div class="plan-days">
        ${groups.map(([date, tasks]) => {
          const isToday = date === today;
          const isPast = date < today && tasks.some(t => !t.done);
          return `<div class="plan-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}">
            <div class="day-head">
              <b>${dateLabel(date)}</b>
              ${isToday ? '<span class="day-badge">오늘</span>' : ''}
              <span class="day-d">${tasks.reduce((s, t) => s + (t.minutes || 0), 0)}분</span>
            </div>
            ${tasks.map(t => `
              <label class="task ${t.done ? 'done' : ''}">
                <input type="checkbox" data-ptask="${t.id}" data-planid="${plan.id}" ${t.done ? 'checked' : ''} />
                <span class="t-body">
                  <span class="t-title">${escapeHtml(t.task)}</span>
                  <span class="t-sub">${escapeHtml(t.unit)}${t.method ? ' · ' + escapeHtml(t.method) : ''} · ${t.minutes}분</span>
                </span>
              </label>`).join('')}
          </div>`;
        }).join('')}
      </div>
      ${plan.tips && plan.tips.length ? `<div class="plan-tips"><b>💡 시험 대비 팁</b><ul>${plan.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

function renderPlans() {
  const host = el('planList');
  const list = plans();
  if (!list.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `<h2 class="sect-title">내 계획</h2>` + list.map(planCard).join('');
  host.querySelectorAll('[data-delplan]').forEach(b => {
    b.addEventListener('click', () => {
      if (!confirm('이 계획을 삭제할까요?')) return;
      savePlans(plans().filter(p => p.id !== b.dataset.delplan));
      renderPlans();
      toast('계획을 삭제했어요');
    });
  });
  host.querySelectorAll('[data-ptask]').forEach(cb => {
    cb.addEventListener('change', () => {
      const list2 = plans();
      const plan = list2.find(p => p.id === cb.dataset.planid);
      if (!plan) return;
      const task = plan.tasks.find(t => t.id === cb.dataset.ptask);
      if (!task) return;
      const wasDone = task.done;
      task.done = cb.checked;
      savePlans(list2);
      cb.closest('.task').classList.toggle('done', task.done);
      const done = plan.tasks.filter(t => t.done).length;
      const pct = Math.round((done / Math.max(1, plan.tasks.length)) * 100);
      const card = cb.closest('.plan-card');
      const bar = card.querySelector('.bar > i');
      if (bar) bar.style.width = pct + '%';
      const pctLabel = card.querySelector(`[data-pct="${plan.id}"]`);
      if (pctLabel) pctLabel.textContent = pct + '%';
      const count = card.querySelector('.row.tight small');
      if (count) count.textContent = `진행 ${done} / ${plan.tasks.length}`;
      if (task.done && !wasDone) { awardXP(5, '학습 체크'); bump('tasksDone'); }
    });
  });
}

/* ---------------- demo ---------------- */
function demoPlan() {
  const subject = currentSubject();
  const today = dayKey();
  const exam = shiftDay(today, 5);
  const tasks = [
    { date: today, unit: '1단원', task: '개념 정리: 핵심 공식 5개를 노트에 정리', minutes: 40, method: '개념 노트' },
    { date: today, unit: '1단원', task: '기본 문제 8문제 풀고 오답 표시', minutes: 30, method: '문제 풀이' },
    { date: shiftDay(today, 1), unit: '2단원', task: '개념 정리 + 예제 3개 따라 풀기', minutes: 50, method: '개념 노트' },
    { date: shiftDay(today, 2), unit: '2단원', task: '유형 문제 10문제 풀기', minutes: 50, method: '문제 풀이' },
    { date: shiftDay(today, 3), unit: '전 범위', task: '실전 모의고사 1회 (시간 재고)', minutes: 60, method: '모의고사' },
    { date: shiftDay(today, 4), unit: '오답', task: '틀린 문제만 다시 풀고 공식 최종 암기', minutes: 40, method: '오답 노트' },
  ].map(t => ({ ...t, id: uid('t'), done: false }));
  const plan = {
    id: uid('pl'), subject: subject.label, subjectId: state.subject, examDate: exam,
    scope: '1~2단원 전체', minutes: 60, title: `${subject.label} 예시 학습 계획`,
    overview: '개념 정리로 시작해 문제 풀이로 확인하고, 시험 전날에는 오답만 보는 압축형 계획이에요.',
    tips: ['하루 계획은 1~3개만: 다 못 지키면 다음 날로 넘기지 말고 가장 중요한 것만 다시', '오답은 "왜 틀렸는지" 한 줄을 꼭 적기', '시험 전날은 새로운 문제보다 정리한 노트 복습'],
    tasks, createdAt: Date.now(), demo: true,
  };
  const list = plans();
  list.unshift(plan);
  savePlans(list);
  renderPlans();
  toast('예시 계획을 열었어요. 체크박스를 눌러 진도를 볼 수 있어요.');
}

/* ---------------- init ---------------- */
export function initPlan() {
  const dateInput = el('planDate');
  dateInput.min = dayKey();
  dateInput.value = shiftDay(dayKey(), 7);
  el('planGen').addEventListener('click', generatePlan);
  el('planDemo').addEventListener('click', demoPlan);
  renderMaterialPicker(el('planMats'), matSel);
  document.addEventListener('app:materials', () => renderMaterialPicker(el('planMats'), matSel));
  renderPlans();
}
