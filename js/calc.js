// 순수 계산 함수 (DOM·Firebase 의존 없음 → Node 테스트 가능)

export const MEMBER_IDS = ['m1', 'm2', 'm3'];
export const DAYS = ['d1', 'd2', 'd3', 'd4'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// 배열 안의 null·문자열 등 잘못된 항목은 버린다 (데이터 파일 방어)
export const list = x => (Array.isArray(x) ? x.filter(o => o && typeof o === 'object') : []);
export const won = v => (num(v) == null ? '-' : Math.round(v).toLocaleString('ko-KR') + '원');

// "A|outId|inId" 형식 집계: {값: [memberId...]}
export function tally(votes = {}) {
  const t = {};
  for (const m of MEMBER_IDS) {
    const v = votes[m];
    if (v == null || v === '') continue;
    (t[v] ||= []).push(m);
  }
  return t;
}
// 다중 선택(배열) 집계
export function tallyMulti(votes = {}) {
  const t = {};
  for (const m of MEMBER_IDS) for (const v of Array.isArray(votes[m]) ? votes[m] : []) (t[v] ||= []).push(m);
  return t;
}
// 최다 득표 키 (동률이면 order 순서 앞쪽)
export function leader(t, order = []) {
  let best = null, n = 0;
  const keys = [...order.filter(k => k in t), ...Object.keys(t).filter(k => !order.includes(k))];
  for (const k of keys) if (t[k].length > n) { best = k; n = t[k].length; }
  return best;
}

// 날짜안: 확정 > 득표 많은 쪽 > A
export function planDateKey(doc) {
  const d = doc?.decided?.date;
  if (d === 'A' || d === 'B') return d;
  const t = tally(doc?.votes?.date);
  return (t.B?.length || 0) > (t.A?.length || 0) ? 'B' : 'A';
}

export const toMin = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
// 현지(상하이) 기준 분 단위 시각: 날짜 + 시각 (+1일)
function stamp(date, hhmm, plusDay) {
  const t = Date.parse(date + 'T00:00:00Z');
  const m = toMin(hhmm);
  if (Number.isNaN(t) || m == null) return null;
  return t / 60000 + m + (plusDay ? 1440 : 0);
}
// 체류 시간(분): 가는 편 도착 ~ 오는 편 출발 (둘 다 상하이 현지 시각)
export function stayMinutes(out, back) {
  const a = stamp(out?.date, out?.arr, out?.nextDay), b = stamp(back?.date, back?.dep, false);
  return a == null || b == null ? null : b - a;
}
export const fmtDur = m => (m == null ? '-' : `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`);

// 시간 조건: 가는 편 출발 12:00 이전, 오는 편 한국 도착 13:00~16:00
export const outOk = f => toMin(f?.dep) != null && toMin(f.dep) < 720;
export const inOk = f => toMin(f?.arr) != null && !f.nextDay && toMin(f.arr) >= 780 && toMin(f.arr) <= 960;

export function parseCombo(s) {
  const [opt, outId, inId] = String(s || '').split('|');
  return { opt, outId, inId };
}
export function comboFlights(flights, s) {
  const { opt, outId, inId } = parseCombo(s);
  const o = flights?.options?.[opt];
  const out = list(o?.out).find(f => f.id === outId), back = list(o?.in).find(f => f.id === inId);
  return out && back ? { opt, out, back } : null;
}
// 최저가 조합: 시간 조건 충족 편 우선, 없으면 전체 최저
export function cheapestCombo(flights, opt) {
  const o = flights?.options?.[opt];
  const min = (arr, ok) => {
    const ps = list(arr).filter(f => num(f.price) != null).sort((a, b) => a.price - b.price);
    return ps.find(ok) || ps[0];
  };
  const out = min(o?.out, outOk), back = min(o?.in, inOk);
  return out && back ? { opt, out, back } : null;
}

// 경비 추정 (1인)
export function estimate(doc, flights, hotels) {
  const opt = planDateKey(doc);
  const b = { foodPerDayKrw: 70000, localTransportKrw: 60000, etcKrw: 50000, ...(doc?.budget || {}) };
  let combo = comboFlights(flights, doc?.decided?.flight), flightNote = '확정 조합';
  if (!combo) {
    const lead = leader(tally(doc?.votes?.flight));
    combo = lead && comboFlights(flights, lead);
    flightNote = '최다 득표 조합';
  }
  if (!combo) { combo = cheapestCombo(flights, opt); flightNote = '최저가 조합'; }
  const flight = combo ? (num(combo.out.price) || 0) + (num(combo.back.price) || 0) : null;

  const hl = list(hotels?.hotels);
  const total = h => num(h?.['price' + opt + '_krw']);
  let hotel = null, hotelNote = '';
  const dh = hl.find(h => h.id === doc?.decided?.hotel);
  if (dh && total(dh) != null) { hotel = total(dh) / 3; hotelNote = '확정 숙소 총액 / 3'; }
  else {
    const ps = hl.map(total).filter(v => v != null);
    if (ps.length) { hotel = ps.reduce((a, c) => a + c, 0) / ps.length / 3; hotelNote = `후보 ${ps.length}곳 평균 / 3`; }
  }
  const food = (num(b.foodPerDayKrw) || 0) * 4, trans = num(b.localTransportKrw) || 0, etc = num(b.etcKrw) || 0;
  const per = (flight || 0) + (hotel || 0) + food + trans + etc;
  return { opt, combo, flight, flightNote, hotel, hotelNote, food, trans, etc, per, all: per * 3 };
}

// 정산: expenses → 사람별 낸 돈/써야 할 돈/차액 + 최소 송금 목록
export function settle(expenses = {}, members = MEMBER_IDS) {
  const paid = {}, owe = {};
  for (const m of members) { paid[m] = 0; owe[m] = 0; }
  for (const e of Object.values(expenses || {})) {
    const amt = num(e?.amountKrw);
    const split = (Array.isArray(e?.split) ? e.split : []).filter(m => members.includes(m));
    if (amt == null || amt <= 0 || !members.includes(e.payer) || !split.length) continue;
    paid[e.payer] += amt;
    for (const m of split) owe[m] += amt / split.length;
  }
  const rows = members.map(m => ({ m, paid: Math.round(paid[m]), owe: Math.round(owe[m]), diff: Math.round(paid[m] - owe[m]) }));
  // 그리디: 가장 많이 받을 사람 ← 가장 많이 낼 사람 (n=3이면 최소 송금 수 보장)
  const cred = rows.filter(r => r.diff > 0).map(r => ({ m: r.m, v: r.diff }));
  const debt = rows.filter(r => r.diff < 0).map(r => ({ m: r.m, v: -r.diff }));
  const transfers = [];
  while (cred.length && debt.length) {
    cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
    const c = cred[0], d = debt[0], v = Math.min(c.v, d.v);
    if (v >= 1) transfers.push({ from: d.m, to: c.m, amount: v });
    c.v -= v; d.v -= v;
    if (c.v < 1) cred.shift();
    if (d.v < 1) debt.shift();
  }
  return { rows, transfers };
}

export function haversineKm(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const hasLL = p => num(p?.lat) != null && num(p?.lng) != null;
// 연속 장소 직선거리 합 (좌표 없는 장소는 건너뜀)
export function routeKm(places) {
  const pts = places.filter(hasLL);
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
  return km;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = iso => WD[new Date(iso + 'T00:00:00Z').getUTCDay()] || '';

// closed 문자열에 해당 요일이 있는지 ("월요일 휴관", "월·화 휴무", "Mon")
export function closedOn(closed, iso) {
  if (!closed || typeof closed !== 'string' || !iso) return false;
  const day = new Date(iso + 'T00:00:00Z').getUTCDay();
  if (Number.isNaN(day)) return false;
  const w = WD[day], en = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day];
  if (closed.includes(w + '요일')) return true;
  if (new RegExp(`(^|[\\s,·/(])${w}(?=[\\s,·/)]|$|휴)`).test(closed)) return true;
  return new RegExp(`\\b${en}`, 'i').test(closed);
}

export function dday(iso, today = new Date()) {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(d)) return '';
  const n = Math.round((d - t) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n}`;
}

// rating 값: 숫자 / 문자열 / {score,count}
const RATING_LABEL = { google: '구글', dianping: '다중뎬핑', tripadvisor: '트립어드바이저', other: '기타' };
export function fmtCount(n) {
  if (num(n) == null) return String(n ?? '');
  return n >= 10000 ? `${+(n / 10000).toFixed(1)}만` : n.toLocaleString('ko-KR');
}
export function ratingText(rating) {
  if (rating == null) return '';
  if (typeof rating !== 'object') return String(rating);
  return Object.entries(rating)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const label = RATING_LABEL[k] || k;
      if (typeof v === 'object') {
        const s = v.score ?? v.value ?? v.rating, c = v.count ?? v.reviews;
        return `${label} ${s ?? ''}${c != null ? ` (${fmtCount(c)})` : ''}`.trim();
      }
      return `${label} ${v}`;
    })
    .join(' · ');
}
export function ratingScore(rating) {
  if (rating == null) return -1;
  if (typeof rating !== 'object') return parseFloat(rating) || -1;
  for (const k of ['google', 'dianping', 'tripadvisor', 'other']) {
    const v = rating[k];
    const s = typeof v === 'object' && v ? v.score ?? v.value ?? v.rating : v;
    const n = parseFloat(s);
    if (Number.isFinite(n)) return n;
  }
  return -1;
}

// 금액 입력 검증: 양수, 1억 미만
export function parseAmount(s) {
  const n = Number(String(s ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e8 ? n : null;
}
export const safeUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

// ?trip= 값: 16자 이상, 영문/숫자/-/_ 만
export function tripFromQuery(search, fallback) {
  const t = new URLSearchParams(search).get('trip');
  return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : fallback;
}

// 일정 연산 (직렬화 가능한 설명 → 서버 최신 plan에 다시 적용)
// op: {type:'add',d,item} | {type:'edit',k,field,value} | {type:'move',k,to,beforeK?} | {type:'swap',k,dir} | {type:'del',k}
// → {next:{dX:[...]}, b:블록} | null(대상이 사라짐)
export function applyPlanOp(plan, op) {
  const day = d => (Array.isArray(plan?.[d]) ? plan[d].filter(b => b && typeof b === 'object').map(b => ({ ...b })) : []);
  if (op.type === 'add') return DAYS.includes(op.d) ? { next: { [op.d]: [...day(op.d).filter(b => b.k !== op.item.k), op.item] }, b: op.item } : null;
  const d = DAYS.find(x => day(x).some(b => b.k === op.k));
  if (!d) return null;
  const arr = day(d), i = arr.findIndex(b => b.k === op.k), b = arr[i];
  if (op.type === 'edit') { arr[i] = { ...b, [op.field]: op.value }; return { next: { [d]: arr }, b }; }
  if (op.type === 'del') return { next: { [d]: arr.filter(x => x.k !== op.k) }, b };
  if (op.type === 'swap') {
    const j = i + op.dir;
    if (j < 0 || j >= arr.length) return null;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { next: { [d]: arr }, b };
  }
  if (op.type === 'move') {
    if (!DAYS.includes(op.to)) return null;
    arr.splice(i, 1);
    const dest = op.to === d ? arr : day(op.to), j = op.beforeK ? dest.findIndex(x => x.k === op.beforeK) : -1;
    dest.splice(j < 0 ? dest.length : j, 0, b);
    return { next: op.to === d ? { [d]: dest } : { [d]: arr, [op.to]: dest }, b };
  }
  return null;
}

// 조사: jo('A안', '로') → 'A안으로', jo('친구1', '가') → '친구1이'
// 받침 없는 형태로 지정: 가(이/가) 를(을/를) 는(은/는) 와(과/와) 로(으로/로)
const JO = { 가: ['이', '가'], 를: ['을', '를'], 는: ['은', '는'], 와: ['과', '와'], 로: ['으로', '로'] };
function jong(word) {
  const c = [...String(word ?? '')].reverse().find(ch => /[가-힣0-9A-Za-z]/.test(ch)); // 끝 괄호·기호 무시
  if (!c) return null;
  if (/[가-힣]/.test(c)) { const j = (c.charCodeAt(0) - 0xac00) % 28; return j === 0 ? 'none' : j === 8 ? 'rieul' : 'yes'; }
  if (/[0-9]/.test(c)) return '178'.includes(c) ? 'rieul' : '036'.includes(c) ? 'yes' : 'none'; // 일 칠 팔 / 영 삼 육
  const l = c.toLowerCase();
  return 'lr'.includes(l) ? 'rieul' : 'mn'.includes(l) ? 'yes' : 'none'; // 엘 알 / 엠 엔
}
export function jo(word, p) {
  const [withB, noB] = JO[p], j = jong(word);
  if (j == null) return `${word}${p === '로' ? '(으)로' : withB + '(' + noB + ')'}`;
  if (p === '로') return word + (j === 'yes' ? withB : noB);
  return word + (j === 'none' ? noB : withB);
}
