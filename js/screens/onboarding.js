// Pierwsze uruchomienie: nowa lista albo dołączenie kodem/linkiem/QR, potem wybór imienia.
import { $, esc, icon, parseCode, haptic, isIOS } from '../util.js';
import { S, createList, joinList, leaveList, choosePerson, addPerson, peopleList, startSync } from '../data.js';
import { UI, saveUI, registerScreen, resetStack, syncTrap } from '../ui.js';
import { avatarHTML } from './common.js';

let el, body;
let renderedStep = null;
let stream = null;
let scanTimer = 0;

export const APP_MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="am" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34D27B"/><stop offset="1" stop-color="#0A9C8E"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#am)"/><path d="M19.5 25h25l-2 22.5a3 3 0 0 1-3 2.7H24.5a3 3 0 0 1-3-2.7z" fill="#fff"/><path d="M25.5 25v-2.5a6.5 6.5 0 0 1 13 0V25" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M25.5 37.5l4.6 4.6 8.6-9" fill="none" stroke="#0FA88A" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function mountOnboarding(root) {
  el = document.createElement('section');
  el.className = 'screen screen-onb accent-scope';
  el.innerHTML = `<div class="onb-body"></div>`;
  root.appendChild(el);
  body = $('.onb-body', el);
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    const f = e.target.dataset.onb;
    if (!f) return;
    UI.onb[f] = e.target.value;
    if (f === 'code') UI.onb.error = '';
    saveUI();
    refresh();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const f = e.target.dataset.onb;
    if (f === 'name') $('[data-act="create"], [data-act="new-person"]', el)?.click();
    if (f === 'code') $('[data-act="join"]', el)?.click();
  });
  registerScreen('onboarding', {
    el,
    update,
    canBack: () => UI.onb.step !== 'welcome',
    onBack: () => {
      if (UI.onb.step === 'welcome') return false;
      if (UI.onb.step === 'who') leaveList();
      goStep(UI.onb.step === 'create' ? 'welcome' : UI.onb.step === 'join' ? 'welcome' : 'join');
      return true;
    },
    onLeave: stopScan,
  });
}

function goStep(step) {
  if (UI.onb.step === 'scan' && step !== 'scan') stopScan();
  UI.onb.step = step;
  UI.onb.error = '';
  saveUI();
  update();
  syncTrap();
}

function finish() {
  UI.onb = { step: 'welcome', name: '', code: '', error: '' };
  UI.stack = ['home'];
  saveUI(true);
  resetStack(['home']);
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'to-create') goStep('create');
  else if (act === 'to-join') goStep('join');
  else if (act === 'back') {
    if (UI.onb.step === 'who') {
      leaveList();
      goStep('join');
    } else goStep(UI.onb.step === 'scan' ? 'join' : 'welcome');
  }
  else if (act === 'create') {
    const name = UI.onb.name.trim();
    if (!name) return;
    haptic();
    createList(name);
    finish();
  } else if (act === 'paste') {
    try {
      const t = await navigator.clipboard.readText();
      UI.onb.code = t.trim();
      saveUI();
      const input = $('[data-onb="code"]', el);
      if (input) input.value = UI.onb.code;
      refresh();
    } catch {
      UI.onb.error = 'Nie udało się odczytać schowka – wklej ręcznie (przytrzymaj pole).';
      refresh();
    }
  } else if (act === 'join') {
    const code = parseCode(UI.onb.code);
    if (!code) {
      UI.onb.error = 'To nie wygląda na kod listy. Kod ma 24 znaki (np. abcd-efgh-…).';
      refresh();
      return;
    }
    haptic();
    startJoin(code);
  } else if (act === 'scan') goStep('scan');
  else if (act === 'pick') {
    haptic();
    choosePerson(b.dataset.id);
    finish();
  } else if (act === 'new-person') {
    const name = UI.onb.name.trim();
    if (!name) return;
    haptic();
    addPerson(name);
    finish();
  }
}

export function startJoin(code, pid = null) {
  joinList(code, pid);
  UI.onb.step = 'who';
  UI.onb.name = '';
  UI.onb.error = '';
  saveUI();
  if (UI.stack[0] !== 'onboarding') resetStack(['onboarding']);
  else update();
}

// ---------- kroki ----------
const backBtn = `<button class="nav-back onb-back" type="button" data-act="back">${icon('back')}<span>Wróć</span></button>`;

