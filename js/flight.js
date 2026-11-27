import { list as arrOf, tally, outOk, inOk, stayMinutes, fmtDur, won, num, comboFlights, parseCombo, planDateKey, jo } from './calc.js';
import { S, esc, empty, names, memberName, commentsBox, btn, badge } from './ui.js';
import { commit, render } from './app.js';
import { decide, dateLabel } from './date.js';

export const AIRPORT = { ICN: '인천', PVG: '푸둥', GMP: '김포', SHA: '훙차오' };
const ap = c => AIRPORT[c] || c || '';
export const comboLabel = s => {
  const c = comboFlights(S.data.flights, s);
  if (!c) return '알 수 없는 조합';
  return `${dateLabel(c.opt)} ${c.out.dep} ${c.out.airline} / ${c.back.dep} ${c.back.airline}`;
};
const clabel = Object.assign(comboLabel, { title: '항공 조합' });

const U = () => (S.ui.flight ||= { opt: null, lcc: false, time: false, airport: 'all', sort: 'dep', out: {}, in: {} });

function row(f, dir, selected) {
  const diff = num(f.prevPrice) != null && num(f.price) != null ? f.price - f.prevPrice : 0;
  return `<button type="button" class="flt ${selected ? 'sel' : ''}" data-act="pickFlight" data-dir="${dir}" data-id="${esc(f.id)}" aria-pressed="${selected}">
    <span class="t">${esc(f.dep)} - ${esc(f.arr)}${f.nextDay ? ' <small>+1</small>' : ''}</span>
    <span class="p">${won(f.price)}${diff ? `<br><small class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${won(Math.abs(diff))}</small>` : ''}</span>
    <span>${esc(f.airline)}${f.codeshare ? ` <small>공동운항 ${esc(f.codeshare)}</small>` : ''} ${f.lcc ? badge('저가', 'pri') : ''} ${dir === 'out' ? (outOk(f) ? badge('오전 출발', 'ok') : '') : inOk(f) ? badge('도착 시간 OK', 'ok') : ''}</span>
    <span><small>${esc(ap(f.from))} → ${esc(ap(f.to))}</small></span>
    ${f.bag || f.note ? `<small style="grid-column:1/-1">${esc([f.bag, f.note].filter(Boolean).join(' · '))}</small>` : ''}
  </button>`;
}

