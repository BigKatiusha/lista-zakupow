// Pole „Dodaj…” zawsze pod kciukiem: podpowiedzi, ilość/notatka, „+ Na stałe” / „+ Tylko raz”, wklejanie wielu linii.
import { $, esc, icon, norm, parseEntry, splitLines, haptic } from './util.js';
import { S, store, storesSorted, allItems, addItems, uncheckItems, findInStore } from './data.js';
import { UI, saveUI, top, openSheet } from './ui.js';
import { logoHTML, accentStyle } from './brands.js';

let bar, input, qtyEl, noteEl, sugEl, targetBtn, permBtn, onceBtn;
let sugHidden = false;
let sugList = [];
let keepFocus = null;
let hooks = {};

const VISIBLE_ON = ['home', 'store', 'edit'];

export function targetStoreId() {
  const t = top();
  if ((t === 'store' || t === 'edit') && store(UI.storeId)) return UI.storeId;
  if (UI.target && store(UI.target)) return UI.target;
  return storesSorted()[0]?.id || null;
}

export function mountAddbar(root, h) {
  hooks = h;
  bar = document.createElement('div');
  bar.id = 'addbar';
  bar.className = 'addbar accent-scope';
  bar.innerHTML = `
    <div class="sug" role="listbox"></div>
    <div class="add-card">
      <div class="add-row">
        <button class="add-target" type="button" aria-label="Wybierz sklep"></button>
        <textarea id="add-input" rows="1" placeholder="Dodaj…" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" spellcheck="true" aria-label="Dodaj produkt"></textarea>
        <button class="add-clear" type="button" aria-label="Wyczyść">${icon('x')}</button>
        <button class="add-more" type="button" aria-label="Ilość i notatka">${icon('sliders')}</button>
      </div>
      <div class="add-details">
        <input id="add-qty" type="text" placeholder="Ilość, np. 2 opak." autocomplete="off" enterkeyhint="done">
        <input id="add-note" type="text" placeholder="Notatka" autocomplete="off" enterkeyhint="done">
      </div>
      <div class="add-actions">
        <button class="add-btn perm" type="button">${icon('pin')}<span>+ Na stałe</span></button>
        <button class="add-btn once" type="button">${icon('plus')}<span>+ Tylko raz</span></button>
      </div>
    </div>`;
  root.appendChild(bar);
  input = $('#add-input', bar);
  qtyEl = $('#add-qty', bar);
  noteEl = $('#add-note', bar);
  sugEl = $('.sug', bar);
  targetBtn = $('.add-target', bar);
  permBtn = $('.add-btn.perm', bar);
  onceBtn = $('.add-btn.once', bar);

  input.value = UI.draft.text || '';
  qtyEl.value = UI.draft.qty || '';
  noteEl.value = UI.draft.note || '';

  // Przyciski nie zabierają fokusu polu – klawiatura zostaje, można dodawać seriami.
  // Uwaga: tylko mousedown. preventDefault na pointerdown w Safari (iOS) kasuje całe kliknięcie.
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) keepFocus = bar.contains(document.activeElement) ? document.activeElement : null;
  });
  bar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn === targetBtn || !keepFocus) return;
    const el = keepFocus;
    keepFocus = null;
    if (!bar.classList.contains('hidden') && document.activeElement !== el) el.focus({ preventScroll: true });
  });

  input.addEventListener('input', () => {
    UI.draft.text = input.value;
    saveUI();
    sugHidden = false;
    autosize();
    updateAddbar();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit(false);
    }
  });
  for (const [el, key] of [
    [qtyEl, 'qty'],
    [noteEl, 'note'],
  ]) {
    el.addEventListener('input', () => {
      UI.draft[key] = el.value;
      saveUI();
      updateAddbar();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit(false);
      }
    });
  }
  const focusChange = () =>
    requestAnimationFrame(() => {
      bar.classList.toggle('focused', bar.contains(document.activeElement));
      updateAddbar();
    });
  bar.addEventListener('focusin', focusChange);
  bar.addEventListener('focusout', focusChange);

  permBtn.addEventListener('click', () => submit(true));
  onceBtn.addEventListener('click', () => submit(false));
  $('.add-clear', bar).addEventListener('click', () => {
    clearDraft();
    input.focus();
  });
  $('.add-more', bar).addEventListener('click', () => {
    UI.draft.open = !UI.draft.open;
    saveUI();
    updateAddbar();
    if (UI.draft.open && !input.value.trim()) input.focus();
  });
  targetBtn.addEventListener('click', () => openSheet('pickStore', { purpose: 'target' }));
  sugEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) pickSuggestion(sugList[+b.dataset.i]);
  });

  new ResizeObserver(() => document.documentElement.style.setProperty('--addbar-h', `${bar.querySelector('.add-card').offsetHeight}px`)).observe(bar.querySelector('.add-card'));
  requestAnimationFrame(autosize);
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

function clearDraft() {
  UI.draft = { text: '', qty: '', note: '', open: false };
  input.value = qtyEl.value = noteEl.value = '';
  saveUI();
  autosize();
  updateAddbar();
}