function stepHTML(step) {
  if (step === 'welcome')
    return `
      <div class="onb-main center">
        <div class="app-mark">${APP_MARK}</div>
        <h1>Lista zakupów</h1>
        <p class="lead">Wspólna lista dla Was dwojga, podzielona na sklepy. Działa bez zasięgu i synchronizuje się na żywo.</p>
        <ul class="feats">
          <li><span class="feat-ic">${icon('list')}</span><span><b>Stała lista każdego sklepu</b>Po zakupach wraca w całości.</span></li>
          <li><span class="feat-ic">${icon('cloud')}</span><span><b>Na żywo na obu telefonach</b>Widać, co jest już w koszyku.</span></li>
          <li><span class="feat-ic">${icon('bag')}</span><span><b>Jedną ręką, także offline</b>Wszystko pod kciukiem.</span></li>
        </ul>
      </div>
      <div class="onb-actions">
        <button class="btn primary wide" type="button" data-act="to-create">Utwórz nową listę</button>
        <button class="btn tinted wide" type="button" data-act="to-join">Mam kod lub link</button>
      </div>`;
  if (step === 'create')
    return `
      ${backBtn}
      <div class="onb-main">
        <h1>Jak masz na imię?</h1>
        <p class="lead">Imię będzie widoczne przy produktach, które dodasz.</p>
        <input class="field big" data-onb="name" type="text" placeholder="Twoje imię" autocomplete="given-name" autocapitalize="words" enterkeyhint="done" maxlength="30">
      </div>
      <div class="onb-actions"><button class="btn primary wide" type="button" data-act="create">Utwórz listę</button></div>`;
  if (step === 'join')
    return `
      ${backBtn}
      <div class="onb-main">
        <h1>Dołącz do listy</h1>
        <p class="lead">Wklej link albo kod listy z drugiego telefonu (Ustawienia → Połącz telefon lub tablet).</p>
        <div class="code-field">
          <input class="field big mono" data-onb="code" type="text" placeholder="Link albo kod listy" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
        </div>
        <div class="row-btns">
          <button class="btn tinted" type="button" data-act="paste">${icon('paste')} Wklej</button>
          ${'BarcodeDetector' in window ? `<button class="btn tinted" type="button" data-act="scan">${icon('camera')} Skanuj QR</button>` : ''}
        </div>
        <p class="err" data-slot="err"></p>
        <div class="tip">${icon('info')}<span>${
          isIOS
            ? 'Na iPhonie najprościej: zeskanuj kod QR zwykłym Aparatem, otwórz link w Safari i dopiero wtedy dodaj apkę do ekranu początkowego – kod zapamięta się sam.'
            : 'Możesz też zeskanować kod QR aparatem telefonu – link otworzy listę od razu.'
        }</span></div>
      </div>
      <div class="onb-actions"><button class="btn primary wide" type="button" data-act="join">Dołącz</button></div>`;
  if (step === 'scan')
    return `
      ${backBtn}
      <div class="onb-main">
        <h1>Skanuj kod QR</h1>
        <p class="lead">Na drugim telefonie otwórz Ustawienia → Połącz telefon lub tablet.</p>
        <div class="scan-box"><video playsinline muted></video><span class="scan-frame"></span></div>
        <p class="err" data-slot="err"></p>
      </div>`;
  if (step === 'who')
    return `
      <div class="onb-main">
        <h1>Kim jesteś?</h1>
        <p class="lead" data-slot="who-lead"></p>
        <div class="people" data-slot="people"></div>
        <p class="err" data-slot="err"></p>
        <div class="new-person">
          <label class="label">Ktoś nowy</label>
          <input class="field big" data-onb="name" type="text" placeholder="Twoje imię" autocomplete="given-name" autocapitalize="words" enterkeyhint="done" maxlength="30">
        </div>
      </div>
      <div class="onb-actions"><button class="btn primary wide" type="button" data-act="new-person">Dalej</button><button class="btn ghost wide" type="button" data-act="back">Użyj innego kodu</button></div>`;
  return '';
}

function update() {
  const step = UI.onb.step;
  if (renderedStep !== step) {
    renderedStep = step;
    body.innerHTML = stepHTML(step);
    body.dataset.step = step;
    body.querySelectorAll('[data-onb]').forEach((i) => (i.value = UI.onb[i.dataset.onb] || ''));
    if (step === 'scan') startScan();
    if (step === 'who') startSync();
  }
  refresh();
}

function refresh() {
  const step = UI.onb.step;
  const slot = (n) => body.querySelector(`[data-slot="${n}"]`);
  if (slot('err')) slot('err').textContent = UI.onb.error || '';
  if (step === 'create') {
    $('[data-act="create"]', body).disabled = !UI.onb.name.trim();
  }
  if (step === 'join') {
    $('[data-act="join"]', body).disabled = !UI.onb.code.trim();
    body.querySelector('.code-field').classList.toggle('valid', !!parseCode(UI.onb.code));
  }
  if (step === 'who') {
    const ppl = peopleList();
    const exists = S.sync.listExists;
    const configured = S.sync.configured;
    let lead = '';
    if (configured === false) lead = 'Ta kopia apki nie ma jeszcze skonfigurowanej synchronizacji (Firebase), więc nie może dołączyć do listy z innego telefonu.';
    else if (exists === false) lead = 'Nie znaleziono listy o tym kodzie. Sprawdź kod i spróbuj ponownie.';
    else if (!ppl.length) lead = navigator.onLine ? 'Łączenie z listą…' : 'Brak internetu – wpisz imię, lista pobierze się po odzyskaniu zasięgu.';
    else lead = 'Wybierz swoje imię albo dodaj nowe.';
    slot('who-lead').innerHTML = (!ppl.length && exists !== false && configured !== false && navigator.onLine ? '<span class="spinner"></span>' : '') + esc(lead);
    const html = ppl.map((p) => `<button class="person-btn" type="button" data-act="pick" data-id="${esc(p.id)}">${avatarHTML(p.id, 'md')}<span>${esc(p.name)}</span>${icon('chevR', 'srow-chev')}</button>`).join('');
    const pe = slot('people');
    if (pe.dataset.html !== html) pe.innerHTML = pe.dataset.html = html;
    const blocked = exists === false || configured === false;
    body.querySelector('.new-person').hidden = blocked;
    $('[data-act="new-person"]', body).disabled = blocked || !UI.onb.name.trim();
  }
}

// ---------- skaner QR (Android: BarcodeDetector) ----------
async function startScan() {
  const video = body.querySelector('video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => {
      if (!stream) return;
      try {
        const codes = await det.detect(video);
        for (const c of codes) {
          const code = parseCode(c.rawValue);
          if (code) {
            haptic(true);
            stopScan();
            startJoin(code);
            return;
          }
        }
      } catch {}
      scanTimer = setTimeout(tick, 250);
    };
    tick();
  } catch {
    UI.onb.error = 'Brak dostępu do aparatu. Wklej link albo kod ręcznie.';
    refresh();
  }
}

function stopScan() {
  clearTimeout(scanTimer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}
