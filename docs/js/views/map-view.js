// View 1: the shared map, with the soil / economics lens and the
// translation chain from soil test to policy lever.
import * as Dt from '../data.js';
import * as E from '../econ.js';
import { createMap } from '../map.js';
import { strips } from '../charts.js';
import { t, lang } from '../i18n.js';
import { setState, state as appState } from '../state.js';
import { THREADS } from '../notes.js';
import {
  BLUE_SEQ, HATCH, NUTRIENT_COLORS, PH_COLORS, REL_COLORS, SHARE_BREAKS, SHARE_COLORS, VCR_BREAKS,
  VCR_COLORS, ZONE_COLORS, big, classOf, countryName, esc, legend, nutrientGroup, nutrientName, num,
  pct, sig, ttRows, zoneName,
} from '../ui.js';

const SOIL_VARS = ['zones', 'p', 'n', 'soc', 'k', 's', 'zn', 'b', 'ph', 'cec', 'clay', 'sand'];
const ECON_VARS = ['zones', 'vcr', 'gain', 'limiting', 'cropland', 'households'];
const GAIN_BREAKS = [0.25, 0.5, 0.75, 1.0];
const CROP_BREAKS = [0.1, 0.2, 0.3, 0.4];
const HH_BREAKS = [5, 10, 20, 40];

let map = null, mountedFor = null, showTable = false;

export function render(app, D, state) {
  const key = `${lang()}`;
  if (mountedFor !== key || !app.querySelector('#map-view')) {
    mount(app, D);
    mountedFor = key;
  }
  update(app, D, state);
}

function mount(app, D) {
  app.innerHTML = `
  <section id="map-view">
    <div class="view-head">
      <div>
        <h2>${t('map.title')}</h2>
        <p id="map-intro"></p>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="toolbar" id="map-toolbar"></div>
        <div id="map"></div>
        <div id="map-legend"></div>
        <p class="small muted" id="map-points-note" style="margin-top:8px"></p>
        <button class="linkish toggle-table" id="map-table-toggle"></button>
        <div id="map-table" class="table-wrap" hidden></div>
      </div>
      <div class="card panel" id="map-panel"></div>
    </div>
  </section>`;
  map = createMap(app.querySelector('#map'), D, {
    onSelect: (sel) => setState({ sel }),
  });
  app.querySelector('#map-table-toggle').addEventListener('click', () => {
    showTable = !showTable;
    update(app, D, appState);
  });
}

// ---------------------------------------------------------------- helpers

function unitSummaries(D, state, econ) {
  const cacheKey = `${state.unit}|${econ.key}`;
  if (D._unitCache && D._unitCache.key === cacheKey) return D._unitCache.map;
  const m = new Map();
  if (state.unit === 'zone' || state.unit === 'samples') {
    for (let z = 1; z <= 5; z++) m.set(z, Dt.summarise(D, D.byZone.get(z) || [], econ));
  }
  if (state.unit === 'admin' || state.unit === 'samples') {
    for (const a of D.admins) m.set(`a${a.i}`, Dt.summarise(D, D.byAdmin.get(a.i) || [], econ));
  }
  D._unitCache = { key: cacheKey, map: m };
  return m;
}

const curVar = (state) => (state.lens === 'soil' ? state.soilVar : state.econVar);
const zonesVar = (state) => curVar(state) === 'zones';
// soil property used where a property is needed but the zones reference is shown
const soilKey = (state) => (state.soilVar === 'zones' ? 'p' : state.soilVar);

function varLabel(D, state) {
  if (zonesVar(state)) return t('var.zones');
  if (state.lens === 'soil') return D.props[state.soilVar][lang()];
  return t(`econvar.${state.econVar}`);
}

function soilStat(D, state) {
  return Dt.hasThreshold(D, state.soilVar) ? state.soilStat : 'median';
}

// Quantile breaks for properties without an interpretation threshold.
function seqBreaks(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => Dt.quantile(v, p));
}

