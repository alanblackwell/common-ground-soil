// View 2: a single national blend compared with zone-specific blends.
import * as Dt from '../data.js';
import * as E from '../econ.js';
import { rangeRows, stackRows } from '../charts.js';
import { t, lang } from '../i18n.js';
import { setState } from '../state.js';
import { econOpts } from './map-view.js';
import { NUTRIENT_COLORS, big, countryName, esc, num, nutrientGroup, nutrientName, pct, zoneName } from '../ui.js';

const NAT_COLOR = '#52514e';
const ZB_COLOR = '#2a78d6';

export function render(app, D, state) {
  const opts = econOpts(state);
  const econ = Dt.econFor(D, opts);
  const iso = state.scen.iso || '';
  const filter = iso ? { iso } : {};
  const pol = Dt.policy(D, econ, filter);
  const rowsIn = (z) => (D.byZone.get(z) || []).filter((r) => !iso || r.iso === iso);
  const zones = [1, 2, 3, 4, 5].filter((z) => rowsIn(z).length >= Dt.MIN_N);
  const prevFocus = document.activeElement && document.activeElement.id;

  app.innerHTML = `
  <section>
    <div class="view-head">
      <div>
        <h2>${t('scen.title')}</h2>
        <p>${t(state.lens === 'soil' ? 'scen.intro.soil' : 'scen.intro.econ')}</p>
      </div>
    </div>
    <p class="note-synthetic">${t('scen.modelNote')}</p>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <label class="field"><span>${t('scen.country')}</span>
          <select id="sc-iso">
            <option value="">${t('scen.allMembers')}</option>
            ${D.members.map((m) => `<option value="${m.iso}" ${m.iso === iso ? 'selected' : ''}>${esc(m[lang()])}</option>`).join('')}
          </select>
        </label>
        ${slider('sc-np', t('scen.fertPrice'), 0.4, 1.4, 0.05, opts.nationalPrice, { suffix: ' USD/kg', digits: 2 })}
        ${slider('sc-gp', t('scen.grainPrice'), 0.6, 1.6, 0.05, opts.grainPriceFactor, { prefix: '× ', digits: 2 })}
        ${slider('sc-rf', t('scen.rate'), 0.5, 1.5, 0.1, opts.rateFactor, { prefix: '× ', digits: 1 })}
        <button class="linkish" id="sc-reset">${t('scen.reset')}</button>
      </div>
      <div class="tiles">
        ${tile(t('scen.tile.area'), pol.nat.ha, pol.zb.ha, (v) => `${big(v)} ha`,
          t('scen.tile.areaSub', { lo: big(pol.zb.lo), hi: big(pol.zb.hi), tot: big(pol.cropHa) }))}
        ${tile(t('scen.tile.grain'), pol.nat.grainT, pol.zb.grainT, (v) => `${big(v)} t`, t('scen.tile.grainSub'))}
        ${tile(t('scen.tile.hh'), pol.nat.households, pol.zb.households, (v) => big(v), t('panel.illustrative'))}
      </div>
    </div>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <h3>${t('scen.vcrTitle')}</h3>
          <p class="sub">${t('scen.vcrSub')}</p>
          <div class="legend" style="margin:0 0 6px">
            <span class="item"><span class="sw dot" style="background:${NAT_COLOR}"></span>${t('scen.national')} (${esc(econ.national.label)})</span>
            <span class="item"><span class="sw dot" style="background:${ZB_COLOR}"></span>${t('scen.zoneBlend')}</span>
          </div>
          <div class="mini-chart" id="sc-vcr"></div>
        </div>
        <div class="card">
          <h3>${t('scen.limTitle')}</h3>
          <p class="sub">${t('scen.limSub')}</p>
          <div class="legend" style="margin:0 0 6px">
            ${['n', 'p', 's', 'other'].map((k) => `<span class="item"><span class="sw" style="background:${NUTRIENT_COLORS[k]}"></span>${k === 'other' ? t('nutrient.otherKZn') : nutrientName(k)}</span>`).join('')}
          </div>
          <div class="mini-chart" id="sc-lim"></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h3>${t('scen.blendsTitle')}</h3>
          <p class="sub">${t('scen.blendsSub')}</p>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>${t('unit.zone')}</th><th>${t('scen.crop')}</th><th>${t('scen.blend')}</th><th class="num">${t('scen.rateCol')}</th><th class="num">${t('scen.priceCol')}</th></tr></thead>
            <tbody>${[1, 2, 3, 4, 5].map((z) => {
              const b = econ.blends[z];
              return `<tr><td>${esc(zoneName(D, z))}</td><td>${t(`crop.${E.CROPS[z].crop}`)}</td><td>${esc(b.label)}</td>
                <td class="num">${num(E.ZONE_RATES[z] * opts.rateFactor)} kg/ha</td><td class="num">${num(E.blendPrice(b, opts.nationalPrice), 2)}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h3>${t('scen.readTitle')}</h3>
          <ul class="small" style="padding-left:18px;margin:0">
            ${t('scen.readPoints').map((p) => `<li style="margin-bottom:6px">${p}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${t('scen.tableTitle')}</h3>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('unit.zone')}</th><th class="num">${t('tt.samples')}</th>
          <th class="num">${t('scen.col.vcrN')}</th><th class="num">${t('scen.col.vcrZ')}</th>
          <th class="num">${t('scen.col.payN')}</th><th class="num">${t('scen.col.payZ')}</th>
          <th class="num">${t('scen.col.areaN')}</th><th class="num">${t('scen.col.areaZ')}</th></tr></thead>
        <tbody>${[1, 2, 3, 4, 5].map((z) => {
          const rs = rowsIn(z);
          if (!rs.length) return '';
          const s = Dt.summarise(D, rs, econ);
          const p = Dt.policy(D, econ, { ...filter, zone: z });
          return `<tr><td>${esc(zoneName(D, z))}${rs.length < Dt.MIN_N ? ' *' : ''}</td><td class="num">${num(rs.length)}</td>
            <td class="num">${num(s.econ.vcrNat.median, 1)}</td><td class="num">${num(s.econ.vcrZb.median, 1)}</td>
            <td class="num">${pct(s.econ.payNat.p)}</td><td class="num">${pct(s.econ.payZb.p)}</td>
            <td class="num">${big(p.nat.ha)}</td><td class="num">${big(p.zb.ha)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="small muted">* ${t('legend.few', { n: Dt.MIN_N })}</p>
    </div>
  </section>`;

  // charts
  const cats = zones.map((z) => {
    const rs = rowsIn(z);
    const s = Dt.summarise(D, rs, econ);
    return {
      label: zoneName(D, z), sub: `${t(`crop.${E.CROPS[z].crop}`)} · n = ${num(rs.length)}`,
      values: { nat: s.econ.vcrNat, zb: s.econ.vcrZb },
      extra: (k) => [[t('scen.pays'), pct(k === 'nat' ? s.econ.payNat.p : s.econ.payZb.p)]],
      lim: s.econ.limiting, limAfter: s.econ.limitingAfter,
    };
  });
  rangeRows(app.querySelector('#sc-vcr'), {
    cats, label: t('econvar.vcr'), domain: [0, 5], digits: 1,
    series: [{ key: 'nat', label: t('scen.national'), color: NAT_COLOR }, { key: 'zb', label: t('scen.zoneBlend'), color: ZB_COLOR }],
    ref: { value: opts.vcrThreshold, label: t('panel.vcrRef') },
  });
  const group = (list) => {
    const o = {};
    for (const x of list) o[nutrientGroup(x.key)] = (o[nutrientGroup(x.key)] || 0) + x.p;
    return o;
  };
  const limCats = cats.flatMap((c) => [
    { label: c.label, shares: group(c.lim) },
    { label: `→ ${t('scen.after')}`, shares: group(c.limAfter) },
  ]);
  stackRows(app.querySelector('#sc-lim'), {
    cats: limCats, keys: ['n', 'p', 's', 'other'], colors: NUTRIENT_COLORS,
    names: { n: nutrientName('n'), p: nutrientName('p'), s: nutrientName('s'), other: t('nutrient.otherKZn') },
    label: t('scen.limTitle'),
  });

  // controls
  app.querySelector('#sc-iso').addEventListener('change', (e) => setState({ scen: { iso: e.target.value } }));
  for (const [id, key] of [['sc-np', 'nationalPrice'], ['sc-gp', 'grainPriceFactor'], ['sc-rf', 'rateFactor']]) {
    const input = app.querySelector(`#${id}`);
    input.addEventListener('change', () => setState({ scen: { [key]: Number(input.value) } }));
    input.addEventListener('input', () => { input.nextElementSibling.textContent = fmtSlider(input.value, input.dataset); });
  }
  app.querySelector('#sc-reset').addEventListener('click', () => setState({ scen: {
    grainPriceFactor: E.DEFAULTS.grainPriceFactor, nationalPrice: E.DEFAULTS.nationalPrice, rateFactor: E.DEFAULTS.rateFactor } }));
  if (prevFocus && app.querySelector(`#${prevFocus}`)) app.querySelector(`#${prevFocus}`).focus();
}

function fmtSlider(v, { prefix = '', suffix = '', digits = 1 }) {
  return `${prefix}${num(Number(v), Number(digits))}${suffix}`;
}

function slider(id, label, min, max, step, value, f) {
  return `<label class="field"><span>${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"
      data-prefix="${esc(f.prefix || '')}" data-suffix="${esc(f.suffix || '')}" data-digits="${f.digits}">
    <output>${fmtSlider(value, f)}</output></label>`;
}

function tile(label, nat, zb, fmt, sub) {
  const delta = zb - nat;
  const rel = nat > 0 ? delta / nat : NaN;
  return `<div class="tile"><div class="k">${label}</div>
    <div class="v">${fmt(zb)}</div>
    <div class="d ${delta > 0 ? 'up' : ''}">${t('scen.vsNational', { nat: fmt(nat), d: `${delta >= 0 ? '+' : '−'}${pct(Math.abs(rel))}` })}</div>
    <div class="d">${sub}</div></div>`;
}
