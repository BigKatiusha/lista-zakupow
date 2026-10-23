// Arkusze wysuwane od dołu: edycja produktu i sklepu, udostępnianie, instalacja, zakończenie zakupów…
import { $, esc, icon, haptic, plural, parseEntry, splitLines, formatCode, relTime, isIOS, isStandalone } from './util.js';
import {
  S, store, item, storesSorted, storeStats, itemsOf, updateItem, deleteItems, restoreItems, addItems,
  finishShopping, finishSummary, addStore, updateStore, deleteStore, renameMe, person, myId, leaveList,
} from './data.js';
import { UI, saveUI, defineSheet, openSheet, closeSheet, toast, push, top, resetStack, requestRender } from './ui.js';
import { logoHTML, accentStyle, PALETTE, BRANDS, storeColor, logoMode } from './brands.js';
import { updateAddbar } from './addbar.js';
import { startJoin } from './screens/onboarding.js';

const listLink = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#k=${S.me?.listId}`;

// ---------- produkt ----------
defineSheet('item', {
  title: () => 'Produkt',
  init: ({ id }) => {
    const it = item(id);
    return it ? { name: it.name, qty: it.qty || '', note: it.note || '', permanent: it.permanent ? '1' : '0', storeId: it.storeId } : {};
  },
  style: ({ id }) => {
    const it = item(id);
    return it ? accentStyle(store(it.storeId)) : '';
  },
  cls: 'accent-scope',
  render: ({ id }, d) => {
    const it = item(id);
    if (!it) return null;
    const who = person(it.addedBy);
    return `
      <div class="form">
        <label class="label">Nazwa</label>
        <input class="field" data-draft="name" type="text" maxlength="80" autocapitalize="sentences" enterkeyhint="done">
        <label class="label">Ilość</label>
        <div class="stepper"><button class="step-btn" type="button" data-act="qty-" aria-label="Mniej">${icon('minus')}</button><input class="field" data-draft="qty" type="text" placeholder="np. 2 opak." enterkeyhint="done"><button class="step-btn" type="button" data-act="qty+" aria-label="Więcej">${icon('plus')}</button></div>
        <label class="label">Notatka</label>
        <textarea class="field" data-draft="note" rows="2" placeholder="np. bez laktozy, duże opakowanie"></textarea>
        <label class="label">Rodzaj</label>
        <div class="seg" data-seg="permanent">
          <button type="button" data-v="1" class="${d.permanent === '1' ? 'on' : ''}">${icon('pin')} Na stałe</button>
          <button type="button" data-v="0" class="${d.permanent === '0' ? 'on' : ''}">${icon('plus')} Tylko raz</button>
        </div>
        <label class="label">Sklep</label>
        <div class="chips" data-seg="storeId">${storesSorted()
          .map((s) => `<button type="button" class="chip ${s.id === d.storeId ? 'on' : ''}" data-v="${esc(s.id)}" style="${accentStyle(s)}">${logoHTML(s, 'logo-xs')}<span>${esc(s.name)}</span></button>`)
          .join('')}</div>
        <p class="meta-info">${who ? `Kto dodał: <b>${esc(who.name)}</b> · ` : ''}Dodano ${esc(relTime(it.addedAt))}${it.checked ? ' · teraz w koszyku' : ''}</p>
        <div class="sheet-actions">
          <button class="btn primary wide" type="button" data-act="save">Zapisz</button>
          <button class="btn danger-ghost wide" type="button" data-act="delete">${icon('trash')} Usuń produkt</button>
        </div>
      </div>`;
  },
  bind: (root, { id }, d) => {
    root.querySelectorAll('[data-seg]').forEach((seg) =>
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        d[seg.dataset.seg] = b.dataset.v;
        saveUI();
        seg.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
        haptic();
      })
    );
    const qtyInput = $('[data-draft="qty"]', root);
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'qty+' || act === 'qty-') {
        const m = /^(\d+(?:[.,]\d+)?)(.*)$/.exec(d.qty.trim());
        const n = m ? parseFloat(m[1].replace(',', '.')) : 1;
        const rest = m ? m[2] : d.qty.trim() ? ` ${d.qty.trim()}` : '';
        const next = Math.max(1, Math.round(act === 'qty+' ? n + 1 : n - 1));
        d.qty = next === 1 && !rest.trim() ? '' : `${next}${rest}`;
        qtyInput.value = d.qty;
        saveUI();
        haptic();
      } else if (act === 'save') {
        const it = item(id);
        if (!it) return closeSheet();
        const name = d.name.trim() || it.name;
        const fields = {};
        if (name !== it.name) fields.name = name;
        if (d.qty.trim() !== (it.qty || '')) fields.qty = d.qty.trim();
        if (d.note.trim() !== (it.note || '')) fields.note = d.note.trim();
        if ((d.permanent === '1') !== !!it.permanent) fields.permanent = d.permanent === '1';
        if (d.storeId !== it.storeId && store(d.storeId)) fields.storeId = d.storeId;
        if (Object.keys(fields).length) updateItem(id, fields);
        haptic();
        closeSheet();
        if (fields.storeId) toast(`Przeniesiono „${name}” do ${store(d.storeId).name}`);
      } else if (act === 'delete') {
        const it = item(id);
        closeSheet();
        if (!it) return;
        haptic(true);
        const snaps = deleteItems([id]);
        toast(`Usunięto „${it.name}”`, { action: 'Cofnij', onAction: () => restoreItems(snaps) });
      }
    });
  },
});