// Value, colour and tooltip text for one aggregation unit.
function unitValue(D, state, s, land, zone) {
  const insufficient = s.n < Dt.MIN_N;
  if (zonesVar(state)) {
    return { v: zone, insufficient: false, text: zone ? zoneName(D, zone) : '–', color: zone ? ZONE_COLORS[zone] : '#eee' };
  }
  if (state.lens === 'soil') {
    const key = state.soilVar;
    const st = soilStat(D, state);
    const d = s.soil[key];
    if (st === 'below') {
      const b = d.below;
      return { v: b.p, insufficient, text: pct(b.p), ci: `${pct(b.lo)} – ${pct(b.hi)}`, ciLabel: 'tt.ci90',
        color: insufficient ? HATCH : SHARE_COLORS[classOf(SHARE_BREAKS, b.p)] };
    }
    const cls = Dt.soilClass(D, key, d.median);
    return { v: d.median, insufficient, text: `${sig(d.median, key, D)} ${D.props[key].unit}`,
      ci: `${sig(d.q25, key, D)} – ${sig(d.q75, key, D)}`, cls,
      color: insufficient ? HATCH : cls == null ? null : (key === 'ph' ? PH_COLORS : REL_COLORS)[cls] };
  }
  const e = s.econ;
  switch (state.econVar) {
    case 'vcr': return { v: e && e.vcrNat.median, insufficient, text: e ? num(e.vcrNat.median, 1) : '–',
      ci: e ? `${num(e.vcrNat.q25, 1)} – ${num(e.vcrNat.q75, 1)}` : '',
      color: insufficient || !e ? HATCH : VCR_COLORS[classOf(VCR_BREAKS, e.vcrNat.median)] };
    case 'gain': return { v: e && e.gainNat.median, insufficient, text: e ? `${num(e.gainNat.median, 2)} t/ha` : '–',
      ci: e ? `${num(e.gainNat.q25, 2)} – ${num(e.gainNat.q75, 2)}` : '',
      color: insufficient || !e ? HATCH : BLUE_SEQ[classOf(GAIN_BREAKS, e.gainNat.median)] };
    case 'limiting': {
      if (!e) return { insufficient: true, text: '–', color: HATCH };
      const top = e.limiting[0];
      return { v: top.key, insufficient, text: `${nutrientName(top.key)} (${pct(top.p)})`,
        color: insufficient ? HATCH : NUTRIENT_COLORS[nutrientGroup(top.key)] };
    }
    case 'cropland': return { v: land.cropShare, insufficient: false, text: pct(land.cropShare), ciLabel: 'tt.total',
      ci: `${big(land.croplandHa)} ha`, color: BLUE_SEQ[classOf(CROP_BREAKS, land.cropShare)] };
    case 'households': return { v: land.hhDensity, insufficient: false, text: `${num(land.hhDensity, 1)} /km²`, ciLabel: 'tt.total',
      ci: `${big(land.households)}`, color: BLUE_SEQ[classOf(HH_BREAKS, land.hhDensity)] };
  }
  return { color: null };
}

function seqFallback(D, state, summaries) {
  // properties without thresholds (clay, sand) use quantile classes of unit medians
  const vals = [...summaries.values()].filter((s) => s.n >= Dt.MIN_N).map((s) => s.soil[state.soilVar].median);
  return seqBreaks(vals);
}

