import * as store from './store.js';
import { tripFromQuery, MEMBER_IDS, applyPlanOp, jo } from './calc.js';
import { S, esc, memberName, toast, dv, clearDrafts } from './ui.js';
import * as home from './home.js';
import * as datesec from './date.js';
import * as flight from './flight.js';
import * as hotel from './hotel.js';
import * as place from './place.js';
import * as plan from './plan.js';
import * as money from './money.js';
import * as check from './check.js';
import * as logsec from './log.js';

export const APP_VERSION = '1.0.0';
const TRIP_ID = 'sh27-b2yiwx52n136pjcnoa37';
S.trip = tripFromQuery(location.search, TRIP_ID);
const ME_KEY = 'sh27-me-' + S.trip;
try { S.me = localStorage.getItem(ME_KEY); } catch { S.me = null; }
if (!MEMBER_IDS.includes(S.me)) S.me = null;

const ROUTES = {
  home: { tab: 'home', mod: home, title: '홈' },
  date: { tab: 'decide', mod: datesec, title: '날짜' },
  flight: { tab: 'decide', mod: flight, title: '항공권' },
  hotel: { tab: 'decide', mod: hotel, title: '숙소' },
  place: { tab: 'place', mod: place, title: '장소' },
  plan: { tab: 'plan', mod: plan, title: '일정' },
  money: { tab: 'money', mod: money, title: '경비' },
  check: { tab: 'more', mod: check, title: '체크리스트' },
  log: { tab: 'more', mod: logsec, title: '변경 기록' },
  credits: { tab: 'more', mod: logsec.credits, title: '사진 출처' },
};
const TABS = [['home', '홈', 'home'], ['decide', '결정', 'date'], ['place', '장소', 'place'], ['plan', '일정', 'plan'], ['money', '경비', 'money'], ['more', '준비·기록', 'check']];
const SUB = { decide: ['date', 'flight', 'hotel'], more: ['check', 'log', 'credits'] };
const route = () => (ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'home');

// ---------- 쓰기 (모든 변경 = 점 경로 update + log 1건) ----------
export function commit(changes, log) {
  if (!S.me) { openWho(); return false; }
  if (!store.ready()) { toast('아직 연결 준비 중입니다. 잠시 후 다시 시도해 주세요.'); return false; }
  const all = [...changes, { path: ['presence', S.me], value: store.ts() }];
  return store.write(all, log && { by: S.me, byName: memberName(S.me), ...log }).catch(e => toast('저장 실패: ' + (e?.code || e?.message || e)));
}
// 일정: op를 서버 최신 plan에 트랜잭션으로 다시 적용 (동시 편집 시 남의 추가·이동 보존)
// 오프라인이면 op를 대기열(localStorage)에 두고 화면엔 덧씌워 보여준 뒤, 연결되면 차례로 적용
const Q_KEY = 'sh27-planq-' + S.trip;
let planQ = [];
try { planQ = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); if (!Array.isArray(planQ)) planQ = []; } catch { planQ = []; }
const saveQ = () => { try { localStorage.setItem(Q_KEY, JSON.stringify(planQ)); } catch {} };
let rawDoc = {};
function withQueue(d) {
  if (!planQ.length) return d;
  let plan = { ...(d.plan || {}) };
  for (const q of planQ) { const r = applyPlanOp(plan, q.op); if (r) plan = { ...plan, ...r.next }; }
  return { ...d, plan };
}
const isOnline = () => store.status.online && !store.status.fromCache;
function sendPlan(q) {
  return store.txWrite(data => {
    const plan = data.plan || {}, r = applyPlanOp(plan, q.op);
    if (!r) return null;
    const ds = Object.keys(r.next), one = ds.length === 1 ? ds[0] : null;
    const before = Object.fromEntries(ds.map(d => [d, Array.isArray(plan[d]) ? plan[d] : []]));
    return {
      changes: ds.map(d => ({ path: ['plan', d], value: r.next[d] })),
      log: { by: q.me, byName: memberName(q.me), action: 'plan', target: one ? `plan.${one}` : 'plan', before: one ? before[one] : before, after: one ? r.next[one] : r.next, text: q.text },
    };
  }, [{ path: ['presence', q.me], value: store.ts() }]);
}
export function commitPlan(op, text) {
  if (!S.me) { openWho(); return; }
  if (!store.ready()) { toast('아직 연결 준비 중입니다. 잠시 후 다시 시도해 주세요.'); return; }
  const q = { op, text, me: S.me };
  if (!isOnline() || planQ.length) {
    planQ.push(q); saveQ();
    S.doc = withQueue(rawDoc); render();
    if (!isOnline()) toast('오프라인: 일정 변경은 연결되면 반영됩니다');
    flushPlan();
    return;
  }
  sendPlan(q).then(res => res == null && toast('그 사이 다른 사람이 바꿨습니다. 다시 확인해 주세요'))
    .catch(e => { if (e?.code === 'unavailable') { planQ.push(q); saveQ(); } else toast('저장 실패: ' + (e?.code || e?.message || e)); });
}
let flushing = false;
async function flushPlan() {
  if (flushing || !planQ.length || !store.ready() || !isOnline()) return;
  flushing = true;
  try {
    while (planQ.length && isOnline()) {
      await sendPlan(planQ[0]);
      planQ.shift(); saveQ();
    }
  } catch (e) { console.warn('일정 대기열 재시도 예정', e); }
  finally { flushing = false; S.doc = withQueue(rawDoc); render(); }
}
export const get = (path, o = S.doc) => path.reduce((a, k) => (a == null ? undefined : a[k]), o);

