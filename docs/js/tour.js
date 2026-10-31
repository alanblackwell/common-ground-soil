// Guided walkthrough: a short policy story across the views. Each step
// sets the application state, then explains what is on screen.
import { t } from './i18n.js';
import { setState, state } from './state.js';

const adminSel = (D, iso, name) => {
  const a = D.admins.find((x) => x.iso === iso && x.name === name);
  return a ? { type: 'admin', id: a.i } : null;
};

const STEPS = [
  { key: 'zones', apply: () => ({ view: 'map', lens: 'soil', unit: 'zone', soilVar: 'zones', sel: null }) },
  { key: 'deficit', apply: () => ({ view: 'map', lens: 'soil', unit: 'zone', soilVar: 's', soilStat: 'below', sel: null }) },
  { key: 'units', apply: () => ({ view: 'map', lens: 'soil', unit: 'admin', soilVar: 's', soilStat: 'below', sel: null }) },
  { key: 'chain', apply: (D) => ({ view: 'map', lens: 'econ', unit: 'admin', econVar: 'vcr', sel: adminSel(D, 'GHA', 'Upper West') }) },
  { key: 'scenario', apply: () => ({ view: 'scenario', lens: 'econ', scen: { iso: '' } }) },
  { key: 'network', apply: () => ({ view: 'network', viewer: 'member' }) },
  { key: 'dialogue', apply: () => ({ view: 'dialogue', thread: 'ghana-north' }) },
  { key: 'about', apply: () => ({ view: 'about' }) },
];

let i = -1, data = null;

export function startTour(D) {
  data = D;
  i = 0;
  show();
}

function show() {
  const el = document.getElementById('tour');
  if (i < 0 || i >= STEPS.length) { el.hidden = true; i = -1; return; }
  const step = STEPS[i];
  setState(step.apply(data));
  el.hidden = false;
  el.innerHTML = `
    <div class="step">${t('tour.step', { n: i + 1, of: STEPS.length })}</div>
    <h3>${t(`tour.${step.key}.title`)}</h3>
    <p>${t(`tour.${step.key}.text`)}</p>
    <div class="actions">
      <button id="tour-close">${t('tour.close')}</button>
      <span>
        ${i > 0 ? `<button id="tour-back">${t('tour.back')}</button>` : ''}
        <button class="primary" id="tour-next">${i === STEPS.length - 1 ? t('tour.finish') : t('tour.next')}</button>
      </span>
    </div>`;
  el.querySelector('#tour-close').addEventListener('click', () => { i = -1; show(); });
  el.querySelector('#tour-next').addEventListener('click', () => { i += 1; show(); });
  const back = el.querySelector('#tour-back');
  if (back) back.addEventListener('click', () => { i -= 1; show(); });
  el.querySelector('#tour-next').focus();
}

// Re-draw the card text after a language change.
export function refreshTour() {
  if (i >= 0) {
    const el = document.getElementById('tour');
    if (!el.hidden) {
      const step = STEPS[i];
      el.querySelector('.step').textContent = t('tour.step', { n: i + 1, of: STEPS.length });
      el.querySelector('h3').textContent = t(`tour.${step.key}.title`);
      el.querySelector('p').innerHTML = t(`tour.${step.key}.text`);
    }
  }
}

export const tourActive = () => i >= 0 && state != null;