function legendFor(D, state, seqB) {
  if (zonesVar(state)) return zoneLegend(D);
  const hatch = { cls: 'hatch', label: t('legend.few', { n: Dt.MIN_N }) };
  if (state.lens === 'soil') {
    const key = state.soilVar;
    if (soilStat(D, state) === 'below') {
      const thr = key === 'ph' ? `pH < ${D.meta.thresholds.ph.low}` : `< ${D.meta.thresholds[key].low} ${D.props[key].unit}`;
      return legend(t('legend.below', { prop: D.props[key][lang()], thr }), [
        ...SHARE_COLORS.map((c, i) => ({ color: c, label: `${i * 20}–${(i + 1) * 20}%` })), hatch]);
    }
    if (key === 'ph') {
      const labs = ['< 5.0', '5.0–5.5', '5.5–7.0', '7.0–7.5', '≥ 7.5'];
      const names = ['ph.strong', 'ph.acid', 'ph.neutral', 'ph.slight', 'ph.alk'];
      return legend(t('legend.ph'), PH_COLORS.map((c, i) => ({ color: c, label: `${labs[i]} ${t(names[i])}` })).concat([hatch]));
    }
    if (Dt.hasThreshold(D, key)) {
      const crit = D.meta.thresholds[key].low;
      const labs = ['rel.vlow', 'rel.low', 'rel.near', 'rel.ok', 'rel.high'];
      return legend(t('legend.rel', { crit: `${crit} ${D.props[key].unit}` }),
        REL_COLORS.map((c, i) => ({ color: c, label: t(labs[i]) })).concat([hatch]));
    }
    const b = seqB.map((v) => num(v, 0));
    return legend(`${D.props[key][lang()]} (${D.props[key].unit}), ${t('legend.median')}`, [
      { color: BLUE_SEQ[0], label: `< ${b[0]}` }, { color: BLUE_SEQ[1], label: `${b[0]}–${b[1]}` },
      { color: BLUE_SEQ[2], label: `${b[1]}–${b[2]}` }, { color: BLUE_SEQ[3], label: `${b[2]}–${b[3]}` },
      { color: BLUE_SEQ[4], label: `≥ ${b[3]}` }, hatch]);
  }
  switch (state.econVar) {
    case 'vcr': return legend(t('legend.vcr'), [
      { color: VCR_COLORS[0], label: t('vcr.loss') }, { color: VCR_COLORS[1], label: t('vcr.weak') },
      { color: VCR_COLORS[2], label: t('vcr.good') }, { color: VCR_COLORS[3], label: t('vcr.strong') }, hatch]);
    case 'gain': return legend(t('legend.gain'), [
      { color: BLUE_SEQ[0], label: '< 0.25' }, { color: BLUE_SEQ[1], label: '0.25–0.5' },
      { color: BLUE_SEQ[2], label: '0.5–0.75' }, { color: BLUE_SEQ[3], label: '0.75–1.0' },
      { color: BLUE_SEQ[4], label: '≥ 1.0 t/ha' }, hatch]);
    case 'limiting': return legend(t('legend.limiting'), [
      { color: NUTRIENT_COLORS.n, label: nutrientName('n') }, { color: NUTRIENT_COLORS.p, label: nutrientName('p') },
      { color: NUTRIENT_COLORS.s, label: nutrientName('s') }, { color: NUTRIENT_COLORS.other, label: t('nutrient.other') }, hatch]);
    case 'cropland': return legend(t('legend.cropland'), [
      { color: BLUE_SEQ[0], label: '< 10%' }, { color: BLUE_SEQ[1], label: '10–20%' }, { color: BLUE_SEQ[2], label: '20–30%' },
      { color: BLUE_SEQ[3], label: '30–40%' }, { color: BLUE_SEQ[4], label: '≥ 40%' }]);
    case 'households': return legend(t('legend.households'), [
      { color: BLUE_SEQ[0], label: '< 5' }, { color: BLUE_SEQ[1], label: '5–10' }, { color: BLUE_SEQ[2], label: '10–20' },
      { color: BLUE_SEQ[3], label: '20–40' }, { color: BLUE_SEQ[4], label: '≥ 40' }]);
  }
  return '';
}

function zoneLegend(D) {
  return legend(t('legend.zones'), [1, 2, 3, 4, 5].map((z) => ({ color: ZONE_COLORS[z], label: zoneName(D, z) })));
}

