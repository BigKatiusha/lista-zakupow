// Ekran główny: kafelki sklepów z liczbą pozycji i wyróżnioną liczbą jednorazowych.
import { $, esc, icon, plural, isStandalone } from '../util.js';
import { S, storesSorted, storeStats, peopleList, person, myId } from '../data.js';
import { UI, saveUI, registerScreen, push, openSheet } from '../ui.js';
import { logoHTML, accentStyle } from '../brands.js';
import { syncPill, openStore, trackScroll } from './common.js';

let el;
let scroller;
let content;
let lastHTML = '';

export function mountHome(root) {
  el = document.createElement('section');
  el.className = 'screen screen-home';
  el.innerHTML = `
    <div class="mini-nav"><span>Zakupy</span></div>
    <div class="scroller">
      <header class="large-head">
        <div class="lh-date" id="home-date"></div>
        <div class="lh-row">
          <h1>Zakupy</h1>
          <div class="lh-actions">
            <button class="icon-btn tinted" type="button" data-act="share" aria-label="Udostępnij listę">${icon('invite')}</button>
            <button class="icon-btn tinted" type="button" data-act="settings" aria-label="Ustawienia">${icon('gear')}</button>
          </div>
        </div>
        <div class="lh-sub" id="home-sub"></div>
      </header>
      <div class="home-content"></div>
    </div>`;
  root.appendChild(el);
  scroller = $('.scroller', el);
  content = $('.home-content', el);
  trackScroll(scroller, 'home', el, 52);
  el.addEventListener('click', onClick);
  registerScreen('home', { el, update, restoreScroll });
}

function restoreScroll() {
  scroller.scrollTop = UI.scroll.home || 0;
  el.classList.toggle('scrolled', scroller.scrollTop > 52);
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'open') openStore(b.dataset.id);
  else if (act === 'settings') push('settings');
  else if (act === 'share') openSheet('share');
  else if (act === 'add-store') openSheet('store', { isNew: true });
  else if (act === 'install') openSheet('install');
  else if (act === 'dismiss') {
    UI.dismissed[b.dataset.what] = true;
    saveUI();
    update();
  }
}

function tile(st) {
  const s = storeStats(st.id);
  const count = s.todo
    ? `<span class="tile-num">${s.todo}</span><span class="tile-unit">${plural(s.todo, 'pozycja', 'pozycje', 'pozycji')}</span>`
    : `<span class="tile-unit muted">${s.cart ? 'wszystko w koszyku' : 'pusta lista'}</span>`;
  const tags = [
    s.once ? `<span class="pill once">${s.once} ${plural(s.once, 'jednorazowa', 'jednorazowe', 'jednorazowych')}</span>` : '',
    s.fresh ? `<span class="pill fresh">${s.fresh} ${plural(s.fresh, 'nowa', 'nowe', 'nowych')}</span>` : '',
  ].join('');
  return `
    <button class="tile accent-scope${s.active ? ' active' : ''}" type="button" data-act="open" data-id="${esc(st.id)}" style="${accentStyle(st)}">
      <span class="tile-top">${logoHTML(st, 'logo-lg')}${s.active ? `<span class="tile-cart">${icon('cart')}${s.cart}</span>` : ''}</span>
      <span class="tile-name">${esc(st.name)}</span>
      <span class="tile-count">${count}</span>
      <span class="tile-tags">${tags}</span>
    </button>`;
}

function update() {
  const d = new Date();
  $('#home-date').textContent = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  const me = person(myId());
  $('#home-sub').innerHTML = `${me ? `<span class="hello">Cześć, ${esc(me.name)}</span>` : ''}${syncPill()}`;

  const stores = storesSorted();
  let html = '';
  for (const st of stores) {
    const s = storeStats(st.id);
    if (!s.active) continue;
    html += `<button class="banner session accent-scope" type="button" data-act="open" data-id="${esc(st.id)}" style="${accentStyle(st)}">
      <span class="banner-ic">${icon('cart')}</span>
      <span class="banner-text"><b>Zakupy w ${esc(st.name)}</b><span>${s.cart} w koszyku · ${s.todo} do kupienia</span></span>
      ${icon('chevR', 'banner-chev')}</button>`;
  }
  const promo = (act, what, ic, title, sub, alt) => `
    <div class="promo-row" role="button" tabindex="0" data-act="${act}">
      <span class="promo-ic${alt ? ' alt' : ''}">${icon(ic)}</span>
      <span class="promo-text"><b>${title}</b><span>${sub}</span></span>
      <button class="promo-x" type="button" data-act="dismiss" data-what="${what}" aria-label="Ukryj">${icon('x')}</button>
    </div>`;
  if (!isStandalone() && !UI.dismissed.install) html += promo('install', 'install', 'download', 'Dodaj do ekranu głównego', 'Działa jak aplikacja, także bez internetu');
  if (S.sync.configured && peopleList().length < 2 && !UI.dismissed.invite) html += promo('share', 'invite', 'qr', 'Połącz drugi telefon', 'Pokaż kod QR – lista będzie wspólna', true);
  html += `<div class="tiles">${stores.map(tile).join('')}
    <button class="tile tile-add" type="button" data-act="add-store"><span class="tile-add-ic">${icon('plus')}</span><span>Dodaj sklep</span></button></div>`;
  if (html !== lastHTML) {
    content.innerHTML = html;
    lastHTML = html;
  }
}
