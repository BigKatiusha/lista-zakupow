// Gesty dotykowe: przesuwanie pozycji, przeciąganie kolejności, cofanie krawędzią ekranu.
import { haptic } from './util.js';

const REVEAL_BTN = 84;

// Wiersze listy zakupów: dotknięcie, przesunięcie w prawo (odhacz), w lewo (akcje), przytrzymanie.
export function rowSwiper(container, h) {
  let st = null;
  let openRow = null;
  let suppressUntil = 0;

  const revealWidth = (row) => row.querySelectorAll('.bg-act').length * REVEAL_BTN;
  const setX = (row, x, animate) => {
    const fg = row.querySelector('.row-fg');
    fg.style.transition = animate ? '' : 'none';
    fg.style.transform = x ? `translateX(${x}px)` : '';
    row.classList.toggle('dir-right', x > 0);
    row.classList.toggle('dir-left', x < 0);
  };
  const close = (row) => {
    if (!row) return;
    setX(row, 0, true);
    row.classList.remove('revealed');
    if (openRow === row) openRow = null;
  };
  container.closeReveal = () => close(openRow);

  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.bg-act')) return;
    const row = e.target.closest('.row');
    if (!row || row.classList.contains('leaving')) return;
    if (openRow && openRow !== row) close(openRow);
    if (e.clientX < 18) return; // krawędź ekranu = gest „wstecz”
    st = { row, x0: e.clientX, y0: e.clientY, x: 0, mode: null, id: e.pointerId, t0: performance.now(), base: row === openRow ? -revealWidth(row) : 0, w: row.offsetWidth, armed: false };
    st.lp = setTimeout(() => {
      if (st && !st.mode && h.onLongPress) {
        st.mode = 'long';
        haptic(true);
        h.onLongPress(row);
      }
    }, 520);
  });

  container.addEventListener(
    'pointermove',
    (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x0;
      const dy = e.clientY - st.y0;
      if (!st.mode) {
        if (Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          st.mode = 'swipe';
          clearTimeout(st.lp);
          try {
            st.row.setPointerCapture(e.pointerId);
          } catch {}
          st.row.classList.add('swiping');
        } else if (Math.abs(dy) > 9) {
          clearTimeout(st.lp);
          st.mode = 'scroll';
        }
        return;
      }
      if (st.mode !== 'swipe') return;
      e.preventDefault();
      let x = st.base + dx;
      const maxLeft = -revealWidth(st.row);
      if (x < maxLeft) x = maxLeft + (x - maxLeft) * (h.onLeftFull ? 0.7 : 0.25);
      if (maxLeft === 0 && x < 0) x *= 0.2;
      st.x = x;
      setX(st.row, x, false);
      const armed = x > st.w * 0.3;
      if (armed !== st.armed) {
        st.armed = armed;
        st.row.classList.toggle('armed', armed);
        if (armed) haptic();
      }
    },
    { passive: false }
  );

  const end = (e, cancelled) => {
    if (!st || e.pointerId !== st.id) return;
    clearTimeout(st.lp);
    const s = st;
    st = null;
    if (s.mode === 'long') {
      suppressUntil = performance.now() + 400;
      return;
    }
    if (s.mode !== 'swipe') return;
    suppressUntil = performance.now() + 400;
    s.row.classList.remove('swiping', 'armed');
    const x = s.x;
    const v = (x - s.base) / Math.max(1, performance.now() - s.t0);
    if (!cancelled && (x > s.w * 0.3 || (x > 60 && v > 0.9))) {
      const fg = s.row.querySelector('.row-fg');
      fg.style.transition = '';
      fg.style.transform = `translateX(${s.w}px)`;
      s.row.classList.add('swiped-out');
      if (openRow === s.row) openRow = null;
      h.onSwipeRight(s.row);
      return;
    }
    const rw = revealWidth(s.row);
    if (!cancelled && h.onLeftFull && x < -s.w * 0.6) {
      close(s.row);
      h.onLeftFull(s.row);
      return;
    }
    if (!cancelled && rw && x < -rw / 2) {
      setX(s.row, -rw, true);
      s.row.classList.add('revealed');
      openRow = s.row;
      return;
    }
    close(s.row);
  };
  container.addEventListener('pointerup', (e) => end(e, false));
  container.addEventListener('pointercancel', (e) => end(e, true));
  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.row')) e.preventDefault();
  });

  container.addEventListener('click', (e) => {
    if (performance.now() < suppressUntil) {
      e.stopPropagation();
      return;
    }
    const btn = e.target.closest('.bg-act');
    const row = e.target.closest('.row');
    if (!row || row.classList.contains('leaving')) return;
    if (btn) {
      close(row);
      h.onAction?.(row, btn.dataset.act);
      return;
    }
    if (row === openRow) {
      close(row);
      return;
    }
    h.onTap(row);
  });
}