// ---------- sklep ----------
async function fileToLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const size = 160;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    let data = c.toDataURL('image/png');
    if (data.length > 70000) data = c.toDataURL('image/jpeg', 0.85);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

defineSheet('store', {
  title: ({ isNew }) => (isNew ? 'Nowy sklep' : 'Sklep'),
  init: ({ id, isNew }) => {
    if (isNew) return { name: '', color: PALETTE[0], logoMode: 'mono', logo: null, brand: null };
    const st = store(id);
    return st ? { name: st.name, color: st.color || '', logoMode: logoMode(st), logo: st.logo || null, brand: st.brand || null } : {};
  },
  render: ({ id, isNew }, d) => {
    if (!isNew && !store(id)) return null;
    const preview = { name: d.name || 'Sklep', brand: d.brand, color: d.color || null, logoMode: d.logoMode, logo: d.logo };
    const hasBrand = d.brand && BRANDS[d.brand];
    const n = isNew ? 0 : itemsOf(id).length;
    return `
      <div class="form">
        <div class="store-preview accent-scope" style="${accentStyle(preview)}">${logoHTML(preview, 'logo-xl')}<span class="preview-name">${esc(d.name || 'Nazwa sklepu')}</span></div>
        <label class="label">Nazwa</label>
        <input class="field" data-draft="name" type="text" maxlength="40" placeholder="np. Trader Joe's" autocapitalize="words" enterkeyhint="done">
        <label class="label">Logo</label>
        <div class="seg" data-seg="logoMode">
          ${hasBrand ? `<button type="button" data-v="brand" class="${d.logoMode === 'brand' ? 'on' : ''}">Logo sklepu</button>` : ''}
          <button type="button" data-v="mono" class="${d.logoMode === 'mono' ? 'on' : ''}">Inicjały</button>
          <button type="button" data-v="image" class="${d.logoMode === 'image' ? 'on' : ''}">${icon('image')} Obrazek</button>
        </div>
        <input type="file" accept="image/*" hidden data-file>
        <label class="label">Kolor akcentu</label>
        <div class="palette">
          ${hasBrand ? `<button type="button" class="swatch ${!d.color ? 'on' : ''}" data-color="" style="--sw:${BRANDS[d.brand].color}" aria-label="Kolor sklepu"><span>A</span></button>` : ''}
          ${PALETTE.map((c) => `<button type="button" class="swatch ${d.color === c ? 'on' : ''}" data-color="${c}" style="--sw:${c}" aria-label="Kolor"></button>`).join('')}
        </div>
        <div class="sheet-actions">
          <button class="btn primary wide" type="button" data-act="save">${isNew ? 'Dodaj sklep' : 'Zapisz'}</button>
          ${isNew ? '' : `<button class="btn danger-ghost wide" type="button" data-act="delete">${icon('trash')} Usuń sklep${n ? ` i ${n} ${plural(n, 'produkt', 'produkty', 'produktów')}` : ''}</button>`}
        </div>
      </div>`;
  },
  bind: (root, params, d) => {
    const rerender = () => openSheet('store', params, { draft: d, instant: true });
    const file = $('[data-file]', root);
    $('[data-draft="name"]', root).addEventListener('input', () => {
      $('.preview-name', root).textContent = d.name || 'Nazwa sklepu';
      if (d.logoMode === 'mono') {
        const p = { name: d.name || 'Sklep', color: d.color || null, logoMode: 'mono' };
        $('.store-preview .logo', root).outerHTML = logoHTML(p, 'logo-xl');
      }
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.v && b.closest('[data-seg="logoMode"]')) {
        if (b.dataset.v === 'image') {
          file.click();
          return;
        }
        d.logoMode = b.dataset.v;
        saveUI();
        rerender();
      } else if (b.dataset.color !== undefined) {
        d.color = b.dataset.color;
        saveUI();
        haptic();
        rerender();
      } else if (b.dataset.act === 'save') {
        const name = d.name.trim();
        if (!name) {
          $('[data-draft="name"]', root).focus();
          return;
        }
        haptic();
        if (params.isNew) {
          const id = addStore({ name, color: d.color, logoMode: d.logoMode, logo: d.logoMode === 'image' ? d.logo : null });
          closeSheet();
          UI.target = id;
          saveUI();
          toast(`Dodano sklep ${name}`);
        } else {
          updateStore(params.id, { name, color: d.color || null, logoMode: d.logoMode, logo: d.logoMode === 'image' ? d.logo : null });
          closeSheet();
        }
      } else if (b.dataset.act === 'delete') {
        openSheet('deleteStore', { id: params.id });
      }
    });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        d.logo = await fileToLogo(f);
        d.logoMode = 'image';
        saveUI();
        rerender();
      } catch {
        toast('Nie udało się wczytać obrazka');
      }
    });
  },
});

