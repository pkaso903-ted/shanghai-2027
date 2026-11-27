import { ratingText, ratingScore, num, safeUrl, MEMBER_IDS, jo } from './calc.js';
import { S, esc, empty, link, memberName, commentsBox, btn, badge, initial, dv, clearDrafts, toast } from './ui.js';
import { commit, render } from './app.js';
import { addToDay, dayLabel } from './plan.js';
import * as store from './store.js';

export const CATS = [['all', '전체'], ['food', '먹거리'], ['sight', '관광'], ['night', '야경·공연'], ['daytrip', '근교'], ['shopping', '쇼핑'], ['nightlife', '밤놀이'], ['massage', '마사지']];
export const catName = k => CATS.find(c => c[0] === k)?.[1] || k || '기타';

// 데이터 장소 + 직접 추가한 장소를 같은 모양으로
export function allPlaces() {
  const base = Array.isArray(S.data.places) ? S.data.places.filter(p => p && typeof p === 'object' && p.id) : [];
  const custom = Object.entries(S.doc?.customPlaces || {}).map(([id, c]) => ({
    id, cat: c.cat, sub: '', name_ko: c.name, area: c.area, oneliner: c.memo, sources: c.url ? [c.url] : [], custom: true, by: c.by,
  }));
  return [...base, ...custom];
}
export const placeById = id => allPlaces().find(p => p.id === id);
export const inCatOf = (p, k) => k === 'all' || p.cat === k || (Array.isArray(p.tags) && p.tags.includes(k));
const U = () => (S.ui.place ||= { cat: 'all', sub: '', area: '', q: '', sort: 'likes', open: {}, add: false });
const likesOf = id => MEMBER_IDS.filter(m => S.doc?.likes?.[id]?.[m]);

function mapLinks(p) {
  const name = p.name_zh || p.name_ko || '';
  const hasLL = num(p.lat) != null && num(p.lng) != null;
  const amap = hasLL ? `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(name)}` : `https://uri.amap.com/search?keyword=${encodeURIComponent(name)}`;
  const g = hasLL ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name_en || name)}`;
  return name ? `${link(amap, '고덕지도', 'btn small')} ${link(g, '구글지도', 'btn small')}` : '';
}

function card(p) {
  const u = U(), likes = likesOf(p.id), mine = likes.includes(S.me), open = u.open[p.id];
  const has = v => v != null && v !== '';
  const price = [has(p.price_cny) && `1인 약 ${p.price_cny}위안`, has(p.ticket_cny) && `입장료 ${p.ticket_cny}위안`].filter(Boolean).join(' · ');
  const info = [
    ['지역', p.area], ['평점', ratingText(p.rating)], ['가격', price], ['영업', p.hours], ['휴무', p.closed],
    ['예약', p.reservation === true ? '필요' : p.reservation === false ? '불필요' : p.reservation], ['대기', p.queue],
    ['소요', num(p.duration_min) != null ? `약 ${p.duration_min}분` : ''], ['추천 시간', p.best_time], ['교통', p.transport],
    ['인기 근거', p.evidence], ['팁', p.tips], ['대표 메뉴', Array.isArray(p.must_order) ? p.must_order.join(', ') : ''],
  ].filter(([, v]) => v != null && v !== '');
  const srcs = (Array.isArray(p.sources) ? p.sources : []).filter(safeUrl);
  return `<div class="card place">
    ${p.photo && /^[\w./-]+$/.test(p.photo) && !p.photo.includes('..') ? `<div class="photo-wrap"><img class="photo" src="${esc(p.photo)}" alt="${esc(p.name_ko)}" loading="lazy" onerror="this.parentElement.remove()">${p.photoGeneric ? '<span class="photo-label">참고 사진(음식 종류)</span>' : ''}</div>` : ''}
    <div class="row between"><h3>${esc(p.name_ko || p.name_en || p.id)}${p.branch ? ` <small>${esc(p.branch)}</small>` : ''}</h3>
      <span>${badge(catName(p.cat))}${p.sub ? ' ' + badge(p.sub) : ''}${p.custom ? ' ' + badge(`${memberName(p.by)} 추가`, 'pri') : ''}</span></div>
    ${p.name_zh ? `<p class="zh">${esc(p.name_zh)} ${btn('중국어 크게', 'zhBig', { id: p.id }, 'small')}</p>` : ''}
    ${p.name_en ? `<p class="muted">${esc(p.name_en)}</p>` : ''}
    ${p.oneliner ? `<p>${esc(p.oneliner)}</p>` : ''}
    ${info.length ? `<dl class="kv">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    <div class="row">${mapLinks(p)}${srcs.map((s, i) => link(s, `출처${srcs.length > 1 ? ' ' + (i + 1) : ''}`, 'btn small')).join(' ')}</div>
    <div class="row">
      ${btn(mine ? '찜 취소' : '찜', 'like', { id: p.id }, 'heart ' + (mine ? 'on' : ''))}
      <span class="likers">${likes.length ? `찜 ${likes.length} · ${likes.map(initial).map(esc).join(' ')}` : '찜 0'}</span>
      ${btn('일정에 넣기', 'addPlanPick', { id: p.id }, 'primary')}
      ${btn(open ? '의견 닫기' : `의견 ${Object.keys(S.doc?.comments?.['place:' + p.id] || {}).length}`, 'placeOpen', { id: p.id }, 'small')}
    </div>
    ${open ? commentsBox('place:' + p.id) : ''}
  </div>`;
}

