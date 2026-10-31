// Loading, aggregation and statistics. No DOM access, so it can be tested in Node.
import * as E from './econ.js';

const FILES = ['regions', 'zones', 'samples', 'network', 'meta'];

export async function loadData(base = 'data/') {
  const raw = {};
  await Promise.all(FILES.map(async (f) => {
    const res = await fetch(`${base}${f}.json`);
    if (!res.ok) throw new Error(`Could not load ${f}.json (${res.status})`);
    raw[f] = await res.json();
  }));
  return prepare(raw);
}

export function prepare(raw) {
  const { regions, zones, samples, network, meta } = raw;
  const campaigns = network.campaigns;
  const fields = Object.keys(samples);
  const n = samples.zone.length;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = { i };
    for (const f of fields) r[f] = samples[f][i];
    const c = campaigns[r.camp];
    r.iso = c.iso;
    r.tier = c.tier;
    r.lab = c.lab;
    rows[i] = r;
  }
  const admins = network.adminStats.map((a) => ({
    ...a,
    feature: regions.admin1.features.find((f) => f.properties.i === a.i),
  }));
  const zoneDefs = zones.zones;
  const props = Object.fromEntries(meta.properties.map((p) => [p.key, p]));
  return {
    regions, zones, meta, network, campaigns, rows, admins, zoneDefs, props,
    members: network.members, labs: network.labs,
    byZone: groupBy(rows, (r) => r.zone),
    byAdmin: groupBy(rows, (r) => r.admin),
    _econ: null,
  };
}

export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// ---------------------------------------------------------------- stats

export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (h - lo);
}

export function describe(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { n: v.length, median: quantile(v, 0.5), q10: quantile(v, 0.1), q25: quantile(v, 0.25),
    q75: quantile(v, 0.75), q90: quantile(v, 0.9), values: v };
}

