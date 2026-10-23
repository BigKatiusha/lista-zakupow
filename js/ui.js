// Stan interfejsu (zapisywany na bieżąco), nawigacja między ekranami, arkusze i komunikaty.
import { $, esc, readJSON, writeJSON } from './util.js';

const UI_KEY = 'lz.ui';
const defaults = () => ({
  stack: ['home'],
  storeId: null, // sklep otwarty na ekranie sklepu
  target: null, // sklep wybrany w polu „Dodaj…” na ekranie głównym
  scroll: {},
  draft: { text: '', qty: '', note: '', open: false },
  cartOpen: {},
  since: {}, // od kiedy liczymy „nowe” pozycje (zamrożone przy wejściu do sklepu)
  sheet: null,
  dismissed: {},
  onb: { step: 'welcome', name: '', code: '', error: '' },
});

export const UI = (() => {
  const saved = readJSON(UI_KEY, {}) || {};
  const d = defaults();
  for (const k of Object.keys(d)) if (saved[k] !== undefined && saved[k] !== null) d[k] = saved[k];
  if (saved.sheet) d.sheet = saved.sheet;
  d.draft = { ...defaults().draft, ...(saved.draft || {}) };
  d.onb = { ...defaults().onb, ...(saved.onb || {}) };
  if (!Array.isArray(d.stack) || !d.stack.length) d.stack = ['home'];
  return d;
})();

let saveTimer = 0;
export function saveUI(now = false) {
  clearTimeout(saveTimer);
  if (now) writeJSON(UI_KEY, UI);
  else saveTimer = setTimeout(() => writeJSON(UI_KEY, UI), 120);
}

// ---------- odświeżanie ----------
let renderFn = null;
let raf = 0;
export const setRenderer = (fn) => (renderFn = fn);
export function requestRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderFn?.();
  });
}
export function renderNow() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  renderFn?.();
}

// ---------- ekrany ----------
const screens = {};
export const registerScreen = (name, def) => (screens[name] = def);
export const screenDef = (name) => screens[name];
export const top = () => UI.stack[UI.stack.length - 1];

export function applyScreens({ from = null, dir = null } = {}) {
  const t = top();
  const under = UI.stack[UI.stack.length - 2];
  for (const [name, def] of Object.entries(screens)) {
    const el = def.el;
    el.classList.toggle('active', name === t);
    el.classList.toggle('under', name === under);
    el.classList.toggle('leaving', dir === 'pop' && name === from);
    el.inert = name !== t;
  }
  if (dir === 'pop' && from) setTimeout(() => screens[from]?.el.classList.remove('leaving'), 450);
}

export function push(name) {
  const from = top();
  if (from === name) return;
  screens[from]?.onLeave?.('push');
  UI.stack.push(name);
  saveUI();
  screens[name]?.onEnter?.('push');
  renderNow();
  applyScreens({ from, dir: 'push' });
  syncTrap();
}

export function pop() {
  if (UI.stack.length < 2) return;
  const from = UI.stack.pop();
  screens[from]?.onLeave?.('pop');
  saveUI();
  screens[top()]?.onEnter?.('pop');
  renderNow();
  applyScreens({ from, dir: 'pop' });
  syncTrap();
}

export function resetStack(stack) {
  screens[top()]?.onLeave?.('reset');
  UI.stack = stack;
  saveUI();
  screens[top()]?.onEnter?.('reset');
  renderNow();
  applyScreens();
  syncTrap();
}

// ---------- przycisk „wstecz” w Androidzie ----------
// Trzymamy w historii jeden dodatkowy wpis („pułapkę”), gdy jest gdzie wracać.
let trapActive = false;
let ignorePop = false;
const canGoBack = () => !!UI.sheet || UI.stack.length > 1 || !!screens[top()]?.canBack?.();

export function syncTrap() {
  const need = canGoBack();
  if (need && !trapActive) {
    history.pushState({ trap: 1 }, '');
    trapActive = true;
  } else if (!need && trapActive) {
    trapActive = false;
    ignorePop = true;
    history.back();
  }
}

export function initHistory() {
  trapActive = !!history.state?.trap;
  window.addEventListener('popstate', () => {
    trapActive = !!history.state?.trap;
    if (ignorePop) {
      ignorePop = false;
      syncTrap();
      return;
    }
    if (UI.sheet) closeSheet();
    else if (screens[top()]?.onBack?.()) {
      /* obsłużone przez ekran */
    } else if (UI.stack.length > 1) pop();
    syncTrap();
  });
  syncTrap();
}

// ---------- komunikat na dole ----------
let toastTimer = 0;
let toastCur = null;

