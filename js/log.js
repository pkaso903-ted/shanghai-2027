import { MEMBER_IDS, list, jo } from './calc.js';
import { S, esc, memberName, btn, fmtTime, link, empty } from './ui.js';
import { commit, render } from './app.js';
import * as store from './store.js';

const SECTIONS = [['', '전체 섹션'], ['votes.date|decided.date', '날짜'], ['votes.flight|decided.flight', '항공'], ['votes.hotel|decided.hotel', '숙소'],
  ['likes|customPlaces|comments.place', '장소'], ['plan', '일정'], ['expenses|budget', '경비'], ['checks|customChecks', '체크'], ['members|comments', '기타']];
export const revertable = l => typeof l.target === 'string' && (l.target === 'plan' || /^plan\.d[1-4]$/.test(l.target) || /^decided\.\w+$/.test(l.target));
const U = () => (S.ui.log ||= { by: '', sec: '' });

export const logLine = l => `<div class="log-item"><div class="t">${esc(l.text || `${l.byName || memberName(l.by)} ${l.action}`)}<br><small class="muted">${esc(fmtTime(l.at))}</small></div>
  ${revertable(l) ? btn('이 상태로 되돌리기', 'revert', { id: l.id }, 'small') : ''}</div>`;

export function view() {
  const u = U(), sec = u.sec ? u.sec.split('|') : null;
  const items = S.log.items.filter(l => (!u.by || l.by === u.by) && (!sec || sec.some(p => String(l.target || '').startsWith(p))));
  return `<h2>변경 기록</h2>
  <div class="card row">
    <select data-change="logSel" data-f="by" aria-label="사람 필터"><option value="">모든 사람</option>${MEMBER_IDS.map(m => `<option value="${m}"${u.by === m ? ' selected' : ''}>${esc(memberName(m))}</option>`).join('')}</select>
    <select data-change="logSel" data-f="sec" aria-label="섹션 필터">${SECTIONS.map(([v, l]) => `<option value="${v}"${u.sec === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
  </div>
  <p class="muted">일정·확정 변경은 "이 상태로 되돌리기"로 그 변경 직전 상태로 돌릴 수 있습니다.</p>
  <div class="card">${items.map(logLine).join('') || '<p class="muted">기록이 없습니다.</p>'}</div>
  ${S.log.items.length >= S.log.limit ? btn('50개 더보기', 'moreLog') : ''}
  <p>${btn('사진 출처 보기', 'goCredits', {}, 'small')}</p>`;
}

export const actions = {
  logSel: el => { U()[el.dataset.f] = el.value; render(true); },
  moreLog: () => store.moreLog(),
  goCredits: () => { location.hash = 'credits'; },
  revert: el => {
    const l = S.log.items.find(x => x.id === el.dataset.id);
    if (!l || !revertable(l)) return;
    if (!confirm(`"${l.text}" 직전 상태로 되돌릴까요?\n그 뒤에 다른 사람이 같은 곳을 바꾼 내용도 함께 사라집니다.`)) return;
    const segs = l.target.split('.');
    let changes, cur;
    if (l.target === 'plan') {
      const before = l.before && typeof l.before === 'object' ? l.before : {};
      changes = Object.entries(before).filter(([d]) => /^d[1-4]$/.test(d)).map(([d, v]) => ({ path: ['plan', d], value: Array.isArray(v) ? v : [] }));
      cur = Object.fromEntries(changes.map(c => [c.path[1], S.doc?.plan?.[c.path[1]] || []]));
    } else {
      changes = [{ path: segs, value: segs[0] === 'plan' ? (Array.isArray(l.before) ? l.before : []) : l.before ?? null }];
      cur = segs.reduce((a, k) => a?.[k], S.doc) ?? null;
    }
    if (!changes.length) return;
    commit(changes, { action: 'revert', target: l.target, before: cur, after: l.target === 'plan' ? Object.fromEntries(changes.map(c => [c.path[1], c.value])) : changes[0].value, text: `${jo(memberName(S.me), '가')} 되돌리기: ${l.text}` });
  },
};

// 사진 출처 (CC BY-SA 표기)
export const credits = {
  view() {
    const c = S.data.photo_credits, items = list(Array.isArray(c) ? c : c?.items);
    return `<h2>사진 출처</h2>${c?.note ? `<p class="muted">${esc(c.note)}</p>` : ''}
    ${items.length ? `<div class="card">${items.map(i => `<div class="log-item"><div class="t"><b>${esc(String(i.title || i.file || '').replace(/^File:/, ''))}</b><br>
      <small>${esc(i.file || '')} · 저자 ${esc(i.author || '미상')} · ${esc(i.license || '')}</small></div>${link(i.page, '원본', 'btn small')}</div>`).join('')}</div>` : empty()}`;
  },
};