function pointColor(D, state, econ, seqB) {
  if (zonesVar(state)) return (r) => ZONE_COLORS[r.zone];
  if (state.lens === 'soil') {
    const key = state.soilVar;
    if (!Dt.hasThreshold(D, key)) return (r) => BLUE_SEQ[classOf(seqB, r[key])];
    const pal = key === 'ph' ? PH_COLORS : REL_COLORS;
    return (r) => pal[Dt.soilClass(D, key, r[key])];
  }
  switch (state.econVar) {
    case 'vcr': return (r) => VCR_COLORS[classOf(VCR_BREAKS, econ.nat[r.i].vcr)];
    case 'gain': return (r) => BLUE_SEQ[classOf(GAIN_BREAKS, econ.nat[r.i].gain)];
    case 'limiting': return (r) => NUTRIENT_COLORS[nutrientGroup(econ.nat[r.i].limitingBefore)];
    default: return () => '#52514e';
  }
}

// ---------------------------------------------------------------- update

function update(app, D, state) {
  const econ = Dt.econFor(D, econOpts(state));
  const summaries = unitSummaries(D, state, econ);
  const seqB = state.lens === 'soil' && !zonesVar(state) && !Dt.hasThreshold(D, state.soilVar)
    ? seqFallback(D, state, summaries) : null;

  app.querySelector('#map-intro').innerHTML = t(state.lens === 'soil' ? 'map.intro.soil' : 'map.intro.econ');
  renderToolbar(app, D, state);

  const zoneLand = (z) => Dt.landStats(D, { zone: z });
  const adminLand = (i) => Dt.landStats(D, { admin: i });
  const valueFor = (type, id) => {
    const s = summaries.get(type === 'zone' ? id : `a${id}`);
    const land = type === 'zone' ? zoneLand(id) : adminLand(id);
    const v = unitValue(D, state, s, land, type === 'zone' ? id : Dt.mainZone(D, id));
    if (seqB && !v.insufficient) v.color = BLUE_SEQ[classOf(seqB, v.v)];
    return { s, v };
  };
  const tip = (type, id) => {
    const { s, v } = valueFor(type, id);
    const title = type === 'zone' ? zoneName(D, id)
      : `${D.admins[id].name} · ${countryName(D, D.admins[id].iso)}`;
    const landVar = state.lens === 'econ' && (state.econVar === 'cropland' || state.econVar === 'households');
    return ttRows(title, [
      [varLabel(D, state), v.text],
      v.ci ? [t(v.ciLabel || 'tt.iqr'), v.ci] : null,
      [t('tt.samples'), num(s.n)],
      s.n ? [t('tt.harmonised'), pct(s.harmonised / s.n)] : null,
      v.insufficient && !landVar ? [t('tt.caution'), t('tt.few')] : null,
    ]);
  };

  const mode = state.unit === 'zone' ? (zonesVar(state) ? 'zones' : 'zoneValues')
    : state.unit === 'admin' ? 'admin' : 'samples';
  const pts = state.unit === 'samples' ? D.rows.filter((r) => Dt.pointVisible(r, state.viewer)) : [];
  const fallbackB = () => seqBreaks(D.rows.map((r) => r[soilKey(state)]));
  const pColor = pointColor(D, state, econ, seqB || fallbackB());
  map.update({
    mode,
    zoneFill: (z) => valueFor('zone', z).v.color || ZONE_COLORS[z],
    adminFill: (i) => valueFor('admin', i).v.color || '#eee',
    tipZone: (z) => tip('zone', z),
    tipAdmin: (i) => tip('admin', i),
    points: pts,
    pointFill: pColor,
    tipPoint: (r) => ttRows(`${t('tt.sample')} · ${D.admins[r.admin].name}`, [
      state.lens === 'soil' ? [D.props[soilKey(state)][lang()], `${sig(r[soilKey(state)], soilKey(state), D)} ${D.props[soilKey(state)].unit}`]
        : [t('econvar.vcr'), num(econ.nat[r.i].vcr, 1)],
      [t('tt.zone'), zoneName(D, r.zone)],
      [t('tt.campaign'), `${D.campaigns[r.camp].id} (${r.year})`],
      [t('tt.lab'), `${r.lab}${r.h ? '' : ` · ${t('tt.unharmonised')}`}`],
      [t('tt.tier'), t(`tier.${r.tier}`)],
    ]),
    selection: state.sel,
    ariaLabel: `${t('map.title')}: ${varLabel(D, state)}`,
  });

  const legendHtml = state.unit === 'samples' && state.lens === 'econ' && (state.econVar === 'cropland' || state.econVar === 'households')
    ? `<p class="small muted">${t('map.landNoPoints')}</p>`
    : legendFor(D, state, seqB || fallbackB());
  app.querySelector('#map-legend').innerHTML = legendHtml + (state.unit === 'samples' && !zonesVar(state) ? zoneLegend(D) : '');

  const nVisible = pts.length;
  const nAggregate = D.rows.length - D.rows.filter((r) => Dt.pointVisible(r, state.viewer)).length;
  const nEmb = Dt.embargoed(D).reduce((s, c) => s + c.n, 0);
  app.querySelector('#map-points-note').innerHTML = t('map.pointsNote', {
    shown: num(state.unit === 'samples' ? nVisible : D.rows.filter((r) => Dt.pointVisible(r, state.viewer)).length),
    agg: num(nAggregate), emb: num(nEmb), viewer: t(`viewer.${state.viewer}`),
  });

  const tbtn = app.querySelector('#map-table-toggle');
  tbtn.textContent = showTable ? t('table.hide') : t('table.show');
  const tbl = app.querySelector('#map-table');
  tbl.hidden = !showTable;
  if (showTable) renderTable(tbl, D, state, valueFor);

  renderPanel(app.querySelector('#map-panel'), D, state, econ, summaries);
}

