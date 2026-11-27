import { estimate, settle, won, num, parseAmount, MEMBER_IDS, jo } from './calc.js';
import { S, esc, memberName, btn, dv, clearDrafts, toast } from './ui.js';
import { commit, render } from './app.js';
import { DEFAULT_BUDGET } from './store.js';
import * as store from './store.js';
import { comboLabel } from './flight.js';

export const budget = () => ({ ...DEFAULT_BUDGET, ...(S.doc?.budget || {}) });
const CATS = ['항공', '숙소', '식비', '교통', '관광', '쇼핑', '마사지', '기타'];
const BFIELDS = [['foodPerDayKrw', '식비 (1인 1일)'], ['localTransportKrw', '현지 교통 (1인)'], ['etcKrw', '기타 (1인)'], ['cnyRate', '환율 (원/위안)']];

export function view() {
  const e = estimate(S.doc, S.data.flights, S.data.hotels), b = budget();
  const exps = Object.entries(S.doc?.expenses || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.at || 0) - (a.at || 0));
  const st = settle(S.doc?.expenses);
  const total = exps.reduce((a, x) => a + (num(x.amountKrw) || 0), 0);
  const split = dv('ex:split', null) || MEMBER_IDS;
  return `<h2>경비·정산</h2>
  <div class="card"><h3>1인 예상 경비</h3>
    <div class="tscroll"><table class="money"><tbody>
      <tr><td>항공 <small>${esc(e.flightNote)}${e.combo ? ' · ' + esc(comboLabel(`${e.combo.opt}|${e.combo.out.id}|${e.combo.back.id}`)) : ''}</small></td><td>${won(e.flight)}</td></tr>
      <tr><td>숙소 <small>${esc(e.hotelNote || '자료 준비 중')}</small></td><td>${won(e.hotel)}</td></tr>
      <tr><td>식비 <small>${won(b.foodPerDayKrw)} x 4일</small></td><td>${won(e.food)}</td></tr>
      <tr><td>현지 교통</td><td>${won(e.trans)}</td></tr>
      <tr><td>기타</td><td>${won(e.etc)}</td></tr>
      <tr><th>1인 합계</th><th class="big">${won(e.per)}</th></tr>
      <tr><th>3인 합계</th><th>${won(e.all)}</th></tr>
    </tbody></table></div>
    <h3>예산 기준 (누구나 수정)</h3>
    <div class="grid two">${BFIELDS.map(([k, l]) => `<label>${l}<br><input type="number" inputmode="numeric" min="0" data-draft="bg:${k}" data-commit="budgetSet" data-k="${k}" data-orig="${esc(b[k])}" value="${esc(dv('bg:' + k, b[k]))}"></label>`).join('')}</div>
  </div>
  <form class="card" data-submit="addExpense"><h3>지출 기록</h3>
    <div class="row"><input data-draft="ex:title" value="${esc(dv('ex:title'))}" maxlength="40" placeholder="제목 (필수)" aria-label="제목"></div>
    <div class="row"><input type="number" inputmode="decimal" min="0" step="any" data-draft="ex:amt" value="${esc(dv('ex:amt'))}" placeholder="금액" aria-label="금액">
      <select data-draft="ex:cur" aria-label="통화">${[['KRW', '원'], ['CNY', '위안']].map(([v, l]) => `<option value="${v}"${dv('ex:cur', 'KRW') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    ${dv('ex:cur', 'KRW') === 'CNY' ? `<small class="muted">1위안 = ${esc(b.cnyRate)}원으로 환산</small>` : ''}
    <div class="row"><label>낸 사람 <select data-draft="ex:payer">${MEMBER_IDS.map(m => `<option value="${m}"${dv('ex:payer', S.me || 'm1') === m ? ' selected' : ''}>${esc(memberName(m))}</option>`).join('')}</select></label>
      <label>분류 <select data-draft="ex:cat">${CATS.map(c => `<option${dv('ex:cat', '식비') === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>날짜 <input type="date" data-draft="ex:date" value="${esc(dv('ex:date'))}"></label></div>
    <div class="row split"><span>나눌 사람</span>${MEMBER_IDS.map(m => `<label class="chk"><input type="checkbox" data-act="exSplit" data-m="${m}" ${split.includes(m) ? 'checked' : ''}>${esc(memberName(m))}</label>`).join('')}</div>
    <button class="btn primary" type="submit">기록하기</button>
  </form>
  <div class="card"><h3>지출 목록 (합계 ${won(total)})</h3>
    ${exps.length ? `<div class="tscroll"><table class="money"><tbody>${exps.map(x => `<tr><td>${esc(x.title)}<br><small>${esc([x.date, x.cat, memberName(x.payer) + ' 냄', '나눔: ' + (x.split || []).map(memberName).join('·')].filter(Boolean).join(' · '))}</small></td>
      <td>${won(x.amountKrw)}${num(x.amountCny) != null ? `<br><small>${x.amountCny}위안</small>` : ''}<br>${btn('삭제', 'delExpense', { id: x.id }, 'danger small')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">아직 기록이 없습니다.</p>'}
  </div>
  <div class="card"><h3>정산</h3>
    <div class="tscroll"><table class="money"><thead><tr><th>이름</th><th>낸 돈</th><th>써야 할 돈</th><th>차액</th></tr></thead><tbody>
      ${st.rows.map(r => `<tr><td>${esc(memberName(r.m))}</td><td>${won(r.paid)}</td><td>${won(r.owe)}</td><td class="${r.diff > 0 ? 'down' : r.diff < 0 ? 'up' : ''}">${r.diff > 0 ? '+' : ''}${won(r.diff)}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>송금</h3>
    ${st.transfers.length ? `<ul>${st.transfers.map(t => `<li><b>${esc(memberName(t.from))}</b> → <b>${esc(memberName(t.to))}</b> ${won(t.amount)}</li>`).join('')}</ul>` : '<p class="muted">보낼 돈이 없습니다.</p>'}
  </div>`;
}

export const actions = {
  budgetSet: el => {
    const k = el.dataset.k, raw = el.value.trim(), v = raw === '' ? NaN : Number(raw), before = budget()[k];
    delete S.drafts['bg:' + k];
    if (!Number.isFinite(v) || v < 0 || v > 1e8 || (k === 'cnyRate' && (v < 50 || v > 1000))) {
      toast(k === 'cnyRate' ? '환율은 50~1000 사이로 입력해 주세요' : '0 이상 1억 미만 숫자로 입력해 주세요');
      return render(true);
    }
    if (v === before) return;
    commit([{ path: ['budget', k], value: v }], { action: 'budget', target: `budget.${k}`, before, after: v, text: `${jo(memberName(S.me), '가')} ${jo(BFIELDS.find(f => f[0] === k)[1], '를')} ${jo(v.toLocaleString('ko-KR'), '로')} 변경` });
  },
  exSplit: el => {
    const cur = S.drafts['ex:split'] || [...MEMBER_IDS], m = el.dataset.m;
    S.drafts['ex:split'] = cur.includes(m) ? cur.filter(x => x !== m) : MEMBER_IDS.filter(x => cur.includes(x) || x === m);
    render(true);
  },
  addExpense: () => {
    if (!S.me) return commit([]);
    const g = (k, d = '') => String(S.drafts['ex:' + k] ?? d).trim();
    const title = g('title'), amt = parseAmount(g('amt')), cur = g('cur', 'KRW'), split = S.drafts['ex:split'] || [...MEMBER_IDS];
    if (!title) return toast('제목을 입력해 주세요');
    if (amt == null) return toast('금액은 0보다 큰 숫자로 입력해 주세요');
    if (!split.length) return toast('나눌 사람을 한 명 이상 골라 주세요');
    const date = g('date');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('날짜 형식이 올바르지 않습니다');
    const rate = budget().cnyRate, krw = Math.round(cur === 'CNY' ? amt * rate : amt);
    if (krw < 1 || krw >= 1e8) return toast('원화 환산 금액이 1원 이상 1억 원 미만이어야 합니다');
    const payer = MEMBER_IDS.includes(g('payer', S.me)) ? g('payer', S.me) : S.me;
    const val = { title: title.slice(0, 40), amountKrw: krw, amountCny: cur === 'CNY' ? amt : null, payer, split, cat: g('cat', '식비'), date, by: S.me, at: Date.now() };
    const id = store.newId();
    commit([{ path: ['expenses', id], value: val }], { action: 'expense', target: `expenses.${id}`, before: null, after: val, text: `${jo(memberName(S.me), '가')} 지출 기록: ${val.title} ${won(val.amountKrw)}` });
    clearDrafts('ex:');
    toast('기록했습니다');
    render(true);
  },
  delExpense: el => {
    const id = el.dataset.id, x = S.doc?.expenses?.[id];
    if (!x || !confirm(`"${x.title}" 지출을 삭제할까요?`)) return;
    commit([{ path: ['expenses', id], value: undefined }], { action: 'expense', target: `expenses.${id}`, before: x, after: null, text: `${jo(memberName(S.me), '가')} 지출 삭제: ${x.title} ${won(x.amountKrw)}` });
  },
};
