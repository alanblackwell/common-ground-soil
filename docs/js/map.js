// The shared map: zones, regions, country borders and sample points, drawn
// in SVG with D3. The same component serves every lens and aggregation unit.
import { ZONE_COLORS, hideTip, moveTip, showTip } from './ui.js';
import { lang } from './i18n.js';

const d3 = window.d3;
const W = 900;

// d3-geo wants clockwise exterior rings; some sources use the opposite.
function rewindFeature(f) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    if (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI) {
      for (const ring of poly) ring.reverse();
    }
  }
  return f;
}

let prepared = null;
function prepareGeometry(D) {
  if (prepared && prepared.D === D) return prepared;
  D.regions.countries.features.forEach(rewindFeature);
  D.regions.admin1.features.forEach(rewindFeature);
  const members = D.regions.countries.features.filter((f) => f.properties.member);
  const neighbours = D.regions.countries.features.filter((f) => !f.properties.member);
  const fc = { type: 'FeatureCollection', features: members };
  const projection = d3.geoConicEqualArea().parallels([8, 18]).rotate([-2, 0]).fitWidth(W - 20, fc);
  const path = d3.geoPath(projection);
  const [[, y0], [, y1]] = path.bounds(fc);
  const H = Math.ceil(y1 - y0 + 24);
  projection.fitExtent([[10, 12], [W - 10, H - 12]], fc);

  // Zone polygons from the zone grid, traced with d3.contours.
  const g = D.zones.grid;
  const codes = new Uint8Array(g.w * g.h);
  g.rows.forEach((row, r) => { for (let c = 0; c < g.w; c++) codes[r * g.w + c] = row.charCodeAt(c) - 48; });
  const contour = d3.contours().size([g.w, g.h]).thresholds([0.5]);
  const zonePaths = {};
  for (let z = 0; z <= 5; z++) {
    const bin = new Float32Array(codes.length);
    for (let k = 0; k < codes.length; k++) bin[k] = codes[k] === z ? 1 : 0;
    const geom = contour(bin)[0];
    let s = '';
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        ring.forEach(([x, y], j) => {
          const p = projection([g.x0 + x * g.dx, g.y0 + y * g.dy]);
          s += (j ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        });
        s += 'Z';
      }
    }
    zonePaths[z] = s;
  }
  prepared = { D, projection, path, H, members, neighbours, zonePaths };
  return prepared;
}

const LABELS = [
  // [iso or name, lon, lat, member]
  ['MLI', -3.2, 17.2, true], ['NER', 9.6, 17.4, true], ['NGA', 8.3, 9.4, true],
  ['BFA', -1.6, 12.6, true], ['GHA', -1.2, 7.3, true], ['BEN', 2.3, 9.9, true],
  ['TGO', 0.95, 8.4, false], ['CIV', -5.6, 7.6, false], ['GIN', -10.6, 10.6, false],
  ['CMR', 12.6, 6.0, false], ['TCD', 15.4, 15.0, false], ['MRT', -10.5, 20.5, false],
  ['DZA', 3.0, 24.4, false],
];

