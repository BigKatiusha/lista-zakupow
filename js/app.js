// Start aplikacji: odtworzenie stanu z pamięci telefonu (bez ekranu ładowania), potem synchronizacja.
import { $, parseCode, isIOS, isStandalone, plural, readJSON, writeJSON } from './util.js';
import { S, loadLocal, subscribe, startSync, flushLocal, autoCloseSessions, store, item, joinList } from './data.js';
import {
  UI, saveUI, setRenderer, requestRender, applyScreens, screenDef, top, initHistory, initSheets,
  openSheet, refreshSheet, sheetPersists, toast, resetStack,
} from './ui.js';
import { mountAddbar, updateAddbar } from './addbar.js';
import { mountHome } from './screens/home.js';
import { mountStore, flashItem } from './screens/store.js';
import { mountEdit } from './screens/edit.js';
import { mountSettings, mountStores } from './screens/settings.js';
import { mountOnboarding } from './screens/onboarding.js';
import './sheets.js';

const app = $('#app');

// ---------- 1. dane z pamięci telefonu ----------
loadLocal();

// ---------- 2. który ekran pokazać ----------
function fixStack() {
  const ready = S.me?.listId && S.me?.pid;
  if (!ready) {
    UI.stack = ['onboarding'];
    if (S.me?.listId && !S.me.pid) UI.onb.step = 'who';
    else if (UI.onb.step === 'who') UI.onb.step = 'welcome';
    return;
  }
  let st = UI.stack.filter((s) => ['home', 'store', 'edit', 'settings', 'stores'].includes(s));
  if (st[0] !== 'home') st = ['home'];
  if ((st.includes('store') || st.includes('edit')) && !store(UI.storeId)) st = ['home'];
  UI.stack = st;
}
fixStack();
if (UI.sheet && !sheetPersists(UI.sheet.type)) UI.sheet = null;

// ---------- 3. link z kodem listy (#k=… albo ?k=…&p=…) ----------
function handleHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const code = parseCode(hash.get('k') || query.get('k'));
  if (!code) return;
  const pid = hash.get('p') || query.get('p') || null;
  const sig = `${code}|${pid || ''}`;
  if (readJSON('lz.lastHash') === sig) return; // ten link był już obsłużony
  writeJSON('lz.lastHash', sig);
  if (S.me?.listId === code) {
    if (!S.me.pid && pid) joinList(code, pid);
    return;
  }
  if (!S.me?.listId) {
    if (pid) {
      joinList(code, pid);
      UI.stack = ['home'];
    } else {
      joinList(code);
      UI.stack = ['onboarding'];
      UI.onb = { step: 'who', name: '', code: '', error: '' };
    }
    saveUI();
    return;
  }
  UI.sheet = { type: 'switchList', params: { code, pid }, draft: {} };
}
handleHash();
fixStack();

// Na iPhonie apka z ekranu początkowego ma osobną pamięć niż Safari – trzymamy kod w adresie
// (jako ?k=…&p=…, bo to iOS na pewno zachowuje), żeby „Do ekranu początkowego” zabrało listę i imię ze sobą.
function keepCodeInUrl() {
  if (!isIOS || isStandalone()) return;
  const want = S.me?.listId ? `?k=${S.me.listId}${S.me.pid ? `&p=${S.me.pid}` : ''}` : '';
  if (location.search !== want || location.hash) {
    history.replaceState(history.state, '', `${location.pathname}${want}`);
    if (want) writeJSON('lz.lastHash', `${S.me.listId}|${S.me.pid || ''}`);
  }
}
if (isIOS && !isStandalone()) document.querySelector('link[rel="manifest"]')?.remove();

// ---------- 4. budowa interfejsu ----------
app.innerHTML = `
  <div id="screens"></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <div id="sheet-layer" hidden><div class="sheet-backdrop"></div><div class="sheet"><div class="sheet-grab"></div><div class="sheet-body"></div></div></div>`;
const screensEl = $('#screens');
mountOnboarding(screensEl);
mountHome(screensEl);
mountStore(screensEl);
mountEdit(screensEl);
mountSettings(screensEl);
mountStores(screensEl);
mountAddbar(app, {
  onAdded: onAdded,
  flash: (id) => (top() === 'store' ? flashItem(id) : null),
  message: (m) => toast(m),
});
initSheets();