// Wilson score interval (90% by default) for a proportion.
export function wilson(k, n, z = 1.645) {
  if (!n) return { p: NaN, lo: NaN, hi: NaN };
  const p = k / n;
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export const MIN_N = 10; // fewer samples than this: shown as "too few samples"

// ---------------------------------------------------------------- soil classes

// Five classes relative to the critical level, so every property is read the
// same way: below critical on the red arm, adequate on the blue arm.
export const REL_BREAKS = [0.5, 0.8, 1.25, 2];
export const PH_BREAKS = [5.0, 5.5, 7.0, 7.5];

export function soilClass(D, key, value) {
  if (!Number.isFinite(value)) return -1;
  if (key === 'ph') return bisect(PH_BREAKS, value);
  const t = D.meta.thresholds[key];
  if (!t || t.low == null) return null; // no interpretation threshold
  return bisect(REL_BREAKS, value / t.low);
}

function bisect(breaks, v) {
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return i;
}

export function hasThreshold(D, key) {
  return key === 'ph' || (D.meta.thresholds[key] && D.meta.thresholds[key].low != null);
}

export function isBelow(D, key, v) {
  if (key === 'ph') return v < D.meta.thresholds.ph.low;
  return v < D.meta.thresholds[key].low;
}

// ---------------------------------------------------------------- economics

export function econFor(D, opts) {
  const key = JSON.stringify(opts);
  if (D._econ && D._econ.key === key) return D._econ;
  const national = E.BLENDS.find((b) => b.national);
  const blends = {};
  for (const [z, rs] of D.byZone) if (z >= 1) blends[z] = E.bestBlend(rs, opts);
  const nat = new Array(D.rows.length);
  const zb = new Array(D.rows.length);
  for (const r of D.rows) {
    nat[r.i] = E.evaluate(r, national, opts);
    zb[r.i] = E.evaluate(r, blends[r.zone], opts);
  }
  D._econ = { key, opts, national, blends, nat, zb };
  return D._econ;
}

// Summary of a set of samples: soil statistics plus economic results.
export function summarise(D, rows, econ) {
  const out = { n: rows.length, harmonised: rows.filter((r) => r.h).length, soil: {} };
  out.located = rows.filter((r) => r.lon != null).length;
  out.labs = [...new Set(rows.map((r) => r.lab))].sort();
  out.countries = [...new Set(rows.map((r) => r.iso))];
  for (const p of D.meta.properties) {
    const d = describe(rows.map((r) => r[p.key]));
    if (hasThreshold(D, p.key)) {
      const k = rows.filter((r) => isBelow(D, p.key, r[p.key])).length;
      d.below = wilson(k, rows.length);
    }
    out.soil[p.key] = d;
  }
  if (econ && rows.length) {
    const nat = rows.map((r) => econ.nat[r.i]);
    const zb = rows.map((r) => econ.zb[r.i]);
    const thr = econ.opts.vcrThreshold;
    out.econ = {
      vcrNat: describe(nat.map((e) => e.vcr)),
      vcrZb: describe(zb.map((e) => e.vcr)),
      gainNat: describe(nat.map((e) => e.gain)),
      gainZb: describe(zb.map((e) => e.gain)),
      y0: describe(nat.map((e) => e.y0)),
      payNat: wilson(nat.filter((e) => e.vcr >= thr).length, rows.length),
      payZb: wilson(zb.filter((e) => e.vcr >= thr).length, rows.length),
      limiting: shares(nat.map((e) => e.limitingBefore)),
      limitingAfter: shares(nat.map((e) => e.limitingAfter)),
      // agronomic efficiency: kg grain per kg of N+P2O5+K2O applied
      aeNat: describe(nat.map((e) => (e.gain * 1000) / (e.rate * (econ.national.n + econ.national.p + econ.national.k) / 100))),
    };
  }
  return out;
}

export function shares(list) {
  const c = {};
  for (const x of list) c[x] = (c[x] || 0) + 1;
  const n = list.length;
  return Object.entries(c).map(([k, v]) => ({ key: k, n: v, p: v / n })).sort((a, b) => b.n - a.n);
}

// Area where fertilizer pays, scaled up from samples to cropland. Each
// region x zone cell uses its own samples when it has enough, otherwise the
// country's samples in that zone, otherwise the whole zone's.
export function policy(D, econ, filter = {}) {
  const thr = econ.opts.vcrThreshold;
  const tot = { cropHa: 0, households: 0, nat: acc(), zb: acc() };
  for (const a of D.admins) {
    if (filter.iso && a.iso !== filter.iso) continue;
    if (filter.admin != null && a.i !== filter.admin) continue;
    for (const zz of a.zones) {
      if (zz.zone < 1) continue;
      if (filter.zone != null && zz.zone !== filter.zone) continue;
      const crop = E.CROPS[zz.zone];
      const ha = zz.croplandHa * crop.cropShare;
      const hh = zz.households * crop.cropShare;
      let rs = (D.byAdmin.get(a.i) || []).filter((r) => r.zone === zz.zone);
      if (rs.length < 8) rs = (D.byZone.get(zz.zone) || []).filter((r) => r.iso === a.iso);
      if (rs.length < 8) rs = D.byZone.get(zz.zone) || [];
      if (!rs.length) continue;
      tot.cropHa += ha;
      tot.households += hh;
      for (const [k, list] of [['nat', econ.nat], ['zb', econ.zb]]) {
        const ev = rs.map((r) => list[r.i]);
        const pay = ev.filter((e) => e.vcr >= thr);
        const w = wilson(pay.length, ev.length);
        const meanGain = pay.length ? pay.reduce((s, e) => s + e.gain, 0) / pay.length : 0;
        tot[k].ha += ha * w.p;
        tot[k].lo += ha * w.lo;
        tot[k].hi += ha * w.hi;
        tot[k].grainT += ha * w.p * meanGain;
        tot[k].households += hh * w.p;
      }
    }
  }
  return tot;
}

function acc() { return { ha: 0, lo: 0, hi: 0, grainT: 0, households: 0 }; }

// Cropland and household totals for a unit, from the regional statistics.
export function landStats(D, filter = {}) {
  let area = 0, crop = 0, hh = 0;
  for (const a of D.admins) {
    if (filter.admin != null && a.i !== filter.admin) continue;
    if (filter.iso && a.iso !== filter.iso) continue;
    for (const zz of a.zones) {
      if (filter.zone != null && zz.zone !== filter.zone) continue;
      area += zz.areaKm2;
      crop += zz.croplandHa;
      hh += zz.households;
    }
  }
  return { areaKm2: area, croplandHa: crop, households: hh,
    cropShare: area ? crop / (area * 100) : NaN, hhDensity: area ? hh / area : NaN };
}

// The zone holding most of a region's cropland.
export function mainZone(D, adminIdx) {
  const a = D.admins[adminIdx];
  const zs = a.zones.filter((z) => z.zone >= 1).sort((x, y) => y.croplandHa - x.croplandHa);
  return zs.length ? zs[0].zone : null;
}

// Rows visible as points to the current viewer.
export function pointVisible(r, viewer) {
  if (r.lon == null) return false;
  return r.tier === 'open' || (viewer === 'member' && r.tier === 'members');
}

export function embargoed(D, filter = {}) {
  return D.campaigns.filter((c) => c.tier === 'embargo' && (!filter.iso || c.iso === filter.iso)
    && (filter.admin == null || c.admins.includes(filter.admin)));
}
