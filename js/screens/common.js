// Wspólne kawałki interfejsu używane przez kilka ekranów.
import { esc, icon, initials, personColor, plural } from '../util.js';
import { S, syncStatus, person, visitBaseline } from '../data.js';
import { UI, saveUI, push } from '../ui.js';

export function syncInfo() {
  const st = syncStatus();
  const n = S.ops.length;
  const waiting = n ? ` · ${n} ${plural(n, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')}` : '';
  switch (st) {
    case 'synced':
      return { cls: 'ok', icon: 'cloud', text: 'Zsynchronizowano' };
    case 'saving':
      return { cls: 'busy', icon: 'cloud', text: 'Zapisywanie…' };
    case 'connecting':
      return { cls: 'busy', icon: 'cloud', text: `Łączenie…${waiting}` };
    case 'offline':
      return { cls: 'off', icon: 'cloudOff', text: `Offline${waiting || ' · zmiany zapiszą się później'}` };
    case 'local':
      return { cls: 'local', icon: 'phone', text: 'Tylko na tym urządzeniu (brak konfiguracji Firebase)' };
    case 'denied':
      return { cls: 'err', icon: 'cloudOff', text: 'Brak dostępu – sprawdź reguły Firestore' };
    default:
      return { cls: 'busy', icon: 'cloud', text: '' };
  }
}

export const syncPill = () => {
  const s = syncInfo();
  return `<span class="sync-pill ${s.cls}">${icon(s.icon)}<span>${esc(s.text)}</span></span>`;
};

export function avatarHTML(pid, cls = '') {
  const p = person(pid);
  if (!p) return '';
  return `<span class="av ${cls}" style="--c:${personColor(p.color)}" title="${esc(p.name)}">${esc(initials(p.name).slice(0, 1))}</span>`;
}

export const personName = (pid) => person(pid)?.name || '';

export function openStore(id) {
  UI.storeId = id;
  UI.target = id;
  saveUI();
  push('store');
}

// Od kiedy liczymy pozycje „nowe od drugiej osoby” – zamrożone na czas wizyty w sklepie.
export function freezeSince(storeId) {
  UI.since[storeId] = visitBaseline(storeId);
  saveUI();
}

export const sinceFor = (storeId) => UI.since[storeId] ?? visitBaseline(storeId);

export const navBar = ({ back = 'Wróć', title = '', right = '' } = {}) => `
  <div class="nav">
    <button class="nav-back" type="button" data-act="back">${icon('back')}<span>${esc(back)}</span></button>
    <div class="nav-title"><span class="nav-title-text">${esc(title)}</span></div>
    <div class="nav-right">${right}</div>
  </div>`;

export function trackScroll(scroller, key, screenEl, threshold = 44) {
  let ticking = false;
  scroller.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        UI.scroll[typeof key === 'function' ? key() : key] = Math.round(scroller.scrollTop);
        saveUI();
        screenEl.classList.toggle('scrolled', scroller.scrollTop > threshold);
      });
    },
    { passive: true }
  );
}
