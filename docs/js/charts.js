// Small SVG charts used in panels and views. Thin marks, hairline axes,
// hover tooltips; every chart has its numbers available in text or a table.
import { esc, hideTip, moveTip, num, showTip, ttRows } from './ui.js';

const d3 = window.d3;

// Deterministic jitter so dots do not move between renders.
const jitter = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

// Strip plot: one row per series of sample values, with the 10-90% range,
// median tick and an optional reference line (critical level, VCR = 2).
export function strips(container, { rows, ref, log = false, unit = '', digits = 1, width = 420 }) {
  const rowH = 46, m = { t: 18, r: 14, b: 30, l: 112 };
  const h = m.t + m.b + rows.length * rowH;
  const all = rows.flatMap((r) => r.values).filter((v) => Number.isFinite(v) && (!log || v > 0));
  if (!all.length) { container.innerHTML = ''; return; }
  let [lo, hi] = d3.extent(all.concat(ref ? [ref.value] : []));
  if (log) { lo = Math.max(lo, 0.01); }
  const x = (log ? d3.scaleLog() : d3.scaleLinear()).domain([lo, hi]).nice().range([m.l, width - m.r]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${h}`).attr('role', 'img')
    .attr('aria-label', rows.map((r) => `${r.label}: median ${num(d3.median(r.values), digits)} ${unit}`).join('; '));
  svg.append('g').attr('class', 'axis grid').attr('transform', `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(5, log ? '~g' : undefined).tickSize(-(h - m.t - m.b)))
    .call((g) => g.select('.domain').remove());
  rows.forEach((r, j) => {
    const y = m.t + j * rowH + rowH / 2;
    const g = svg.append('g');
    const v = r.values.filter((d) => Number.isFinite(d) && (!log || d > 0)).sort((a, b) => a - b);
    const q = (p) => d3.quantile(v, p);
    g.append('text').attr('x', 0).attr('y', y).attr('dy', '0.32em').attr('font-size', 12)
      .attr('fill', 'var(--ink)').text(r.label);
    // sample dots, capped for legibility
    const step = Math.max(1, Math.floor(v.length / 400));
    g.selectAll('circle').data(v.filter((_, i) => i % step === 0)).join('circle')
      .attr('cx', (d) => x(d)).attr('cy', (d, i) => y - 12 + 24 * jitter(i + j * 997))
      .attr('r', 2).attr('fill', r.color).attr('fill-opacity', 0.45);
    g.append('line').attr('x1', x(q(0.1))).attr('x2', x(q(0.9))).attr('y1', y + 17).attr('y2', y + 17)
      .attr('stroke', 'var(--ink-2)').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    g.append('line').attr('x1', x(q(0.5))).attr('x2', x(q(0.5))).attr('y1', y - 15).attr('y2', y + 19)
      .attr('stroke', 'var(--ink)').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    // hover target covering the whole row
    g.append('rect').attr('x', m.l).attr('width', width - m.l - m.r).attr('y', y - rowH / 2).attr('height', rowH)
      .attr('fill', 'transparent')
      .on('pointerenter', (e) => showTip(ttRows(r.label, [
        ['n', num(v.length)], ['Median', `${num(q(0.5), digits)} ${unit}`],
        ['10–90%', `${num(q(0.1), digits)} – ${num(q(0.9), digits)}`],
        ...(r.extra || []),
      ]), e))
      .on('pointermove', moveTip).on('pointerleave', hideTip);
  });
  if (ref) {
    svg.append('line').attr('class', 'ref-line').attr('x1', x(ref.value)).attr('x2', x(ref.value))
      .attr('y1', m.t - 6).attr('y2', h - m.b);
    svg.append('text').attr('class', 'ref-label').attr('x', x(ref.value) + 4).attr('y', m.t - 6)
      .attr('dy', '0.7em').text(ref.label);
  }
  svg.append('text').attr('class', 'ref-label').attr('x', width - m.r).attr('y', h - 2)
    .attr('text-anchor', 'end').text(unit);
  container.innerHTML = '';
  container.append(svg.node());
}

