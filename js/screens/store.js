// Ekran sklepu: lista do odhaczania, pasek zakupów, sekcja „W koszyku”.
import { $, esc, icon, plural, haptic, relTime } from '../util.js';
import { S, store, itemsOf, item, checkItem, uncheckItems, updateItem, isFresh, myId, visitStore } from '../data.js';
import { UI, saveUI, registerScreen, pop, top, toast, openSheet, resetStack } from '../ui.js';
import { logoHTML, applyAccent } from '../brands.js';
import { rowSwiper, edgeBack } from '../gestures.js';
import { avatarHTML, personName, freezeSince, sinceFor, navBar, trackScroll, syncInfo } from './common.js';

let el, scroller, listEl, cartEl, heroEl, emptyEl, sessionEl, navTitle, syncEl;
let pendingScroll = null;
let lastCart = '';
let lastHero = '';
let lastSession = '';

const scrollKey = () => `store:${UI.storeId}`;

export function mountStore(root) {
  el = document.createElement('section');
  el.className = 'screen screen-store accent-scope';
  el.innerHTML = `
    <div class="topbar">
      ${navBar({ back: 'Sklepy', right: `<span class="nav-sync"></span><button class="icon-btn tinted" type="button" data-act="menu" aria-label="Więcej">${icon('more')}</button>` })}
      <div class="session-slot"></div>
    </div>
    <div class="scroller">
      <div class="hero"></div>
      <div class="items"></div>
      <div class="empty" hidden></div>
      <div class="cart"></div>
      <div class="list-foot"></div>
    </div>`;
  root.appendChild(el);
  scroller = $('.scroller', el);
  listEl = $('.items', el);
  cartEl = $('.cart', el);
  heroEl = $('.hero', el);
  emptyEl = $('.empty', el);
  sessionEl = $('.session-slot', el);
  navTitle = $('.nav-title-text', el);
  syncEl = $('.nav-sync', el);
  trackScroll(scroller, scrollKey, el, 64);
  new ResizeObserver(() => el.style.setProperty('--head-h', `${$('.topbar', el).offsetHeight}px`)).observe($('.topbar', el));

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || listEl.contains(b)) return;
    const act = b.dataset.act;
    if (act === 'back') pop();
    else if (act === 'menu') openSheet('storeMenu', { storeId: UI.storeId });
    else if (act === 'finish') openSheet('finish', { storeId: UI.storeId });
    else if (act === 'cart-toggle') {
      UI.cartOpen[UI.storeId] = !UI.cartOpen[UI.storeId];
      saveUI();
      lastCart = '';
      update();
    } else if (act === 'restore') {
      haptic();
      const it = item(b.dataset.id);
      uncheckItems([b.dataset.id]);
      if (it) toast(`„${it.name}” wraca na listę`);
    } else if (act === 'add-focus') document.getElementById('add-input')?.focus();
  });

  rowSwiper(listEl, {
    onTap: (row) => doCheck(row),
    onSwipeRight: (row) => doCheck(row, true),
    onLongPress: (row) => openSheet('item', { id: row.dataset.id }),
    // Pełne przesunięcie w lewo: jednorazowa → na stałe (jednym ruchem), stała → edycja.
    onLeftFull: (row) => (row.classList.contains('once') ? makePermanent(row.dataset.id) : openSheet('item', { id: row.dataset.id })),
    onAction: (row, act) => {
      if (act === 'edit') openSheet('item', { id: row.dataset.id });
      if (act === 'perm') makePermanent(row.dataset.id);
    },
  });
  edgeBack(el, () => document.querySelector('.screen-home'), () => pop());

  registerScreen('store', {
    el,
    update,
    onEnter(dir) {
      if (dir === 'push' || dir === 'reset') {
        freezeSince(UI.storeId);
        listEl.dataset.store = '';
        pendingScroll = UI.scroll[scrollKey()] || 0;
      }
    },
    onLeave(dir) {
      listEl.closeReveal?.();
      if (dir !== 'push') visitStore(UI.storeId);
    },
    restoreScroll() {
      pendingScroll = UI.scroll[scrollKey()] || 0;
      update();
    },
  });
}

function makePermanent(id) {
  const it = item(id);
  if (!it) return;
  haptic();
  updateItem(id, { permanent: true });
  toast(`„${it.name}” jest teraz na stałej liście`, { action: 'Cofnij', onAction: () => updateItem(id, { permanent: false }) });
}