// ---------- 데이터 파일 ----------
async function loadJson(name, v) {
  try {
    const r = await fetch(`data/${name}.json?v=${encodeURIComponent(v)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn(name, e);
    return null;
  }
}
async function loadData() {
  let v = String(Date.now());
  try {
    const r = await fetch('data/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) v = (await r.json()).v || v;
  } catch {}
  S.data.version = v;
  const names = ['dateCompare', 'flights', 'hotels', 'places', 'checklist', 'photo_credits'];
  const vals = await Promise.all(names.map(n => loadJson(n, v)));
  names.forEach((n, i) => (S.data[n] = vals[i]));
  S.dataReady = true;
  render();
}

// ---------- 렌더 ----------
let pending = false;
const editing = () => {
  const a = document.activeElement;
  return a && a.closest('#main, #modal') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio';
};
export function render(force) {
  if (!force && editing()) { pending = true; return; }
  pending = false;
  const r = route(), R = ROUTES[r];
  document.getElementById('nav').innerHTML = TABS.map(([t, label, first]) => {
    const target = SUB[t]?.includes(r) ? r : first;
    return `<a href="#${t === R.tab ? target : first}" class="${t === R.tab ? 'on' : ''}"${t === R.tab ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('');
  const sub = SUB[R.tab] ? `<nav class="subtabs">${SUB[R.tab].map(k => `<a href="#${k}" class="${k === r ? 'on' : ''}">${ROUTES[k].title}</a>`).join('')}</nav>` : '';
  let body;
  try {
    body = S.dataReady ? R.mod.view() : '<p class="empty">불러오는 중</p>';
  } catch (e) {
    console.error(e);
    body = `<p class="empty">화면을 그리는 중 오류가 났습니다: ${esc(e.message)}</p>`;
  }
  document.getElementById('main').innerHTML = sub + body;
  renderHeader();
  renderModal();
  try { R.mod.after?.(); } catch (e) { console.error(e); }
}
document.addEventListener('focusout', () => setTimeout(() => pending && !editing() && render(), 0));

function renderHeader() {
  const st = store.status;
  const conn = st.auth === 'fail' ? ['연결 실패 - 새로고침 해 주세요', 'bad'] : st.auth === 'pending' ? ['연결 중', 'warn']
    : !st.online || st.fromCache ? ['오프라인 - 변경은 연결되면 반영', 'warn'] : st.pending ? ['저장 중', 'ok'] : ['연결됨', 'ok'];
  document.getElementById('conn').innerHTML = `<span class="badge ${conn[1]}">${conn[0]}</span>${S.trip !== TRIP_ID ? `<span class="badge test">테스트 문서</span>` : ''}`;
  document.getElementById('who').textContent = S.me ? `나: ${memberName(S.me)}` : '나는 누구?';
}

// ---------- 모달 ----------
function openWho() { S.ui.modal = { type: 'who' }; render(true); }
function renderModal() {
  const m = S.ui.modal, el = document.getElementById('modal');
  if (!m) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  let inner = '';
  if (m.type === 'who') {
    inner = `<h2>나는 누구?</h2><p class="muted">선택은 이 기기에 기억됩니다. 이름은 셋 모두에게 같게 보입니다.</p>
      ${MEMBER_IDS.map(id => `<div class="who-row">
        <button type="button" class="btn ${S.me === id ? 'primary' : ''}" data-act="pickMe" data-m="${id}">${esc(memberName(id))}${S.me === id ? ' (나)' : ''}</button>
        <form class="row" data-submit="rename" data-m="${id}"><input data-draft="rn:${id}" value="${esc(dv('rn:' + id, memberName(id)))}" maxlength="12" aria-label="${esc(memberName(id))} 이름 변경"><button class="btn" type="submit">이름 저장</button></form>
      </div>`).join('')}
      ${S.me ? '<button type="button" class="btn" data-act="closeModal">닫기</button>' : ''}`;
  } else if (m.type === 'share') {
    inner = `<h2>링크 복사</h2><p>아래 주소를 길게 눌러 복사하세요.</p><input id="shareInput" readonly value="${esc(m.url)}"><button type="button" class="btn" data-act="closeModal">닫기</button>`;
  } else {
    const mod = Object.values(ROUTES).find(R => R.mod.modal?.[m.type])?.mod;
    try { inner = mod ? mod.modal[m.type](m) : ''; } catch (e) { console.error(e); inner = `<p>열 수 없습니다: ${esc(e.message)}</p><button type="button" class="btn" data-act="closeModal">닫기</button>`; }
  }
  el.innerHTML = `<div class="sheet ${m.type === 'zh' ? 'full' : ''}" role="dialog" aria-modal="true">${inner}</div>`;
  if (m.type === 'share') document.getElementById('shareInput')?.select();
}

// ---------- 공통 액션 ----------
const common = {
  who: openWho,
  closeModal: () => { S.ui.modal = null; render(true); },
  pickMe: el => {
    S.me = el.dataset.m;
    try { localStorage.setItem(ME_KEY, S.me); } catch {}
    S.ui.modal = null;
    render(true);
    beat();
  },
  share: async () => {
    const url = location.href.split('#')[0];
    try { await navigator.clipboard.writeText(url); toast('링크를 복사했습니다'); }
    catch { S.ui.modal = { type: 'share', url }; render(true); }
  },
  rename: form => {
    const id = form.dataset.m, name = (S.drafts['rn:' + id] ?? '').trim();
    if (!name || name.length > 12) return toast('이름은 1~12자로 입력해 주세요');
    if (MEMBER_IDS.some(o => o !== id && memberName(o) === name)) return toast('다른 멤버와 같은 이름은 쓸 수 없습니다');
    const before = memberName(id);
    if (name === before) return;
    if (!S.me) return toast('먼저 위에서 본인 이름을 눌러 선택해 주세요');
    commit([{ path: ['members', id, 'name'], value: name }], { action: 'member', target: `members.${id}.name`, before, after: name, text: `${jo(memberName(S.me), '가')} ${jo(before, '를')} ${jo(name, '로')} 이름 변경` });
    delete S.drafts['rn:' + id];
    toast('이름을 저장했습니다');
  },
  comment: form => {
    const key = form.dataset.key, text = (S.drafts['cm:' + key] ?? '').trim();
    if (!text) return toast('의견을 입력해 주세요');
    if (text.length > 200) return toast('200자 이내로 입력해 주세요');
    const id = store.newId();
    commit([{ path: ['comments', key, id], value: { by: S.me, text, at: store.ts() } }], { action: 'comment', target: `comments.${key}`, before: null, after: text, text: `${jo(memberName(S.me), '가')} 의견 남김: ${text.slice(0, 40)}` });
    clearDrafts('cm:' + key);
    render(true);
  },
};
const allActions = () => Object.assign({}, common, ...Object.values(ROUTES).map(R => R.mod.actions || {}));

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) {
    e.preventDefault();
    const fn = allActions()[el.dataset.act];
    if (fn) fn(el, e); else console.warn('없는 동작', el.dataset.act);
    return;
  }
  if (e.target.id === 'modal' && S.me) common.closeModal();
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-submit]');
  if (!f) return;
  e.preventDefault();
  allActions()[f.dataset.submit]?.(f, e);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset?.draft) S.drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset?.live) allActions()[el.dataset.live]?.(el, e);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset?.draft) S.drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset?.change) allActions()[el.dataset.change]?.(el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.ui.modal && S.me) common.closeModal();
});
// data-commit 입력: 포커스가 빠질 때(또는 Enter) 저장
document.addEventListener('focusout', e => {
  const el = e.target;
  if (el.dataset?.commit && el.value !== el.dataset.orig) allActions()[el.dataset.commit]?.(el);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.commit) { e.preventDefault(); e.target.blur(); } });
addEventListener('hashchange', () => { scrollTo(0, 0); render(true); });

// 접속 표시: 화면이 보일 때 60초마다 presence 갱신 (log 없음)
function beat() {
  if (S.me && store.ready() && document.visibilityState === 'visible') store.write([{ path: ['presence', S.me], value: store.ts() }], null).catch(() => {});
}
setInterval(beat, 60000);
setInterval(() => route() === 'home' && render(), 30000);

// ---------- 시작 ----------
document.getElementById('ver').textContent = `앱 ${APP_VERSION}`;
render(true);
if (!S.me) openWho();
store.on('doc', d => { rawDoc = d; S.doc = withQueue(d); render(); });
store.on('log', l => { S.log = l; render(); });
store.on('status', () => { renderHeader(); if (store.status.auth === 'ok') { beatOnce(); flushPlan(); } });
store.on('error', e => toast('동기화 오류: ' + (e?.code || e?.message || e)));
let beaten = false;
const beatOnce = () => { if (!beaten && S.me) { beaten = true; beat(); } };
loadData().then(() => { document.getElementById('ver').textContent = `앱 ${APP_VERSION} · 자료 ${S.data.version}`; });
store.start(S.trip);
window.__app = { S, store };