export function econOpts(state) {
  return { ...E.DEFAULTS, grainPriceFactor: state.scen.grainPriceFactor,
    nationalPrice: state.scen.nationalPrice, rateFactor: state.scen.rateFactor };
}

function renderToolbar(app, D, state) {
  const units = ['zone', 'admin', 'samples'];
  const vars = state.lens === 'soil' ? SOIL_VARS : ECON_VARS;
  const cur = state.lens === 'soil' ? state.soilVar : state.econVar;
  const statDisabled = state.lens !== 'soil' || !Dt.hasThreshold(D, state.soilVar);
  const varName = (v) => (v === 'zones' ? t('var.zones') : state.lens === 'soil' ? D.props[v][lang()] : t(`econvar.${v}`));
  app.querySelector('#map-toolbar').innerHTML = `
    <div class="field"><span>${t('map.unit')}</span>
      <div class="seg" role="group" aria-label="${t('map.unit')}">
        ${units.map((u) => `<button data-unit="${u}" aria-pressed="${state.unit === u}">${t(`unit.${u}`)}</button>`).join('')}
      </div>
    </div>
    <label class="field"><span>${t('map.indicator')}</span>
      <select id="map-var">
        ${vars.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(varName(v))}</option>`).join('')}
      </select>
    </label>
    ${state.lens === 'soil' && !zonesVar(state) ? `
    <div class="field"><span>${t('map.stat')}</span>
      <div class="seg" role="group" aria-label="${t('map.stat')}">
        <button data-stat="below" aria-pressed="${soilStat(D, state) === 'below'}" ${statDisabled ? 'disabled' : ''}>${t('stat.below')}</button>
        <button data-stat="median" aria-pressed="${soilStat(D, state) === 'median'}">${t('stat.median')}</button>
      </div>
    </div>` : ''}`;
  const tb = app.querySelector('#map-toolbar');
  tb.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => setState({ unit: b.dataset.unit })));
  tb.querySelectorAll('[data-stat]').forEach((b) => b.addEventListener('click', () => setState({ soilStat: b.dataset.stat })));
  tb.querySelector('#map-var').addEventListener('change', (e) => setState(state.lens === 'soil' ? { soilVar: e.target.value } : { econVar: e.target.value }));
}

function renderTable(el, D, state, valueFor) {
  const units = state.unit === 'zone' ? [1, 2, 3, 4, 5].map((z) => ({ type: 'zone', id: z, name: zoneName(D, z), country: '' }))
    : D.admins.map((a) => ({ type: 'admin', id: a.i, name: a.name, country: countryName(D, a.iso) }));
  const rows = units.map((u) => ({ ...u, ...valueFor(u.type, u.id) }))
    .sort((a, b) => (b.v.v ?? -1) - (a.v.v ?? -1));
  el.innerHTML = `<table class="data"><thead><tr>
    <th>${t(state.unit === 'zone' ? 'unit.zone' : 'unit.admin')}</th>${state.unit !== 'zone' ? `<th>${t('table.country')}</th>` : ''}
    <th class="num">${esc(varLabel(D, state))}</th><th class="num">${t('table.range')}</th><th class="num">${t('tt.samples')}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td><button class="linkish" data-sel="${r.type}:${r.id}">${esc(r.name)}</button></td>
      ${state.unit !== 'zone' ? `<td>${esc(r.country)}</td>` : ''}
      <td class="num">${r.v.text}${r.v.insufficient ? ' *' : ''}</td><td class="num">${r.v.ci || ''}</td><td class="num">${num(r.s.n)}</td></tr>`).join('')}
    </tbody></table><p class="small muted">* ${t('legend.few', { n: Dt.MIN_N })}</p>`;
  el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => {
    const [type, id] = b.dataset.sel.split(':');
    setState({ sel: { type, id: Number(id) } });
  }));
}