function doCheck(row) {
  if (!row || row.classList.contains('leaving')) return;
  const id = row.dataset.id;
  const it = item(id);
  if (!it || it.checked) return;
  haptic();
  row.classList.add('checking');
  checkItem(id);
  // „Cofnij” dotyczy ostatniego odhaczenia; wcześniejsze można przywrócić z sekcji „W koszyku”.
  toast(`„${it.name}” w koszyku`, {
    action: 'Cofnij',
    duration: 5000,
    onAction: () => {
      haptic();
      uncheckItems([id]);
    },
  });
}

export function flashItem(id) {
  const row = listEl.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  // Przewijamy tylko listę (scrollIntoView potrafi przesunąć cały ekran w trakcie animacji).
  const sr = scroller.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + rr.top - sr.top - (sr.height - rr.height) / 2), behavior: 'smooth' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1600);
}

// ---------- wiersze ----------
function rowInner(it, fresh) {
  const tags = [];
  if (!it.permanent) tags.push('<span class="tag once">jednorazowe</span>');
  if (fresh) tags.push(`<span class="tag fresh">nowe · ${esc(personName(it.addedBy))}, ${esc(relTime(it.addedAt))}</span>`);
  if (it.note) tags.push(`<span class="note">${esc(it.note)}</span>`);
  return `
    <div class="row-bg">
      <div class="bg-left">${icon('check')}<span>Do koszyka</span></div>
      <div class="bg-right">${!it.permanent ? `<button class="bg-act pin" type="button" data-act="perm">${icon('pin')}<span>Na stałe</span></button>` : ''}<button class="bg-act edit" type="button" data-act="edit">${icon('pencil')}<span>Edytuj</span></button></div>
    </div>
    <div class="row-fg">
      <span class="chk">${icon('check')}</span>
      <span class="row-main">
        <span class="row-title"><span class="row-name">${esc(it.name)}</span>${it.qty ? `<span class="qty">${esc(it.qty)}</span>` : ''}</span>
        ${tags.length ? `<span class="row-sub">${tags.join('')}</span>` : ''}
      </span>
      ${it.addedBy && it.addedBy !== myId() ? avatarHTML(it.addedBy, 'sm') : ''}
    </div>`;
}

function syncRows(items, since, animate) {
  const existing = new Map();
  for (const r of listEl.children) if (r.dataset.id && !r.classList.contains('leaving')) existing.set(r.dataset.id, r);
  let prev = null;
  const keep = new Set();
  for (const it of items) {
    const fresh = isFresh(it, since);
    const sig = [it.name, it.qty, it.note, it.permanent, fresh, it.addedBy, personName(it.addedBy), fresh ? relTime(it.addedAt) : ''].join('\u0001');
    let row = existing.get(it.id);
    if (!row) {
      row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = it.id;
      if (animate) row.classList.add('entering');
    } else if (row.classList.contains('checking') || row.classList.contains('swiped-out')) {
      // odhaczenie cofnięte, zanim wiersz zdążył zniknąć
      row.classList.remove('checking', 'swiped-out', 'dir-right', 'armed');
      row.querySelector('.row-fg').style.transform = '';
    }
    if (row._sig !== sig) {
      row.innerHTML = rowInner(it, fresh);
      row.classList.toggle('once', !it.permanent);
      row.classList.toggle('fresh', fresh);
      row.classList.remove('revealed', 'dir-left', 'dir-right');
      row._sig = sig;
    }
    keep.add(it.id);
    const ref = prev ? prev.nextSibling : listEl.firstChild;
    if (row !== ref) listEl.insertBefore(row, ref);
    prev = row;
  }
  for (const [id, row] of existing) if (!keep.has(id)) animateOut(row, animate);
}

function animateOut(row, animate) {
  if (!animate) {
    row.remove();
    return;
  }
  row.style.height = `${row.offsetHeight}px`;
  void row.offsetHeight;
  row.classList.add('leaving');
  row.style.height = '0px';
  const done = () => row.isConnected && row.remove();
  row.addEventListener('transitionend', (e) => e.target === row && e.propertyName === 'height' && done());
  setTimeout(done, 900);
}

