// Logo sklepów (rysowane w SVG, działają offline), domyślne sklepy i startowe listy.
import { esc, initials } from './util.js';

const svg = (body) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const spark = [0, 60, 120, 180, 240, 300]
  .map((a) => `<rect x="29" y="10.5" width="6" height="15" rx="3" transform="rotate(${a} 32 32)"/>`)
  .join('');

export const BRANDS = {
  costco: {
    color: '#E31837',
    svg: svg(
      `<rect width="64" height="64" fill="#fff"/>` +
        `<text x="32" y="34" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="15" fill="#E31837" textLength="50" lengthAdjust="spacingAndGlyphs">COSTCO</text>` +
        `<rect x="7" y="38.5" width="10" height="5" rx="1" fill="#005DAA"/>` +
        `<text x="37" y="43.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="6.2" fill="#005DAA" textLength="34" lengthAdjust="spacingAndGlyphs">WHOLESALE</text>`
    ),
  },
  samsclub: {
    color: '#0067A0',
    svg: svg(
      `<rect width="64" height="64" fill="#0067A0"/>` +
        `<g transform="rotate(45 32 32)" fill="#fff"><rect x="18.5" y="18.5" width="12.5" height="12.5" rx="1.6"/><rect x="33" y="18.5" width="12.5" height="12.5" rx="1.6"/><rect x="18.5" y="33" width="12.5" height="12.5" rx="1.6"/><rect x="33" y="33" width="12.5" height="12.5" rx="1.6" fill-opacity=".5"/></g>`
    ),
  },
  wholefoods: {
    color: '#00674B',
    svg: svg(
      `<rect width="64" height="64" fill="#00674B"/>` +
        `<path d="M19 46.5C16.5 30 27 16 47.5 13c2 17-7.5 31-25.5 34.5z" fill="#fff"/>` +
        `<path d="M21.5 45.5C27 36 34 27.5 43 19" stroke="#00674B" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
        `<path d="M21 46.5L15.5 52" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`
    ),
  },
  amazon: {
    color: '#FF9900',
    svg: svg(
      `<rect width="64" height="64" fill="#232F3E"/>` +
        `<text x="32" y="37" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="34" fill="#fff">a</text>` +
        `<path d="M14.5 42.5c10.5 6.5 24.5 7 35 .5" stroke="#FF9900" stroke-width="3.6" fill="none" stroke-linecap="round"/>` +
        `<path d="M43.5 39.6l6.6 3.3-3.3 6" stroke="#FF9900" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    ),
  },
  walmart: {
    color: '#0071CE',
    svg: svg(`<rect width="64" height="64" fill="#0071CE"/><g fill="#FFC220">${spark}</g>`),
  },
  target: {
    color: '#CC0000',
    svg: svg(
      `<rect width="64" height="64" fill="#fff"/><circle cx="32" cy="32" r="22" fill="#CC0000"/><circle cx="32" cy="32" r="14.6" fill="#fff"/><circle cx="32" cy="32" r="7.4" fill="#CC0000"/>`
    ),
  },
  tjmaxx: {
    color: '#C8102E',
    svg: svg(
      `<rect width="64" height="64" fill="#fff"/>` +
        `<text x="32" y="30" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="19" fill="#C8102E" textLength="32" lengthAdjust="spacingAndGlyphs">T·J·</text>` +
        `<text x="32" y="47" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" fill="#C8102E" textLength="40" lengthAdjust="spacingAndGlyphs">maxx</text>`
    ),
  },
  homegoods: {
    color: '#6B2C55',
    svg: svg(
      `<rect width="64" height="64" fill="#6B2C55"/>` +
        `<path d="M15.5 31.5L32 17.5l16.5 14" stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M20.5 28.5v16h23v-16" stroke="#fff" stroke-width="4.2" fill="none" stroke-linejoin="round"/>` +
        `<rect x="29" y="35" width="6" height="9.5" rx="1" fill="#fff"/>`
    ),
  },
};

export const DEFAULT_STORES = [
  { id: 'costco', name: 'Costco' },
  { id: 'samsclub', name: "Sam's Club" },
  { id: 'wholefoods', name: 'Whole Foods' },
  { id: 'amazon', name: 'Amazon' },
  { id: 'walmart', name: 'Walmart' },
  { id: 'target', name: 'Target' },
  { id: 'tjmaxx', name: 'TJ Maxx' },
  { id: 'homegoods', name: 'HomeGoods' },
];

export const SEED = {
  samsclub: ['Ręcznik papierowy', 'Jajka', 'Chusteczki do mycia', 'Pierś z kurczaka', 'Polędwiczki z kurczaka', 'Bagietka', 'Mielone wołowe'],
  costco: ['Mleko', 'Papier toaletowy', 'Perfect Bars', 'Ser żółty', 'Burrata', 'Parówki', 'Mielone z bizona', 'Burgery grass-fed', 'Masło', 'Maliny', 'Jagody', 'Bajgle'],
  wholefoods: ['Cebula', 'Ziemniaki', 'Mielone wieprzowe', 'Czekolada Hu', 'Czosnek'],
};

// Kolory do wyboru dla własnych sklepów.
export const PALETTE = ['#0A84FF', '#30B0C7', '#34C759', '#2E7D32', '#FF9F0A', '#FF6B35', '#FF375F', '#C8102E', '#BF5AF2', '#5E5CE6', '#8E8E93', '#A2845E'];

export const storeColor = (st) => st?.color || BRANDS[st?.brand]?.color || '#0A84FF';

export function onColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.42 ? '#141414' : '#fff';
}

export const logoMode = (st) => st?.logoMode || (st?.brand && BRANDS[st.brand] ? 'brand' : 'mono');

export function logoHTML(st, cls = '') {
  const mode = logoMode(st);
  if (mode === 'image' && st.logo) return `<span class="logo ${cls}"><img src="${esc(st.logo)}" alt="" draggable="false"></span>`;
  if (mode === 'brand' && BRANDS[st.brand]) return `<span class="logo ${cls}">${BRANDS[st.brand].svg}</span>`;
  const c = storeColor(st);
  const letters = initials(st?.name);
  return `<span class="logo ${cls}">${svg(
    `<rect width="64" height="64" fill="${c}"/><text x="32" y="33" dominant-baseline="central" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="${letters.length > 1 ? 25 : 30}" fill="${onColor(c)}">${esc(letters)}</text>`
  )}</span>`;
}

// Styl CSS z akcentem sklepu (kolor przycisków, pasków, wyróżnień).
export const accentStyle = (st) => {
  const c = storeColor(st);
  return `--accent:${c};--on-accent:${onColor(c)}`;
};

export function applyAccent(el, st) {
  const c = storeColor(st);
  el.style.setProperty('--accent', c);
  el.style.setProperty('--on-accent', onColor(c));
}
