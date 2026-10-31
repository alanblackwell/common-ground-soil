// Minimal two-language string table. Strings may contain {placeholders}
// and simple HTML; arrays are returned as arrays (for lists).
import { STRINGS } from './strings.js';

let current = 'en';

export const lang = () => current;

export function setLang(l) {
  current = STRINGS[l] ? l : 'en';
  document.documentElement.lang = current;
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);

export function t(key, vars) {
  const s = STRINGS[current][key] ?? STRINGS.en[key];
  if (s == null) {
    console.warn('Missing string', key);
    return key;
  }
  return Array.isArray(s) ? s.map((x) => fill(x, vars)) : fill(s, vars);
}

export function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.title = `Common Ground — ${t('title.suffix')}`;
}