// Range rows: for each category, two series shown as 10-90% bars with a
// median dot, offset vertically. Used for VCR by zone.
export function rangeRows(container, { cats, series, ref, domain, label, width = 640, digits = 1 }) {
  const rowH = 54, m = { t: 22, r: 16, b: 34, l: 240 };
  const h = m.t + m.b + cats.length * rowH;
  const x = d3.scaleLinear().domain(domain).nice().range([m.l, width - m.r]).clamp(true);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${h}`).attr('role', 'img').attr('aria-label', label);
  svg.append('g').attr('class', 'axis grid').attr('transform', `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-(h - m.t - m.b)))
    .call((g) => g.select('.domain').remove());
  svg.append('text').attr('class', 'ref-label').attr('x', width - m.r).attr('y', h - 2)
    .attr('text-anchor', 'end').text(label);
  cats.forEach((c, j) => {
    const y0 = m.t + j * rowH;
    svg.append('text').attr('x', 0).attr('y', y0 + rowH / 2).attr('dy', '0.32em').attr('font-size', 12)
      .attr('fill', 'var(--ink)').text(c.label);
    if (c.sub) {
      svg.append('text').attr('x', 0).attr('y', y0 + rowH / 2 + 15).attr('font-size', 11)
        .attr('fill', 'var(--muted)').text(c.sub);
    }
    series.forEach((s, k) => {
      const d = c.values[s.key];
      if (!d) return;
      const y = y0 + 16 + k * 20;
      const g = svg.append('g');
      g.append('line').attr('x1', x(d.q10)).attr('x2', x(d.q90)).attr('y1', y).attr('y2', y)
        .attr('stroke', s.color).attr('stroke-width', 4).attr('stroke-linecap', 'round').attr('stroke-opacity', 0.45);
      g.append('circle').attr('cx', x(d.median)).attr('cy', y).attr('r', 5)
        .attr('fill', s.color).attr('stroke', '#fff').attr('stroke-width', 2);
      g.append('rect').attr('x', m.l).attr('width', width - m.l - m.r).attr('y', y - 10).attr('height', 20)
        .attr('fill', 'transparent')
        .on('pointerenter', (e) => showTip(ttRows(`${c.label} · ${s.label}`, [
          ['Median', num(d.median, digits)], ['10–90%', `${num(d.q10, digits)} – ${num(d.q90, digits)}`],
          ...(c.extra ? c.extra(s.key) : []),
        ]), e))
        .on('pointermove', moveTip).on('pointerleave', hideTip);
    });
  });
  if (ref) {
    svg.append('line').attr('class', 'ref-line').attr('x1', x(ref.value)).attr('x2', x(ref.value))
      .attr('y1', m.t - 8).attr('y2', h - m.b);
    svg.append('text').attr('class', 'ref-label').attr('x', x(ref.value) + 4).attr('y', m.t - 10)
      .attr('dy', '0.7em').text(ref.label);
  }
  container.innerHTML = '';
  container.append(svg.node());
}

