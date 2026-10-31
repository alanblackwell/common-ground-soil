// View 3: members, laboratories, harmonisation and data-sharing tiers.
import * as Dt from '../data.js';
import { ptTimeline, yearBars } from '../charts.js';
import { t, lang } from '../i18n.js';
import { setState } from '../state.js';
import { COUNTRY_COLORS, TIER_COLORS, countryName, esc, num, pct, zoneName } from '../ui.js';

const d3 = window.d3;
const TIERS = ['open', 'members', 'aggregate', 'embargo'];
let showCampaigns = false;

export function render(app, D, state) {
  const allCamps = D.campaigns;
  const memberStats = D.members.map((m) => memberSummary(D, m.iso));
  const years = [...new Set(allCamps.map((c) => c.year))].sort();
  const byYear = Object.fromEntries(years.map((y) => [y, {}]));
  for (const c of allCamps) byYear[c.year][c.iso] = (byYear[c.year][c.iso] || 0) + c.n;
  const tierTotals = Object.fromEntries(TIERS.map((k) => [k, allCamps.filter((c) => c.tier === k).reduce((s, c) => s + c.n, 0)]));

  app.innerHTML = `
  <section>
    <div class="view-head"><div>
      <h2>${t('net.title')}</h2>
      <p>${t('net.intro')}</p>
    </div></div>
    <div class="members">
      ${memberStats.map((m) => memberCard(D, m)).join('')}
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <h3>${t('net.growthTitle')}</h3>
        <p class="sub">${t('net.growthSub')}</p>
        <div class="legend" style="margin:0 0 6px">
          ${D.members.map((m) => `<span class="item"><span class="sw" style="background:${COUNTRY_COLORS[m.iso]}"></span>${esc(m[lang()])}</span>`).join('')}
        </div>
        <div class="mini-chart" id="net-years"></div>
      </div>
      <div class="card">
        <h3>${t('net.tiersTitle')}</h3>
        <p class="sub">${t('net.tiersSub', { viewer: t(`viewer.${state.viewer}`) })}</p>
        <div class="tiers">
          ${TIERS.map((k) => `<div class="tier"><h4><span class="sw" style="width:12px;height:12px;border-radius:3px;display:inline-block;background:${TIER_COLORS[k]}"></span>${t(`tier.${k}`)}</h4>
            <div class="n">${num(tierTotals[k])}</div><div class="muted small">${t('tt.samples')}</div>
            <p class="small" style="margin:6px 0 0">${t(`tier.${k}.desc`)}</p>
            <p class="small muted" style="margin:4px 0 0">${t(`tier.${k}.${state.viewer}`)}</p></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>${t('net.labsTitle')}</h3>
      <p class="sub">${t('net.labsSub')}</p>
      <div class="legend" style="margin:0 0 8px">
        <span class="item"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4" fill="var(--good)"/></svg>${t('pt.good')} (|z| &lt; 2)</span>
        <span class="item"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><path d="${d3.symbol().type(d3.symbolTriangle).size(48)()}" fill="var(--warning)"/></svg>${t('pt.warning')} (2–3)</span>
        <span class="item"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><path d="${d3.symbol().type(d3.symbolCross).size(48)()}" fill="var(--critical)"/></svg>${t('pt.critical')} (≥ 3)</span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('net.lab')}</th><th>${t('table.country')}</th><th>${t('net.methods')}</th>
          <th>${t('net.ptRounds')} 2019–2026</th><th>${t('net.latest')}</th><th class="num">${t('tt.samples')}</th><th class="num">${t('tt.harmonised')}</th></tr></thead>
        <tbody>${D.labs.map((l) => labRow(D, l)).join('')}</tbody>
      </table></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>${t('net.campTitle')}</h3>
      <p class="sub">${t('net.campSub', { n: allCamps.length })}</p>
      <button class="linkish" id="net-camp-toggle">${showCampaigns ? t('table.hide') : t('table.show')}</button>
      <div class="table-wrap" ${showCampaigns ? '' : 'hidden'}><table class="data" style="margin-top:8px">
        <thead><tr><th>${t('net.campaign')}</th><th>${t('table.country')}</th><th class="num">${t('net.year')}</th><th>${t('net.lab')}</th>
          <th>${t('net.purpose')}</th><th>${t('net.tier')}</th><th class="num">${t('tt.samples')}</th><th>${t('net.regions')}</th></tr></thead>
        <tbody>${[...allCamps].sort((a, b) => b.year - a.year || a.iso.localeCompare(b.iso)).map((c) => `<tr>
          <td>${esc(c.id)}</td><td>${esc(countryName(D, c.iso))}</td><td class="num">${c.year}</td><td>${c.lab}</td>
          <td>${esc(purposeName(D, c.purpose))}</td>
          <td>${t(`tier.${c.tier}`)}${c.embargoUntil ? ` (${t('net.until', { y: c.embargoUntil })})` : ''}</td>
          <td class="num">${num(c.n)}</td><td class="small">${c.admins.map((a) => esc(D.admins[a].name)).join(', ')}</td></tr>`).join('')}
        </tbody></table></div>
    </div>
  </section>`;

  yearBars(app.querySelector('#net-years'), {
    years, keys: D.members.map((m) => m.iso), values: byYear, colors: COUNTRY_COLORS,
    names: Object.fromEntries(D.members.map((m) => [m.iso, m[lang()]])), label: t('net.growthTitle'),
  });
  app.querySelector('#net-camp-toggle').addEventListener('click', () => { showCampaigns = !showCampaigns; render(app, D, state); });
  app.querySelectorAll('[data-zone]').forEach((b) => b.addEventListener('click', () =>
    setState({ view: 'map', unit: 'zone', sel: { type: 'zone', id: Number(b.dataset.zone) } })));
}

function purposeName(D, key) {
  const p = D.network.purposes.find((x) => x.key === key);
  return p ? p[lang()] : key;
}

function memberSummary(D, iso) {
  const camps = D.campaigns.filter((c) => c.iso === iso);
  const rows = D.rows.filter((r) => r.iso === iso);
  const tiers = Object.fromEntries(TIERS.map((k) => [k, camps.filter((c) => c.tier === k).reduce((s, c) => s + c.n, 0)]));
  const total = Object.values(tiers).reduce((a, b) => a + b, 0);
  const labs = D.labs.filter((l) => l.iso === iso);
  // reciprocity: samples from other members in the zones this member farms
  const zones = [1, 2, 3, 4, 5].filter((z) => D.admins.some((a) => a.iso === iso && a.zones.some((zz) => zz.zone === z && zz.croplandHa > 0)));
  const others = D.rows.filter((r) => r.iso !== iso && zones.includes(r.zone));
  const otherMembers = new Set(others.map((r) => r.iso));
  return { iso, camps, rows, tiers, total, labs, zones, othersN: others.length, otherMembers: [...otherMembers],
    harmonised: rows.length ? rows.filter((r) => r.h).length / rows.length : NaN };
}

function memberCard(D, m) {
  return `<div class="card member">
    <h4><span class="sw" style="background:${COUNTRY_COLORS[m.iso]}"></span>${esc(countryName(D, m.iso))}</h4>
    <div class="tierbar" role="img" aria-label="${TIERS.map((k) => `${t(`tier.${k}`)} ${m.tiers[k]}`).join(', ')}">
      ${TIERS.filter((k) => m.tiers[k]).map((k) => `<span style="flex:${m.tiers[k]};background:${TIER_COLORS[k]}" title="${t(`tier.${k}`)}: ${m.tiers[k]}"></span>`).join('')}
    </div>
    <dl>
      <dt>${t('net.contributed')}</dt><dd>${num(m.total)}</dd>
      <dt>${t('overview.campaigns')}</dt><dd>${num(m.camps.length)}</dd>
      <dt>${t('overview.labs')}</dt><dd>${m.labs.map((l) => l.id).join(', ')}</dd>
      <dt>${t('tt.harmonised')}</dt><dd>${pct(m.harmonised)}</dd>
    </dl>
    <div class="back">${t('net.back', { n: `<b>${num(m.othersN)}</b>`, k: m.otherMembers.length })}
      <div class="small" style="margin-top:4px">${m.zones.map((z) => `<button class="linkish" data-zone="${z}">${esc(zoneName(D, z))}</button>`).join(' · ')}</div>
    </div>
  </div>`;
}

function labRow(D, l) {
  const rows = D.rows.filter((r) => r.lab === l.id);
  const camps = D.campaigns.filter((c) => c.lab === l.id);
  const n = camps.reduce((s, c) => s + c.n, 0);
  let status;
  if (!l.rounds.length) status = `<span class="status muted">${t('pt.none')}</span>`;
  else {
    const z = Math.max(...Object.values(l.rounds[l.rounds.length - 1].z).map(Math.abs));
    const k = z < 2 ? 'good' : z < 3 ? 'warning' : 'critical';
    const icon = { good: '✓', warning: '!', critical: '✕' }[k];
    status = `<span class="status"><span aria-hidden="true" style="color:var(--${k === 'good' ? 'success-text' : k === 'warning' ? 'ink' : 'critical'});font-weight:700">${icon}</span>${t(`pt.${k}`)}</span>`;
  }
  return `<tr>
    <td><b>${l.id}</b><div class="small muted">${esc(t(`labtype.${l.type}`))}</div></td>
    <td>${esc(countryName(D, l.iso))}</td>
    <td class="small">P: ${l.pMethod}<br>C: ${l.cMethod}</td>
    <td>${l.rounds.length ? ptTimeline(l.rounds) : `<span class="small muted">${t('pt.invited')}</span>`}
      ${l.ptJoined ? `<div class="small muted">${t('pt.since', { y: l.ptJoined })}</div>` : ''}</td>
    <td>${status}</td>
    <td class="num">${num(n)}</td>
    <td class="num">${rows.length ? pct(rows.filter((r) => r.h).length / rows.length) : '–'}</td>
  </tr>`;
}
