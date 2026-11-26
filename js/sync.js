/* =========================================================
   sync.js — Google Drive appDataFolder 동기화 + JSON 백업
   ========================================================= */
import { K, load, save, toast, openModal, escapeHtml, getSetup, saveSetup, state } from './core.js?v=ce8e2714';

const SYNC_KEY = 'aitutor.v1.sync';
const BACKUP_NAME = 'ai-study-tutor-backup.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let accessToken = '';
let tokenExpires = 0;
let gisLoading = null;

export function getSync() {
  return Object.assign({ clientId: '', connected: false, email: '', lastSync: 0, auto: true }, load(SYNC_KEY, {}));
}
export function setSync(patch) {
  const next = Object.assign(getSync(), patch);
  save(SYNC_KEY, next);
  return next;
}
export function isDriveReady() { return !!getSync().clientId; }

/* ---------------- Google Identity Services ---------------- */
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했어요. 네트워크를 확인해 주세요.'));
    document.head.appendChild(s);
  });
  return gisLoading;
}

function requestToken(prompt = '') {
  const sync = getSync();
  if (!sync.clientId) return Promise.reject(new Error('Google OAuth Client ID가 설정되지 않았어요.'));
  return loadGis().then(() => new Promise((resolve, reject) => {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: sync.clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            tokenExpires = Date.now() + ((Number(resp.expires_in) || 3500) * 1000) - 60000;
            resolve(resp);
          } else {
            reject(new Error(resp && resp.error ? 'Google 로그인이 취소되었거나 거부되었어요. (' + resp.error + ')' : 'Google 로그인에 실패했어요.'));
          }
        },
        error_callback: (err) => reject(new Error('Google 로그인 창을 열지 못했어요. ' + (err && err.message ? err.message : ''))),
      });
      tokenClient.requestAccessToken({ prompt });
    } catch (e) {
      reject(new Error('Google 로그인을 시작하지 못했어요. Client ID와 승인된 JavaScript 출처를 확인해 주세요.'));
    }
  }));
}

async function ensureToken() {
  if (accessToken && Date.now() < tokenExpires) return accessToken;
  await requestToken('');
  return accessToken;
}

async function driveFetch(url, options = {}, retry = true) {
  await ensureToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: 'Bearer ' + accessToken },
  });
  if (res.status === 401 && retry) {
    accessToken = '';
    await ensureToken();
    return driveFetch(url, options, false);
  }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.error && j.error.message ? j.error.message : ''; } catch (e) {}
    throw new Error(`Google Drive 요청 실패 (${res.status}) ${msg.slice(0, 120)}`);
  }
  return res;
}

export async function connectGoogle() {
  const sync = getSync();
  if (!sync.clientId) throw new Error('먼저 Google OAuth Client ID를 입력해 주세요.');
  await requestToken(sync.connected ? '' : 'consent');
  let email = sync.email || '';
  try {
    const res = await driveFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const j = await res.json();
    email = j.email || email;
  } catch (e) {}
  setSync({ connected: true, email, lastSync: sync.lastSync || 0 });
  return { email };
}
export function disconnectGoogle() {
  try { if (window.google && accessToken) window.google.accounts.oauth2.revoke(accessToken); } catch (e) {}
  accessToken = '';
  tokenExpires = 0;
  setSync({ connected: false, email: '' });
}

/* ---------------- backup snapshot ---------------- */
export function snapshot() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('aitutor.v1.')) continue;
      if (k === K.key) continue;           // API 키는 백업하지 않음
      data[k] = localStorage.getItem(k);
    }
  } catch (e) {}
  return { app: 'ai-study-tutor', version: 2, exportedAt: new Date().toISOString(), setup: getSetup(), data };
}

export function exportJSON() {
  const snap = snapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ai-study-tutor-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  return snap;
}

export function restore(snap) {
  if (!snap || snap.app !== 'ai-study-tutor' || !snap.data) throw new Error('이 앱의 백업 파일이 아니에요.');
  let n = 0;
  Object.entries(snap.data).forEach(([k, v]) => {
    if (k === K.key) return;
    try { localStorage.setItem(k, v); n++; } catch (e) {}
  });
  return n;
}