export function toast(msg, opts = {}) {
  const el = $('#toast');
  if (toastCur && toastCur.onEnd && toastCur.key !== opts.key) {
    const f = toastCur.onEnd;
    toastCur = null;
    f();
  }
  toastCur = opts;
  el.innerHTML = `<span class="toast-msg">${opts.html ? msg : esc(msg)}</span>${opts.action ? `<button class="toast-btn" type="button">${esc(opts.action)}</button>` : ''}`;
  el.classList.add('show');
  el.querySelector('.toast-btn')?.addEventListener(
    'click',
    () => {
      const o = toastCur;
      toastCur = null;
      hideToast();
      o?.onAction?.();
    },
    { once: true }
  );
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    const o = toastCur;
    toastCur = null;
    hideToast();
    o?.onEnd?.();
  }, opts.duration || (opts.action ? 5000 : 2600));
}

export function hideToast() {
  clearTimeout(toastTimer);
  $('#toast')?.classList.remove('show');
}

// ---------- arkusze (wysuwane od dołu) ----------
const SHEETS = {};
export const defineSheet = (type, def) => (SHEETS[type] = def);
export const sheetPersists = (type) => SHEETS[type] && SHEETS[type].persist !== false;
let hideTimer = 0;

export function openSheet(type, params = {}, { draft = null, instant = false } = {}) {
  const def = SHEETS[type];
  if (!def) return;
  const replacing = !!UI.sheet;
  if (replacing) SHEETS[UI.sheet.type]?.onClose?.();
  UI.sheet = { type, params, draft: draft || def.init?.(params) || {} };
  saveUI();
  if (renderSheet(instant || replacing ? 'instant' : 'open')) syncTrap();
}

function renderSheet(mode) {
  const layer = $('#sheet-layer');
  const def = SHEETS[UI.sheet.type];
  const html = def.render(UI.sheet.params, UI.sheet.draft);
  if (html == null) {
    UI.sheet = null;
    saveUI();
    hideLayer();
    return false;
  }
  clearTimeout(hideTimer);
  const sheet = layer.querySelector('.sheet');
  sheet.className = `sheet ${def.cls || ''}`;
  sheet.style.cssText = def.style ? def.style(UI.sheet.params) : '';
  sheet.style.transform = '';
  const body = layer.querySelector('.sheet-body');
  body.innerHTML = `${def.title ? `<div class="sheet-head"><h2>${def.title(UI.sheet.params)}</h2><button class="icon-btn sheet-x" data-close type="button" aria-label="Zamknij"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` : ''}<div class="sheet-content">${html}</div>`;
  bindDraft(body, UI.sheet.draft);
  def.bind?.(body, UI.sheet.params, UI.sheet.draft);
  layer.hidden = false;
  if (mode === 'open') {
    layer.classList.remove('open');
    void layer.offsetWidth;
  }
  layer.classList.add('open');
  if (mode !== 'open') layer.classList.add('instant');
  requestAnimationFrame(() => layer.classList.remove('instant'));
  return true;
}

function hideLayer() {
  const layer = $('#sheet-layer');
  if (layer.contains(document.activeElement)) document.activeElement.blur();
  layer.classList.remove('open');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!UI.sheet) {
      layer.hidden = true;
      layer.querySelector('.sheet-body').innerHTML = '';
    }
  }, 380);
}

export function closeSheet() {
  if (!UI.sheet) return;
  const def = SHEETS[UI.sheet.type];
  UI.sheet = null;
  saveUI();
  def?.onClose?.();
  hideLayer();
  syncTrap();
}

export function refreshSheet() {
  if (UI.sheet && SHEETS[UI.sheet.type]?.live) renderSheet('instant');
}

export const sheetBody = () => $('#sheet-layer .sheet-body');

// Pola z atrybutem data-draft zapisują się na bieżąco (przetrwają zamknięcie apki przez system).
export function bindDraft(root, draft) {
  root.querySelectorAll('[data-draft]').forEach((el) => {
    const key = el.dataset.draft;
    if (draft[key] !== undefined && el.value !== draft[key]) el.value = draft[key];
    el.addEventListener('input', () => {
      draft[key] = el.value;
      saveUI();
    });
  });
}

export function initSheets() {
  const layer = $('#sheet-layer');
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-backdrop')) closeSheet();
  });
  // Przeciągnięcie w dół zamyka arkusz.
  const sheet = layer.querySelector('.sheet');
  let drag = null;
  sheet.addEventListener('pointerdown', (e) => {
    const grab = e.target.closest('.sheet-grab, .sheet-head');
    if (!grab || e.target.closest('button, input, textarea')) return;
    drag = { y0: e.clientY, dy: 0, id: e.pointerId, t0: performance.now() };
    sheet.setPointerCapture(e.pointerId);
    sheet.classList.add('dragging');
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y0);
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, t0 } = drag;
    drag = null;
    sheet.classList.remove('dragging');
    const fast = dy > 40 && dy / (performance.now() - t0) > 0.6;
    if (dy > 120 || fast) {
      sheet.style.transform = '';
      closeSheet();
    } else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}
