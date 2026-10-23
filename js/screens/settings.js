// Ustawienia oraz zarządzanie sklepami (nazwa, kolejność, logo).
import { $, esc, icon, formatCode, haptic, plural, isStandalone } from '../util.js';
import { S, storesSorted, storeStats, peopleList, person, myId, reorder } from '../data.js';
import { UI, registerScreen, pop, push, toast, openSheet } from '../ui.js';
import { logoHTML } from '../brands.js';
import { sortable, edgeBack } from '../gestures.js';
import { navBar, trackScroll, avatarHTML, syncInfo } from './common.js';

const VERSION = '1.0.0';

// ---------- Ustawienia ----------
let sEl, sScroller, sBody, sLast = '';

export function mountSettings(root) {
  sEl = document.createElement('section');
  sEl.className = 'screen screen-settings';
  sEl.innerHTML = `
    ${navBar({ back: 'Zakupy', title: 'Ustawienia' })}
    <div class="scroller"><div class="page-head"><h1>Ustawienia</h1></div><div class="settings-body"></div></div>`;
  root.appendChild(sEl);
  sScroller = $('.scroller', sEl);
  sBody = $('.settings-body', sEl);
  trackScroll(sScroller, 'settings', sEl, 40);
  sEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') pop();
    else if (act === 'name') openSheet('name');
    else if (act === 'share') openSheet('share');
    else if (act === 'stores') push('stores');
    else if (act === 'install') openSheet('install');
    else if (act === 'leave') openSheet('leave');
    else if (act === 'copy-code') {
      try {
        await navigator.clipboard.writeText(formatCode(S.me.listId));
        haptic();
        toast('Skopiowano kod listy');
      } catch {
        toast('Nie udało się skopiować');
      }
    }
  });
  edgeBack(sEl, () => document.querySelector('.screen-home'), () => pop());
  registerScreen('settings', {
    el: sEl,
    update: updateSettings,
    restoreScroll: () => (sScroller.scrollTop = UI.scroll.settings || 0),
    onEnter: (dir) => dir === 'push' && (sScroller.scrollTop = 0),
  });
}

const row = (act, ic, title, detail = '', extra = '') =>
  `<button class="srow" type="button" ${act ? `data-act="${act}"` : 'disabled'}><span class="srow-ic">${icon(ic)}</span><span class="srow-text"><span>${title}</span>${detail ? `<small>${detail}</small>` : ''}</span>${extra}${act ? icon('chevR', 'srow-chev') : ''}</button>`;

function updateSettings() {
  const me = person(myId());
  const ppl = peopleList();
  const si = syncInfo();
  const stores = storesSorted();
  const html = `
    <div class="group">
      <button class="profile" type="button" data-act="name">${avatarHTML(myId(), 'lg')}<span class="profile-text"><b>${esc(me?.name || 'Bez imienia')}</b><small>To Ty na tym urządzeniu · zmień imię</small></span>${icon('chevR', 'srow-chev')}</button>
    </div>
    <h3 class="group-title">Wspólna lista</h3>
    <div class="group">
      ${row('share', 'qr', 'Połącz telefon lub tablet', 'Kod QR i link do tej listy')}
      <div class="srow static"><span class="srow-ic">${icon('person')}</span><span class="srow-text"><span>Osoby na liście</span><small>${ppl.map((p) => esc(p.name)).join(', ') || '—'}</small></span><span class="av-stack">${ppl.map((p) => avatarHTML(p.id, 'sm')).join('')}</span></div>
    </div>
    <h3 class="group-title">Sklepy</h3>
    <div class="group">${row('stores', 'store', 'Sklepy i ich kolejność', `${stores.length} ${plural(stores.length, 'sklep', 'sklepy', 'sklepów')} · nazwy, logo, nowe sklepy`)}</div>
    <h3 class="group-title">Aplikacja</h3>
    <div class="group">
      ${row('install', 'download', isStandalone() ? 'Zainstalowana na ekranie głównym' : 'Dodaj do ekranu głównego', 'Instrukcja dla Androida i iPhone’a')}
      <div class="srow static"><span class="srow-ic sync ${si.cls}">${icon(si.icon)}</span><span class="srow-text"><span>Synchronizacja</span><small>${esc(si.text)}</small></span></div>
    </div>
    <h3 class="group-title">Kod listy</h3>
    <div class="group">
      <button class="srow" type="button" data-act="copy-code"><span class="srow-ic">${icon('link')}</span><span class="srow-text"><span class="code">${esc(formatCode(S.me?.listId || ''))}</span><small>Dotknij, aby skopiować. Kto zna ten kod, ma dostęp do listy.</small></span>${icon('copy', 'srow-chev')}</button>
    </div>
    <div class="group danger">${row('leave', 'logout', 'Odłącz to urządzenie od listy', 'Lista zostaje dla pozostałych osób')}</div>
    <p class="foot-note">Lista zakupów ${VERSION}<br>Działa offline · dane synchronizowane przez Firebase</p>`;
  if (html !== sLast) sBody.innerHTML = sLast = html;
}

// ---------- Sklepy ----------
let tEl, tScroller, tList, tDragging = false, tLast = '';

export function mountStores(root) {
  tEl = document.createElement('section');
  tEl.className = 'screen screen-stores';
  tEl.innerHTML = `
    ${navBar({ back: 'Ustawienia', title: 'Sklepy', right: `<button class="icon-btn tinted" type="button" data-act="add" aria-label="Dodaj sklep">${icon('plus')}</button>` })}
    <div class="scroller">
      <div class="page-head"><h1>Sklepy</h1><p>Przeciągnij ${icon('grip', 'inline')}, aby zmienić kolejność kafelków. Dotknij sklepu, aby zmienić nazwę, kolor albo logo.</p></div>
      <div class="store-list"></div>
      <div class="pad"><button class="btn tinted wide" type="button" data-act="add">${icon('plus')} Dodaj sklep</button></div>
    </div>`;
  root.appendChild(tEl);
  tScroller = $('.scroller', tEl);
  tList = $('.store-list', tEl);
  trackScroll(tScroller, 'stores', tEl, 40);
  tEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') pop();
    else if (b.dataset.act === 'add') openSheet('store', { isNew: true });
    else if (b.dataset.act === 'edit') openSheet('store', { id: b.closest('[data-id]').dataset.id });
  });
  sortable(tList, {
    onStart: () => (tDragging = true),
    onDrop: (id, ids, moved) => {
      tDragging = false;
      if (moved) reorder('stores', ids, id);
      tLast = '';
      setTimeout(updateStores, 240);
    },
  });
  edgeBack(tEl, () => document.querySelector('.screen-settings'), () => pop());
  registerScreen('stores', { el: tEl, update: updateStores, restoreScroll: () => (tScroller.scrollTop = UI.scroll.stores || 0) });
}

function updateStores() {
  if (tDragging) return;
  const html = storesSorted()
    .map((st) => {
      const s = storeStats(st.id);
      return `<div class="erow store-row" data-id="${esc(st.id)}">
        <button class="erow-main" type="button" data-act="edit">${logoHTML(st, 'logo-md')}<span class="erow-text"><span class="erow-name">${esc(st.name)}</span><span class="erow-meta">${s.todo} ${plural(s.todo, 'pozycja', 'pozycje', 'pozycji')}</span></span></button>
        <span class="grip" aria-label="Przeciągnij, aby zmienić kolejność">${icon('grip')}</span>
      </div>`;
    })
    .join('');
  if (html !== tLast) tList.innerHTML = tLast = html;
}