export async function importJSON(file) {
  const text = await file.text();
  let snap;
  try { snap = JSON.parse(text); } catch (e) { throw new Error('JSON 파일을 읽지 못했어요.'); }
  const n = restore(snap);
  return n;
}

/* ---------------- Drive file ops ---------------- */
async function findBackup() {
  const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`;
  const res = await driveFetch(url);
  const j = await res.json();
  return (j.files && j.files[0]) || null;
}

export async function pushToDrive() {
  if (!getSync().connected) throw new Error('먼저 Google 로그인을 연결해 주세요.');
  const body = JSON.stringify(snapshot());
  const existing = await findBackup();
  let id = existing && existing.id;
  if (!id) {
    const res = await driveFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: BACKUP_NAME, parents: ['appDataFolder'] }),
    });
    const j = await res.json();
    id = j.id;
  }
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const at = Date.now();
  setSync({ lastSync: at });
  return { at, size: body.length };
}

export async function pullFromDrive() {
  if (!getSync().connected) throw new Error('먼저 Google 로그인을 연결해 주세요.');
  const file = await findBackup();
  if (!file) throw new Error('Drive에 백업 파일이 아직 없어요. 먼저 "지금 백업"을 눌러 주세요.');
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  const text = await res.text();
  let snap;
  try { snap = JSON.parse(text); } catch (e) { throw new Error('Drive 백업 파일을 읽지 못했어요.'); }
  const n = restore(snap);
  return { n, savedAt: snap.exportedAt, modifiedTime: file.modifiedTime };
}

/* ---------------- helpers ---------------- */
export function driveSetupModal() {
  const sync = getSync();
  const origin = location.origin;
  const modal = openModal(`
    <div class="modal-head"><h2>Google Drive 동기화 설정</h2><button class="icon-btn" data-close type="button">✕</button></div>
    <div class="modal-body">
      <p class="hint">자동 로그인이나 가짜 계정은 쓰지 않아요. 아래 Client ID로 <b>진짜 Google 로그인</b>을 열고, 내 Drive의 앱 전용 폴더(appDataFolder)에 학습 기록을 백업합니다.</p>
      <ol class="steps">
        <li><span class="num">1</span><div><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console → 사용자 인증 정보</a>에서 프로젝트를 만들고 <b>OAuth 클라이언트 ID(웹 애플리케이션)</b>를 생성</div></li>
        <li><span class="num">2</span><div>승인된 JavaScript 출처에 <code>${escapeHtml(origin)}</code> 추가</div></li>
        <li><span class="num">3</span><div>Drive API 사용 설정 후, 발급된 Client ID(<code>…apps.googleusercontent.com</code>)를 아래에 붙여넣기</div></li>
      </ol>
      <label class="field"><span>OAuth Client ID</span>
        <input id="clientIdInput" placeholder="1234567890-abc.apps.googleusercontent.com" value="${escapeHtml(sync.clientId)}" />
      </label>
      <p class="fine">Client ID는 비밀값이 아니라 앱 식별자예요. 승인된 출처가 맞지 않으면 로그인 창에서 오류가 나며, 그때는 2번을 확인해 주세요.</p>
      <div class="key-foot">
        <button class="primary" id="clientIdSave" type="button">저장</button>
        <button class="ghost-btn" data-close type="button">닫기</button>
      </div>
    </div>`);
  modal.root.querySelector('#clientIdSave').addEventListener('click', () => {
    const v = modal.root.querySelector('#clientIdInput').value.trim();
    if (v && !/\.apps\.googleusercontent\.com$/.test(v)) {
      toast('Client ID 형식을 확인해 주세요. (…apps.googleusercontent.com)', 'err');
      return;
    }
    setSync({ clientId: v, connected: v ? getSync().connected : false });
    modal.close();
    document.dispatchEvent(new CustomEvent('app:settings-refresh'));
    toast(v ? 'Client ID를 저장했어요. 이제 Google 로그인을 눌러 주세요.' : 'Client ID를 지웠어요.');
  });
  void state;
  void saveSetup;
}

void load;
