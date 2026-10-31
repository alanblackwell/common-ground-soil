// Stylised fertilizer-response and economics model. Illustrative only: the
// parameters are plausible for West African smallholder systems but are not
// calibrated against trial data, and the demonstrator says so.
//
// Each soil test value is turned into a supply index r (1 = enough for the
// attainable yield). Fertilizer raises r. Yield follows a Mitscherlich curve
// in the most limiting nutrient (Liebig's law of the minimum), softened so
// that a second nutrient close to limiting also holds yield back.

export const NUTRIENTS = ['n', 'p', 'k', 's', 'zn'];

// Soil test value at which the supply index is 1.
export const REFERENCE = { n: 2.0, p: 18, k: 0.3, s: 10, zn: 1.2 };

// kg of nutrient per ha that raise the supply index by 1 (includes recovery).
// N as N, P as P2O5, K as K2O, S and Zn as elements.
export const DOSE_PER_INDEX = { n: 75, p: 40, k: 60, s: 18, zn: 4 };

const MITSCHERLICH = 1.6;
const SOFT_MIN = 8; // higher = closer to a strict minimum
const response = (r) => 1 - Math.exp(-MITSCHERLICH * r);

// Water-limited attainable yield (t/ha) and grain price (USD/kg) by zone.
export const CROPS = {
  1: { crop: 'millet', ymax: 1.6, price: 0.38, cropShare: 0.45 },
  2: { crop: 'sorghum', ymax: 2.6, price: 0.32, cropShare: 0.35 },
  3: { crop: 'maize', ymax: 4.6, price: 0.30, cropShare: 0.35 },
  4: { crop: 'maize', ymax: 4.0, price: 0.30, cropShare: 0.30 },
  5: { crop: 'maize', ymax: 3.4, price: 0.30, cropShare: 0.20 },
};

// Illustrative formulations. Grades are % N, % P2O5, % K2O, % S, % Zn.
export const BLENDS = [
  { id: 'npk201010', label: 'NPK 20:10:10', n: 20, p: 10, k: 10, s: 0, zn: 0, national: true },
  { id: 'npk151515', label: 'NPK 15:15:15', n: 15, p: 15, k: 15, s: 0, zn: 0 },
  { id: 'b23105s', label: 'NPK 23:10:5 + 3S + 0.5Zn', n: 23, p: 10, k: 5, s: 3, zn: 0.5 },
  { id: 'b201206s', label: 'NPK 20:12:6 + 4S + 1Zn', n: 20, p: 12, k: 6, s: 4, zn: 1 },
  { id: 'b142012s', label: 'NPK 14:20:12 + 5S + 1Zn', n: 14, p: 20, k: 12, s: 5, zn: 1 },
  { id: 'b25105s', label: 'NPK 25:10:5 + 5S', n: 25, p: 10, k: 5, s: 5, zn: 0 },
];

// Price per kg of product: a base cost (manufacture, bagging, transport)
// plus the value of each nutrient. Calibrated so NPK 20:10:10 costs the
// default national price.
export const NUTRIENT_COST = { n: 1.25, p: 1.45, k: 0.9, s: 0.6, zn: 6.0 }; // USD per kg nutrient
const BASE_COST = 0.31;

export function blendPrice(blend, nationalPrice) {
  const raw = (b) => BASE_COST + NUTRIENTS.reduce((acc, k) => acc + (b[k] / 100) * NUTRIENT_COST[k], 0);
  const national = BLENDS.find((b) => b.national);
  return raw(blend) * (nationalPrice / raw(national));
}

// Typical application rates (kg product per ha): micro-dosing in the Sahel,
// moderate in the Sudanian zone, full rates for maize further south.
export const ZONE_RATES = { 1: 60, 2: 100, 3: 200, 4: 200, 5: 150 };

export const DEFAULTS = {
  rateFactor: 1,       // multiplier on ZONE_RATES
  nationalPrice: 0.8,  // USD per kg of NPK 20:10:10
  grainPriceFactor: 1, // multiplier on the zone grain prices
  vcrThreshold: 2,
};

function supply(sample) {
  const r = {};
  for (const k of NUTRIENTS) r[k] = Math.max(sample[k], 0) / REFERENCE[k];
  return r;
}

export function yieldOf(r, zone) {
  let worst = Infinity, limiting = null, acc = 0;
  for (const k of NUTRIENTS) {
    const f = Math.max(response(r[k]), 1e-3);
    acc += f ** -SOFT_MIN;
    if (f < worst) { worst = f; limiting = k; }
  }
  const soft = (acc / NUTRIENTS.length) ** (-1 / SOFT_MIN);
  return { y: CROPS[zone].ymax * soft, limiting };
}

// Evaluate one sample under one blend at the given settings.
export function evaluate(sample, blend, opts = DEFAULTS) {
  const zone = sample.zone;
  const c = CROPS[zone];
  const r0 = supply(sample);
  const rate = ZONE_RATES[zone] * opts.rateFactor;
  // acidity penalty below pH 5.2 (aluminium toxicity); lime, not NPK, fixes it
  const acid = sample.ph < 5.2 ? Math.max(0.6, 1 - 0.4 * (5.2 - sample.ph)) : 1;
  const base = yieldOf(r0, zone);
  const r1 = {};
  for (const k of NUTRIENTS) r1[k] = r0[k] + (rate * blend[k] / 100) / DOSE_PER_INDEX[k];
  const fert = yieldOf(r1, zone);
  const y0 = base.y * acid, y1 = fert.y * acid;
  const gain = y1 - y0;                                   // t/ha
  const cost = rate * blendPrice(blend, opts.nationalPrice); // USD/ha
  const value = gain * 1000 * c.price * opts.grainPriceFactor;    // USD/ha
  return {
    y0, y1, gain, cost, value, vcr: value / cost,
    limitingBefore: base.limiting, limitingAfter: fert.limiting,
    gap: c.ymax - y0, rate,
  };
}

// For a set of samples in one zone, pick the blend with the highest
// median value-cost ratio. This is the "use the Hub's data to choose a
// blend" step.
export function bestBlend(samples, opts = DEFAULTS) {
  let best = null;
  for (const b of BLENDS) {
    const v = samples.map((s) => evaluate(s, b, opts).vcr).sort((a, z) => a - z);
    const med = v[Math.floor(v.length / 2)];
    if (!best || med > best.median) best = { blend: b, median: med };
  }
  return best.blend;
}
