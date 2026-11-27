// 화면 공용 도우미
import { safeUrl, MEMBER_IDS } from './calc.js';
import { DEFAULT_MEMBERS } from './store.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const attr = esc;
export const link = (u, text, cls = '') => {
  const s = safeUrl(u);
  return s ? `<a class="${cls}" href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(text || s)}</a>` : '';
};
export const S = { data: {}, doc: {}, log: { items: [], limit: 50 }, me: null, trip: '', ui: {}, drafts: {}, dataReady: false };

export const memberName = m => S.doc?.members?.[m]?.name || DEFAULT_MEMBERS[m]?.name || m;
export const initial = m => memberName(m).slice(0, 1);
export const names = ms => (ms || []).map(memberName).join(', ');
export const members = () => MEMBER_IDS;

// 입력 초안: 재렌더 중에도 입력 값 보존
export const dv = (key, def = '') => (key in S.drafts ? S.drafts[key] : def);
export const clearDrafts = prefix => { for (const k of Object.keys(S.drafts)) if (k.startsWith(prefix)) delete S.drafts[k]; };

export const empty = (msg = '자료 준비 중') => `<p class="empty">${esc(msg)}</p>`;
export const badge = (t, cls = '') => `<span class="badge ${cls}">${esc(t)}</span>`;
export const btn = (label, act, data = {}, cls = '') =>
  `<button type="button" class="btn ${cls}" data-act="${act}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}>${esc(label)}</button>`;
export const sel = (draftKey, options, value, extra = '') =>
  `<select data-draft="${draftKey}" ${extra}>${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

export const fmtTime = at => {
  const d = at?.toDate ? at.toDate() : at instanceof Date ? at : null;
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 한 줄 의견 (comments.<key>.<id>)
export function commentsBox(key) {
  const list = Object.entries(S.doc?.comments?.[key] || {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0));
  return `<div class="comments">
    ${list.map(c => `<p class="comment"><b>${esc(memberName(c.by))}</b> ${esc(c.text)} <small>${esc(fmtTime(c.at))}</small></p>`).join('')}
    <form class="row" data-submit="comment" data-key="${esc(key)}">
      <input data-draft="cm:${esc(key)}" value="${esc(dv('cm:' + key))}" maxlength="200" placeholder="한 줄 의견" aria-label="한 줄 의견">
      <button class="btn" type="submit">남기기</button>
    </form>
  </div>`;
}