// ---------- render ----------
function update() {
  const st = store(UI.storeId);
  if (!st) {
    if (UI.stack.includes('store'))
      setTimeout(() => {
        if (!store(UI.storeId) && UI.stack.includes('store')) resetStack(['home']);
      }, 0);
    return;
  }
  applyAccent(el, st);
  navTitle.textContent = st.name;
  const si = syncInfo();
  syncEl.innerHTML = si.cls === 'ok' || si.cls === 'busy' || si.cls === 'local' ? '' :`<span class="sync-mini ${si.cls}" title="${esc(si.text)}">${icon(si.icon)}</span>`;

  const all = itemsOf(st.id);
  const todo = all.filter((i) => !i.checked);
  const cart = all.filter((i) => i.checked).sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
  const once = todo.filter((i) => !i.permanent).length;
  const active = !!st.session || cart.length > 0;

  const hero = `${logoHTML(st, 'logo-hero')}<div class="hero-text"><h1>${esc(st.name)}</h1><p>${
    todo.length ? `${todo.length} do kupienia` : cart.length ? 'Wszystko w koszyku' : 'Lista jest pusta'
  }${once ? ` · <span class="hero-once">${once} ${plural(once, 'jednorazowa', 'jednorazowe', 'jednorazowych')}</span>` : ''}</p></div>`;
  if (hero !== lastHero) heroEl.innerHTML = lastHero = hero;

  const session = active
    ? `<div class="session-bar"><span class="sb-ic">${icon('cart')}</span><span class="sb-text"><b>Zakupy w ${esc(st.name)}</b><span class="sb-dot"> · </span><span class="sb-count">${cart.length} w koszyku</span></span><button class="sb-btn" type="button" data-act="finish">Zakończ</button></div>`
    : '';
  if (session !== lastSession) {
    sessionEl.innerHTML = lastSession = session;
    el.classList.toggle('shopping', active);
  }

  const fresh = listEl.dataset.store !== st.id;
  if (fresh) {
    listEl.innerHTML = '';
    listEl.dataset.store = st.id;
    lastCart = '';
  }
  syncRows(todo, sinceFor(st.id), !fresh);

  emptyEl.hidden = todo.length > 0;
  if (!todo.length) {
    emptyEl.innerHTML = cart.length
      ? `<div class="empty-ic done">${icon('check')}</div><h3>Wszystko w koszyku</h3><p>Gdy skończycie, zakończ zakupy – stała lista wróci w całości.</p><button class="btn primary" type="button" data-act="finish">Zakończ zakupy</button>`
      : `<div class="empty-ic">${logoHTML(st, 'logo-lg')}</div><h3>Lista jest pusta</h3><p>Wpisz produkt w polu na dole. „+ Na stałe” dodaje do stałej listy tego sklepu, „+ Tylko raz” – jednorazowo.</p><button class="btn tinted" type="button" data-act="add-focus">${icon('plus')} Dodaj produkt</button>`;
  }

  const open = !!UI.cartOpen[st.id];
  const cartSig = open + '|' + cart.map((i) => [i.id, i.name, i.qty, i.checkedBy].join(':')).join(',');
  if (cartSig !== lastCart) {
    lastCart = cartSig;
    cartEl.hidden = !cart.length;
    cartEl.classList.toggle('open', open);
    cartEl.innerHTML = cart.length
      ? `<button class="cart-head" type="button" data-act="cart-toggle" aria-expanded="${open}">${icon('cart')}<span>W koszyku (${cart.length})</span>${icon('chevD', 'cart-chev')}</button>
        <div class="cart-body"><div class="cart-inner">${cart
          .map(
            (i) => `<button class="cart-row" type="button" data-act="restore" data-id="${esc(i.id)}">
              <span class="chk on">${icon('check')}</span>
              <span class="cart-name">${esc(i.name)}${i.qty ? ` <span class="qty">${esc(i.qty)}</span>` : ''}</span>
              ${i.checkedBy && i.checkedBy !== myId() ? avatarHTML(i.checkedBy, 'sm') : ''}
              <span class="cart-undo">${icon('undo')}</span></button>`
          )
          .join('')}<p class="cart-hint">Dotknij, aby przywrócić na listę.</p></div></div>`
      : '';
  }

  if (pendingScroll != null && top() === 'store') {
    scroller.scrollTop = pendingScroll;
    el.classList.toggle('scrolled', scroller.scrollTop > 64);
    pendingScroll = null;
  }
}
