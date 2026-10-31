// Entry point: wires the header controls, state and views together.
import { loadData } from './data.js';
import { applyStatic, setLang, t } from './i18n.js';
import { readHash, setState, state, subscribe } from './state.js';
import { refreshTour, startTour } from './tour.js';
import * as mapView from './views/map-view.js';
import * as scenario from './views/scenario.js';
import * as network from './views/network.js';
import * as dialogue from './views/dialogue.js';
import * as about from './views/about.js';
import { hideTip } from './ui.js';

const VIEWS = { map: mapView, scenario, network, dialogue, about };
const app = document.getElementById('app');
let D = null;

const initial = readHash();
if (initial.scen) initial.scen = { ...state.scen, ...initial.scen };
Object.assign(state, initial);
if (!VIEWS[state.view]) state.view = 'map';
setLang(state.lang);
applyStatic();

function syncChrome() {
  document.body.classList.toggle('lens-soil', state.lens === 'soil');
  document.body.classList.toggle('lens-econ', state.lens === 'econ');
  document.querySelectorAll('[data-lens]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lens === state.lens));
  document.querySelectorAll('[data-viewer]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.viewer === state.viewer));
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === state.lang));
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function render(prev) {
  syncChrome();
  if (!D) return;
  hideTip();
  if (prev && prev.lang !== state.lang) {
    setLang(state.lang);
    applyStatic();
    refreshTour();
  }
  const view = VIEWS[state.view] || mapView;
  view.render(app, D, state);
  if (prev && prev.view !== state.view) window.scrollTo({ top: 0 });
}

subscribe((s, prev) => render(prev));

// header controls
document.querySelectorAll('[data-lens]').forEach((b) => b.addEventListener('click', () => setState({ lens: b.dataset.lens })));
document.querySelectorAll('[data-viewer]').forEach((b) => b.addEventListener('click', () => setState({ viewer: b.dataset.viewer })));
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setState({ lang: b.dataset.lang })));
document.querySelectorAll('.tabs a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  setState({ view: a.dataset.view });
}));
document.getElementById('tour-start').addEventListener('click', () => D && startTour(D));
window.addEventListener('hashchange', () => setState(readHash()));

syncChrome();
loadData().then((data) => {
  D = data;
  render();
}).catch((err) => {
  console.error(err);
  app.innerHTML = `<div class="card"><h3>${t('error.title')}</h3><p>${t('error.text')}</p><pre class="small">${String(err.message)}</pre></div>`;
});