// ---------------------------------------------------------------- panel

function renderPanel(el, D, state, econ, summaries) {
  if (!state.sel) return renderOverview(el, D, state);
  const { type, id } = state.sel;
  const isZone = type === 'zone';
  const rows = (isZone ? D.byZone.get(id) : D.byAdmin.get(id)) || [];
  const s = Dt.summarise(D, rows, econ);
  const zone = isZone ? id : Dt.mainZone(D, id);
  const filter = isZone ? { zone: id } : { admin: id };
  const land = Dt.landStats(D, filter);
  const pol = Dt.policy(D, econ, filter);
  const emb = Dt.embargoed(D, isZone ? {} : { admin: id }).filter((c) => !isZone || c.admins.some((a) => D.admins[a].zones.some((z) => z.zone === id)));
  const name = isZone ? zoneName(D, id) : D.admins[id].name;
  const crumbs = isZone ? `${t('unit.zone')} · ${s.countries.map((c) => countryName(D, c)).join(', ')}`
    : `${t('unit.admin')} · ${countryName(D, D.admins[id].iso)}${zone ? ` · ${zoneName(D, zone)}` : ''}`;
  const crop = zone ? E.CROPS[zone] : null;
  const threads = type === 'admin' ? THREADS.filter((th) => adminIndex(D, th.sel) === id) : [];

  el.innerHTML = `
    <div class="crumbs">${esc(crumbs)}</div>
    <h3>${esc(name)}</h3>
    <div class="tiles">
      <div class="tile"><div class="v">${num(s.n)}</div><div class="k">${t('panel.samples')}</div>
        <div class="d">${s.n ? t('panel.harmonisedShare', { p: pct(s.harmonised / s.n) }) : t('panel.none')}</div></div>
      <div class="tile"><div class="v">${big(land.croplandHa)}</div><div class="k">${t('panel.cropland')}</div>
        <div class="d">${pct(land.cropShare)} ${t('panel.ofLand')}</div></div>
      <div class="tile"><div class="v">${big(land.households)}</div><div class="k">${t('panel.households')}</div>
        <div class="d">${t('panel.illustrative')}</div></div>
    </div>
    <p class="small muted">${t('panel.provenance', { labs: s.labs.join(', ') || '–', camps: num(new Set(rows.map((r) => r.camp)).size) })}
      ${emb.length ? ` ${t('panel.embargoed', { n: num(emb.reduce((a, c) => a + c.n, 0)) })}` : ''}</p>
    ${s.n < Dt.MIN_N ? `<p class="note-synthetic">${s.n ? t('panel.fewWarn', { n: s.n }) : t('panel.noSamples')}</p>` : ''}
    <div class="mini-chart" id="panel-chart"></div>
    ${s.n ? chainHtml(D, state, s, zone, crop, econ, pol) : ''}
    <div class="toolbar" style="margin-top:12px">
      ${isZone || zone ? `<button class="tour-btn" id="to-scenario">${t('panel.toScenario')}</button>` : ''}
      ${threads.length ? `<button class="tour-btn" id="to-thread">${t('panel.discussion', { n: threads.length })}</button>` : ''}
      <button class="linkish" id="clear-sel">${t('panel.clear')}</button>
    </div>`;

  if (s.n) {
    const chart = el.querySelector('#panel-chart');
    if (state.lens === 'soil') {
      const key = soilKey(state);
      const thr = key === 'ph' ? D.meta.thresholds.ph.low : D.meta.thresholds[key] && D.meta.thresholds[key].low;
      strips(chart, {
        rows: [{ label: t('panel.fields'), values: rows.map((r) => r[key]), color: 'var(--soil-lens)' }],
        ref: thr != null ? { value: thr, label: t('panel.critical') } : null,
        log: !['ph', 'clay', 'sand'].includes(key), unit: `${D.props[key][lang()]}${D.props[key].unit ? ` (${D.props[key].unit})` : ''}`,
        digits: D.props[key].decimals,
      });
    } else {
      strips(chart, {
        rows: [
          { label: t('scen.national'), values: rows.map((r) => econ.nat[r.i].vcr), color: '#52514e' },
          { label: t('scen.zoneBlend'), values: rows.map((r) => econ.zb[r.i].vcr), color: 'var(--econ-lens)' },
        ],
        ref: { value: econ.opts.vcrThreshold, label: t('panel.vcrRef') }, unit: t('econvar.vcr'), digits: 1,
      });
    }
  }
  const go = el.querySelector('#to-scenario');
  if (go) go.addEventListener('click', () => setState({ view: 'scenario', scen: { iso: isZone ? '' : D.admins[id].iso } }));
  const th = el.querySelector('#to-thread');
  if (th) th.addEventListener('click', () => setState({ view: 'dialogue', thread: threads[0].id }));
  el.querySelector('#clear-sel').addEventListener('click', () => setState({ sel: null }));
}