// Horizontal 100% stacked bars (e.g. limiting nutrient by zone).
export function stackRows(container, { cats, keys, colors, names, label, width = 640 }) {
  const rowH = 30, m = { t: 6, r: 10, b: 24, l: 240 };
  const h = m.t + m.b + cats.length * rowH;
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, width - m.r]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${h}`).attr('role', 'img').attr('aria-label', label);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(5, '%')).call((g) => g.select('.domain').remove());
  cats.forEach((c, j) => {
    const y = m.t + j * rowH + 4;
    svg.append('text').attr('x', 0).attr('y', y + 10).attr('dy', '0.32em').attr('font-size', 12)
      .attr('fill', 'var(--ink)').text(c.label);
    let acc = 0;
    for (const k of keys) {
      const p = c.shares[k] || 0;
      if (p <= 0) continue;
      const x0 = x(acc), x1 = x(acc + p);
      acc += p;
      svg.append('rect').attr('x', x0 + 1).attr('width', Math.max(0, x1 - x0 - 2)).attr('y', y).attr('height', 20)
        .attr('rx', 3).attr('fill', colors[k])
        .on('pointerenter', (e) => showTip(ttRows(c.label, [[names[k], `${num(p * 100)} %`]]), e))
        .on('pointermove', moveTip).on('pointerleave', hideTip);
      if (x1 - x0 > 34) {
        svg.append('text').attr('x', (x0 + x1) / 2).attr('y', y + 10).attr('dy', '0.32em')
          .attr('text-anchor', 'middle').attr('font-size', 11).attr('pointer-events', 'none')
          .attr('fill', '#fff').text(`${num(p * 100)}%`);
      }
    }
  });
  container.innerHTML = '';
  container.append(svg.node());
}

// Vertical stacked bars by year (e.g. samples contributed by member).
export function yearBars(container, { years, keys, values, colors, names, label, width = 640 }) {
  const m = { t: 10, r: 10, b: 26, l: 44 }, h = 220;
  const x = d3.scaleBand().domain(years).range([m.l, width - m.r]).padding(0.2);
  const totals = years.map((y) => keys.reduce((s, k) => s + (values[y][k] || 0), 0));
  const yS = d3.scaleLinear().domain([0, d3.max(totals) || 1]).nice().range([h - m.b, m.t]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${h}`).attr('role', 'img').attr('aria-label', label);
  svg.append('g').attr('class', 'axis grid').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(yS).ticks(4).tickSize(-(width - m.l - m.r))).call((g) => g.select('.domain').remove());
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).tickValues(years.filter((y, i) => i % 2 === 0 || years.length < 10)))
    .call((g) => g.select('.domain').attr('stroke', 'var(--axis)'));
  years.forEach((yr, i) => {
    let acc = 0;
    keys.forEach((k) => {
      const v = values[yr][k] || 0;
      if (!v) return;
      const y1 = yS(acc), y0 = yS(acc + v);
      acc += v;
      svg.append('rect').attr('x', x(yr)).attr('width', x.bandwidth()).attr('y', y0)
        .attr('height', Math.max(0, y1 - y0 - 2)).attr('fill', colors[k])
        .on('pointerenter', (e) => showTip(ttRows(String(yr), keys.filter((kk) => values[yr][kk])
          .map((kk) => [names[kk], num(values[yr][kk])]).concat([['Total', num(totals[i])]])), e))
        .on('pointermove', moveTip).on('pointerleave', hideTip);
    });
  });
  container.innerHTML = '';
  container.append(svg.node());
}

// Proficiency-test timeline for one lab: one mark per round, status by |z|.
export function ptTimeline(rounds, { from = 2019, to = 2026, width = 260 } = {}) {
  const h = 26, m = { l: 4, r: 4 };
  const x = d3.scaleLinear().domain([from, to + 1]).range([m.l, width - m.r]);
  const pos = (r) => { const [y, half] = r.round.split('-').map(Number); return y + (half - 0.5) / 2; };
  const status = (z) => { const a = Math.max(...Object.values(z).map(Math.abs)); return a < 2 ? 'good' : a < 3 ? 'warning' : 'critical'; };
  const shape = { good: 'circle', warning: 'triangle', critical: 'cross' };
  const fill = { good: 'var(--good)', warning: 'var(--warning)', critical: 'var(--critical)' };
  const marks = rounds.map((r) => {
    const s = status(r.z), cx = x(pos(r)), cy = h / 2;
    const title = esc(`${r.round}: ${Object.entries(r.z).map(([k, v]) => `${k} z=${num(v, 1)}`).join(', ')}`);
    const sym = d3.symbol().type({ circle: d3.symbolCircle, triangle: d3.symbolTriangle, cross: d3.symbolCross }[shape[s]]).size(48)();
    return `<path d="${sym}" transform="translate(${cx},${cy})" fill="${fill[s]}"><title>${title}</title></path>`;
  }).join('');
  const ticks = d3.range(from, to + 1).map((y) => `<line x1="${x(y)}" x2="${x(y)}" y1="${h - 4}" y2="${h}" stroke="var(--axis)"/>`).join('');
  return `<svg viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-label="Proficiency test rounds">${ticks}<line x1="${m.l}" x2="${width - m.r}" y1="${h - 2}" y2="${h - 2}" stroke="var(--axis)"/>${marks}</svg>`;
}