defineSheet('deleteStore', {
  persist: false,
  render: ({ id }) => {
    const st = store(id);
    if (!st) return null;
    const n = itemsOf(id).length;
    return `<div class="confirm">${logoHTML(st, 'logo-lg')}<h2>Usunąć sklep ${esc(st.name)}?</h2><p>${n ? `Zniknie też ${n} ${plural(n, 'produkt', 'produkty', 'produktów')} z jego listy – na obu telefonach.` : 'Sklep zniknie z obu telefonów.'}</p>
      <div class="sheet-actions"><button class="btn danger wide" type="button" data-act="yes">Usuń sklep</button><button class="btn ghost wide" type="button" data-close>Anuluj</button></div></div>`;
  },
  bind: (root, { id }) => {
    $('[data-act="yes"]', root).addEventListener('click', () => {
      haptic(true);
      const name = store(id)?.name;
      deleteStore(id);
      closeSheet();
      if (UI.storeId === id && (UI.stack.includes('store') || UI.stack.includes('edit'))) resetStack(['home']);
      toast(`Usunięto sklep ${name}`);
    });
  },
});

// ---------- udostępnianie ----------
let qrLoading = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  if (!qrLoading)
    qrLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/qrcode.js';
      s.onload = res;
      s.onerror = () => {
        qrLoading = null;
        rej();
      };
      document.head.appendChild(s);
    });
  return qrLoading;
}

function qrSVG(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-label="Kod QR"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

defineSheet('share', {
  title: () => 'Połącz drugi telefon',
  persist: true,
  render: () => {
    if (!S.me?.listId) return null;
    const local = S.sync.configured === false;
    return `
      <div class="share">
        ${local ? `<div class="tip warn">${icon('info')}<span>Synchronizacja nie jest jeszcze skonfigurowana (brak Firebase w pliku config.js) – drugi telefon nie zobaczy tej listy, dopóki jej nie włączysz.</span></div>` : ''}
        <div class="qr-box"><span class="spinner"></span></div>
        <p class="share-lead">Zeskanuj ten kod aparatem na drugim telefonie lub tablecie i otwórz link.</p>
        <div class="code-box"><small>Kod listy</small><span class="code">${esc(formatCode(S.me.listId))}</span></div>
        <div class="sheet-actions two">
          <button class="btn tinted" type="button" data-act="copy">${icon('copy')} Kopiuj link</button>
          ${navigator.share ? `<button class="btn primary" type="button" data-act="send">${icon('share')} Wyślij link</button>` : ''}
        </div>
        <div class="tip">${icon('phone')}<span><b>iPhone / iPad:</b> otwórz link w Safari, potem Udostępnij → „Do ekranu początkowego”. Lista i kod zapamiętają się same.<br><b>Android:</b> otwórz link w Chrome, potem ⋮ → „Dodaj do ekranu głównego”.</span></div>
        <div class="tip subtle">${icon('info')}<span>Kto ma ten link lub kod, ma dostęp do listy – wysyłaj go tylko domownikom.</span></div>
      </div>`;
  },
  bind: (root) => {
    loadQR()
      .then(() => ($('.qr-box', root).innerHTML = qrSVG(listLink())))
      .catch(() => ($('.qr-box', root).innerHTML = `<p class="muted">Kod QR będzie dostępny po połączeniu z internetem.</p>`));
    root.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(listLink());
          haptic();
          toast('Skopiowano link do listy');
        } catch {
          toast('Nie udało się skopiować');
        }
      } else if (act === 'send') {
        try {
          await navigator.share({ title: 'Lista zakupów', text: 'Nasza wspólna lista zakupów:', url: listLink() });
        } catch {}
      }
    });
  },
});

