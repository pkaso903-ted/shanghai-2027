import { DAYS, planDateKey, addDays, weekday, closedOn, routeKm, comboFlights, num, MEMBER_IDS, jo } from './calc.js';
import { S, esc, empty, memberName, btn, badge, dv, toast } from './ui.js';
import { commitPlan, render } from './app.js';
import { allPlaces, placeById, catName } from './place.js';
import { AIRPORT } from './flight.js';
import { showMap } from './map.js';

const AP_LONG = { PVG: '푸둥공항', SHA: '훙차오공항', ICN: '인천공항', GMP: '김포공항' };
export function dayDate(d) {
  const o = S.data.dateCompare?.options?.[planDateKey(S.doc)];
  return o?.start ? addDays(o.start, DAYS.indexOf(d)) : null;
}
export function dayLabel(d) {
  const iso = dayDate(d), n = DAYS.indexOf(d) + 1;
  return iso ? `${n}일차 ${+iso.slice(5, 7)}/${+iso.slice(8, 10)}(${weekday(iso)})` : `${n}일차`;
}
const day = d => (Array.isArray(S.doc?.plan?.[d]) ? S.doc.plan[d] : []);
const key = () => Math.random().toString(36).slice(2, 10);
const pname = pid => placeById(pid)?.name_ko || '삭제된 장소';

// 일정 연산은 직렬화 가능한 op로 보내고, 서버 최신 plan에 다시 적용된다 (calc.applyPlanOp)
const short = d => dayLabel(d).split(' ')[0];
export function addToDay(pid, d) {
  if (!DAYS.includes(d) || !placeById(pid)) return;
  commitPlan({ type: 'add', d, item: { k: key(), pid, time: '', memo: '', by: S.me } }, `${jo(memberName(S.me), '가')} ${short(d)}에 ${pname(pid)} 추가`);
}
const blk = k => DAYS.flatMap(d => day(d).map(b => ({ ...b, d }))).find(b => b.k === k);

export function view() {
  const opt = planDateKey(S.doc), decided = !!S.doc?.decided?.date;
  const combo = comboFlights(S.data.flights, S.doc?.decided?.flight);
  const placed = new Set(DAYS.flatMap(d => day(d).map(b => b.pid)));
  const U = (S.ui.plan ||= { map: {} });
  const cols = DAYS.map((d, i) => {
    const iso = dayDate(d), blocks = day(d), pts = blocks.map(b => placeById(b.pid)).filter(Boolean);
    const km = routeKm(pts);
    const top = i === 0 && combo ? `<div class="blk fix">도착 ${esc(combo.out.arr)} ${esc(AP_LONG[combo.out.to] || combo.out.to)}</div>` : '';
    const bottom = i === 3 && combo ? `<div class="blk fix">출발 ${esc(combo.back.dep)} ${esc(AP_LONG[combo.back.from] || combo.back.from)}</div>` : '';
    const rows = blocks.map((b, j) => {
      const p = placeById(b.pid), closed = p && closedOn(p.closed, iso);
      return `<div class="blk" draggable="true" data-d="${d}" data-k="${esc(b.k)}">
        <div class="row between"><b>${j + 1}. ${esc(pname(b.pid))}</b><span>${p ? badge(catName(p.cat)) : ''}${closed ? ' ' + badge(`휴무 주의: ${p.closed}`, 'bad') : ''}</span></div>
        <div class="row">
          <input type="time" data-draft="pt:${esc(b.k)}" data-commit="planTime" data-d="${d}" data-k="${esc(b.k)}" data-orig="${esc(b.time || '')}" value="${esc(dv('pt:' + b.k, b.time || ''))}" aria-label="시간">
          <input data-draft="pm:${esc(b.k)}" data-commit="planMemo" data-d="${d}" data-k="${esc(b.k)}" data-orig="${esc(b.memo || '')}" value="${esc(dv('pm:' + b.k, b.memo || ''))}" maxlength="100" placeholder="메모" aria-label="메모">
        </div>
        <div class="row">
          ${btn('위로', 'planMove', { d, k: b.k, dir: -1 }, 'small')}${btn('아래로', 'planMove', { d, k: b.k, dir: 1 }, 'small')}
          <select data-change="planDay" data-d="${d}" data-k="${esc(b.k)}" aria-label="다른 날로 이동"><option value="">다른 날로</option>${DAYS.filter(x => x !== d).map(x => `<option value="${x}">${esc(dayLabel(x))}</option>`).join('')}</select>
          ${btn('삭제', 'planDel', { d, k: b.k }, 'danger small')}
        </div>
        <small class="muted">${esc(memberName(b.by))} 추가</small>
      </div>`;
    }).join('');
    const hasLL = pts.some(p => num(p.lat) != null && num(p.lng) != null);
    return `<div class="card" data-drop="${d}">
      <div class="row between"><h3>${esc(dayLabel(d))}</h3><span>${km > 0 ? badge(`직선 ${km.toFixed(1)}km`) : ''} ${blocks.length}곳</span></div>
      ${top}${rows || '<p class="muted">아직 넣은 장소가 없습니다</p>'}${bottom}
      ${hasLL ? btn(U.map[d] ? '지도 닫기' : '지도 보기', 'planMap', { d }, 'small') : ''}
      ${U.map[d] && hasLL ? `<div id="map-${d}" class="map"></div>` : ''}
    </div>`;
  }).join('');

  const liked = allPlaces().filter(p => MEMBER_IDS.some(m => S.doc?.likes?.[p.id]?.[m]) && !placed.has(p.id));
  return `<h2>일정 짜기</h2>
  <p>${decided ? badge('날짜 확정', 'ok') : badge('미확정', 'warn')} ${esc(S.data.dateCompare?.options?.[opt]?.label || opt + '안')} 기준 ${decided ? '' : '(득표 많은 쪽, 동률이면 A)'}</p>
  ${S.data.dateCompare?.options ? '' : empty('날짜 자료 준비 중')}
  <div class="days">${cols}</div>
  <div class="card"><h3>아직 안 넣은 찜 (${liked.length})</h3>
    ${liked.length ? liked.map(p => `<div class="row between"><span>${esc(p.name_ko)} <small>${esc(catName(p.cat))}</small></span><span class="row">${DAYS.map((d, i) => btn(`${i + 1}일`, 'planAddLiked', { id: p.id, d }, 'small')).join('')}</span></div>`).join('') : '<p class="muted">장소 탭에서 찜한 곳이 여기에 나옵니다.</p>'}
  </div>`;
}

