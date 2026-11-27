// Firestore 공유 상태: 실시간 구독 + 점 경로(FieldPath) 단위 갱신 + 변경 기록
const V = '10.12.5';
const firebaseConfig = {"apiKey": "AIzaSyCgjqWCQpAaqgcwge11Hl3hx91fsaltgd0", "authDomain": "daily-english-jmh.firebaseapp.com", "projectId": "daily-english-jmh", "storageBucket": "daily-english-jmh.firebasestorage.app", "messagingSenderId": "1058181338255", "appId": "1:1058181338255:web:adf9447e21fd9f6c4e0cfa"};

export const DEFAULT_MEMBERS = { m1: { name: '민희' }, m2: { name: '친구1' }, m3: { name: '친구2' } };
export const DEFAULT_BUDGET = { foodPerDayKrw: 70000, localTransportKrw: 60000, etcKrw: 50000, cnyRate: 190 };

let fs, ref, logCol, uid = null, logUnsub = null, logLimit = 50;
let docExists = null, seeded = false;
const listeners = { doc: [], log: [], status: [], error: [] };
export const on = (ev, fn) => listeners[ev].push(fn);
const emit = (ev, v) => listeners[ev].forEach(f => f(v));

export const status = { auth: 'pending', online: navigator.onLine, fromCache: true, pending: false };
const setStatus = p => { Object.assign(status, p); emit('status', status); };
addEventListener('online', () => setStatus({ online: true }));
addEventListener('offline', () => setStatus({ online: false }));

export async function start(tripId) {
  try {
    const [appM, authM, f] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    fs = f;
    const app = appM.initializeApp(firebaseConfig);
    let db;
    try {
      db = f.initializeFirestore(app, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
    } catch (e) {
      console.warn('오프라인 캐시 사용 불가, 메모리 캐시 사용', e);
      db = f.initializeFirestore(app, {});
    }
    ref = f.doc(db, 'shanghai2027', tripId);
    logCol = f.collection(ref, 'log');
    const auth = authM.getAuth(app);
    await authM.signInAnonymously(auth);
    uid = auth.currentUser?.uid;
    setStatus({ auth: 'ok' });
    f.onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      docExists = snap.exists();
      setStatus({ fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      const cur = snap.data() || {};
      if (!seeded && !snap.metadata.fromCache && (!cur.members || !cur.budget)) {
        seeded = true;
        // 빠진 기본 필드만 채움 (트랜잭션: 동시에 연 다른 사람의 이름 변경 등을 덮지 않음)
        f.runTransaction(ref.firestore, async tx => {
          const d = (await tx.get(ref)).data() || {}, patch = {};
          if (!d.members) patch.members = DEFAULT_MEMBERS;
          if (!d.budget) patch.budget = DEFAULT_BUDGET;
          if (Object.keys(patch).length) tx.set(ref, patch, { merge: true });
        }).catch(err);
      }
      emit('doc', snap.data({ serverTimestamps: 'estimate' }) || {});
    }, err);
    subscribeLog();
  } catch (e) {
    setStatus({ auth: 'fail' });
    err(e);
  }
}

function err(e) {
  console.error(e);
  emit('error', e);
}

function subscribeLog() {
  logUnsub?.();
  const q = fs.query(logCol, fs.orderBy('at', 'desc'), fs.limit(logLimit));
  logUnsub = fs.onSnapshot(q, s => emit('log', { items: s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })), limit: logLimit }), err);
}
export function moreLog() {
  if (!fs) return;
  logLimit += 50;
  subscribeLog();
}

export const ready = () => !!fs && status.auth === 'ok';
export const ts = () => fs.serverTimestamp();
export const DEL = () => fs.deleteField();
export const newId = () => fs.doc(logCol).id;

const nest = (segs, v) => segs.reduceRight((acc, k) => ({ [k]: acc }), v);
const clean = v => (v === undefined ? null : JSON.parse(JSON.stringify(v ?? null)));

/**
 * changes: [{path:['votes','date','m1'], value}]  (value === undefined → 필드 삭제)
 * log: {by, byName, action, target, before, after, text} | null
 */
export function write(changes, log) {
  if (!ready()) return Promise.reject(new Error('아직 연결 준비 중입니다'));
  const args = [];
  for (const c of changes) args.push(new fs.FieldPath(...c.path), c.value === undefined ? fs.deleteField() : c.value);
  const p = fs.updateDoc(ref, ...args).catch(e => {
    if (e?.code !== 'not-found') throw e;
    return fs.setDoc(ref, changes.reduce((o, c) => deepMerge(o, nest(c.path, c.value === undefined ? fs.deleteField() : c.value)), {}), { merge: true });
  });
  p.catch(err);
  if (log) {
    fs.addDoc(logCol, { ...log, before: clean(log.before), after: clean(log.after), uid, at: fs.serverTimestamp() }).catch(err);
  }
  // 오프라인이면 서버 응답 전까지 대기하므로 호출부는 await 하지 않는다
  return p;
}

/**
 * 서버 최신 값에 연산을 다시 적용 (일정처럼 배열 통째 교체가 필요한 필드용)
 * fn(data) → {changes, log} | null. 온라인에서만 호출 (오프라인 대기열은 app.js)
 */
export async function txWrite(fn, extra = []) {
  if (!ready()) throw new Error('아직 연결 준비 중입니다');
  let out = null;
  await fs.runTransaction(ref.firestore, async tx => {
    const snap = await tx.get(ref);
    out = fn(snap.data() || {});
    if (!out) return;
    const args = [];
    for (const c of [...out.changes, ...extra]) args.push(new fs.FieldPath(...c.path), c.value === undefined ? fs.deleteField() : c.value);
    if (snap.exists()) tx.update(ref, ...args);
    else tx.set(ref, [...out.changes, ...extra].reduce((o, c) => deepMerge(o, nest(c.path, c.value)), {}), { merge: true });
  });
  if (out?.log) fs.addDoc(logCol, { ...out.log, before: clean(out.log.before), after: clean(out.log.after), uid, at: fs.serverTimestamp() }).catch(err);
  return out ? 'ok' : null;
}

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && v.constructor === Object) a[k] = deepMerge({ ...a[k] }, v);
    else a[k] = v;
  }
  return a;
}