// ---------- instalacja ----------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

defineSheet('install', {
  title: () => 'Dodaj do ekranu głównego',
  init: () => ({ tab: isIOS ? 'ios' : 'android' }),
  render: (p, d) => {
    if (isStandalone())
      return `<div class="confirm"><div class="empty-ic done">${icon('check')}</div><h2>Gotowe!</h2><p>Apka działa z ekranu głównego – otwiera się na pełnym ekranie i działa bez internetu.</p><div class="sheet-actions"><button class="btn primary wide" type="button" data-close>OK</button></div></div>`;
    const step = (n, html) => `<li><span class="step-n">${n}</span><span>${html}</span></li>`;
    const ios = `<ol class="steps">
        ${step(1, 'Otwórz tę stronę w <b>Safari</b> (jeśli link otworzył się w innej apce, wybierz „Otwórz w Safari”).')}
        ${step(2, `Dotknij <b>Udostępnij</b> <span class="kbd">${icon('share')}</span> na dolnym pasku. W iOS 26 najpierw dotknij <b>•••</b> obok paska adresu. Na iPadzie przycisk jest u góry.`)}
        ${step(3, 'Przewiń w dół i wybierz <b>Do ekranu początkowego</b>.')}
        ${step(4, 'Zostaw włączone „Otwórz jako aplikację internetową” i dotknij <b>Dodaj</b>.')}
        ${step(5, 'Otwieraj listę ikoną <b>Zakupy</b> na ekranie początkowym.')}
      </ol>`;
    const android = `<ol class="steps">
        ${step(1, 'Otwórz tę stronę w <b>Chrome</b>.')}
        ${step(2, `Dotknij menu <span class="kbd">⋮</span> w prawym górnym rogu.`)}
        ${step(3, 'Wybierz <b>Dodaj do ekranu głównego</b> (albo <b>Zainstaluj aplikację</b>), potem <b>Zainstaluj</b>.')}
        ${step(4, 'Otwieraj listę ikoną <b>Zakupy</b> na ekranie głównym lub w szufladzie aplikacji.')}
      </ol>`;
    return `
      <div class="seg tabs" data-tabs>
        <button type="button" data-v="ios" class="${d.tab === 'ios' ? 'on' : ''}">iPhone / iPad</button>
        <button type="button" data-v="android" class="${d.tab === 'android' ? 'on' : ''}">Android</button>
      </div>
      ${d.tab === 'android' && installPrompt ? `<button class="btn primary wide install-now" type="button" data-act="prompt">${icon('download')} Zainstaluj teraz</button>` : ''}
      ${d.tab === 'ios' ? ios : android}
      <p class="hint">Na tablecie wygląda to tak samo. Kod listy zapamiętuje się na każdym urządzeniu osobno – wystarczy raz.</p>`;
  },
  bind: (root, p, d) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.closest('[data-tabs]') && b.dataset.v) {
        d.tab = b.dataset.v;
        saveUI();
        openSheet('install', p, { draft: d, instant: true });
      } else if (b.dataset.act === 'prompt' && installPrompt) {
        installPrompt.prompt();
        const r = await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        if (r?.outcome === 'accepted') closeSheet();
      }
    });
  },
});

