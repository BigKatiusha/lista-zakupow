// Dane listy: lokalna kopia (localStorage) + kolejka zmian + synchronizacja z Firestore.
//
// Ekran zawsze pokazuje S.data = ostatni stan z serwera (S.base) + niepotwierdzone zmiany (S.ops).
// Dzięki temu apka startuje natychmiast z pamięci telefonu, działa offline,
// a zmiany zrobione bez zasięgu czekają w kolejce i wysyłają się po odzyskaniu sieci.
import { readJSON, writeJSON, clone, newId, randomCode, norm, debounce } from './util.js';
import { DEFAULT_STORES, SEED } from './brands.js';

export const FIREBASE_VERSION = '12.10.0';
export const FIREBASE_URLS = [
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`,
];

const K = {
  me: 'lz.me',
  base: (id) => `lz.base.${id}`,
  ops: (id) => `lz.ops.${id}`,
  hist: (id) => `lz.hist.${id}`,
};
export const AUTO_CLOSE_MS = 12 * 3600 * 1000;

const emptyData = () => ({ list: null, stores: {}, items: {} });
const noServer = () => ({ list: false, stores: false, items: false });

export const S = {
  me: null, // { listId, pid }
  base: emptyData(),
  ops: [],
  data: emptyData(),
  hist: [],
  sync: { configured: null, server: noServer(), cache: noServer(), error: null, listExists: null },
};

// ---------- powiadomienia o zmianach ----------
const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
const emit = (why) => listeners.forEach((fn) => fn(why));

// ---------- zapis lokalny ----------
const saveMe = () => writeJSON(K.me, S.me);
const saveOps = () => S.me?.listId && writeJSON(K.ops(S.me.listId), S.ops);
const saveBase = debounce(() => S.me?.listId && writeJSON(K.base(S.me.listId), S.base), 400);
export function flushLocal() {
  saveBase.flush();
  saveOps();
}

export function loadLocal() {
  S.me = readJSON(K.me);
  loadListCache();
}

function loadListCache() {
  const id = S.me?.listId;
  S.base = (id && readJSON(K.base(id))) || emptyData();
  S.ops = (id && readJSON(K.ops(id))) || [];
  S.hist = (id && readJSON(K.hist(id))) || [];
  recompute();
}

// ---------- operacje ----------
const set = (path, data) => ({ kind: 'set', path, data });
const update = (path, data) => ({ kind: 'update', path, data });
const del = (path) => ({ kind: 'delete', path });

function applyFields(doc, fields) {
  const out = clone(doc) || {};
  for (const [key, value] of Object.entries(fields)) {
    const parts = key.split('.');
    let o = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = clone(value);
  }
  return out;
}

function applyOp(d, op) {
  if (!op.path) {
    if (op.kind === 'set') d.list = clone(op.data);
    else if (op.kind === 'update') d.list = applyFields(d.list || {}, op.data);
    return;
  }
  const [coll, id] = op.path.split('/');
  const map = d[coll];
  if (!map) return;
  if (op.kind === 'delete') delete map[id];
  else if (op.kind === 'set') map[id] = clone(op.data);
  else if (op.kind === 'update' && map[id]) map[id] = applyFields(map[id], op.data);
}

function recompute() {
  S.data = clone(S.base) || emptyData();
  for (const op of S.ops) applyOp(S.data, op);
}

function commit(ops) {
  if (!ops.length || !S.me?.listId) return;
  const local = S.sync.configured === false;
  for (const op of ops) {
    op.id = newId(12);
    applyOp(S.data, op);
    if (local) applyOp(S.base, op);
    else S.ops.push(op);
  }
  if (local) saveBase();
  else saveOps();
  emit('local');
  flush();
}

// Bez Firebase (tryb tylko na tym urządzeniu) zmiany od razu trafiają do stanu bazowego.
function foldOps() {
  if (!S.ops.length) return;
  for (const op of S.ops) applyOp(S.base, op);
  S.ops = [];
  saveOps();
  saveBase();
  recompute();
}

// ---------- Firestore ----------
let fs = null;
let db = null;
let config = null;
let unsubs = [];
let starting = null;
const sent = new Set();

export function startSync() {
  if (!starting) starting = doStart().finally(() => (starting = null));
  return starting;
}

async function doStart() {
  if (!S.me?.listId) return;
  if (S.sync.configured === null) {
    try {
      config = (await import('../config.js')).firebaseConfig || null;
    } catch (e) {
      console.warn('Nie udało się wczytać config.js', e);
      return;
    }
    S.sync.configured = !!(config && config.projectId);
  }
  if (!S.sync.configured) {
    foldOps();
    emit('sync');
    return;
  }
  if (!db) {
    try {
      const [appMod, fsMod] = await Promise.all(FIREBASE_URLS.map((u) => import(u)));
      const app = appMod.initializeApp(config);
      db = fsMod.initializeFirestore(app, { ignoreUndefinedProperties: true });
      fs = fsMod;
      S.sync.error = null;
    } catch (e) {
      console.warn('Firebase SDK niedostępny', e);
      S.sync.error = 'sdk';
      emit('sync');
      return;
    }
  }
  attach();
}

function detach() {
  unsubs.forEach((u) => u());
  unsubs = [];
  S.sync.server = noServer();
  S.sync.cache = noServer();
  S.sync.listExists = null;
}

function attach() {
  detach();
  const lid = S.me?.listId;
  if (!lid || !db) return;
  // Lista założona lokalnie, zanim dodano Firebase – jeśli serwer jej nie zna, wysyłamy ją w całości.
  const seed = S.base.list?.people?.[myId()] ? clone(S.base) : null;
  const onErr = (key) => (err) => {
    console.warn('Firestore', key, err);
    S.sync.error = err.code || 'error';
    emit('sync');
  };
  unsubs.push(
    fs.onSnapshot(
      fs.doc(db, 'lists', lid),
      { includeMetadataChanges: true },
      (snap) => {
        // Pierwszy wynik z samej pamięci podręcznej SDK bywa pusty – czekamy na serwer.
        if (snap.metadata.fromCache && !S.sync.server.list) return;
        S.sync.server.list = true;
        S.sync.cache.list = snap.metadata.fromCache;
        S.sync.listExists = snap.exists();
        S.base.list = snap.exists() ? snap.data() : null;
        baseChanged();
        if (!snap.exists() && seed && !snap.metadata.hasPendingWrites) uploadSeed(seed);
      },
      onErr('list')
    )
  );
  for (const coll of ['stores', 'items']) {
    unsubs.push(
      fs.onSnapshot(
        fs.collection(db, 'lists', lid, coll),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.metadata.fromCache && !S.sync.server[coll]) return;
          S.sync.server[coll] = true;
          S.sync.cache[coll] = snap.metadata.fromCache;
          const map = {};
          snap.forEach((d) => (map[d.id] = d.data()));
          S.base[coll] = map;
          baseChanged();
        },
        onErr(coll)
      )
    );
  }
  flush();
}

let seeded = false;
function uploadSeed(seed) {
  if (seeded) return;
  seeded = true;
  const ops = [set('', seed.list)];
  for (const [id, s] of Object.entries(seed.stores)) ops.push(set(`stores/${id}`, s));
  for (const [id, it] of Object.entries(seed.items)) ops.push(set(`items/${id}`, it));
  commit(ops);
}

function baseChanged() {
  if (S.sync.error && S.sync.error !== 'sdk') S.sync.error = null;
  recompute();
  saveBase();
  emit('remote');
}

function refFor(path) {
  const lid = S.me.listId;
  return path ? fs.doc(db, 'lists', lid, ...path.split('/')) : fs.doc(db, 'lists', lid);
}

function flush() {
  if (!db || !S.me?.listId) return;
  for (const op of S.ops) {
    if (sent.has(op.id)) continue;
    sent.add(op.id);
    let p;
    try {
      const ref = refFor(op.path);
      p = op.kind === 'set' ? fs.setDoc(ref, op.data) : op.kind === 'update' ? fs.updateDoc(ref, op.data) : fs.deleteDoc(ref);
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      () => dropOp(op.id, false),
      (err) => {
        // Serwer odrzucił zmianę (np. pozycję w międzyczasie usunięto) – wycofujemy ją lokalnie.
        console.warn('Zmiana odrzucona', op, err);
        dropOp(op.id, true);
      }
    );
  }
}

function dropOp(id, failed) {
  const i = S.ops.findIndex((o) => o.id === id);
  if (i < 0) return;
  S.ops.splice(i, 1);
  saveOps();
  if (failed) recompute();
  emit(failed ? 'remote' : 'sync');
}

window.addEventListener('online', () => {
  if (!db) startSync();
  emit('sync');
});
window.addEventListener('offline', () => emit('sync'));

export function syncStatus() {
  if (!S.me?.listId) return 'none';
  if (S.sync.configured === false) return 'local';
  if (S.sync.error === 'permission-denied') return 'denied';
  if (!navigator.onLine) return 'offline';
  const sv = S.sync.server;
  if (!db || !(sv.list && sv.stores && sv.items)) return S.sync.error ? 'offline' : 'connecting';
  const c = S.sync.cache;
  if (c.list || c.stores || c.items) return 'offline';
  if (S.ops.length) return 'saving';
  return 'synced';
}

// Czy mamy świeże dane (z serwera albo tryb lokalny) – potrzebne do automatycznego kończenia zakupów.
const trusted = () => S.sync.configured === false || (S.sync.server.stores && S.sync.server.items);

// ---------- odczyt ----------
export const myId = () => S.me?.pid || null;
export const person = (pid) => S.data.list?.people?.[pid] || null;

export function peopleList() {
  const ppl = S.data.list?.people || {};
  return Object.entries(ppl)
    .filter(([, p]) => p && p.name)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

export function storesSorted() {
  return Object.entries(S.data.stores)
    .filter(([, s]) => s && s.name)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export const store = (id) => (S.data.stores[id]?.name ? { id, ...S.data.stores[id] } : null);

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.addedAt ?? 0) - (b.addedAt ?? 0);

export function itemsOf(storeId) {
  const out = [];
  for (const [id, it] of Object.entries(S.data.items)) if (it && it.name && it.storeId === storeId) out.push({ id, ...it });
  return out.sort(byOrder);
}

export function allItems() {
  const out = [];
  for (const [id, it] of Object.entries(S.data.items)) if (it && it.name && S.data.stores[it.storeId]?.name) out.push({ id, ...it });
  return out;
}

export const item = (id) => (S.data.items[id]?.name ? { id, ...S.data.items[id] } : null);

export function visitBaseline(storeId) {
  const pid = myId();
  return S.data.list?.visits?.[pid]?.[storeId] ?? person(pid)?.joinedAt ?? 0;
}

export const isFresh = (it, since) => !!it.addedBy && it.addedBy !== myId() && (it.addedAt || 0) > (since || 0);

export function storeStats(storeId) {
  const since = visitBaseline(storeId);
  const st = S.data.stores[storeId];
  const s = { todo: 0, once: 0, cart: 0, fresh: 0, active: false };
  for (const it of itemsOf(storeId)) {
    if (it.checked) s.cart++;
    else {
      s.todo++;
      if (!it.permanent) s.once++;
      if (isFresh(it, since)) s.fresh++;
    }
  }
  s.active = !!st?.session || s.cart > 0;
  return s;
}

export function finishSummary(storeId) {
  const s = { back: 0, gone: 0, stay: 0 };
  for (const it of itemsOf(storeId)) {
    if (it.checked && it.permanent) s.back++;
    else if (it.checked) s.gone++;
    else if (!it.permanent) s.stay++;
  }
  return s;
}

// ---------- lista i osoby ----------
export function createList(name) {
  detach();
  const listId = randomCode(24);
  const pid = newId();
  S.me = { listId, pid };
  saveMe();
  loadListCache();
  const t = Date.now();
  const ops = [set('', { createdAt: t, people: { [pid]: { name, color: 0, joinedAt: t } }, visits: {} })];
  DEFAULT_STORES.forEach((s, i) =>
    ops.push(set(`stores/${s.id}`, { name: s.name, brand: s.id, color: null, logoMode: 'brand', logo: null, order: (i + 1) * 1000, session: null, createdAt: t }))
  );
  for (const [sid, names] of Object.entries(SEED)) {
    names.forEach((n, i) => ops.push(set(`items/${newId()}`, newItem(sid, n, '', '', true, (i + 1) * 1000, null, t))));
  }
  commit(ops);
  emit('me');
  if (db) attach();
  else startSync();
}

export function joinList(listId, pid = null) {
  detach();
  S.me = { listId, pid };
  saveMe();
  loadListCache();
  emit('me');
  if (db) attach();
  else startSync();
}

export function leaveList() {
  const id = S.me?.listId;
  detach();
  if (id) [K.base(id), K.ops(id), K.hist(id)].forEach((k) => writeJSON(k, null));
  S.me = null;
  saveMe();
  loadListCache();
  emit('me');
}

export function choosePerson(pid) {
  S.me = { ...S.me, pid };
  saveMe();
  emit('me');
}

export function addPerson(name) {
  const pid = newId();
  const n = Object.keys(S.data.list?.people || {}).length;
  S.me = { ...S.me, pid };
  saveMe();
  commit([update('', { [`people.${pid}`]: { name, color: n, joinedAt: Date.now() } })]);
  emit('me');
  return pid;
}

export function renameMe(name) {
  const pid = myId();
  if (!pid || !name) return;
  if (person(pid)) commit([update('', { [`people.${pid}.name`]: name })]);
  else commit([update('', { [`people.${pid}`]: { name, color: Object.keys(S.data.list?.people || {}).length, joinedAt: Date.now() } })]);
}

export function visitStore(storeId) {
  const pid = myId();
  if (!pid || !S.data.stores[storeId]) return;
  commit([update('', { [`visits.${pid}.${storeId}`]: Date.now() })]);
}

// ---------- pozycje ----------
function newItem(storeId, name, qty, note, permanent, order, by, t) {
  return { storeId, name, qty: qty || '', note: note || '', permanent: !!permanent, order, checked: false, checkedAt: null, checkedBy: null, addedBy: by || null, addedAt: t, updatedAt: t };
}

function maxOrder(storeId) {
  let m = 0;
  for (const it of Object.values(S.data.items)) if (it?.storeId === storeId && (it.order ?? 0) > m) m = it.order;
  return m;
}

export function findInStore(storeId, name) {
  const key = norm(name);
  return itemsOf(storeId).find((it) => norm(it.name) === key) || null;
}

// entries: [{ name, qty, note }]
export function addItems(storeId, entries, permanent) {
  const existing = new Map(itemsOf(storeId).map((it) => [norm(it.name), it]));
  const res = { added: [], restored: [], converted: [], dup: [] };
  const ops = [];
  const t = Date.now();
  let order = maxOrder(storeId);
  for (const e of entries) {
    const name = (e.name || '').trim().slice(0, 200);
    if (!name) continue;
    const key = norm(name);
    const ex = existing.get(key);
    if (ex) {
      if (!ex.id) continue; // duplikat w tej samej paczce
      const upd = {};
      if (permanent && !ex.permanent) {
        upd.permanent = true;
        res.converted.push(ex.id);
      }
      if (ex.checked) {
        Object.assign(upd, { checked: false, checkedAt: null, checkedBy: null });
        res.restored.push(ex.id);
      }
      if (e.qty && e.qty !== ex.qty) upd.qty = e.qty;
      if (e.note && e.note !== ex.note) upd.note = e.note;
      if (Object.keys(upd).length) ops.push(update(`items/${ex.id}`, { ...upd, updatedAt: t }));
      if (!upd.permanent && !ex.checked) res.dup.push(ex.id);
      continue;
    }
    order += 1000;
    const id = newId();
    ops.push(set(`items/${id}`, newItem(storeId, name, e.qty, e.note, permanent, order, myId(), t)));
    existing.set(key, { name });
    res.added.push(id);
  }
  commit(ops);
  return res;
}

export function checkItem(id) {
  const it = S.data.items[id];
  if (!it || it.checked) return;
  const t = Date.now();
  const st = S.data.stores[it.storeId];
  const ops = [update(`items/${id}`, { checked: true, checkedAt: t, checkedBy: myId() })];
  if (st) ops.push(update(`stores/${it.storeId}`, { session: { startedAt: st.session?.startedAt || t, lastCheckAt: t, by: st.session?.by || myId() } }));
  commit(ops);
}

export function uncheckItems(ids) {
  const ops = [];
  const stores = new Set();
  for (const id of ids) {
    const it = S.data.items[id];
    if (!it || !it.checked) continue;
    ops.push(update(`items/${id}`, { checked: false, checkedAt: null, checkedBy: null }));
    stores.add(it.storeId);
  }
  if (!ops.length) return;
  for (const op of ops) applyOp(S.data, op); // podgląd: czy w koszyku coś zostanie
  for (const sid of stores) {
    if (S.data.stores[sid]?.session && !itemsOf(sid).some((i) => i.checked)) ops.push(update(`stores/${sid}`, { session: null }));
  }
  commit(ops);
}

export function finishShopping(storeId) {
  const ops = [];
  const bought = [];
  for (const it of itemsOf(storeId)) {
    if (!it.checked) continue;
    if (it.permanent) ops.push(update(`items/${it.id}`, { checked: false, checkedAt: null, checkedBy: null }));
    else {
      ops.push(del(`items/${it.id}`));
      bought.push(it.name);
    }
  }
  if (S.data.stores[storeId]) ops.push(update(`stores/${storeId}`, { session: null, lastFinishedAt: Date.now() }));
  commit(ops);
  addHistory(storeId, bought);
}

export function autoCloseSessions() {
  if (!trusted()) return [];
  const closed = [];
  const t = Date.now();
  for (const st of storesSorted()) {
    const cart = itemsOf(st.id).filter((i) => i.checked);
    if (!st.session && !cart.length) continue;
    const last = Math.max(st.session?.lastCheckAt || 0, ...cart.map((i) => i.checkedAt || 0));
    if (t - last > AUTO_CLOSE_MS) {
      finishShopping(st.id);
      closed.push(st.name);
    }
  }
  return closed;
}

export function updateItem(id, fields) {
  const it = S.data.items[id];
  if (!it) return;
  const upd = { ...fields, updatedAt: Date.now() };
  if (fields.storeId && fields.storeId !== it.storeId) {
    upd.order = maxOrder(fields.storeId) + 1000;
    if (it.checked) Object.assign(upd, { checked: false, checkedAt: null, checkedBy: null });
  }
  commit([update(`items/${id}`, upd)]);
}

export function deleteItems(ids) {
  const snaps = [];
  const ops = [];
  for (const id of ids) {
    if (!S.data.items[id]) continue;
    snaps.push({ id, data: clone(S.data.items[id]) });
    ops.push(del(`items/${id}`));
  }
  commit(ops);
  return snaps;
}

export function restoreItems(snaps) {
  commit(snaps.map((s) => set(`items/${s.id}`, s.data)));
}

export function reorder(coll, orderedIds, movedId) {
  const map = S.data[coll];
  const idx = orderedIds.indexOf(movedId);
  if (idx < 0) return;
  const before = idx > 0 ? map[orderedIds[idx - 1]]?.order : null;
  const after = idx < orderedIds.length - 1 ? map[orderedIds[idx + 1]]?.order : null;
  if (before != null && after != null && after - before < 0.0001) {
    commit(orderedIds.map((id, i) => update(`${coll}/${id}`, { order: (i + 1) * 1000 })));
    return;
  }
  const o = before == null && after == null ? 1000 : before == null ? after - 1000 : after == null ? before + 1000 : (before + after) / 2;
  commit([update(`${coll}/${movedId}`, { order: o })]);
}

// ---------- sklepy ----------
export function addStore({ name, color, logoMode, logo }) {
  const id = newId();
  let order = 0;
  for (const s of Object.values(S.data.stores)) if ((s?.order ?? 0) > order) order = s.order;
  commit([set(`stores/${id}`, { name, brand: null, color: color || null, logoMode: logoMode || 'mono', logo: logo || null, order: order + 1000, session: null, createdAt: Date.now() })]);
  return id;
}

export function updateStore(id, fields) {
  if (!S.data.stores[id]) return;
  commit([update(`stores/${id}`, fields)]);
}

export function deleteStore(id) {
  const ops = itemsOf(id).map((it) => del(`items/${it.id}`));
  ops.push(del(`stores/${id}`));
  commit(ops);
}

// ---------- historia (podpowiedzi z wcześniej kupionych jednorazowych) ----------
function addHistory(storeId, names) {
  if (!names.length || !S.me?.listId) return;
  const t = Date.now();
  const keys = new Set(names.map((n) => norm(n) + '|' + storeId));
  S.hist = [...names.map((n) => ({ n, s: storeId, t })), ...S.hist.filter((h) => !keys.has(norm(h.n) + '|' + h.s))].slice(0, 300);
  writeJSON(K.hist(S.me.listId), S.hist);
}
