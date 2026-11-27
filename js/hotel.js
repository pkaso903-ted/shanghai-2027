import { list as arrOf, tally, tallyMulti, won, num, planDateKey, jo } from './calc.js';
import { S, esc, empty, link, names, memberName, commentsBox, btn, badge, initial } from './ui.js';
import { commit, render } from './app.js';
import { decide, dateLabel } from './date.js';
import { showMap } from './map.js';

const H = () => S.data.hotels || {};
export const areaName = k => arrOf(H().areas).find(a => a.key === k)?.name || k;
export const hotelName = id => arrOf(H().hotels).find(h => h.id === id)?.name_ko || id;
const alabel = Object.assign(areaName, { title: '숙소 지역' });
const hlabel = Object.assign(hotelName, { title: '숙소' });
const U = () => (S.ui.hotel ||= { area: 'all', sort: 'base', map: false, own: false });
const ownBed = h => /각자/.test(h.beds || '');
const li = arr => (Array.isArray(arr) && arr.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const kv = pairs => `<dl class="kv">${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

export function view() {
  const areas = arrOf(H().areas), hotels = arrOf(H().hotels);
  if (!areas.length && !hotels.length) return `<h2>숙소</h2>${empty()}`;
  const u = U(), dec = S.doc?.decided || {}, opt = planDateKey(S.doc);
  const ta = tally(S.doc?.votes?.hotelArea), th = tallyMulti(S.doc?.votes?.hotel);
  const myArea = S.doc?.votes?.hotelArea?.[S.me], myH = S.doc?.votes?.hotel?.[S.me] || [];
  const areaCards = areas.map(a => `<div class="card ${dec.hotelArea === a.key ? 'hl' : ''}">
    <div class="row between"><h3>${esc(a.name)}</h3>${dec.hotelArea === a.key ? badge('확정', 'ok') : ''}</div>
    ${a.pros?.length ? `<b>장점</b>${li(a.pros)}` : ''}${a.cons?.length ? `<b>단점</b>${li(a.cons)}` : ''}
    ${kv([['지하철', a.metro], ['푸둥공항', a.to_pvg], ['훙차오역', a.to_hongqiao], ['가격대', a.price_level], ['추천', a.best_for]])}
    <div class="row">${btn(myArea === a.key ? '내 투표 (취소)' : '이 지역 투표', 'voteArea', { k: a.key }, myArea === a.key ? 'on' : '')}
      <span>${ta[a.key]?.length || 0}표${ta[a.key] ? ` (${esc(names(ta[a.key]))})` : ''}</span>
      ${dec.hotelArea === a.key ? btn('확정 해제', 'decideArea', { k: '' }, 'danger small') : btn('확정', 'decideArea', { k: a.key }, 'small')}</div>
  </div>`).join('');

  let list = hotels.filter(h => (u.area === 'all' || h.area === u.area) && (!u.own || ownBed(h)));
  if (u.sort === 'votes') list = [...list].sort((a, b) => (th[b.id]?.length || 0) - (th[a.id]?.length || 0));
  if (u.sort === 'price') list = [...list].sort((a, b) => (num(a['price' + opt + '_krw']) ?? 1e12) - (num(b['price' + opt + '_krw']) ?? 1e12));
  const hasLL = hotels.some(h => num(h.lat) != null && num(h.lng) != null);
  const priceCell = (h, k) => {
    const tot = num(h[`price${k}_krw`]), night = num(h[`night${k}_krw`]);
    if (tot == null && night == null) return `<div class="card" style="margin:0;padding:8px"><b>${esc(dateLabel(k))}</b><br><small>${esc(k)} 일정 가격 없음(매진/미노출)</small></div>`;
    return `<div class="${k === opt ? 'card hl' : 'card'}" style="margin:0;padding:8px"><b>${esc(dateLabel(k))}${k === opt ? (dec.date ? ' (확정)' : ' (유력)') : ''}</b><br>3박 ${won(tot)}${night != null ? `<br><small>1박 ${won(night)}</small>` : ''}${tot != null ? `<br>1인 ${won(tot / 3)}` : ''}</div>`;
  };
  const cards = list.map(h => `<div class="card ${dec.hotel === h.id ? 'hl' : ''}">
    <div class="row between"><h3>${esc(h.name_ko || h.name_en || h.id)}</h3>${dec.hotel === h.id ? badge('확정', 'ok') : ''}</div>
    ${h.name_en || h.name_zh ? `<p class="muted">${esc([h.name_en, h.name_zh].filter(Boolean).join(' · '))}</p>` : ''}
    <p>${[h.area && badge(areaName(h.area)), num(h.stars) != null && badge(h.stars + '성'), h.rating != null && h.rating !== '' && esc('평점 ' + h.rating), h.beds && badge(h.beds, ownBed(h) ? 'ok' : 'warn')].filter(Boolean).join(' ')}</p>
    ${kv([['객실', h.room], ['주소', h.address], ['지하철', h.metro], ['메모', h.note]])}
    <div class="grid two">${priceCell(h, 'A')}${priceCell(h, 'B')}</div>
    ${h.price_source ? `<small class="muted">${esc(h.price_source)}</small>` : ''}
    <div class="row">${link(h.url, '예약 페이지 열기', 'btn')}
      ${btn(myH.includes(h.id) ? '찜 취소' : '찜', 'voteHotel', { id: h.id }, 'heart ' + (myH.includes(h.id) ? 'on' : ''))}
      <span class="likers">${th[h.id]?.length || 0}표 ${(th[h.id] || []).map(initial).join(' ')}</span>
      ${dec.hotel === h.id ? btn('확정 해제', 'decideHotel', { id: '' }, 'danger small') : btn('확정', 'decideHotel', { id: h.id }, 'small')}</div>
    ${commentsBox('hotel:' + h.id)}
  </div>`).join('');

  return `<h2>숙소</h2>
  ${H().generated || H().checkedAt ? `<p class="muted">조회일 ${esc(H().checkedAt || H().generated)}${H().note ? ' · ' + esc(H().note) : ''}</p>` : ''}
  ${areas.length ? `<h3>지역 비교</h3><div class="grid two">${areaCards}</div>` : ''}
  <h3>숙소 후보 (${list.length})</h3>
  ${hotels.length ? `<div class="card row">
    <select data-change="hotelSel" data-f="area" aria-label="지역 필터"><option value="all">전체 지역</option>${areas.map(a => `<option value="${esc(a.key)}"${u.area === a.key ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    <select data-change="hotelSel" data-f="sort" aria-label="정렬">${[['base', '기본순'], ['votes', '득표 많은 순'], ['price', '가격 낮은 순']].map(([v, l]) => `<option value="${v}"${u.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" data-act="hotelOwn" ${u.own ? 'checked' : ''}>각자 침대만</label>
    ${hasLL ? btn(u.map ? '지도 닫기' : '지도 보기', 'hotelMap') : ''}
  </div>
  ${u.map && hasLL ? '<div id="hotelMap" class="map"></div>' : ''}
  ${cards || empty('해당 지역 숙소가 없습니다')}` : empty()}`;
}

export function after() {
  const u = U();
  if (!u.map) return;
  const pts = arrOf(H().hotels).filter(h => (u.area === 'all' || h.area === u.area) && (!u.own || ownBed(h)) && num(h.lat) != null && num(h.lng) != null)
    .map(h => ({ lat: h.lat, lng: h.lng, label: h.name_ko || h.id }));
  showMap('hotelMap', pts, false);
}

export const actions = {
  hotelSel: el => { U()[el.dataset.f] = el.value; render(true); },
  hotelOwn: () => { U().own = !U().own; render(true); },
  hotelMap: () => { U().map = !U().map; render(true); },
  voteArea: el => {
    const k = el.dataset.k, before = S.doc?.votes?.hotelArea?.[S.me] ?? null, after = before === k ? undefined : k;
    commit([{ path: ['votes', 'hotelArea', S.me], value: after }], { action: 'vote', target: `votes.hotelArea.${S.me}`, before, after: after ?? null, text: after ? `${jo(memberName(S.me), '가')} 숙소 지역 ${areaName(k)} 투표` : `${jo(memberName(S.me), '가')} 숙소 지역 투표 취소` });
  },
  voteHotel: el => {
    const id = el.dataset.id, before = S.doc?.votes?.hotel?.[S.me] || [], has = before.includes(id);
    const after = has ? before.filter(x => x !== id) : [...before, id];
    commit([{ path: ['votes', 'hotel', S.me], value: after }], { action: 'vote', target: `votes.hotel.${S.me}`, before, after, text: `${jo(memberName(S.me), '가')} 숙소 ${hotelName(id)} ${has ? '찜 취소' : '찜'}` });
  },
  decideArea: el => decide('hotelArea', el.dataset.k || null, alabel),
  decideHotel: el => decide('hotel', el.dataset.id || null, hlabel),
};