function adminIndex(D, sel) {
  const a = D.admins.find((x) => x.iso === sel.iso && x.name === sel.name);
  return a ? a.i : -1;
}

function chainHtml(D, state, s, zone, crop, econ, pol) {
  const key = Dt.hasThreshold(D, state.soilVar) && state.soilVar !== 'ph' ? state.soilVar : 'p';
  const d = s.soil[key];
  const e = s.econ;
  const blend = zone ? econ.blends[zone] : null;
  const rate = zone ? Math.round(E.ZONE_RATES[zone] * econ.opts.rateFactor) : null;
  const lim = e.limiting.slice(0, 3).map((x) => `${nutrientName(x.key)} ${pct(x.p)}`).join(', ');
  const cropName = crop ? t(`crop.${crop.crop}`) : '';
  const step = (cls, soilTerm, econTerm, val) => {
    const [primary, secondary] = state.lens === 'soil' ? [soilTerm, econTerm] : [econTerm, soilTerm];
    return `<li class="${cls}"><div class="terms"><span class="primary">${primary}</span><span class="secondary">≈ ${secondary}</span></div><div class="val">${val}</div></li>`;
  };
  return `
    <p class="chain-intro">${t('chain.intro')}</p>
    <ol class="chain">
      ${step('soil-step', t('chain.1.soil'), t('chain.1.econ'), t('chain.1.val', {
        n: num(s.n), prop: D.props[key][lang()], med: sig(d.median, key, D), unit: D.props[key].unit,
        below: pct(d.below.p), lo: pct(d.below.lo), hi: pct(d.below.hi) }))}
      ${step('soil-step', t('chain.2.soil'), t('chain.2.econ'), t('chain.2.val', { lim }))}
      ${step('soil-step', t('chain.3.soil'), t('chain.3.econ'), blend ? t('chain.3.val', {
        nat: econ.national.label, blend: blend.label, rate: num(rate) }) : '–')}
      ${step('econ-step', t('chain.4.soil'), t('chain.4.econ'), t('chain.4.val', {
        nat: num(e.gainNat.median, 2), zb: num(e.gainZb.median, 2), crop: cropName, y0: num(e.y0.median, 1) }))}
      ${step('econ-step', t('chain.5.soil'), t('chain.5.econ'), t('chain.5.val', {
        ae: num(e.aeNat.median, 0), vn: num(e.vcrNat.median, 1), vz: num(e.vcrZb.median, 1),
        pn: pct(e.payNat.p), pz: pct(e.payZb.p) }))}
      ${step('econ-step', t('chain.6.soil'), t('chain.6.econ'), t('chain.6.val', {
        ha: big(pol.zb.ha), lo: big(pol.zb.lo), hi: big(pol.zb.hi), crop: cropName || t('crop.crop'),
        hh: big(pol.zb.households), nat: big(pol.nat.ha) }))}
    </ol>`;
}