export function after() {
  const U = S.ui.plan || { map: {} };
  for (const d of DAYS) if (U.map[d]) {
    const pts = day(d).map(b => placeById(b.pid)).filter(p => p && num(p.lat) != null && num(p.lng) != null).map(p => ({ lat: p.lat, lng: p.lng, label: p.name_ko }));
    showMap('map-' + d, pts, true);
  }
}

function edit(k, field, value, label) {
  const b = blk(k);
  if (!b) return toast('그 사이 다른 사람이 바꿨습니다. 다시 확인해 주세요');
  if ((b[field] || '') === value) return;
  commitPlan({ type: 'edit', k, field, value }, `${jo(memberName(S.me), '가')} ${pname(b.pid)} ${label} 변경`);
}
function moveTo(k, to, beforeK) {
  const b = blk(k);
  if (!b || !DAYS.includes(to)) return;
  commitPlan({ type: 'move', k, to, beforeK: beforeK || null }, `${jo(memberName(S.me), '가')} ${jo(pname(b.pid), '를')} ${to === b.d ? short(to) + ' 안에서' : jo(short(to), '로')} 이동`);
}

export const actions = {
  planTime: el => { edit(el.dataset.k, 'time', el.value, '시간'); delete S.drafts['pt:' + el.dataset.k]; },
  planMemo: el => { edit(el.dataset.k, 'memo', el.value.trim().slice(0, 100), '메모'); delete S.drafts['pm:' + el.dataset.k]; },
  planMove: el => { const b = blk(el.dataset.k); if (b) commitPlan({ type: 'swap', k: b.k, dir: +el.dataset.dir }, `${jo(memberName(S.me), '가')} ${short(b.d)} 순서 변경`); },
  planDay: el => { if (el.value) moveTo(el.dataset.k, el.value); },
  planDel: el => {
    const b = blk(el.dataset.k);
    if (!b || !confirm(`${jo(pname(b.pid), '를')} 일정에서 뺄까요?`)) return;
    commitPlan({ type: 'del', k: b.k }, `${jo(memberName(S.me), '가')} ${short(b.d)}에서 ${pname(b.pid)} 삭제`);
  },
  planMap: el => { const m = S.ui.plan.map; m[el.dataset.d] = !m[el.dataset.d]; render(true); },
  planAddLiked: el => addToDay(el.dataset.id, el.dataset.d),
};

// PC 드래그 (모바일은 버튼)
let drag = null;
document.addEventListener('dragstart', e => {
  const b = e.target.closest?.('.blk[draggable]');
  if (b) { drag = { d: b.dataset.d, k: b.dataset.k }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.dataset.k); }
});
document.addEventListener('dragover', e => { if (drag && e.target.closest?.('[data-drop]')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const zone = e.target.closest?.('[data-drop]');
  if (!drag || !zone) return;
  e.preventDefault();
  const over = e.target.closest('.blk[draggable]');
  if (!(over && over.dataset.k === drag.k)) moveTo(drag.k, zone.dataset.drop, over?.dataset.k);
  drag = null;
});
document.addEventListener('dragend', () => (drag = null));
