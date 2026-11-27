import { tally, list, jo } from './calc.js';
import { S, esc, empty, link, names, memberName, commentsBox, btn } from './ui.js';
import { commit } from './app.js';

export const dateLabel = k => S.data.dateCompare?.options?.[k]?.label || `${k}안`;

// 확정/해제 공통 (decided.<key>)
export function decide(key, value, labelFn) {
  const before = S.doc?.decided?.[key] ?? null;
  const text = value == null ? `${jo(memberName(S.me), '가')} ${labelFn.title} 확정 해제` : `${jo(memberName(S.me), '가')} ${jo(labelFn.title, '를')} ${jo(labelFn(value), '로')} 확정`;
  if (!confirm(value == null ? `${labelFn.title} 확정을 해제할까요?` : `${jo(labelFn.title, '를')} ${jo(`"${labelFn(value)}"`, '로')} 확정할까요?`)) return;
  commit([{ path: ['decided', key], value }, { path: ['decided', 'by'], value: S.me }, { path: ['decided', 'at'], value: Date.now() }],
    { action: 'decide', target: `decided.${key}`, before, after: value, text });
}
const dlabel = Object.assign(k => dateLabel(k), { title: '날짜' });

export function view() {
  const d = S.data.dateCompare;
  const rows = list(d?.rows);
  if (!d?.options?.A || !d?.options?.B || typeof d.options.A !== 'object' || typeof d.options.B !== 'object' || !rows.length) return `<h2>날짜 A vs B</h2>${empty()}`;
  const t = tally(S.doc?.votes?.date), my = S.doc?.votes?.date?.[S.me], dec = S.doc?.decided?.date;
  const cls = (r, k) => (r.win === k ? 'win' : r.win === 'tbd' ? 'tbd' : '');
  const opt = k => d.options[k];
  return `<h2>날짜 A vs B</h2>
  ${d.checkedAt ? `<p class="muted">조회일 ${esc(d.checkedAt)}</p>` : ''}
  <div class="card">
    <table class="cmp"><thead><tr><th></th>${['A', 'B'].map(k => `<th class="${dec === k ? 'win' : ''}">${esc(opt(k).label || k)}${dec === k ? ' (확정)' : ''}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>기간</th><td>${esc(opt('A').range)}</td><td>${esc(opt('B').range)}</td></tr>
      <tr><th>숙박</th><td>${esc(opt('A').nights)}</td><td>${esc(opt('B').nights)}</td></tr>
      <tr><th>연차</th><td>${esc(opt('A').leave)}</td><td>${esc(opt('B').leave)}</td></tr>
      ${rows.map(r => `<tr><th>${esc(r.k)}</th><td class="${cls(r, 'A')}">${esc(r.A)}</td><td class="${cls(r, 'B')}">${esc(r.B)}</td></tr>${r.note ? `<tr class="note"><td colspan="3">${esc(r.note)}</td></tr>` : ''}`).join('')}
    </tbody></table>
    <div class="legend"><span class="badge ok">초록 = 우세</span><span class="badge">표시 없음 = 같음</span><span class="badge warn">노랑 = 미정(tbd)</span></div>
  </div>
  <div class="card">
    <h3>내 투표</h3>
    <div class="row">${['A', 'B'].map(k => btn(`${dateLabel(k)} ${my === k ? '(내 투표)' : ''}`, 'voteDate', { k }, my === k ? 'on' : '')).join('')}</div>
    <p>${['A', 'B'].map(k => `${esc(dateLabel(k))} ${t[k]?.length || 0}표${t[k] ? ` (${esc(names(t[k]))})` : ''}`).join(' · ')}</p>
    <div class="row">
      ${dec ? `<span class="badge ok">확정: ${esc(dateLabel(dec))}</span>${btn('확정 해제', 'decideDate', { k: '' }, 'danger')}`
      : ['A', 'B'].map(k => btn(`${jo(dateLabel(k), '로')} 확정`, 'decideDate', { k })).join('')}
    </div>
    ${commentsBox('sec:date')}
  </div>
  ${list(d.sources).length ? `<div class="card"><h3>출처</h3><ul>${list(d.sources).map(s => `<li class="src">${link(s.u, s.t)}</li>`).join('')}</ul></div>` : ''}`;
}

export const actions = {
  voteDate: el => {
    const k = el.dataset.k, before = S.doc?.votes?.date?.[S.me] ?? null, after = before === k ? undefined : k;
    commit([{ path: ['votes', 'date', S.me], value: after }], { action: 'vote', target: `votes.date.${S.me}`, before, after: after ?? null, text: after ? `${jo(memberName(S.me), '가')} 날짜를 ${jo(dateLabel(k), '로')} 투표` : `${jo(memberName(S.me), '가')} 날짜 투표 취소` });
  },
  decideDate: el => decide('date', el.dataset.k || null, dlabel),
};