// ---------- zakończenie zakupów ----------
defineSheet('finish', {
  live: true,
  cls: 'accent-scope',
  style: ({ storeId }) => accentStyle(store(storeId)),
  render: ({ storeId }) => {
    const st = store(storeId);
    if (!st) return null;
    const s = finishSummary(storeId);
    const li = (cls, ic, n, text) => (n ? `<li class="${cls}"><span class="fl-ic">${icon(ic)}</span><span><b>${n}</b> ${text}</span></li>` : '');
    const rows =
      li('ok', 'undo', s.back, plural(s.back, 'produkt ze stałej listy wróci na listę', 'produkty ze stałej listy wrócą na listę', 'produktów ze stałej listy wróci na listę')) +
      li('gone', 'check', s.gone, plural(s.gone, 'kupiony jednorazowy zniknie', 'kupione jednorazowe znikną', 'kupionych jednorazowych zniknie')) +
      li('stay', 'pin', s.stay, plural(s.stay, 'niekupiony jednorazowy zostanie na następny raz', 'niekupione jednorazowe zostaną na następny raz', 'niekupionych jednorazowych zostanie na następny raz'));
    return `
      <div class="confirm finish">
        ${logoHTML(st, 'logo-lg')}
        <h2>Zakończyć zakupy w ${esc(st.name)}?</h2>
        <ul class="finish-list">${rows || `<li class="ok"><span class="fl-ic">${icon('check')}</span><span>Koszyk jest pusty – lista zostanie bez zmian.</span></li>`}</ul>
        <div class="sheet-actions"><button class="btn primary wide" type="button" data-act="finish">Zakończ zakupy</button><button class="btn ghost wide" type="button" data-close>Jeszcze nie</button></div>
      </div>`;
  },
  bind: (root, { storeId }) => {
    $('[data-act="finish"]', root).addEventListener('click', () => {
      const st = store(storeId);
      haptic(true);
      finishShopping(storeId);
      closeSheet();
      toast(`Zakupy w ${st?.name || 'sklepie'} zakończone · lista gotowa na następny raz`);
    });
  },
});

