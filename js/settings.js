/* =========================================================
   settings.js — 설정 화면 (학습 정보 · 과목 · API 키 · Google 동기화 · 앱 설정)
   ========================================================= */
import {
  K, state, load, save, SUBJECTS, subjectById, currentSubject, setSubject, getSetup, saveSetup,
  openModal, toast, escapeHtml, fmt, dayKey, dday, hasKey, getKey, clearKey, connectTest, getModel,
  saveSettings,
} from './core.js?v=00671424';
import { openKeyModal, renderKeyState, speak, stopSpeaking, ttsSupported } from './ui.js?v=00671424';
import { profile, emit, weeklyXP, tierFor, currentStreak, totalXP } from './gamify.js?v=00671424';
import { getCourse, courseProgress, renderCourse, renderTopBar, openAddSubjectModal, courses } from './course.js?v=00671424';
import {
  getSync, setSync, connectGoogle, disconnectGoogle, pushToDrive, pullFromDrive,
  exportJSON, importJSON, driveSetupModal, isDriveReady,
} from './sync.js?v=00671424';
import { openOnboarding } from './onboarding.js?v=00671424';

const el = (id) => document.getElementById(id);

function fmtDate(ts) {
  if (!ts) return '아직 없음';
  const d = new Date(ts);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function renderSettings() {
  const setup = getSetup() || {};
  const p = profile();
  const sync = getSync();
  const subjIds = Array.isArray(setup.subjects) && setup.subjects.length ? setup.subjects : SUBJECTS.map(s => s.id);
  const host = el('settingsBody');
  if (!host) return;

  const dd = setup.examDate ? dday(setup.examDate) : null;
  const keyOn = hasKey();
  const tier = tierFor(weeklyXP());

  host.innerHTML = `
    <!-- 프로필 -->
    <div class="panel">
      <div class="panel-head tight"><b>내 프로필</b><span class="week-label">${p.emoji || '🐣'} ${escapeHtml(p.nick || '닉네임 없음')}</span></div>
      <div class="set-row">
        <button class="set-emoji" id="setEmoji" type="button" title="아바타">${p.emoji || '🐣'}</button>
        <input id="setNick" placeholder="닉네임 (친구 랭킹에 표시)" maxlength="12" value="${escapeHtml(p.nick || '')}" />
        <button class="ghost-btn small" id="setNickSave" type="button">저장</button>
      </div>
      <p class="set-note">🔥 ${currentStreak()}일 연속 · ⚡ ${fmt(totalXP())} XP 누적 · ${tier.icon} ${tier.name} 리그</p>
    </div>

    <!-- 학습 정보 -->
    <div class="panel">
      <div class="panel-head tight"><b>수업 과목 · 시험 설정</b><span class="week-label">AI가 이 정보에 맞춰 단원과 난이도를 조정해요</span></div>
      <div class="form-grid" style="margin-top:6px">
        <label class="field"><span>국가</span>
          <select id="setCountry">
            ${['대한민국', '미국', '일본', '중국', '베트남', '기타'].map(c => `<option ${setup.country === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>학교급</span>
          <select id="setLevel">
            ${['초등학교', '중학교', '고등학교', '대학교'].map(c => `<option ${setup.level === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>학년</span>
          <select id="setGrade">
            ${['1학년', '2학년', '3학년', '4학년', '5학년', '6학년', '대학 1학년', '대학 2학년', '대학 3학년', '대학 4학년'].map(c => `<option ${setup.grade === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>현재 수준</span>
          <select id="setSelf">
            ${['기초', '보통', '심화'].map(c => `<option ${setup.levelSelf === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
        <label class="field span2"><span>학교명 (선택)</span>
          <input id="setSchool" placeholder="예: 세일고등학교" value="${escapeHtml(setup.school || '')}" />
        </label>
        <label class="field span2"><span>학교 홈페이지 · 교육과정 메모 (선택)</span>
          <textarea id="setSchoolNote" rows="2" placeholder="예: 2022 개정 교육과정, 공통수학 1·2 / 학교 홈페이지 주소">${escapeHtml(setup.schoolNote || '')}</textarea>
        </label>
        <label class="field"><span>시험 날짜</span>
          <input type="date" id="setExamDate" value="${escapeHtml(setup.examDate || '')}" />
        </label>
        <label class="field"><span>하루 학습 시간</span>
          <select id="setMinutes">
            ${[20, 30, 45, 60, 90, 120, 180].map(m => `<option value="${m}" ${Number(setup.dailyMinutes) === m ? 'selected' : ''}>${m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분'}</option>`).join('')}
          </select>
        </label>
        <label class="field span2"><span>목표</span>
          <select id="setGoal">
            <option value="50" ${Number(setup.goalPct) === 50 ? 'selected' : ''}>50% · 핵심 주제 집중</option>
            <option value="70" ${Number(setup.goalPct) === 70 ? 'selected' : ''}>70% · 모든 주제 연습</option>
            <option value="90" ${Number(setup.goalPct) === 90 ? 'selected' : ''}>90% · 어려운 문제까지 정복</option>
          </select>
        </label>
      </div>
      <p class="set-note">${dd == null ? '시험 날짜를 넣으면 D-day와 학습 계획이 자동으로 맞춰져요.' : dd > 0 ? `시험까지 ${dd}일 남았어요.` : '시험 날짜가 지났어요. 새 날짜를 넣어 주세요.'}</p>
      <div class="row tight" style="margin-top:10px">
        <button class="primary small" id="setSave" type="button">설정 저장</button>
      </div>
    </div>

    <!-- 과목 -->
    <div class="panel">
      <div class="panel-head tight"><b>내 과목</b><span class="week-label">${subjIds.length}개</span></div>
      <div class="onb-chips" id="setSubjChips">
        ${subjIds.map(id => {
          const s = subjectById(id) || { label: id, icon: '✏️' };
          const prog = courseProgress(id);
          return `<span class="onb-chip on" data-subchip="${escapeHtml(id)}">${s.icon} ${escapeHtml(s.label)} <b style="font-size:10px;color:var(--muted)">${prog.pct}%</b> <button class="chip-x" data-delsub="${escapeHtml(id)}" type="button" aria-label="삭제">✕</button></span>`;
        }).join('')}
      </div>
      <div class="row tight" style="margin-top:10px">
        <button class="ghost-btn small" id="setAddSubj" type="button">＋ 과목 추가</button>
        <button class="ghost-btn small" id="setOnboarding" type="button">온보딩 다시 열기</button>
      </div>
    </div>

    <!-- API 키 -->
    <div class="panel">
      <div class="panel-head tight"><b>Gemini API 키</b>
        <span class="set-badge ${keyOn ? 'ok' : 'off'}">${keyOn ? '연결됨' : '미연결'}</span>
      </div>
      <p class="set-note" style="margin-top:0">사용 모델: <b>${keyOn ? escapeHtml(getModel() || '자동 선택') : '—'}</b><br/>
        키는 이 기기 브라우저(localStorage)에만 저장되고 서버로 보내지 않아요.</p>
      <div class="row tight" style="margin-top:10px">
        <button class="primary small" id="setKey" type="button">${keyOn ? '키 변경 · 연결 테스트' : '키 연결하기'}</button>
        <button class="ghost-btn small" id="setKeyTest" type="button">연결 테스트</button>
        ${keyOn ? '<button class="ghost-btn small danger" id="setKeyDel" type="button">키 삭제</button>' : ''}
      </div>
      <div class="status" id="setKeyStatus" hidden></div>
    </div>

    <!-- Google 동기화 -->
    <div class="panel">
      <div class="panel-head tight"><b>학습 저장 · Google Drive</b>
        <span class="set-badge ${sync.connected ? 'ok' : 'off'}">${sync.connected ? '연결됨' : '로컬 저장'}</span>
      </div>
      <p class="set-note" style="margin-top:0">
        ${sync.connected
          ? `${escapeHtml(sync.email || 'Google 계정')} · 마지막 백업 ${fmtDate(sync.lastSync)}`
          : '지금도 모든 기록은 이 기기에 저장되고 있어요. Google 계정을 연결하면 내 Drive 앱 전용 폴더에 백업해 기기를 바꿔도 이어서 쓸 수 있어요.'}
      </p>
      ${!isDriveReady() ? `<p class="set-note">동기화를 쓰려면 OAuth Client ID가 필요해요. <button class="link-btn" id="setDriveSetup" type="button">Client ID 설정</button></p>` : ''}
      <div class="row tight" style="margin-top:10px">
        ${sync.connected
          ? `<button class="ghost-btn small" id="setDrivePush" type="button">지금 백업</button>
             <button class="ghost-btn small" id="setDrivePull" type="button">Drive에서 불러오기</button>
             <button class="ghost-btn small" id="setDriveOff" type="button">연결 해제</button>`
          : `<button class="primary small" id="setDriveOn" type="button" ${isDriveReady() ? '' : 'disabled'}>Google 로그인</button>`}
      </div>
      <div class="status" id="setDriveStatus" hidden></div>
      <p class="set-note">수동 백업도 가능해요. (API 키는 백업에 포함되지 않아요)</p>
      <div class="row tight" style="margin-top:8px">
        <button class="ghost-btn small" id="setExport" type="button">JSON 내보내기</button>
        <button class="ghost-btn small" id="setImport" type="button">JSON 불러오기</button>
      </div>
    </div>

    <!-- 앱 설정 -->
    <div class="panel">
      <div class="panel-head tight"><b>앱 설정</b></div>
      <div class="set-block" style="padding-top:0">
        <div class="set-row" style="justify-content:space-between">
          <div><b style="font-size:13px">답변 자동 읽기</b><p class="set-note" style="margin-top:2px">튜터 답변을 음성으로 읽어 줘요 (${ttsSupported() ? '지원' : '미지원'})</p></div>
          <label class="switch"><input type="checkbox" id="setAutoSpeak" ${state.settings.autoSpeak ? 'checked' : ''} /><span></span></label>
        </div>
      </div>
      <div class="set-block">
        <div class="set-row" style="justify-content:space-between">
          <b style="font-size:13px">말하기 속도</b>
          <select id="setRate" class="speed-select">
            ${[0.8, 1, 1.25, 1.5].map(r => `<option value="${r}" ${Number(state.settings.ttsRate) === r ? 'selected' : ''}>${r}배속</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="set-block">
        <b style="font-size:13px;display:block;margin-bottom:8px">튜터 기본 모드</b>
        <div class="seg wide" id="setMode">
          <button class="seg-btn ${state.settings.mode === 'socratic' ? 'active' : ''}" data-mode="socratic" type="button">단계별 1:1 과외</button>
          <button class="seg-btn ${state.settings.mode === 'summary' ? 'active' : ''}" data-mode="summary" type="button">핵심 빠르게 정리</button>
        </div>
      </div>
      <div class="set-block">
        <div class="set-row" style="justify-content:space-between">
          <b style="font-size:13px">화면 테마</b>
          <select id="setTheme" class="speed-select">
            <option value="dark" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'selected' : ''}>다크 (Astra)</option>
            <option value="light" ${document.documentElement.getAttribute('data-theme') === 'light' ? 'selected' : ''}>라이트</option>
          </select>
        </div>
      </div>
      <div class="set-block">
        <div class="set-row" style="justify-content:space-between">
          <b style="font-size:13px">하루 목표 XP</b>
          <select id="setGoalXp" class="speed-select">
            ${[20, 30, 50, 80, 120].map(n => `<option value="${n}" ${Number(state.settings.dailyGoal) === n ? 'selected' : ''}>${n} XP</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="set-block">
        <b style="font-size:13px;display:block;margin-bottom:8px">학습 데이터</b>
        <div class="row tight">
          <button class="ghost-btn small danger" id="setReset" type="button">모든 기록 초기화</button>
        </div>
        <p class="set-note">대화·계획·카드·리그·배지가 이 브라우저에서 모두 삭제됩니다. API 키도 함께 삭제돼요.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head tight"><b>개인정보 · 앱 정보</b></div>
      <p class="set-note" style="margin-top:0">
        • 학습 기록·대화·API 키는 이 기기의 브라우저 저장소(localStorage)에만 보관되며, Pickle이나 다른 서버로 전송되지 않아요.<br/>
        • AI 요청은 입력한 내용이 Google Gemini API로만 전달됩니다.<br/>
        • Google Drive 백업은 내 계정의 앱 전용 폴더(appDataFolder)에만 저장되고, API 키는 백업에서 제외됩니다.<br/>
        • 공용 PC에서는 사용 후 API 키를 삭제해 주세요.<br/>
        • 앱 버전 2.0 · GitHub Pages 정적 배포
      </p>
    </div>`;

  bindSettings(host);
}

function bindSettings(host) {
  host.querySelector('#setNickSave')?.addEventListener('click', () => {
    const p = profile();
    p.nick = host.querySelector('#setNick').value.trim().slice(0, 12);
    save(K.profile, p);
    emit();
    renderSettings();
    renderTopBar();
    toast('닉네임을 저장했어요');
  });
  host.querySelector('#setEmoji')?.addEventListener('click', () => {
    const p = profile();
    const emojis = ['🐣', '🐼', '🦊', '🐧', '🐯', '🦉', '🐨', '🦄', '🚀', '📚', '🎧', '🧠', '⭐', '🍀', '🎓', '🔥'];
    const modal = openModal(`
      <div class="modal-head"><h2>아바타</h2><button class="icon-btn" data-close type="button">✕</button></div>
      <div class="modal-body"><div class="emoji-list" style="display:flex">${emojis.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div></div>`);
    modal.root.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => {
      p.emoji = b.dataset.e;
      save(K.profile, p);
      emit();
      modal.close();
      renderSettings();
      renderTopBar();
    }));
  });

  host.querySelector('#setSave')?.addEventListener('click', () => {
    const patch = {
      country: host.querySelector('#setCountry').value,
      level: host.querySelector('#setLevel').value,
      grade: host.querySelector('#setGrade').value,
      levelSelf: host.querySelector('#setSelf').value,
      school: host.querySelector('#setSchool').value.trim(),
      schoolNote: host.querySelector('#setSchoolNote').value.trim(),
      examDate: host.querySelector('#setExamDate').value || '',
      dailyMinutes: Number(host.querySelector('#setMinutes').value || 60),
      goalPct: Number(host.querySelector('#setGoal').value || 70),
    };
    saveSetup(patch);
    renderCourse();
    renderSettings();
    toast('학습 정보를 저장했어요. AI가 이 기준으로 단원과 난이도를 맞춥니다.', 'xp', 3000);
  });
  host.querySelector('#setAddSubj')?.addEventListener('click', () => openAddSubjectModal());
  host.querySelector('#setOnboarding')?.addEventListener('click', () => openOnboarding(true));
  host.querySelectorAll('[data-delsub]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delsub;
    const setup = getSetup();
    const list = (setup.subjects || []).filter(x => x !== id);
    if (!list.length) { toast('최소 한 과목은 남겨 주세요.', 'err'); return; }
    saveSetup({ subjects: list });
    if (state.subject === id) setSubject(list[0]);
    renderSettings();
    renderCourse();
    toast('과목을 목록에서 뺐어요');
  }));

  host.querySelector('#setKey')?.addEventListener('click', () => openKeyModal());
  host.querySelector('#setKeyTest')?.addEventListener('click', async () => {
    const box = host.querySelector('#setKeyStatus');
    if (!hasKey()) { openKeyModal(); return; }
    box.hidden = false;
    box.className = 'status';
    box.innerHTML = '<span class="spinner"></span> 연결을 확인하는 중…';
    try {
      const r = await connectTest(getKey(), (m) => { box.innerHTML = `<span class="spinner"></span> ${escapeHtml(m)}`; });
      box.className = 'status ok';
      box.innerHTML = `✅ 연결됨 · 사용 모델 <b>${escapeHtml(r.model)}</b>`;
      renderKeyState();
    } catch (e) {
      box.className = 'status err';
      box.innerHTML = '❌ ' + escapeHtml(e.message || '연결 실패');
    }
  });
  host.querySelector('#setKeyDel')?.addEventListener('click', () => {
    if (!confirm('이 기기에 저장된 API 키를 삭제할까요?')) return;
    clearKey();
    renderKeyState();
    renderSettings();
    toast('API 키를 삭제했어요');
  });

  host.querySelector('#setDriveSetup')?.addEventListener('click', driveSetupModal);
  host.querySelector('#setDriveOn')?.addEventListener('click', async () => {
    const box = host.querySelector('#setDriveStatus');
    box.hidden = false; box.className = 'status';
    box.innerHTML = '<span class="spinner"></span> Google 로그인 창을 여는 중…';
    try {
      const r = await connectGoogle();
      box.className = 'status ok';
      box.innerHTML = `✅ ${escapeHtml(r.email || 'Google 계정')} 연결됨`;
      renderSettings();
      toast('Google 계정을 연결했어요. 이제 Drive에 백업할 수 있어요.', 'xp', 3000);
    } catch (e) {
      box.className = 'status err';
      box.innerHTML = '❌ ' + escapeHtml(e.message || '연결하지 못했어요.');
    }
  });
  host.querySelector('#setDriveOff')?.addEventListener('click', () => {
    disconnectGoogle();
    renderSettings();
    toast('Google 연결을 해제했어요. 기록은 이 기기에 그대로 있어요.');
  });
  host.querySelector('#setDrivePush')?.addEventListener('click', async () => {
    const box = host.querySelector('#setDriveStatus');
    box.hidden = false; box.className = 'status';
    box.innerHTML = '<span class="spinner"></span> Drive에 백업하는 중…';
    try {
      const r = await pushToDrive();
      box.className = 'status ok';
      box.innerHTML = `✅ 백업 완료 · ${fmtDate(r.at)}`;
      renderSettings();
    } catch (e) {
      box.className = 'status err';
      box.innerHTML = '❌ ' + escapeHtml(e.message || '백업하지 못했어요.');
    }
  });
  host.querySelector('#setDrivePull')?.addEventListener('click', async () => {
    if (!confirm('Drive 백업으로 이 기기의 기록을 덮어쓸까요?')) return;
    const box = host.querySelector('#setDriveStatus');
    box.hidden = false; box.className = 'status';
    box.innerHTML = '<span class="spinner"></span> Drive에서 불러오는 중…';
    try {
      const r = await pullFromDrive();
      box.className = 'status ok';
      box.innerHTML = `✅ ${r.n}개 항목을 불러왔어요 (백업 ${escapeHtml(String(r.savedAt || '').slice(0, 10))})`;
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      box.className = 'status err';
      box.innerHTML = '❌ ' + escapeHtml(e.message || '불러오지 못했어요.');
    }
  });
  host.querySelector('#setExport')?.addEventListener('click', () => {
    exportJSON();
    toast('JSON 파일로 내보냈어요 (API 키 제외)');
  });
  host.querySelector('#setImport')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const f = (input.files || [])[0];
      if (!f) return;
      if (!confirm('이 백업 파일로 현재 기록을 덮어쓸까요?')) return;
      try {
        const n = await importJSON(f);
        toast(`${n}개 항목을 불러왔어요. 새로 고칩니다.`, 'xp');
        setTimeout(() => location.reload(), 900);
      } catch (e) {
        toast(e.message || '불러오지 못했어요.', 'err');
      }
    });
    input.click();
  });

  host.querySelector('#setAutoSpeak')?.addEventListener('change', (e) => {
    state.settings.autoSpeak = e.target.checked;
    saveSettings();
    if (!e.target.checked) stopSpeaking();
  });
  host.querySelector('#setRate')?.addEventListener('change', (e) => {
    state.settings.ttsRate = Number(e.target.value) || 1;
    saveSettings();
    speak('이 속도로 읽어 드릴게요.', { rate: state.settings.ttsRate });
  });
  host.querySelector('#setMode')?.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    state.settings.mode = b.dataset.mode;
    saveSettings();
    host.querySelectorAll('#setMode .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('#modeSeg .seg-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === b.dataset.mode));
    toast(b.dataset.mode === 'socratic' ? '기본 모드를 단계별 과외로 설정했어요' : '기본 모드를 핵심 정리로 설정했어요', 'info', 1800);
  });
  host.querySelector('#setTheme')?.addEventListener('change', (e) => {
    const theme = e.target.value;
    document.documentElement.setAttribute('data-theme', theme);
    save(K.theme, theme);
    document.dispatchEvent(new CustomEvent('app:theme', { detail: theme }));
    toast(theme === 'dark' ? '다크 테마로 바꿨어요' : '라이트 테마로 바꿨어요', 'info', 1600);
  });
  host.querySelector('#setGoalXp')?.addEventListener('change', (e) => {
    state.settings.dailyGoal = Number(e.target.value) || 50;
    saveSettings();
    renderCourse();
    toast(`하루 목표를 ${state.settings.dailyGoal} XP로 정했어요`);
  });
  host.querySelector('#setReset')?.addEventListener('click', () => {
    if (!confirm('모든 학습 기록과 API 키를 삭제할까요? 되돌릴 수 없어요.')) return;
    if (!confirm('정말로 삭제합니다. 마지막 확인이에요.')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('aitutor.v1.')) keys.push(k);
    }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    location.reload();
  });
}

export function initSettings() {
  el('settingsHomeBtn')?.addEventListener('click', () => {
    document.querySelector('#bottomNav [data-view="course"]')?.click();
  });
  document.addEventListener('app:settings-refresh', () => {
    if (!document.querySelector('.view[data-view="settings"]').hidden) renderSettings();
  });
  document.addEventListener('app:view', (e) => {
    if (e.detail === 'settings') renderSettings();
    if (e.detail === 'league') { /* league 자체 렌더 */ }
  });
  document.addEventListener('gamify:update', () => {
    const v = document.querySelector('.view[data-view="settings"]');
    if (v && !v.hidden) renderSettings();
  });
  renderSettings();
  void courses; void getCourse; void currentSubject; void load; void saveSettings;
}
