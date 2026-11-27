// E2E: cd tests && npm i && npx playwright install chromium && node e2e.mjs
// 실데이터 문서를 건드리지 않도록 항상 ?trip=test-<랜덤16자> 문서만 사용한다.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests/fixtures');
const PORT = 8800 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}/`;
const rand16 = () => Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const testTrip = () => `test-${rand16()}`;
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['PASS', name, Date.now() - t]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name, Date.now() - t, e.message]); console.log('FAIL', name, '\n  ', e.message.split('\n')[0]); }
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
// 서버가 실제로 응답할 때까지 대기
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const browser = await chromium.launch();

async function open(ctx, trip, hash = 'home', who = 'm1') {
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.goto(`${BASE}?trip=${trip}#${hash}`);
  // 로컬 서버가 첫 요청을 늦게 주는 경우가 있어 한 번만 새로고침 재시도
  if (!(await p.locator('[data-act=pickMe]').first().waitFor({ timeout: 10000 }).then(() => true, () => false))) await p.reload();
  await p.click(`[data-act=pickMe][data-m=${who}]`);
  await p.waitForFunction(() => document.querySelector('#conn')?.textContent.includes('연결됨'), null, { timeout: 15000 }).catch(async e => { throw new Error('연결 안 됨: ' + await p.locator('#conn').innerText() + ' / ' + p.errors.join(';')); });
  return p;
}
const go = async (p, hash) => { await p.evaluate(h => (location.hash = h), hash); await p.waitForTimeout(200); };
const main = p => p.locator('#main').innerText();