export function setDraftText(text) {
  input.value = text;
  UI.draft.text = text;
  saveUI();
  autosize();
  updateAddbar();
}

function submit(permanent) {
  const sid = targetStoreId();
  const lines = splitLines(input.value);
  if (!lines.length) return;
  if (!sid) {
    openSheet('store', { isNew: true });
    return;
  }
  let entries;
  if (lines.length === 1) {
    const e = parseEntry(lines[0]);
    if (UI.draft.qty.trim()) e.qty = UI.draft.qty.trim();
    if (UI.draft.note.trim()) e.note = UI.draft.note.trim();
    entries = [e];
  } else entries = lines.map(parseEntry);
  entries = entries.filter((e) => e.name);
  if (!entries.length) return;
  const res = addItems(sid, entries, permanent);
  haptic();
  clearDraft();
  hooks.onAdded?.(sid, res, entries, permanent);
}

function suggestions(q, sid) {
  const nq = norm(q);
  if (!nq) return [];
  const seen = new Set();
  const out = [];
  const consider = (name, storeId, state, permanent) => {
    const n = norm(name);
    const key = `${n}|${storeId}`;
    if (seen.has(key)) return;
    const i = n.indexOf(nq);
    if (i < 0) return;
    seen.add(key);
    let score = i === 0 ? 0 : /[\s\-(]/.test(n[i - 1]) ? 1 : 2;
    if (state === 'hist') score += 0.6;
    if (storeId === sid) score -= 0.3;
    out.push({ name, storeId, state, permanent, score, i, len: nq.length });
  };
  for (const it of allItems()) consider(it.name, it.storeId, it.checked ? 'cart' : 'list', it.permanent);
  for (const h of S.hist) if (store(h.s)) consider(h.n, h.s, 'hist', false);
  return out.sort((a, b) => a.score - b.score || a.name.length - b.name.length).slice(0, 6);
}

function pickSuggestion(s) {
  if (!s) return;
  const sid = targetStoreId();
  haptic();
  if (s.storeId === sid && s.state !== 'hist') {
    const it = findInStore(sid, s.name);
    clearDraft();
    if (it?.checked) {
      uncheckItems([it.id]);
      hooks.message?.(`„${it.name}” wraca z koszyka na listę`);
    } else if (it) {
      hooks.flash?.(it.id);
      hooks.message?.(`„${it.name}” już jest na liście`);
    }
    return;
  }
  sugHidden = true;
  setDraftText(s.name);
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

const stateLabel = (s, sid) => {
  if (s.state === 'cart') return 'w koszyku';
  if (s.state === 'hist') return 'kupione wcześniej';
  if (s.storeId === sid) return 'już na liście';
  return s.permanent ? 'na stałe' : 'jednorazowe';
};

export function updateAddbar() {
  if (!bar) return;
  const t = top();
  const hidden = !VISIBLE_ON.includes(t) || !S.me?.pid;
  bar.classList.toggle('hidden', hidden);
  document.documentElement.classList.toggle('no-addbar', hidden);
  if (hidden && bar.contains(document.activeElement)) document.activeElement.blur();
  const sid = targetStoreId();
  const st = sid ? store(sid) : null;
  bar.style.cssText = st ? accentStyle(st) : '';
  const onHome = t === 'home';
  bar.classList.toggle('with-target', onHome && !!st);
  const targetHTML = st ? logoHTML(st, 'logo-sm') + icon('chevD', 'tiny') : '';
  if (targetBtn.dataset.html !== targetHTML) {
    targetBtn.innerHTML = targetHTML;
    targetBtn.dataset.html = targetHTML;
  }
  input.placeholder = st ? `Dodaj do ${st.name}…` : 'Dodaj…';

  const lines = splitLines(input.value);
  const multi = lines.length > 1;
  const has = lines.length > 0;
  bar.classList.toggle('has-text', has);
  bar.classList.toggle('multi', multi);
  bar.classList.toggle('details-open', !!UI.draft.open && !multi);
  permBtn.querySelector('span').textContent = multi ? `+ Na stałe (${lines.length})` : '+ Na stałe';
  onceBtn.querySelector('span').textContent = multi ? `+ Tylko raz (${lines.length})` : '+ Tylko raz';

  const focused = bar.classList.contains('focused');
  sugList = has && !multi && !sugHidden && focused ? suggestions(lines[0], sid) : [];
  sugEl.innerHTML = sugList
    .map((s, i) => {
      const sst = store(s.storeId);
      const a = s.i;
      const b = s.i + s.len;
      const name = `${esc(s.name.slice(0, a))}<b>${esc(s.name.slice(a, b))}</b>${esc(s.name.slice(b))}`;
      return `<button class="sug-row accent-scope" type="button" data-i="${i}" style="${accentStyle(sst)}">${logoHTML(sst, 'logo-xs')}<span class="sug-text"><span class="sug-name">${name}</span><span class="sug-store"> · ${esc(sst.name)}</span></span><span class="sug-state ${s.state}">${stateLabel(s, sid)}</span></button>`;
    })
    .join('');
  bar.classList.toggle('show-sug', sugList.length > 0);
}

export const blurAddbar = () => bar && bar.contains(document.activeElement) && document.activeElement.blur();
