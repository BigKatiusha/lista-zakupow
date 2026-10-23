// Edycja listy sklepu: kolejność przez przeciąganie (trasa po sklepie), zmiana nazwy, przeniesienie, usuwanie.
import { $, esc, icon, haptic } from '../util.js';
import { store, itemsOf, deleteItems, restoreItems, reorder, myId } from '../data.js';
import { UI, registerScreen, pop, toast, openSheet } from '../ui.js';
import { applyAccent } from '../brands.js';
import { sortable, edgeBack } from '../gestures.js';
import { navBar, trackScroll, avatarHTML } from './common.js';

let el, scroller, listEl, headEl;
let dragging = false;
let lastSig = '';
let pendingScroll = null;
const scrollKey = () => `edit:${UI.storeId}`;

export function mountEdit(root) {
  el = document.createElement('section');
  el.className = 'screen screen-edit accent-scope';
  el.innerHTML = `
    ${navBar({ back: 'Wróć', right: '<button class="nav-done" type="button" data-act="back">Gotowe</button>' })}
    <div class="scroller">
      <div class="page-head"></div>
      <div class="edit-list"></div>
    </div>`;
  root.appendChild(el);
  scroller = $('.scroller', el);
  listEl = $('.edit-list', el);
  headEl = $('.page-head', el);
  trackScroll(scroller, scrollKey, el, 56);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = b.closest('[data-id]')?.dataset.id;
    if (act === 'back') pop();
    else if (act === 'bulk') openSheet('bulk', { storeId: UI.storeId });
    else if (act === 'edit' && id) openSheet('item', { id });
    else if (act === 'del' && id) removeItem(id, b.closest('.erow'));
  });

  sortable(listEl, {
    onStart: () => (dragging = true),
    onDrop: (movedId, ids, moved) => {
      dragging = false;
      if (moved) reorder('items', ids, movedId);
      lastSig = '';
      setTimeout(update, 240);
    },
  });
  edgeBack(el, () => document.querySelector('.screen-store'), () => pop());

  registerScreen('edit', {
    el,
    update,
    onEnter(dir) {
      if (dir === 'push') {
        pendingScroll = 0;
        lastSig = '';
      }
    },
    restoreScroll() {
      pendingScroll = UI.scroll[scrollKey()] || 0;
      update();
    },
  });
}

function removeItem(id, row) {
  haptic();
  const name = itemsOf(UI.storeId).find((i) => i.id === id)?.name;
  if (row) {
    row.style.height = `${row.offsetHeight}px`;
    void row.offsetHeight;
    row.classList.add('leaving');
    row.style.height = '0px';
  }
  setTimeout(() => {
    const snaps = deleteItems([id]);
    toast(`Usunięto „${name}”`, { action: 'Cofnij', onAction: () => restoreItems(snaps) });
  }, row ? 220 : 0);
}

function update() {
  const st = store(UI.storeId);
  if (!st) return;
  applyAccent(el, st);
  $('.nav-title-text', el).textContent = `Edytuj · ${st.name}`;
  if (dragging) return;
  const items = itemsOf(st.id);
  const sig = st.name + '|' + items.map((i) => [i.id, i.name, i.qty, i.note, i.permanent, i.checked, i.addedBy].join(':')).join(',');
  if (sig !== lastSig) {
    lastSig = sig;
    headEl.innerHTML = `<h1>Edytuj listę</h1><p>${esc(st.name)} · przeciągnij ${icon('grip', 'inline')}, aby ułożyć produkty według trasy po sklepie. Dotknij produktu, aby zmienić nazwę, ilość, notatkę albo sklep.</p>
      <div class="head-tools"><button class="btn small tinted" type="button" data-act="bulk">${icon('list')} Dodaj wiele naraz</button></div>`;
    listEl.innerHTML = items.length
      ? items
          .map(
            (i) => `<div class="erow${i.permanent ? '' : ' once'}" data-id="${esc(i.id)}">
          <button class="erow-del" type="button" data-act="del" aria-label="Usuń">${icon('minus')}</button>
          <button class="erow-main" type="button" data-act="edit">
            <span class="erow-name">${esc(i.name)}${i.qty ? ` <span class="qty">${esc(i.qty)}</span>` : ''}</span>
            <span class="erow-meta">${i.permanent ? '' : '<span class="tag once">jednorazowe</span>'}${i.checked ? '<span class="tag cart">w koszyku</span>' : ''}${i.note ? `<span class="note">${esc(i.note)}</span>` : ''}</span>
          </button>
          ${i.addedBy && i.addedBy !== myId() ? avatarHTML(i.addedBy, 'sm') : ''}
          <span class="grip" aria-label="Przeciągnij, aby zmienić kolejność">${icon('grip')}</span>
        </div>`
          )
          .join('')
      : `<div class="empty"><h3>Brak produktów</h3><p>Dodaj produkty polem na dole albo „Dodaj wiele naraz”.</p></div>`;
  }
  if (pendingScroll != null) {
    scroller.scrollTop = pendingScroll;
    pendingScroll = null;
  }
}
