// Small DOM, formatting and colour helpers shared by the views.
import { t, lang } from './i18n.js';

export function html(strings, ...vals) {
  return strings.reduce((s, str, i) => s + str + (i < vals.length ? vals[i] ?? '' : ''), '');
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- numbers

const nf = (opts) => new Intl.NumberFormat(lang() === 'fr' ? 'fr-FR' : 'en-GB', opts);

export function num(v, digits = 0) {
  if (!Number.isFinite(v)) return '–';
  return nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function pct(p, digits = 0) {
  if (!Number.isFinite(p)) return '–';
  return nf({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p);
}

// 1234567 -> "1.2 M", 45600 -> "45,600"
export function big(v) {
  if (!Number.isFinite(v)) return '–';
  if (Math.abs(v) >= 1e6) return `${num(v / 1e6, v >= 1e7 ? 0 : 1)} M`;
  if (Math.abs(v) >= 1e4) return `${num(v / 1e3, 0)} k`;
  return num(v, 0);
}

export function sig(v, key, D) {
  const p = D.props[key];
  return num(v, p ? p.decimals : 1);
}

// ---------------------------------------------------------------- colour

// Zones: one-hue green ordinal ramp, arid (light) to humid (dark).
export const ZONE_COLORS = { 0: '#efe8d6', 1: '#c9e3b5', 2: '#9fcd86', 3: '#6fae5c', 4: '#458a3e', 5: '#24622a' };
// Relative to critical level: red arm (deficient), grey midpoint, blue arm (adequate).
export const REL_COLORS = ['#c43c3b', '#ee9d97', '#e4e2dc', '#86b6ef', '#256abf'];
// pH: red = acid, grey = neutral range, blue = alkaline.
export const PH_COLORS = ['#c43c3b', '#ee9d97', '#e4e2dc', '#86b6ef', '#256abf'];
// Share below critical: one-hue orange sequential.
export const SHARE_COLORS = ['#f9c9b0', '#f29a73', '#eb6834', '#bf4c1c', '#8a3410'];
export const SHARE_BREAKS = [0.2, 0.4, 0.6, 0.8];
// Magnitudes: one-hue blue sequential.
export const BLUE_SEQ = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#104281'];
// VCR: diverging around the profitability threshold.
export const VCR_COLORS = ['#c43c3b', '#ee9d97', '#86b6ef', '#256abf'];
export const VCR_BREAKS = [1, 2, 3];
// Limiting nutrient: first three categorical slots + grey for the rest.
export const NUTRIENT_COLORS = { n: '#2a78d6', p: '#eb6834', s: '#1baf7a', other: '#a9a79f' };
// Members: categorical slots in fixed order (colour follows the country).
export const COUNTRY_COLORS = { NGA: '#2a78d6', NER: '#eb6834', BEN: '#1baf7a', GHA: '#eda100', BFA: '#e87ba4', MLI: '#008300' };
export const TIER_COLORS = { open: '#256abf', members: '#86b6ef', aggregate: '#c3c2b7', embargo: '#52514e' };
export const HATCH = 'url(#hatch)';

export function classOf(breaks, v) {
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return i;
}

export function nutrientGroup(k) {
  return k === 'n' || k === 'p' || k === 's' ? k : 'other';
}

// ---------------------------------------------------------------- tooltip

const tip = () => document.getElementById('tooltip');

export function showTip(content, event) {
  const el = tip();
  el.innerHTML = content;
  el.hidden = false;
  moveTip(event);
}

export function moveTip(event) {
  const el = tip();
  if (el.hidden) return;
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = el.getBoundingClientRect();
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + r.width > w - 8) x = event.clientX - r.width - pad;
  if (y + r.height > h - 8) y = event.clientY - r.height - pad;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() { tip().hidden = true; }

export function ttRows(title, rows) {
  return `<div class="tt-title">${esc(title)}</div>` +
    rows.filter(Boolean).map(([k, v]) => `<div class="tt-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('');
}

// ---------------------------------------------------------------- legend

export function legend(title, items) {
  return `<div class="legend" role="list" aria-label="${esc(title)}"><span class="title">${esc(title)}</span>` +
    items.map((it) => `<span class="item" role="listitem"><span class="sw ${it.cls || ''}" style="${it.color ? `background:${it.color}` : ''}"></span>${esc(it.label)}</span>`).join('') +
    '</div>';
}

export function zoneName(D, z) {
  const def = D.zoneDefs.find((d) => d.id === z);
  return def ? def[lang()] : '';
}

export function countryName(D, iso) {
  const m = D.members.find((x) => x.iso === iso);
  return m ? m[lang()] : iso;
}

export function nutrientName(k) {
  return t(`nutrient.${k}`);
}
