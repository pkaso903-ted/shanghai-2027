import { MEMBER_IDS, jo } from './calc.js';
import { S, esc, empty, memberName, dv, clearDrafts, toast } from './ui.js';
import { commit, render } from './app.js';
import * as store from './store.js';

const items = () => [
  ...(Array.isArray(S.data.checklist?.items) ? S.data.checklist.items.filter(i => i && typeof i === 'object' && i.id) : []),
  ...Object.entries(S.doc?.customChecks || {}).map(([id, c]) => ({ id, group: c.group || '직접 추가', t: c.t, note: '', by: c.by })),
];

export function view() {
  const list = items(), checks = S.doc?.checks || {};
  const groups = [...new Set(list.map(i => i.group || '기타'))];
  const done = list.reduce((a, i) => a + MEMBER_IDS.filter(m => checks[i.id]?.[m]).length, 0), all = list.length * 3;
  const pct = all ? Math.round((done / all) * 100) : 0;
  const form = `<form class="card" data-submit="addCheck"><h3>항목 직접 추가</h3><div class="row">
    <input data-draft="ck:t" value="${esc(dv('ck:t'))}" maxlength="80" placeholder="할 일" aria-label="할 일">
    <input data-draft="ck:g" value="${esc(dv('ck:g'))}" maxlength="12" placeholder="그룹 (선택)" aria-label="그룹" list="ckgroups">
    <datalist id="ckgroups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <button class="btn" type="submit">추가</button></div></form>`;
  if (!list.length) return `<h2>준비 체크리스트</h2>${empty()}${form}`;
  return `<h2>준비 체크리스트</h2>
  <div class="card"><div class="row between"><b>전체 진행률</b><span>${done} / ${all} (${pct}%)</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    <p class="muted">${MEMBER_IDS.map(m => `${esc(memberName(m))} ${list.filter(i => checks[i.id]?.[m]).length}/${list.length}`).join(' · ')}</p></div>
  ${groups.map(g => `<div class="card"><h3>${esc(g)}</h3>${list.filter(i => (i.group || '기타') === g).map(i => `<div class="chkrow">
      <div class="t">${esc(i.t)}${i.note ? `<br><small class="muted">${esc(i.note)}</small>` : ''}${i.by ? ` <small class="muted">(${esc(memberName(i.by))} 추가)</small>` : ''}</div>
      <div class="row">${MEMBER_IDS.map(m => `<label class="chk"><input type="checkbox" ${checks[i.id]?.[m] ? 'checked' : ''} ${m === S.me ? `data-act="toggleCheck" data-id="${esc(i.id)}"` : 'disabled'} aria-label="${esc(memberName(m))} ${esc(i.t)}">${esc(memberName(m))}</label>`).join('')}</div>
    </div>`).join('')}</div>`).join('')}
  ${form}`;
}

export const actions = {
  toggleCheck: el => {
    const id = el.dataset.id, before = !!S.doc?.checks?.[id]?.[S.me], t = items().find(i => i.id === id)?.t || id;
    commit([{ path: ['checks', id, S.me], value: !before }], { action: 'check', target: `checks.${id}.${S.me}`, before, after: !before, text: `${jo(memberName(S.me), '가')} "${t}" ${before ? '체크 해제' : '완료'}` });
  },
  addCheck: () => {
    if (!S.me) return commit([]);
    const t = String(S.drafts['ck:t'] || '').trim(), g = String(S.drafts['ck:g'] || '').trim();
    if (!t) return toast('할 일을 입력해 주세요');
    const id = 'cc_' + store.newId(), val = { t: t.slice(0, 80), group: g.slice(0, 12) || '직접 추가', by: S.me };
    commit([{ path: ['customChecks', id], value: val }], { action: 'check', target: `customChecks.${id}`, before: null, after: val, text: `${jo(memberName(S.me), '가')} 체크 항목 추가: ${val.t}` });
    clearDrafts('ck:');
    render(true);
  },
};