// ---------- menu sklepu ----------
defineSheet('storeMenu', {
  persist: false,
  cls: 'accent-scope',
  style: ({ storeId }) => accentStyle(store(storeId)),
  render: ({ storeId }) => {
    const st = store(storeId);
    if (!st) return null;
    const s = storeStats(storeId);
    const mi = (act, ic, text, sub) => `<button class="menu-row" type="button" data-act="${act}"><span class="menu-ic">${icon(ic)}</span><span class="menu-text"><span>${text}</span>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
    return `<div class="menu">
      <div class="menu-head">${logoHTML(st, 'logo-md')}<b>${esc(st.name)}</b></div>
      ${mi('edit', 'list', 'Edytuj listę i kolejność', 'Przeciągnij według trasy po sklepie')}
      ${mi('bulk', 'paste', 'Dodaj wiele naraz', 'Wklej kilka linii – każda to jeden produkt')}
      ${s.active ? mi('finish', 'cart', 'Zakończ zakupy', `${s.cart} w koszyku`) : ''}
      ${mi('store', 'pencil', 'Nazwa, logo i kolor sklepu')}
    </div>`;
  },
  bind: (root, { storeId }) => {
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'edit') {
        closeSheet();
        push('edit');
      } else if (act === 'bulk') openSheet('bulk', { storeId });
      else if (act === 'finish') openSheet('finish', { storeId });
      else if (act === 'store') openSheet('store', { id: storeId });
    });
  },
});

// ---------- wybór sklepu dla pola „Dodaj…” ----------
defineSheet('pickStore', {
  title: () => 'Dodawaj do sklepu',
  persist: false,
  render: () =>
    `<div class="menu">${storesSorted()
      .map(
        (st) => `<button class="menu-row pick accent-scope" type="button" data-id="${esc(st.id)}" style="${accentStyle(st)}">${logoHTML(st, 'logo-md')}<span class="menu-text"><span>${esc(st.name)}</span></span>${
          st.id === (UI.target || storesSorted()[0]?.id) ? `<span class="pick-on">${icon('check')}</span>` : ''
        }</button>`
      )
      .join('')}</div>`,
  bind: (root) => {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      haptic();
      UI.target = b.dataset.id;
      saveUI();
      closeSheet();
      updateAddbar();
      requestAnimationFrame(() => document.getElementById('add-input')?.focus());
    });
  },
});

// ---------- dodawanie hurtowe ----------
defineSheet('bulk', {
  title: () => 'Dodaj wiele naraz',
  cls: 'accent-scope',
  style: ({ storeId }) => accentStyle(store(storeId)),
  init: () => ({ text: '' }),
  render: ({ storeId }) => {
    const st = store(storeId);
    if (!st) return null;
    return `<div class="form">
      <p class="hint">Do: <b>${esc(st.name)}</b>. Każda linia to jeden produkt. Ilość możesz wpisać na początku, np. „2 Mleko”.</p>
      <textarea class="field bulk" data-draft="text" rows="8" placeholder="Mleko&#10;2 Jajka&#10;Chleb"></textarea>
      <div class="sheet-actions two">
        <button class="btn tinted" type="button" data-act="perm">${icon('pin')} <span>+ Na stałe</span></button>
        <button class="btn primary" type="button" data-act="once">${icon('plus')} <span>+ Tylko raz</span></button>
      </div></div>`;
  },
  bind: (root, { storeId }, d) => {
    const ta = $('textarea', root);
    const label = () => {
      const n = splitLines(d.text).length;
      $('[data-act="perm"] span', root).textContent = n ? `+ Na stałe (${n})` : '+ Na stałe';
      $('[data-act="once"] span', root).textContent = n ? `+ Tylko raz (${n})` : '+ Tylko raz';
    };
    ta.addEventListener('input', label);
    label();
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act !== 'perm' && act !== 'once') return;
      const entries = splitLines(d.text).map(parseEntry).filter((x) => x.name);
      if (!entries.length) return ta.focus();
      const res = addItems(storeId, entries, act === 'perm');
      haptic(true);
      d.text = '';
      closeSheet();
      const n = res.added.length;
      const extra = res.dup.length ? ` · ${res.dup.length} już ${plural(res.dup.length, 'była', 'były', 'było')} na liście` : '';
      toast(`Dodano ${n} ${plural(n, 'produkt', 'produkty', 'produktów')}${extra}`);
    });
  },
});

// ---------- imię ----------
defineSheet('name', {
  title: () => 'Twoje imię',
  init: () => ({ name: person(myId())?.name || '' }),
  render: () => `<div class="form">
      <input class="field big" data-draft="name" type="text" maxlength="30" autocapitalize="words" enterkeyhint="done" placeholder="Twoje imię">
      <p class="hint">Imię widać przy produktach, które dodajesz – na wszystkich urządzeniach.</p>
      <div class="sheet-actions"><button class="btn primary wide" type="button" data-act="save">Zapisz</button></div></div>`,
  bind: (root, p, d) => {
    const save = () => {
      if (!d.name.trim()) return;
      renameMe(d.name.trim());
      haptic();
      closeSheet();
    };
    $('[data-act="save"]', root).addEventListener('click', save);
    $('input', root).addEventListener('keydown', (e) => e.key === 'Enter' && save());
  },
});

// ---------- odłączenie urządzenia ----------
defineSheet('leave', {
  persist: false,
  render: () => `<div class="confirm"><div class="empty-ic warn">${icon('logout')}</div><h2>Odłączyć to urządzenie?</h2>
      <p>Lista zostanie na pozostałych telefonach. Żeby wrócić, potrzebny będzie kod:<br><span class="code">${esc(formatCode(S.me?.listId || ''))}</span></p>
      ${S.ops.length ? `<p class="err">Uwaga: ${S.ops.length} ${plural(S.ops.length, 'zmiana nie została', 'zmiany nie zostały', 'zmian nie zostało')} jeszcze wysłanych – po odłączeniu przepadną.</p>` : ''}
      <div class="sheet-actions"><button class="btn danger wide" type="button" data-act="yes">Odłącz</button><button class="btn ghost wide" type="button" data-close>Anuluj</button></div></div>`,
  bind: (root) => {
    $('[data-act="yes"]', root).addEventListener('click', () => {
      leaveList();
      closeSheet();
      UI.onb = { step: 'welcome', name: '', code: '', error: '' };
      UI.since = {};
      UI.scroll = {};
      resetStack(['onboarding']);
    });
  },
});

// ---------- link do innej listy ----------
defineSheet('switchList', {
  persist: false,
  render: ({ code }) => `<div class="confirm"><div class="empty-ic">${icon('link')}</div><h2>Otworzyć inną listę?</h2>
      <p>Ten link prowadzi do innej listy niż ta, której używasz na tym urządzeniu.</p>
      <p class="muted small">Nowa: ${esc(formatCode(code))}<br>Obecna: ${esc(formatCode(S.me?.listId || ''))}</p>
      <div class="sheet-actions"><button class="btn primary wide" type="button" data-act="yes">Przełącz na nową listę</button><button class="btn ghost wide" type="button" data-close>Zostań przy obecnej</button></div></div>`,
  bind: (root, { code, pid }) => {
    $('[data-act="yes"]', root).addEventListener('click', () => {
      closeSheet();
      UI.since = {};
      UI.scroll = {};
      startJoin(code, pid || null);
    });
  },
});

export { listLink };