export function view() {
  const F = S.data.flights, u = U();
  const opts = Object.keys(F?.options && typeof F.options === 'object' ? F.options : {}).filter(k => arrOf(F.options[k]?.out).length || arrOf(F.options[k]?.in).length);
  if (!opts.length) return `<h2>항공권</h2>${empty()}`;
  const dec = S.doc?.decided?.flight;
  // 날짜가 새로 확정되면 그 탭으로
  if (u.decFor !== (S.doc?.decided?.date || null)) { u.decFor = S.doc?.decided?.date || null; u.opt = null; }
  if (!u.opt || !opts.includes(u.opt)) u.opt = opts.includes(planDateKey(S.doc)) ? planDateKey(S.doc) : opts[0];
  const o = F.options[u.opt];
  const filt = (lst, dir) => arrOf(lst)
    .filter(f => !u.lcc || f.lcc)
    .filter(f => !u.time || (dir === 'out' ? outOk(f) : inOk(f)))
    .filter(f => u.airport === 'all' || (u.airport === 'pvg' ? [f.from, f.to].includes('PVG') : [f.from, f.to].includes('SHA')))
    .sort((a, b) => (u.sort === 'price' ? (num(a.price) ?? 1e12) - (num(b.price) ?? 1e12) : String(a.dep).localeCompare(String(b.dep))));
  const outs = filt(o.out, 'out'), ins = filt(o.in, 'in');
  const selOut = arrOf(o.out).find(f => f.id === u.out[u.opt]), selIn = arrOf(o.in).find(f => f.id === u.in[u.opt]);
  const t = tally(S.doc?.votes?.flight), my = S.doc?.votes?.flight?.[S.me];
  const list = (arr, dir) => (arr.length ? arr.map(f => row(f, dir, (dir === 'out' ? selOut : selIn)?.id === f.id)).join('') : empty('조건에 맞는 편이 없습니다'));

  let combo = '';
  if (selOut && selIn) {
    const key = `${u.opt}|${selOut.id}|${selIn.id}`, per = (num(selOut.price) || 0) + (num(selIn.price) || 0);
    const stay = stayMinutes(selOut, selIn), ok = outOk(selOut) && inOk(selIn);
    combo = `<div class="card hl sticky-combo"><h3>선택한 조합</h3>
      <p>1인 <b>${won(per)}</b> · 3인 <b>${won(per * 3)}</b> · 현지 체류 ${stay != null && stay > 0 ? fmtDur(stay) : '<span class="badge bad">시간 확인 필요</span>'}</p>
      <p>${ok ? badge('시간 조건 충족', 'ok') : badge('시간 조건 미충족', 'warn')}</p>
      <div class="row">${btn(my === key ? '내 투표 취소' : '이 조합에 투표', 'voteFlight', { key }, my === key ? 'on' : 'primary')}
      ${dec === key ? '' : btn('이 조합으로 확정', 'decideFlight', { key })}</div></div>`;
  } else combo = `<p class="muted">가는 편과 오는 편을 하나씩 누르면 조합 합계가 나옵니다.</p>`;

  const votes = Object.entries(t).sort((a, b) => b[1].length - a[1].length);
  return `<h2>항공권</h2>
  <p class="muted">가격 조회일: ${esc(F.checkedAt || '-')} · ${esc(F.source || '')}</p>
  ${arrOf(F.history).length ? `<div class="card"><b>지난 조회 대비</b><ul>${arrOf(F.history).map(h => `<li>${esc(h.checkedAt)} ${esc(h.note)}</li>`).join('')}</ul><small>각 편의 ▲/▼는 지난 조회 가격과의 차이입니다.</small></div>` : ''}
  <div class="card"><h3>조합 투표 현황</h3>
    ${dec ? `<p>${badge('확정', 'ok')} ${esc(comboLabel(dec))} ${btn('확정 해제', 'decideFlight', { key: '' }, 'danger small')}</p>` : ''}
    ${votes.length ? votes.map(([k, ms]) => `<div class="row between"><span>${esc(comboLabel(k))} - <b>${ms.length}표</b> (${esc(names(ms))})</span>${btn('보기', 'showCombo', { key: k }, 'small')}${dec === k ? '' : btn('확정', 'decideFlight', { key: k }, 'small')}</div>`).join('') : '<p class="muted">아직 투표가 없습니다.</p>'}
    ${commentsBox('sec:flight')}
  </div>
  <div class="subtabs">${opts.map(k => `<button type="button" class="btn ${k === u.opt ? 'on' : ''}" data-act="flightOpt" data-k="${k}">${esc(dateLabel(k))}${S.doc?.decided?.date === k ? ' (확정)' : ''}</button>`).join('')}</div>
  <div class="card">
    <div class="row">
      <label class="chk"><input type="checkbox" data-act="flightFilter" data-f="lcc" ${u.lcc ? 'checked' : ''}>저가항공만</label>
      <label class="chk"><input type="checkbox" data-act="flightFilter" data-f="time" ${u.time ? 'checked' : ''}>시간 조건 맞는 편만</label>
    </div>
    <small class="muted">시간 조건: 가는 편 12:00 이전 출발, 오는 편 한국 13:00~16:00 도착</small>
    <div class="row">
      <select data-change="flightSel" data-f="airport" aria-label="공항">${[['all', '공항 전체'], ['pvg', '인천-푸둥'], ['sha', '김포-훙차오']].map(([v, l]) => `<option value="${v}"${u.airport === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select data-change="flightSel" data-f="sort" aria-label="정렬">${[['dep', '출발시간순'], ['price', '가격순']].map(([v, l]) => `<option value="${v}"${u.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div class="grid two">
    <div><h3>가는 편 (${outs.length})</h3>${list(outs, 'out')}</div>
    <div><h3>오는 편 (${ins.length})</h3>${list(ins, 'in')}</div>
  </div>
  ${combo}`;
}

export const actions = {
  flightOpt: el => { U().opt = el.dataset.k; render(true); },
  flightFilter: el => { const u = U(); u[el.dataset.f] = !u[el.dataset.f]; render(true); },
  flightSel: el => { U()[el.dataset.f] = el.value; render(true); },
  pickFlight: el => {
    const u = U(), m = u[el.dataset.dir];
    m[u.opt] = m[u.opt] === el.dataset.id ? null : el.dataset.id;
    render(true);
  },
  showCombo: el => {
    const { opt, outId, inId } = parseCombo(el.dataset.key), u = U();
    Object.assign(u, { opt, lcc: false, time: false, airport: 'all' });
    u.out[opt] = outId; u.in[opt] = inId;
    render(true);
  },
  voteFlight: el => {
    const key = el.dataset.key, before = S.doc?.votes?.flight?.[S.me] ?? null, after = before === key ? undefined : key;
    commit([{ path: ['votes', 'flight', S.me], value: after }], { action: 'vote', target: `votes.flight.${S.me}`, before, after: after ?? null, text: after ? `${jo(memberName(S.me), '가')} 항공 조합 투표: ${comboLabel(key)}` : `${jo(memberName(S.me), '가')} 항공 투표 취소` });
  },
  decideFlight: el => decide('flight', el.dataset.key || null, clabel),
};
