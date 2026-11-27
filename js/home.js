import { tally, tallyMulti, leader, dday, estimate, won, DAYS, MEMBER_IDS } from './calc.js';
import { S, esc, memberName, badge } from './ui.js';
import { dateLabel } from './date.js';
import { comboLabel } from './flight.js';
import { areaName, hotelName } from './hotel.js';
import { logLine } from './log.js';

const counts = (t, label) => Object.entries(t).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${label(k)} ${v.length}`).join(' : ');

export function view() {
  const d = S.doc || {}, dec = d.decided || {}, opts = S.data.dateCompare?.options;
  const dd = dec.date && opts?.[dec.date] ? `${esc(dateLabel(dec.date))} ${dday(opts[dec.date].start)}`
    : opts ? ['A', 'B'].filter(k => opts[k]).map(k => `${esc(dateLabel(k))} ${dday(opts[k].start)}`).join(' / ') : '';
  const stat = (title, href, decidedVal, decLabel, t, label) => `<a class="stat" href="#${href}"><b>${title}</b>
    ${decidedVal ? `${badge('확정', 'ok')}<br>${esc(decLabel(decidedVal))}` : Object.keys(t).length ? `${badge('투표 중', 'warn')}<br>${esc(counts(t, label))}` : badge('투표 전')}</a>`;
  const placed = DAYS.reduce((a, k) => a + (Array.isArray(d.plan?.[k]) ? d.plan[k].length : 0), 0);
  const e = estimate(d, S.data.flights, S.data.hotels);
  const now = Date.now();
  const online = MEMBER_IDS.filter(m => { const t = d.presence?.[m]?.toMillis?.(); return t && now - t < 120000; });
  const ft = tally(d.votes?.flight), fl = leader(ft);
  return `<div class="hero"><h1>2027 상하이 3박4일</h1><p class="big">${dd || '날짜 자료 준비 중'}</p></div>
  <div class="stat-grid">
    ${stat('날짜', 'date', dec.date, dateLabel, tally(d.votes?.date), k => k)}
    <a class="stat" href="#flight"><b>항공</b>${dec.flight ? `${badge('확정', 'ok')}<br>${esc(comboLabel(dec.flight))}` : fl ? `${badge('투표 중', 'warn')}<br>1위 ${ft[fl].length}표: ${esc(comboLabel(fl))}` : badge('투표 전')}</a>
    ${stat('숙소 지역', 'hotel', dec.hotelArea, areaName, tally(d.votes?.hotelArea), areaName)}
    ${stat('숙소', 'hotel', dec.hotel, hotelName, tallyMulti(d.votes?.hotel), hotelName)}
    <a class="stat" href="#plan"><b>일정</b>${placed}곳 배치</a>
  </div>
  <div class="card"><div class="row between"><b>1인 예상 경비</b><span class="big">${won(e.per)}</span></div><small class="muted">3인 ${won(e.all)} · <a class="btn small" href="#money">자세히</a></small></div>
  <div class="card"><b>접속 중</b> ${online.length ? online.map(m => badge(memberName(m), 'ok')).join(' ') : '<span class="muted">최근 2분 내 활동 없음</span>'}</div>
  <div class="card"><div class="row between"><h3>최근 변경</h3><a class="btn small" href="#log">전체 보기</a></div>
    ${S.log.items.slice(0, 5).map(logLine).join('') || '<p class="muted">아직 변경이 없습니다.</p>'}</div>`;
}