function renderOverview(el, D, state) {
  const nEmb = Dt.embargoed(D).reduce((s, c) => s + c.n, 0);
  const zoneRows = [1, 2, 3, 4, 5].map((z) => {
    const rs = D.byZone.get(z) || [];
    const isos = [...new Set(D.admins.filter((a) => a.zones.some((zz) => zz.zone === z && zz.croplandHa > 0)).map((a) => a.iso))];
    return { z, n: rs.length, isos };
  });
  el.innerHTML = `
    <h3>${t('overview.title')}</h3>
    <p class="small" style="color:var(--ink-2)">${t('overview.text')}</p>
    <div class="tiles">
      <div class="tile"><div class="v">${num(D.rows.length + nEmb)}</div><div class="k">${t('overview.samples')}</div><div class="d">${t('overview.embargoNote', { n: num(nEmb) })}</div></div>
      <div class="tile"><div class="v">${num(D.campaigns.length)}</div><div class="k">${t('overview.campaigns')}</div><div class="d">2014–2026</div></div>
      <div class="tile"><div class="v">${num(D.labs.length)}</div><div class="k">${t('overview.labs')}</div><div class="d">${t('overview.labsPT', { n: D.labs.filter((l) => l.ptJoined).length })}</div></div>
    </div>
    <table class="data" style="margin-top:12px"><thead><tr><th>${t('unit.zone')}</th><th>${t('overview.sharedBy')}</th><th class="num">${t('tt.samples')}</th></tr></thead>
    <tbody>${zoneRows.map((r) => `<tr><td><span class="legend" style="margin:0;display:inline-flex"><span class="sw" style="background:${ZONE_COLORS[r.z]}"></span></span> <button class="linkish" data-z="${r.z}">${esc(zoneName(D, r.z))}</button></td>
      <td class="small">${r.isos.map((i) => esc(countryName(D, i))).join(', ')}</td><td class="num">${num(r.n)}</td></tr>`).join('')}</tbody></table>
    <p class="chain-intro">${t('overview.hint')}</p>`;
  el.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => setState({ sel: { type: 'zone', id: Number(b.dataset.z) } })));
}