const chip = (label, n, act, k, on) => `<button type="button" class="btn chip ${on ? 'on' : ''}" data-act="${act}" data-k="${esc(k)}" aria-pressed="${on}">${esc(label)}${n != null ? ` <small>${n}</small>` : ''}</button>`;
export function view() {
  const u = U(), all = allPlaces();
  const addForm = u.add ? `<form class="card" data-submit="addPlace">
      <h3>장소 직접 추가</h3>
      <div class="row"><input data-draft="np:name" value="${esc(dv('np:name'))}" maxlength="40" placeholder="이름 (필수)" aria-label="이름" required></div>
      <div class="row"><select data-draft="np:cat" aria-label="분류">${CATS.slice(1).map(([k, l]) => `<option value="${k}"${dv('np:cat', 'food') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input data-draft="np:area" value="${esc(dv('np:area'))}" maxlength="30" placeholder="지역" aria-label="지역"></div>
      <div class="row"><input data-draft="np:memo" value="${esc(dv('np:memo'))}" maxlength="200" placeholder="메모" aria-label="메모"></div>
      <div class="row"><input data-draft="np:url" value="${esc(dv('np:url'))}" maxlength="500" type="url" placeholder="링크 (https://...)" aria-label="링크"></div>
      <div class="row"><button class="btn primary" type="submit">추가</button>${btn('닫기', 'placeAdd')}</div>
    </form>` : '';
  const head = `<div class="row between"><h2>장소 후보</h2>${btn(u.add ? '추가 닫기' : '장소 직접 추가', 'placeAdd')}</div>${addForm}`;
  if (!all.length) return head + empty();

  const inCat = all.filter(p => inCatOf(p, u.cat));
  const subs = [...new Set(inCat.map(p => p.sub).filter(Boolean))];
  if (u.sub && !subs.includes(u.sub)) u.sub = '';
  const areas = [...new Set(all.map(p => p.area).filter(Boolean))].sort();
  const q = u.q.trim().toLowerCase();
  let list = inCat.filter(p => (!u.sub || p.sub === u.sub) && (!u.area || p.area === u.area)
    && (!q || [p.name_ko, p.name_zh, p.name_en, p.oneliner].some(s => String(s || '').toLowerCase().includes(q))));
  const nm = p => String(p.name_ko || p.name_en || '');
  if (u.sort === 'likes') list.sort((a, b) => likesOf(b.id).length - likesOf(a.id).length || nm(a).localeCompare(nm(b), 'ko'));
  else if (u.sort === 'rating') list.sort((a, b) => ratingScore(b.rating) - ratingScore(a.rating));
  else list.sort((a, b) => nm(a).localeCompare(nm(b), 'ko'));

  return `${head}
  <div class="chips" role="tablist">${CATS.map(([k, l]) => chip(l, all.filter(p => inCatOf(p, k)).length, 'placeCat', k, u.cat === k)).join('')}</div>
  ${subs.length ? `<div class="chips">${chip('하위 전체', null, 'placeSub', '', !u.sub)}${subs.map(s => chip(s, inCat.filter(p => p.sub === s).length, 'placeSub', s, u.sub === s)).join('')}</div>` : ''}
  <div class="card row">
    <input type="search" data-draft="pq" data-live="placeQ" value="${esc(u.q)}" placeholder="검색 (한/중/영 이름)" aria-label="검색">
    <select data-change="placeSel" data-f="area" aria-label="지역 필터"><option value="">전체 지역</option>${areas.map(a => `<option${u.area === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select data-change="placeSel" data-f="sort" aria-label="정렬">${[['likes', '찜 많은 순'], ['rating', '평점 순'], ['name', '이름 순']].map(([v, l]) => `<option value="${v}"${u.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
  </div>
  <p class="muted">${list.length}곳</p>
  <div id="placeList" class="grid two">${list.map(card).join('') || empty('조건에 맞는 장소가 없습니다')}</div>`;
}

export const modal = {
  zh: m => {
    const p = placeById(m.id) || {};
    // branch는 한국어라 기사용 큰 글씨에서 제외, address_zh 있을 때만 중국어 주소 표시
    return `<div class="zh-big" lang="zh">${esc(p.name_zh || p.name_ko)}</div>
      ${p.address_zh ? `<div class="zh-sub" lang="zh">${esc(p.address_zh)}</div>` : ''}
      <div class="zh-sub" lang="zh">请带我去这里，谢谢</div>
      <p class="muted">${esc(p.name_ko)}${p.branch ? ' · ' + esc(p.branch) : ''}${p.area ? ' · ' + esc(p.area) : ''}</p>
      ${btn('닫기', 'closeModal', {}, 'primary')}`;
  },
  addPlan: m => `<h2>${esc(placeById(m.id)?.name_ko || '')}</h2><p>몇 일차에 넣을까요?</p>
    <div class="grid two">${['d1', 'd2', 'd3', 'd4'].map(d => btn(dayLabel(d), 'addPlanDo', { id: m.id, d }, 'primary')).join('')}</div>
    ${btn('취소', 'closeModal')}`,
};

export const actions = {
  placeCat: el => { const u = U(); u.cat = el.dataset.k; u.sub = ''; render(true); },
  placeSub: el => { U().sub = el.dataset.k; render(true); },
  placeSel: el => { U()[el.dataset.f] = el.value; render(true); },
  placeQ: el => {
    U().q = el.value;
    // 입력 중엔 목록만 갈아끼워 포커스 유지
    const tmp = document.createElement('div');
    tmp.innerHTML = view();
    document.getElementById('placeList')?.replaceWith(tmp.querySelector('#placeList'));
  },
  placeAdd: () => { U().add = !U().add; render(true); },
  placeOpen: el => { const o = U().open; o[el.dataset.id] = !o[el.dataset.id]; render(true); },
  zhBig: el => { S.ui.modal = { type: 'zh', id: el.dataset.id }; render(true); },
  addPlanPick: el => { S.ui.modal = { type: 'addPlan', id: el.dataset.id }; render(true); },
  addPlanDo: el => { addToDay(el.dataset.id, el.dataset.d); S.ui.modal = null; render(true); },
  like: el => {
    const id = el.dataset.id, before = !!S.doc?.likes?.[id]?.[S.me];
    commit([{ path: ['likes', id, S.me], value: before ? undefined : true }], { action: 'like', target: `likes.${id}.${S.me}`, before, after: !before, text: `${jo(memberName(S.me), '가')} ${placeById(id)?.name_ko || id} ${before ? '찜 취소' : '찜'}` });
  },
  addPlace: () => {
    if (!S.me) return commit([]);
    const g = k => String(S.drafts['np:' + k] ?? (k === 'cat' ? 'food' : '')).trim();
    const name = g('name'), cat = g('cat'), url = g('url');
    if (!name) return toast('이름을 입력해 주세요');
    if (!CATS.some(c => c[0] === cat && c[0] !== 'all')) return toast('분류를 골라 주세요');
    if (url && !safeUrl(url)) return toast('링크는 http:// 또는 https:// 로 시작해야 합니다');
    const id = 'c_' + store.newId();
    const val = { name: name.slice(0, 40), cat, area: g('area').slice(0, 30), memo: g('memo').slice(0, 200), url: url ? safeUrl(url) : '', by: S.me };
    commit([{ path: ['customPlaces', id], value: val }], { action: 'place', target: `customPlaces.${id}`, before: null, after: val, text: `${jo(memberName(S.me), '가')} 장소 추가: ${val.name}` });
    clearDrafts('np:');
    U().add = false;
    toast('장소를 추가했습니다');
    render(true);
  },
};