function onAdded(storeId, res, entries, permanent) {
  const st = store(storeId);
  const inStore = (top() === 'store' || top() === 'edit') && UI.storeId === storeId;
  const name = entries.length === 1 ? entries[0].name : null;
  if (res.dup.length && !res.added.length && !res.restored.length && !res.converted.length) {
    if (inStore && top() === 'store') flashItem(res.dup[0]);
    toast(name ? `„${item(res.dup[0])?.name || name}” już jest na liście` : 'Wszystko już jest na liście');
    return;
  }
  if (res.restored.length && !res.added.length) {
    toast(name ? `„${name}” wraca z koszyka na listę` : `${res.restored.length} wraca z koszyka`);
    return;
  }
  if (res.converted.length && !res.added.length) {
    toast(name ? `„${name}” jest teraz na stałej liście` : 'Zmieniono na stałe');
    return;
  }
  const n = res.added.length;
  if (inStore && top() === 'store') {
    if (n === 1) requestAnimationFrame(() => flashItem(res.added[0]));
    if (n > 1) toast(`Dodano ${n} ${plural(n, 'produkt', 'produkty', 'produktów')}${res.dup.length ? ` · ${res.dup.length} już na liście` : ''}`);
    return;
  }
  const kind = permanent ? 'na stałe' : 'jednorazowo';
  toast(n === 1 ? `Dodano „${name}” do ${st?.name} · ${kind}` : `Dodano ${n} ${plural(n, 'produkt', 'produkty', 'produktów')} do ${st?.name}`);
}

function render() {
  for (const name of new Set([top(), UI.stack[UI.stack.length - 2]])) {
    if (name) screenDef(name)?.update?.();
  }
  updateAddbar();
  refreshSheet();
  keepCodeInUrl();
}
setRenderer(render);

// Pierwszy obraz: od razu właściwy ekran, przewinięcie, wpisany tekst i otwarty arkusz.
document.documentElement.classList.add('no-anim');
for (const name of UI.stack) {
  if (name === 'store' || name === 'edit') screenDef(name).onEnter?.('restore');
  screenDef(name)?.update?.();
  screenDef(name)?.restoreScroll?.();
}
applyScreens();
render();
if (UI.sheet) {
  const s = UI.sheet;
  UI.sheet = null;
  openSheet(s.type, s.params, { draft: s.draft, instant: true });
}
initHistory();
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-anim')));

// ---------- 5. zmiany danych ----------
subscribe((why) => {
  if (why === 'me') fixStackAfterMe();
  requestRender();
});

function fixStackAfterMe() {
  if (!S.me?.listId && top() !== 'onboarding') resetStack(['onboarding']);
}

// ---------- 6. zapis przy przejściu do innej aplikacji ----------
function persistNow() {
  saveUI(true);
  flushLocal();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistNow();
  else {
    checkSessions();
    requestRender();
  }
});
window.addEventListener('pagehide', persistNow);
document.addEventListener('freeze', persistNow);

// ---------- 7. klawiatura na iPhonie (pole „Dodaj…” nad klawiaturą) ----------
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    document.documentElement.classList.toggle('kb-open', kb > 80);
  };
  vv.addEventListener('resize', onVV);
  vv.addEventListener('scroll', onVV);
  onVV();
}
// iOS potrafi przewinąć całą stronę przy otwieraniu klawiatury – wracamy na miejsce.
window.addEventListener('scroll', () => {
  if (window.scrollY && !document.documentElement.classList.contains('kb-open')) window.scrollTo(0, 0);
});

// ---------- 8. automatyczne kończenie zakupów po 12 h ----------
function checkSessions() {
  const closed = autoCloseSessions();
  if (closed.length) toast(`Zakupy w ${closed.join(', ')} zakończono automatycznie (12 h bez odhaczeń)`);
}
setInterval(checkSessions, 60 * 1000);
subscribe((why) => why === 'remote' && setTimeout(checkSessions, 0));

// ---------- 9. synchronizacja i tryb offline ----------
setTimeout(() => {
  startSync().then(checkSessions);
}, 0);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && navigator.serviceWorker.controller) {
            toast('Jest nowa wersja aplikacji', { action: 'Odśwież', duration: 10000, onAction: () => location.reload() });
          }
        });
      });
    })
    .catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});

// Do testów w konsoli przeglądarki.
window.__lz = { S, UI };
