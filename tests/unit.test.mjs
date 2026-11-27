// 순수 계산 단위 테스트: node --test tests/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

test('정산: 사람별 차액 합 0, 최소 송금', () => {
  const ex = {
    a: { amountKrw: 300000, payer: 'm1', split: ['m1', 'm2', 'm3'] },
    b: { amountKrw: 90000, payer: 'm2', split: ['m1', 'm2', 'm3'] },
    c: { amountKrw: 20000, payer: 'm3', split: ['m3', 'm2'] },
  };
  const { rows, transfers } = C.settle(ex);
  const r = Object.fromEntries(rows.map(x => [x.m, x]));
  assert.equal(r.m1.paid, 300000); assert.equal(r.m1.owe, 130000); assert.equal(r.m1.diff, 170000);
  assert.equal(r.m2.owe, 140000); assert.equal(r.m2.diff, -50000);
  assert.equal(r.m3.owe, 140000); assert.equal(r.m3.diff, -120000);
  assert.equal(rows.reduce((a, x) => a + x.diff, 0), 0);
  assert.deepEqual(transfers.sort((a, b) => b.amount - a.amount), [
    { from: 'm3', to: 'm1', amount: 120000 }, { from: 'm2', to: 'm1', amount: 50000 }]);
});
test('정산: 잘못된 항목 무시, 빈 입력', () => {
  assert.deepEqual(C.settle({}).transfers, []);
  assert.deepEqual(C.settle(null).transfers, []);
  const { rows } = C.settle({ x: { amountKrw: -5, payer: 'm1', split: ['m2'] }, y: { amountKrw: 100, payer: 'zz', split: ['m1'] }, z: { amountKrw: 100, payer: 'm1', split: [] }, w: { amountKrw: 'abc', payer: 'm1', split: ['m2'] } });
  assert.ok(rows.every(r => r.paid === 0 && r.owe === 0));
});
test('정산: 나누어 떨어지지 않는 금액', () => {
  const { transfers } = C.settle({ a: { amountKrw: 100000, payer: 'm1', split: ['m1', 'm2', 'm3'] } });
  const sum = transfers.reduce((a, t) => a + t.amount, 0);
  assert.ok(Math.abs(sum - 66667) <= 1, String(sum));
});
test('투표 집계·확정 날짜', () => {
  assert.equal(C.planDateKey({}), 'A');
  assert.equal(C.planDateKey({ votes: { date: { m1: 'A', m2: 'B' } } }), 'A');
  assert.equal(C.planDateKey({ votes: { date: { m1: 'B', m2: 'B', m3: 'A' } } }), 'B');
  assert.equal(C.planDateKey({ votes: { date: { m1: 'B', m2: 'B' } }, decided: { date: 'A' } }), 'A');
  assert.deepEqual(C.tallyMulti({ m1: ['h1', 'h2'], m2: ['h2'], m3: 'bad' }), { h1: ['m1'], h2: ['m1', 'm2'] });
  assert.equal(C.leader({ x: ['m1'], y: ['m1', 'm2'] }), 'y');
});
test('항공: 체류시간·시간조건', () => {
  const out = { date: '2027-03-20', dep: '08:25', arr: '09:45', nextDay: false };
  const back = { date: '2027-03-23', dep: '13:50', arr: '16:40' };
  assert.equal(C.stayMinutes(out, back), 3 * 1440 + 245);
  assert.equal(C.stayMinutes({ date: '2027-03-19', arr: '01:00', nextDay: true }, { date: '2027-03-22', dep: '02:00' }), 2 * 1440 + 60);
  assert.ok(C.outOk(out)); assert.ok(!C.outOk({ dep: '12:00' }));
  assert.ok(C.inOk({ arr: '16:00' })); assert.ok(!C.inOk(back)); assert.ok(!C.inOk({ arr: '12:59' }));
  assert.equal(C.fmtDur(125), '2시간 5분');
});
test('휴무 요일 경고', () => {
  assert.ok(C.closedOn('월요일 휴관 (국경일 제외)', '2027-03-22'));
  assert.ok(!C.closedOn('월요일 휴관', '2027-03-23'));
  assert.ok(C.closedOn('화요일 휴관 (국경일 제외) → 2027-03-23(화) 불가', '2027-03-23'));
  assert.ok(!C.closedOn('정기휴무 없음', '2027-03-22'));
  assert.ok(!C.closedOn('', '2027-03-22'));
  assert.ok(!C.closedOn('매월 첫째 금 휴무', '2027-03-22'));
});
test('거리·평점·쿼리·금액', () => {
  const km = C.routeKm([{ lat: 31.2304, lng: 121.4737 }, { lat: null }, { lat: 31.2397, lng: 121.4998 }]);
  assert.ok(km > 2.5 && km < 2.9, String(km));
  assert.equal(C.ratingText({ google: '4.3 (1,231)', other: 'Michelin' }), '구글 4.3 (1,231) · 기타 Michelin');
  assert.equal(C.ratingText({ google: { score: 4.6, count: 12000 } }), '구글 4.6 (1.2만)');
  assert.equal(C.ratingScore({ google: '4.3 (1,231)' }), 4.3);
  assert.equal(C.tripFromQuery('?trip=short', 'D'), 'D');
  assert.equal(C.tripFromQuery('?trip=test-abcdefghijklmnop', 'D'), 'test-abcdefghijklmnop');
  assert.equal(C.tripFromQuery('?trip=test-abcdefghijklmnop/../x', 'D'), 'D');
  assert.equal(C.parseAmount('12,000'), 12000); assert.equal(C.parseAmount('-1'), null); assert.equal(C.parseAmount('1e9'), null); assert.equal(C.parseAmount(''), null);
  assert.equal(C.safeUrl('javascript:alert(1)'), null);
});
test('경비 추정: 데이터 없을 때도 동작', () => {
  const e = C.estimate({}, null, null);
  assert.equal(e.flight, null); assert.equal(e.hotel, null);
  assert.equal(e.per, 70000 * 4 + 60000 + 50000);
  const F = { options: { A: { out: [{ id: 'o1', dep: '13:00', price: 100 }, { id: 'o2', dep: '09:00', price: 200 }], in: [{ id: 'i1', arr: '15:00', price: 50 }] } } };
  assert.equal(C.estimate({}, F, { hotels: [{ id: 'h', priceA_krw: 300 }] }).flight, 250, '시간 조건 충족 편 우선');
  assert.equal(C.estimate({ votes: { flight: { m1: 'A|o1|i1' } } }, F, null).flight, 150);
  assert.equal(C.estimate({ decided: { hotel: 'h' } }, F, { hotels: [{ id: 'h', priceA_krw: 300 }, { id: 'g', priceA_krw: 900 }] }).hotel, 100);
});
test('일정 연산: 서버 최신 값에 재적용', () => {
  const base = { d1: [{ k: 'a', pid: 'p1' }, { k: 'b', pid: 'p2' }], d2: [{ k: 'c', pid: 'p3' }] };
  // 상대가 d1에 x를 추가한 서버 상태에 내 추가를 다시 적용 → 둘 다 남음
  const server = { ...base, d1: [...base.d1, { k: 'x', pid: 'px' }] };
  assert.deepEqual(C.applyPlanOp(server, { type: 'add', d: 'd1', item: { k: 'y', pid: 'py' } }).next.d1.map(b => b.k), ['a', 'b', 'x', 'y']);
  // 같은 add 두 번 재생해도 중복 없음
  const once = C.applyPlanOp(base, { type: 'add', d: 'd2', item: { k: 'y' } }).next;
  assert.equal(C.applyPlanOp({ ...base, ...once }, { type: 'add', d: 'd2', item: { k: 'y' } }).next.d2.length, 2);
  assert.deepEqual(C.applyPlanOp(base, { type: 'move', k: 'a', to: 'd2' }).next, { d1: [{ k: 'b', pid: 'p2' }], d2: [{ k: 'c', pid: 'p3' }, { k: 'a', pid: 'p1' }] });
  assert.deepEqual(C.applyPlanOp(base, { type: 'move', k: 'c', to: 'd1', beforeK: 'b' }).next.d1.map(b => b.k), ['a', 'c', 'b']);
  assert.deepEqual(C.applyPlanOp(base, { type: 'swap', k: 'a', dir: 1 }).next.d1.map(b => b.k), ['b', 'a']);
  assert.equal(C.applyPlanOp(base, { type: 'swap', k: 'a', dir: -1 }), null);
  assert.equal(C.applyPlanOp(base, { type: 'edit', k: 'zz', field: 'memo', value: 'm' }), null, '사라진 블록');
  assert.equal(C.applyPlanOp(base, { type: 'edit', k: 'c', field: 'memo', value: 'm' }).next.d2[0].memo, 'm');
  assert.deepEqual(C.applyPlanOp(base, { type: 'del', k: 'b' }).next.d1.map(b => b.k), ['a']);
  assert.equal(C.applyPlanOp({ d1: [null, 'x'] }, { type: 'add', d: 'd1', item: { k: 'n' } }).next.d1.length, 1);
});
test('조사: 받침에 맞게', () => {
  assert.equal(C.jo('A안', '로'), 'A안으로');
  assert.equal(C.jo('B안', '로'), 'B안으로');
  assert.equal(C.jo('1일차', '로'), '1일차로');
  assert.equal(C.jo('서울', '로'), '서울로', 'ㄹ 받침은 로');
  assert.equal(C.jo('"A안"', '로'), '"A안"으로', '끝 따옴표 무시');
  assert.equal(C.jo('민희', '가'), '민희가');
  assert.equal(C.jo('준혁', '가'), '준혁이');
  assert.equal(C.jo('친구1', '가'), '친구1이');
  assert.equal(C.jo('친구2', '가'), '친구2가');
  assert.equal(C.jo('날짜', '를'), '날짜를');
  assert.equal(C.jo('숙소 지역', '를'), '숙소 지역을');
  assert.equal(C.jo('80,000', '로'), '80,000으로');
  assert.equal(C.jo('190', '로'), '190으로');
  assert.equal(C.jo('7', '로'), '7로');
  assert.equal(C.jo('Tom', '가'), 'Tom이');
  assert.equal(C.jo('', '로'), '(으)로', '판단 불가면 병기');
});