// Przeciąganie za uchwyt ≡ – ręczna kolejność (produkty według trasy po sklepie, kolejność sklepów).
export function sortable(container, { handle = '.grip', onDrop, onStart }) {
  container.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || !container.contains(grip)) return;
    const row = grip.closest('[data-id]');
    if (!row) return;
    e.preventDefault();
    const scroller = container.closest('.scroller');
    const rows = Array.from(container.querySelectorAll(':scope > [data-id]'));
    const idx = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const gap = rows.length > 1 ? Math.max(0, (idx > 0 ? rects[idx].top - rects[idx - 1].bottom : rects[idx + 1].top - rects[idx].bottom)) : 0;
    const pitch = rects[idx].height + gap;
    const scroll0 = scroller.scrollTop;
    const y0 = e.clientY;
    let lastY = e.clientY;
    let target = idx;
    let rafId = 0;
    let active = true;
    onStart?.();
    container.classList.add('sorting');
    row.classList.add('dragging');
    haptic();
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {}

    const layout = () => {
      const dy = lastY - y0 + (scroller.scrollTop - scroll0);
      row.style.transform = `translateY(${dy}px)`;
      const center = rects[idx].top + rects[idx].height / 2 + dy;
      let t = idx;
      for (let i = idx - 1; i >= 0; i--) {
        if (center < rects[i].top + rects[i].height / 2) t = i;
        else break;
      }
      if (t === idx) {
        for (let i = idx + 1; i < rows.length; i++) {
          if (center > rects[i].top + rects[i].height / 2) t = i;
          else break;
        }
      }
      if (t !== target) {
        target = t;
        haptic();
        rows.forEach((r, i) => {
          if (i === idx) return;
          let shift = 0;
          if (idx < target && i > idx && i <= target) shift = -pitch;
          if (idx > target && i < idx && i >= target) shift = pitch;
          r.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      }
    };

    const tick = () => {
      if (!active) return;
      const sr = scroller.getBoundingClientRect();
      const bar = document.getElementById('addbar');
      const barTop = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect().top : sr.bottom;
      const bottom = Math.min(sr.bottom, barTop);
      const topEdge = sr.top + 70;
      let speed = 0;
      if (lastY < topEdge) speed = -Math.min(14, (topEdge - lastY) / 4);
      else if (lastY > bottom - 60) speed = Math.min(14, (lastY - (bottom - 60)) / 4);
      if (speed) {
        scroller.scrollTop += speed;
        layout();
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      lastY = ev.clientY;
      layout();
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      active = false;
      cancelAnimationFrame(rafId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      // FLIP: przestawiamy element w DOM i płynnie dojeżdżamy na miejsce.
      const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
      if (target !== idx) container.insertBefore(row, target > idx ? rows[target].nextSibling : rows[target]);
      rows.forEach((r) => {
        r.style.transition = 'none';
        r.style.transform = '';
      });
      rows.forEach((r) => {
        const d = before.get(r) - r.getBoundingClientRect().top;
        if (d) r.style.transform = `translateY(${d}px)`;
      });
      void container.offsetHeight;
      rows.forEach((r) => {
        r.style.transition = '';
        r.style.transform = '';
      });
      row.classList.remove('dragging');
      setTimeout(() => container.classList.remove('sorting'), 220);
      const ids = Array.from(container.querySelectorAll(':scope > [data-id]')).map((r) => r.dataset.id);
      onDrop(row.dataset.id, ids, target !== idx);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

// Przesunięcie od lewej krawędzi = wstecz (jak w aplikacjach na iOS).
export function edgeBack(screenEl, getUnder, onBack) {
  let st = null;
  screenEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.clientX > 18) return;
    st = { x0: e.clientX, y0: e.clientY, id: e.pointerId, mode: null, x: 0, t0: performance.now() };
  });
  screenEl.addEventListener(
    'pointermove',
    (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x0;
      const dy = e.clientY - st.y0;
      if (!st.mode) {
        if (dx > 10 && Math.abs(dx) > Math.abs(dy)) {
          st.mode = 'back';
          try {
            screenEl.setPointerCapture(e.pointerId);
          } catch {}
          st.under = getUnder();
          screenEl.classList.add('edge-drag');
          st.under?.classList.add('edge-peek');
        } else if (Math.abs(dy) > 10) st = null;
        return;
      }
      e.preventDefault();
      st.x = Math.max(0, dx);
      const w = screenEl.offsetWidth;
      screenEl.style.transform = `translateX(${st.x}px)`;
      if (st.under) st.under.style.transform = `translateX(${-25 + (st.x / w) * 25}%)`;
    },
    { passive: false }
  );
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (s.mode !== 'back') return;
    const w = screenEl.offsetWidth;
    const v = s.x / Math.max(1, performance.now() - s.t0);
    screenEl.classList.remove('edge-drag');
    screenEl.style.transform = '';
    if (s.under) {
      s.under.style.transform = '';
      setTimeout(() => s.under.classList.remove('edge-peek'), 400);
    }
    if (s.x > w * 0.35 || (s.x > 50 && v > 0.6)) onBack();
  };
  screenEl.addEventListener('pointerup', end);
  screenEl.addEventListener('pointercancel', end);
}