export function createMap(container, D, { onSelect } = {}) {
  const G = prepareGeometry(D);
  const { path, projection, H } = G;
  container.innerHTML = '';
  const wrap = d3.select(container).append('div').attr('class', 'map-wrap');
  const svg = wrap.append('svg').attr('class', 'map-svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img');
  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id', 'hatch').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#f4f2ec');
  pat.append('rect').attr('width', 2).attr('height', 6).attr('fill', '#d9d6cd');
  defs.append('clipPath').attr('id', 'members-clip').selectAll('path').data(G.members)
    .join('path').attr('d', path);

  const root = svg.append('g');
  const gBase = root.append('g');
  const gZoneUnits = root.append('g').attr('clip-path', 'url(#members-clip)');
  const gVeil = root.append('g');
  const gAdmin = root.append('g');
  const gAdminLines = root.append('g');
  const gCountry = root.append('g');
  const gPoints = root.append('g');
  const gSel = root.append('g');
  const gLabels = root.append('g');

  for (let z = 0; z <= 5; z++) {
    gBase.append('path').attr('class', 'zone-base').attr('d', G.zonePaths[z])
      .attr('fill', ZONE_COLORS[z]).attr('fill-rule', 'evenodd');
  }
  gVeil.selectAll('path').data(G.neighbours).join('path').attr('class', 'veil').attr('d', path);
  gAdminLines.selectAll('path').data(D.regions.admin1.features).join('path')
    .attr('class', 'admin-line').attr('d', path);
  gCountry.selectAll('path').data(D.regions.countries.features).join('path')
    .attr('class', 'country-line').attr('d', path)
    .attr('stroke-opacity', (f) => (f.properties.member ? 1 : 0.35))
    .attr('stroke-width', (f) => (f.properties.member ? 1.3 : 0.8));

  let k = 1;
  // the wheel scrolls the page unless Ctrl/⌘ is held (trackpad pinch sets ctrlKey)
  const zoom = d3.zoom().scaleExtent([1, 10]).translateExtent([[0, 0], [W, H]])
    .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
    .on('zoom', (e) => {
      k = e.transform.k;
      root.attr('transform', e.transform);
      gPoints.selectAll('circle').attr('r', pointR());
      gLabels.selectAll('text').attr('font-size', (d) => (d[3] ? 12 : 11) / k);
    });
  svg.call(zoom).on('dblclick.zoom', null);
  const pointR = () => 2.8 / Math.sqrt(k);

  const actions = wrap.append('div').attr('class', 'map-actions');
  actions.append('button').attr('aria-label', 'Zoom in').text('+')
    .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.6));
  actions.append('button').attr('aria-label', 'Zoom out').text('−')
    .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6));
  actions.append('button').attr('aria-label', 'Reset view').text('⟲')
    .on('click', () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity));

  function bindTip(sel, tipFn) {
    sel.on('pointerenter', (e, d) => { const c = tipFn(d); if (c) showTip(c, e); })
      .on('pointermove', moveTip)
      .on('pointerleave', hideTip);
  }

  function zoomTo(feature) {
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    const s = Math.min(6, 0.8 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(s).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(500).call(zoom.transform, t);
  }

  // spec: { mode: 'zones'|'zoneValues'|'admin'|'samples', zoneFill, adminFill,
  //         points, pointFill, tipZone, tipAdmin, tipPoint, selection, ariaLabel }
  function update(spec) {
    svg.attr('aria-label', spec.ariaLabel || '');
    const zoneMode = spec.mode === 'zones' || spec.mode === 'zoneValues';
    gBase.attr('opacity', spec.mode === 'samples' ? 0.55 : 1);

    const zones = zoneMode ? [1, 2, 3, 4, 5] : [];
    const zu = gZoneUnits.selectAll('path').data(zones, (z) => z).join('path')
      .attr('class', 'unit').attr('d', (z) => G.zonePaths[z]).attr('fill-rule', 'evenodd')
      .attr('fill', (z) => spec.zoneFill(z))
      .on('click', (e, z) => onSelect && onSelect({ type: 'zone', id: z }));
    bindTip(zu, (z) => spec.tipZone && spec.tipZone(z));

    // in sample mode regions stay clickable but are drawn transparent
    const admins = spec.mode === 'admin' || spec.mode === 'samples' ? D.regions.admin1.features : [];
    const au = gAdmin.selectAll('path').data(admins, (f) => f.properties.i).join('path')
      .attr('class', 'unit').attr('d', path)
      .attr('fill', (f) => (spec.mode === 'samples' ? 'transparent' : spec.adminFill(f.properties.i)))
      .on('click', (e, f) => onSelect && onSelect({ type: 'admin', id: f.properties.i }));
    bindTip(au, (f) => spec.mode === 'admin' && spec.tipAdmin && spec.tipAdmin(f.properties.i));

    const pts = spec.points || [];
    const pu = gPoints.selectAll('circle').data(pts, (r) => r.i).join('circle')
      .attr('class', 'pt')
      .attr('cx', (r) => projection([r.lon, r.lat])[0])
      .attr('cy', (r) => projection([r.lon, r.lat])[1])
      .attr('r', pointR())
      .attr('fill', (r) => spec.pointFill(r));
    bindTip(pu, (r) => spec.tipPoint && spec.tipPoint(r));

    let selGeom = null;
    if (spec.selection && spec.selection.type === 'admin') {
      selGeom = D.regions.admin1.features.find((f) => f.properties.i === spec.selection.id);
      gSel.selectAll('path').data(selGeom ? [selGeom] : []).join('path').attr('class', 'sel').attr('d', path);
    } else if (spec.selection && spec.selection.type === 'zone') {
      gSel.selectAll('path').data([spec.selection.id]).join('path').attr('class', 'sel')
        .attr('d', (z) => G.zonePaths[z]).attr('clip-path', 'url(#members-clip)');
    } else {
      gSel.selectAll('path').remove();
    }

    const names = Object.fromEntries(D.regions.countries.features.map((f) => [f.properties.iso, f.properties[lang()] || f.properties.en]));
    gLabels.selectAll('text').data(LABELS.filter((l) => names[l[0]]), (d) => d[0]).join('text')
      .attr('class', (d) => `label${d[3] ? '' : ' neighbour-label'}`)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => (d[3] ? 12 : 11) / k)
      .attr('x', (d) => projection([d[1], d[2]])[0])
      .attr('y', (d) => projection([d[1], d[2]])[1])
      .text((d) => names[d[0]]);
  }

  return { update, zoomTo, svg };
}
