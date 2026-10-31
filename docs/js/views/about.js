// View 5: what is real, how the system would work, and what we need corrected.
import { t, lang } from '../i18n.js';
import { countryName, esc } from '../ui.js';

export function render(app, D) {
  const src = D.meta.sources;
  app.innerHTML = `
  <section class="stack">
    <div class="view-head"><div>
      <h2>${t('about.title')}</h2>
      <p>${t('about.intro')}</p>
    </div></div>

    <div class="card prose" style="max-width:none">
      <h3 style="margin-top:0">${t('about.realTitle')}</h3>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('about.real')}</th><th>${t('about.invented')}</th></tr></thead>
        <tbody><tr><td><ul>${t('about.realList').map((x) => `<li>${x}</li>`).join('')}</ul></td>
          <td><ul>${t('about.inventedList').map((x) => `<li>${x}</li>`).join('')}</ul></td></tr></tbody>
      </table></div>
    </div>

    <div class="card diagram">
      <h3>${t('about.archTitle')}</h3>
      <p class="sub">${t('about.archSub')}</p>
      ${diagram()}
    </div>

    <div class="grid-2">
      <div class="card prose">
        <h3 style="margin-top:0">${t('about.simplTitle')}</h3>
        <p class="small muted">${t('about.simplSub')}</p>
        <ul>${t('about.simplList').map((x) => `<li>${x}</li>`).join('')}</ul>
      </div>
      <div class="card prose">
        <h3 style="margin-top:0">${t('about.customTitle')}</h3>
        <ul>${t('about.customList').map((x) => `<li>${x}</li>`).join('')}</ul>
        <h3>${t('about.modelTitle')}</h3>
        <p class="small">${t('about.modelText')}</p>
      </div>
    </div>

    <div class="card prose" style="max-width:none">
      <h3 style="margin-top:0">${t('about.sourcesTitle')}</h3>
      <ul class="small">
        <li>${esc(src.soil)}. Poggio, L. et al. (2021) SoilGrids 2.0, <i>SOIL</i> 7, 217–240.</li>
        <li>${esc(src.rain)}. Fick, S.E. &amp; Hijmans, R.J. (2017) WorldClim 2, <i>Int. J. Climatology</i> 37, 4302–4315.</li>
        <li>${esc(src.countries)}.</li>
        ${Object.entries(src.admin1).map(([iso, m]) => `<li>${esc(countryName(D, iso))}: ${esc(m.source || '')} (${esc(m.year || '')}), ${esc(m.license || '')}, via geoBoundaries (${esc(m.edition)}).</li>`).join('')}
        <li>${t('about.boundaryNote')}</li>
      </ul>
      <p class="small muted">${t('about.generated', { date: D.meta.generated, seed: D.meta.seed })}</p>
      <p class="small">${t('about.byline')}</p>
    </div>
  </section>`;
}

function diagram() {
  const boxes = [
    { x: 10, cls: '', t: t('arch.labs'), s: t('arch.labs.s') },
    { x: 160, cls: 'hub', t: t('arch.ingest'), s: t('arch.ingest.s') },
    { x: 310, cls: 'hub', t: t('arch.harm'), s: t('arch.harm.s') },
    { x: 460, cls: 'hub', t: t('arch.store'), s: t('arch.store.s') },
    { x: 610, cls: 'hub', t: t('arch.agg'), s: t('arch.agg.s') },
  ];
  const views = [
    { y: 18, cls: 'soil', t: t('lens.soil') }, { y: 62, cls: 'econ', t: t('lens.econ') },
    { y: 106, cls: '', t: t('nav.network') }, { y: 150, cls: '', t: t('nav.dialogue') },
  ];
  const wrap = (s, n = 22) => {
    const words = s.split(' '); const lines = ['']; for (const w of words) {
      if ((lines[lines.length - 1] + ' ' + w).trim().length > n) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
    } return lines;
  };
  const box = (b) => `<rect class="box ${b.cls}" x="${b.x}" y="40" width="130" height="110" rx="8"/>
    <text class="t" x="${b.x + 10}" y="62">${wrap(b.t, 18).map((l, i) => `<tspan x="${b.x + 10}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join('')}</text>
    <text class="s" x="${b.x + 10}" y="${b.t.length > 18 ? 98 : 84}">${wrap(b.s, 22).map((l, i) => `<tspan x="${b.x + 10}" dy="${i ? 13 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  const arrows = boxes.slice(0, -1).map((b) => `<path class="arrow" d="M${b.x + 132} 95 H${b.x + 156}" marker-end="url(#arr)"/>`).join('');
  const vs = views.map((v) => `<rect class="box ${v.cls}" x="770" y="${v.y}" width="120" height="34" rx="8"/>
    <text x="830" y="${v.y + 21}" text-anchor="middle">${esc(v.t)}</text>
    <path class="arrow" d="M742 95 C756 95 754 ${v.y + 17} 768 ${v.y + 17}" marker-end="url(#arr)"/>`).join('');
  return `<div class="table-wrap"><svg viewBox="0 0 900 250" role="img" aria-label="${esc(t('about.archTitle'))}" style="min-width:680px">
    <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#7d7a72"/></marker>
      <marker id="arr2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#6b3f22"/></marker></defs>
    ${boxes.map(box).join('')}${arrows}
    ${vs}
    <path class="arrow loop" d="M830 184 V222 H75 V154" marker-end="url(#arr2)"/>
    <text class="s" x="450" y="240" text-anchor="middle" fill="#6b3f22">${esc(t('arch.loop'))}</text>
  </svg></div>`;
}