try {
  const trip = testTrip();
  console.log('trip =', trip);

  await step('(1) 실데이터 로드·렌더 (375px, 가로 스크롤 없음)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const p = await open(ctx, trip);
    const places = JSON.parse(readFileSync(path.join(ROOT, 'data/places.json'), 'utf8'));
    const flights = JSON.parse(readFileSync(path.join(ROOT, 'data/flights.json'), 'utf8'));
    const hotels = JSON.parse(readFileSync(path.join(ROOT, 'data/hotels.json'), 'utf8'));
    for (const [h, check] of Object.entries({
      home: t => t.includes('1인 예상 경비'),
      date: t => t.includes('A안') && t.includes('B안') && !t.includes('자료 준비 중'),
      flight: async () => (await p.locator('.flt').count()) > 0,
      hotel: async () => (await p.locator('[data-act=voteHotel]').count()) === hotels.hotels.length,
      place: t => t.includes(`전체 ${places.length}`),
      plan: t => t.includes('1일차'),
      money: t => t.includes('1인 합계'),
      check: t => t.includes('전체 진행률'),
      log: t => t.includes('변경 기록'),
      credits: t => t.includes('CC BY-SA'),
    })) {
      await go(p, h);
      const ok = await check(await main(p));
      assert.ok(ok, `${h} 화면 내용 확인 실패`);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= 375, `${h} 가로 스크롤 ${sw}px`);
    }
    assert.ok(flights.options.A.out.length > 0);
    assert.deepEqual(p.errors, []);
    await ctx.close();
  });

  await step('(1b) 빈 데이터 / 깨진 JSON → "자료 준비 중"', async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    await ctx.route('**/data/*.json*', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (name === 'version.json') return route.fulfill({ body: '{"v":"t"}', contentType: 'application/json' });
      if (name === 'flights.json') return route.fulfill({ body: readFileSync(path.join(FIX, 'broken.json')), contentType: 'application/json' });
      return route.fulfill({ body: readFileSync(path.join(FIX, 'empty', name)), contentType: 'application/json' });
    });
    const p = await open(ctx, testTrip());
    for (const h of ['date', 'flight', 'hotel', 'place', 'check', 'credits']) {
      await go(p, h);
      assert.ok((await main(p)).includes('자료 준비 중'), `${h}에 "자료 준비 중" 없음`);
    }
    for (const h of ['home', 'plan', 'money']) { await go(p, h); assert.ok(!(await main(p)).includes('오류'), h); }
    assert.deepEqual(p.errors, []);
    await ctx.close();
  });

  const A = await browser.newContext(), B = await browser.newContext();
  const pa = await open(A, trip, 'date', 'm1'), pb = await open(B, trip, 'date', 'm2');
  const seen = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 });

  await step('(2a) 투표 동기화 5초 이내', async () => {
    await pa.click('[data-act=voteDate][data-k=A]');
    await seen(pb, () => document.querySelector('#main').innerText.includes('A안 1표 (민희)'));
  });
  await step('(2b) 동시 투표 - 서로 덮어쓰지 않음', async () => {
    await Promise.all([pa.click('[data-act=voteDate][data-k=B]'), pb.click('[data-act=voteDate][data-k=B]')]);
    await seen(pa, () => document.querySelector('#main').innerText.includes('B안 2표'));
    await seen(pb, () => document.querySelector('#main').innerText.includes('B안 2표'));
  });
  await step('(2c) 찜 동기화 5초 이내', async () => {
    await go(pa, 'place'); await go(pb, 'place');
    const id = await pa.locator('[data-act=like]').first().getAttribute('data-id');
    await pa.click(`[data-act=like][data-id="${id}"]`);
    await seen(pb, id => document.querySelector(`[data-act=like][data-id="${id}"]`)?.parentElement.innerText.includes('찜 1'), id);
  });
  await step('(2d) 일정 추가 동기화 + 서로 다른 날 동시 추가', async () => {
    const ids = await pa.locator('[data-act=addPlanPick]').evaluateAll(els => els.slice(0, 2).map(e => e.dataset.id));
    await pa.click(`[data-act=addPlanPick][data-id="${ids[0]}"]`); await pb.click(`[data-act=addPlanPick][data-id="${ids[1]}"]`);
    await Promise.all([pa.click('[data-act=addPlanDo][data-d=d1]'), pb.click('[data-act=addPlanDo][data-d=d2]')]);
    await go(pa, 'plan'); await go(pb, 'plan');
    for (const p of [pa, pb]) await seen(p, () => document.querySelectorAll('.blk[data-d=d1]').length === 1 && document.querySelectorAll('.blk[data-d=d2]').length === 1);
  });
  await step('(2e) 이름 변경이 상대 화면에 반영', async () => {
    await pb.click('#who');
    await pb.fill('[data-draft="rn:m2"]', '테스트이름');
    await pb.click('[data-submit=rename][data-m=m2] button[type=submit]');
    await seen(pa, () => document.querySelector('#main').innerText.includes('테스트이름'));
    await pb.click('[data-act=closeModal]');
  });
  await step('(2f) 변경 기록 + 일정 되돌리기', async () => {
    pa.once('dialog', d => d.accept());
    await pa.click('.blk[data-d=d1] [data-act=planDel]');
    await seen(pb, () => document.querySelectorAll('.blk[data-d=d1]').length === 0);
    await go(pa, 'log');
    pa.once('dialog', d => d.accept());
    await pa.locator('[data-act=revert]').first().click();
    await go(pa, 'plan');
    await seen(pb, () => document.querySelectorAll('.blk[data-d=d1]').length === 1);
  });
  await step('(2g) 같은 날 동시 추가 - 둘 다 남음 (검증 에이전트 지적 1)', async () => {
    await go(pa, 'place'); await go(pb, 'place');
    const ids = await pa.locator('[data-act=addPlanPick]').evaluateAll(els => els.slice(2, 4).map(e => e.dataset.id));
    await pa.click(`[data-act=addPlanPick][data-id="${ids[0]}"]`); await pb.click(`[data-act=addPlanPick][data-id="${ids[1]}"]`);
    await Promise.all([pa.click('[data-act=addPlanDo][data-d=d3]'), pb.click('[data-act=addPlanDo][data-d=d3]')]);
    await go(pa, 'plan'); await go(pb, 'plan');
    for (const p of [pa, pb]) await seen(p, () => document.querySelectorAll('.blk[data-d=d3]').length === 2);
  });
  await step('(2h) 다른 날로 이동 + 상대가 그 날에 추가 - 이동 블록 소실 없음 (지적 2)', async () => {
    const k = await pa.locator('.blk[data-d=d3]').first().getAttribute('data-k');
    await go(pb, 'place');
    const id = await pb.locator('[data-act=addPlanPick]').nth(5).getAttribute('data-id');
    await pb.click(`[data-act=addPlanPick][data-id="${id}"]`);
    await Promise.all([pa.selectOption(`.blk[data-k="${k}"] select`, 'd4'), pb.click('[data-act=addPlanDo][data-d=d4]')]);
    await go(pb, 'plan');
    for (const p of [pa, pb]) await seen(p, k => document.querySelectorAll('.blk[data-d=d4]').length === 2 && document.querySelectorAll('.blk[data-d=d3]').length === 1 && document.querySelectorAll(`.blk[data-k="${k}"]`).length === 1, k);
  });
  await step('(2i) 오프라인 추가 후 재연결 - 상대 온라인 추가와 둘 다 남음 (지적 3)', async () => {
    await go(pa, 'place'); await go(pb, 'place');
    const ids = await pa.locator('[data-act=addPlanPick]').evaluateAll(els => els.slice(6, 8).map(e => e.dataset.id));
    await A.setOffline(true);
    await pa.waitForFunction(() => document.querySelector('#conn').textContent.includes('오프라인'), null, { timeout: 15000 });
    await pa.click(`[data-act=addPlanPick][data-id="${ids[0]}"]`); await pa.click('[data-act=addPlanDo][data-d=d1]');
    await pb.click(`[data-act=addPlanPick][data-id="${ids[1]}"]`); await pb.click('[data-act=addPlanDo][data-d=d1]');
    await pb.waitForTimeout(1500);
    await A.setOffline(false);
    await go(pa, 'plan'); await go(pb, 'plan');
    for (const p of [pa, pb]) await p.waitForFunction(ids => ids.every(id => [...document.querySelectorAll('.blk[data-d=d1]')].some(b => b.innerText.includes(window.__app.S.data.places.find(x => x.id === id).name_ko))), ids, { timeout: 20000 });
  });
  for (const p of [pa, pb]) assert.deepEqual(p.errors, [], 'pageerror');
  await A.close(); await B.close();
} finally {
  await browser.close();
  server.kill();
}
console.log('\n결과:', results.filter(r => r[0] === 'PASS').length, '/', results.length, 'PASS');
process.exit(results.every(r => r[0] === 'PASS') ? 0 : 1);
