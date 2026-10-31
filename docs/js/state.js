// Application state, mirrored in the URL hash so any view can be shared as a link.
import { DEFAULTS } from './econ.js';

export const state = {
  view: 'map',
  lens: 'soil',
  lang: 'en',
  viewer: 'member',
  unit: 'zone',       // zone | admin | samples
  soilVar: 'p',
  soilStat: 'below',  // below | median
  econVar: 'vcr',     // vcr | gain | limiting | cropland | households
  sel: null,          // { type: 'zone' | 'admin', id }
  thread: null,
  scen: { iso: '', grainPriceFactor: DEFAULTS.grainPriceFactor, nationalPrice: DEFAULTS.nationalPrice, rateFactor: DEFAULTS.rateFactor },
};

const listeners = [];
export function subscribe(fn) { listeners.push(fn); }

export function setState(patch) {
  const prev = { ...state, scen: { ...state.scen } };
  if (patch.scen) patch = { ...patch, scen: { ...state.scen, ...patch.scen } };
  Object.assign(state, patch);
  writeHash();
  listeners.forEach((fn) => fn(state, prev));
}

const KEYS = ['view', 'lens', 'lang', 'viewer', 'unit', 'soilVar', 'soilStat', 'econVar', 'thread'];
const SCEN = { iso: 'iso', gp: 'grainPriceFactor', np: 'nationalPrice', rf: 'rateFactor' };

function writeHash() {
  const p = new URLSearchParams();
  for (const k of KEYS) if (state[k] != null) p.set(k, state[k]);
  if (state.sel) p.set('sel', `${state.sel.type}:${state.sel.id}`);
  for (const [short, long] of Object.entries(SCEN)) {
    if (state.scen[long] !== '' && state.scen[long] != null) p.set(short, state.scen[long]);
  }
  history.replaceState(null, '', `#${p.toString()}`);
}

// Merge whatever the hash specifies into state (keys not present are kept).
export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const patch = {};
  for (const k of KEYS) if (p.has(k)) patch[k] = p.get(k);
  if (p.has('sel')) {
    const [type, id] = p.get('sel').split(':');
    patch.sel = (type === 'zone' || type === 'admin') && id !== '' ? { type, id: Number(id) } : null;
  }
  const scen = {};
  for (const [short, long] of Object.entries(SCEN)) {
    if (p.has(short)) scen[long] = long === 'iso' ? p.get(short) : Number(p.get(short));
  }
  if (Object.keys(scen).length) patch.scen = scen;
  return patch;
}
