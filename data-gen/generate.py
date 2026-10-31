"""Generate the synthetic Hub dataset for the demonstrator.

Run fetch.py first. Output goes to ../docs/data/ as compact JSON, and a
plain-text sanity summary to data-gen/summary.txt.

What is real and what is invented:
  - Real: national and first-level boundaries; annual and dry-season rainfall
    (WorldClim), used to delimit approximate agro-ecological zones; mapped soil pH, SOC,
    total N, CEC, clay and sand (SoilGrids, 0-30 cm weighted to 0-20 cm),
    used as the expected value at each synthetic sample location.
  - Invented: every sample, campaign, laboratory, proficiency-test result
    and data-sharing arrangement; field-level variation around the mapped
    values; extractable P, K, Zn, S and B (modelled from the mapped
    properties, not taken from any map); cropland and household figures.
"""
import datetime
import json
import os

import numpy as np

from fetch import BBOX, CACHE, COUNTRIES, DEPTHS, RES, SOIL_PROPS
from tiffread import read_geotiff

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'docs', 'data')
SEED = 20261031
CURRENT_YEAR = 2026

COUNTRY_NAMES = {
    'NGA': ('Nigeria', 'Nigéria'), 'NER': ('Niger', 'Niger'), 'BEN': ('Benin', 'Bénin'),
    'GHA': ('Ghana', 'Ghana'), 'BFA': ('Burkina Faso', 'Burkina Faso'), 'MLI': ('Mali', 'Mali'),
}
NAME_FIXES = {
    ('BEN', 'Atlanique'): 'Atlantique', ('BEN', 'Oueme'): 'Ouémé',
    ('MLI', 'Koulikouro'): 'Koulikoro', ('MLI', 'Segou'): 'Ségou',
    ('NER', 'Tillaberi'): 'Tillabéri',
    ('NGA', 'Abuja Federal Capital Territory'): 'Federal Capital Territory',
}

# Approximate agro-ecological zones from mean annual rainfall, with humid
# forest distinguished from derived savanna by a short dry season (rainfall
# of the driest quarter), since Ghana's forest belt receives only 1250-1500
# mm. Coastal savanna (the Accra plains and the Dahomey Gap) is drier than
# its latitude suggests, so it is grouped with the derived savanna.
ZONES = [
    {'id': 0, 'key': 'saharan', 'en': 'Saharan', 'fr': 'Saharienne',
     'rain': '< 250 mm', 'crop': None},
    {'id': 1, 'key': 'sahelian', 'en': 'Sahelian', 'fr': 'Sahélienne',
     'rain': '250–550 mm', 'crop': 'millet'},
    {'id': 2, 'key': 'sudanian', 'en': 'Sudanian savanna', 'fr': 'Savane soudanienne',
     'rain': '550–900 mm', 'crop': 'sorghum'},
    {'id': 3, 'key': 'nguinea', 'en': 'Northern Guinea savanna', 'fr': 'Savane guinéenne nord',
     'rain': '900–1200 mm', 'crop': 'maize'},
    {'id': 4, 'key': 'derived', 'en': 'Southern Guinea & derived savanna',
     'fr': 'Savane guinéenne sud et dérivée',
     'rain': '> 1200 mm with a long dry season, and coastal savanna',
     'crop': 'maize'},
    {'id': 5, 'key': 'humid', 'en': 'Humid forest', 'fr': 'Forêt humide',
     'rain': '> 1250 mm with a short dry season', 'crop': 'maize'},
]
RAIN_BREAKS = [250, 550, 900, 1200]
NO_DATA = 9  # sea and unmapped cells in the exported zone grid
FOREST_RULE = 'annual ≥ 1500 mm and driest quarter ≥ 50 mm, or annual ≥ 1250 mm, driest quarter ≥ 55 mm and latitude < 8°N'

# Illustrative cropland share of land area by zone, and per-country scaling
# tuned so national totals are in the range of FAOSTAT arable-land figures.
CROPLAND_SHARE = {0: 0.0, 1: 0.28, 2: 0.30, 3: 0.28, 4: 0.25, 5: 0.18}
CROPLAND_COUNTRY = {'NGA': 1.15, 'NER': 2.4, 'MLI': 0.55, 'BFA': 0.95, 'GHA': 0.9, 'BEN': 1.0}
FARM_SIZE_HA = {1: 3.5, 2: 2.2, 3: 1.8, 4: 1.4, 5: 1.0}

# Generic laboratory labels: no real institution is named, so no invented
# data is attributed to a real organisation.
LABS = [
    # id, country, type, P method, C method, year joined proficiency testing
    ('NG-1', 'NGA', 'National soil laboratory', 'Mehlich-3', 'Walkley-Black', 2019),
    ('NG-2', 'NGA', 'University soil laboratory', 'Bray-1', 'Walkley-Black', 2021),
    ('NG-3', 'NGA', 'State agricultural institute laboratory', 'Bray-1', 'Walkley-Black', 2024),
    ('GH-1', 'GHA', 'National soil research laboratory', 'Mehlich-3', 'Dry combustion', 2019),
    ('GH-2', 'GHA', 'University soil laboratory', 'Bray-1', 'Walkley-Black', 2022),
    ('BF-1', 'BFA', 'National soil laboratory', 'Mehlich-3', 'Walkley-Black', 2020),
    ('ML-1', 'MLI', 'National soil laboratory', 'Olsen', 'Walkley-Black', 2020),
    ('ML-2', 'MLI', 'Regional research station laboratory', 'Olsen', 'Walkley-Black', None),
    ('NE-1', 'NER', 'National soil laboratory', 'Olsen', 'Walkley-Black', 2021),
    ('BJ-1', 'BEN', 'National soil laboratory', 'Mehlich-3', 'Walkley-Black', 2020),
]
# Approximate ratio of each P extraction to Mehlich-3 on these soils.
P_TO_M3 = {'Mehlich-3': 1.0, 'Bray-1': 0.85, 'Olsen': 0.5}
WB_RECOVERY = 0.77
# Mapped SOC averages over all land cover; cultivated fields hold less,
# especially where the mapped value reflects forest.
CULTIVATION_SOC = {1: 0.9, 2: 0.9, 3: 0.85, 4: 0.75, 5: 0.65}  # uncorrected Walkley-Black under-recovers organic C

SAMPLE_TARGET = {'NGA': 1400, 'GHA': 520, 'BFA': 460, 'MLI': 440, 'NER': 380, 'BEN': 400}
PURPOSES = [
    ('baseline', 'Soil fertility baseline survey', 'Enquête de référence sur la fertilité'),
    ('trial', 'Fertilizer trial baseline', 'Référence pour essais d’engrais'),
    ('extension', 'Extension soil-testing service', 'Service d’analyse pour la vulgarisation'),
    ('research', 'Research project sampling', 'Échantillonnage de projet de recherche'),
    ('monitoring', 'Soil health monitoring (repeat)', 'Suivi de la santé des sols (répété)'),
]
TIERS = [('open', 0.4), ('members', 0.38), ('aggregate', 0.22)]

# Indicative interpretation thresholds (0-20 cm). These vary by method,
# crop and source; the demonstrator says so.
THRESHOLDS = {
    'ph': {'low': 5.5, 'high': 7.5},
    'soc': {'low': 5.0, 'ok': 10.0},
    'n': {'low': 0.5, 'ok': 1.0},
    'p': {'low': 10.0, 'ok': 20.0},
    'k': {'low': 0.2, 'ok': 0.4},
    'cec': {'low': 5.0, 'ok': 12.0},
    'zn': {'low': 1.5},
    's': {'low': 10.0},
    'b': {'low': 0.5},
}
PROPERTIES = [
    # key, unit, decimals, en, fr
    ('ph', '', 1, 'pH (water)', 'pH (eau)'),
    ('soc', 'g/kg', 1, 'Soil organic carbon', 'Carbone organique'),
    ('n', 'g/kg', 2, 'Total nitrogen', 'Azote total'),
    ('p', 'mg/kg', 1, 'Available P (Mehlich-3 equiv.)', 'P assimilable (équiv. Mehlich-3)'),
    ('k', 'cmol+/kg', 2, 'Exchangeable K', 'K échangeable'),
    ('cec', 'cmol+/kg', 1, 'CEC', 'CEC'),
    ('clay', '%', 0, 'Clay', 'Argile'),
    ('sand', '%', 0, 'Sand', 'Sable'),
    ('zn', 'mg/kg', 2, 'Zinc', 'Zinc'),
    ('s', 'mg/kg', 1, 'Sulphur', 'Soufre'),
    ('b', 'mg/kg', 2, 'Boron', 'Bore'),
]


# ---------------------------------------------------------------- grids

def load_soil():
    """SoilGrids layers, weighted to 0-20 cm and converted to lab units."""
    scale = {'phh2o': 10.0, 'soc': 10.0, 'nitrogen': 100.0, 'cec': 10.0,
             'clay': 10.0, 'sand': 10.0}
    weights = {'0-5cm': 5, '5-15cm': 10, '15-30cm': 5}
    soil, transform = {}, None
    for p in SOIL_PROPS:
        acc = None
        for d in DEPTHS:
            a, transform, _ = read_geotiff(os.path.join(CACHE, '%s_%s.tif' % (p, d)))
            a = a.astype(float)
            a[a <= 0] = np.nan if p == 'phh2o' else 0
            acc = a * weights[d] if acc is None else acc + a * weights[d]
        soil[p] = acc / 20.0 / scale[p]
    valid = np.isfinite(soil['phh2o']) & (soil['clay'] + soil['sand'] > 0)
    return soil, valid, transform


def cell_centres(shape, transform):
    x0, dx, y0, dy = transform
    lon = x0 + (np.arange(shape[1]) + 0.5) * dx
    lat = y0 + (np.arange(shape[0]) + 0.5) * dy
    return np.meshgrid(lon, lat)


def bilinear(grid, transform, lon, lat):
    x0, dx, y0, dy = transform
    fc = (lon - x0) / dx - 0.5
    fr = (lat - y0) / dy - 0.5
    c0, r0 = np.floor(fc).astype(int), np.floor(fr).astype(int)
    tc, tr = fc - c0, fr - r0
    g = lambda r, c: grid[np.clip(r, 0, grid.shape[0] - 1), np.clip(c, 0, grid.shape[1] - 1)]
    return ((1 - tr) * ((1 - tc) * g(r0, c0) + tc * g(r0, c0 + 1))
            + tr * ((1 - tc) * g(r0 + 1, c0) + tc * g(r0 + 1, c0 + 1)))


def majority_filter(codes, n_classes, radius=2, passes=2):
    for _ in range(passes):
        best, best_n = codes.copy(), np.zeros(codes.shape)
        for k in range(n_classes):
            m = np.pad((codes == k).astype(float), radius, mode='edge')
            s = m.cumsum(0).cumsum(1)
            s = np.pad(s, ((1, 0), (1, 0)))
            w = 2 * radius + 1
            n = s[w:, w:] - s[:-w, w:] - s[w:, :-w] + s[:-w, :-w]
            better = n > best_n
            best[better], best_n[better] = k, n[better]
        codes = best
    return codes


def make_zones(shape, transform):
    lon, lat = cell_centres(shape, transform)

    def climate(name):
        g, t, _ = read_geotiff(os.path.join(CACHE, name))
        g = g.astype(float)
        g[g < -1e30] = 0
        return bilinear(g, t, lon, lat)

    rain = climate('wc2.1_10m_bio_12.tif')
    dry = climate('wc2.1_10m_bio_17.tif')
    zone = np.searchsorted(RAIN_BREAKS, rain, side='right')
    forest = (((rain >= 1500) & (dry >= 50))
              | ((rain >= 1250) & (dry >= 55) & (lat < 8)))
    zone[(lat < 7.5) & (rain >= 550)] = 4
    zone[forest] = 5
    return majority_filter(zone, len(ZONES)), rain


def rasterize(rings, shape, transform):
    """Even-odd point-in-polygon test for every cell centre."""
    x0, dx, y0, dy = transform
    h, w = shape
    tog = np.zeros((h, w + 1), np.int32)
    for ring in rings:
        p = np.asarray(ring, float)
        xa, ya, xb, yb = p[:-1, 0], p[:-1, 1], p[1:, 0], p[1:, 1]
        ymin, ymax = np.minimum(ya, yb), np.maximum(ya, yb)
        # rows whose centre y lies in [ymin, ymax)
        r_first = np.floor((ymax - y0) / dy - 0.5).astype(int) + 1
        r_last = np.floor((ymin - y0) / dy - 0.5).astype(int)
        yc_first = y0 + (r_first + 0.5) * dy
        r_first = np.where(yc_first >= ymax, r_first + 1, r_first)
        count = np.maximum(r_last - r_first + 1, 0)
        if count.sum() == 0:
            continue
        e = np.repeat(np.arange(len(xa)), count)
        rows = r_first[e] + (np.arange(count.sum()) - np.repeat(np.cumsum(count) - count, count))
        yc = y0 + (rows + 0.5) * dy
        xint = xa[e] + (yc - ya[e]) * (xb[e] - xa[e]) / (yb[e] - ya[e])
        cols = np.clip(np.floor((xint - x0) / dx - 0.5).astype(int) + 1, 0, w)
        ok = (rows >= 0) & (rows < h)
        np.add.at(tog, (rows[ok], cols[ok]), 1)
    return (np.cumsum(tog, axis=1)[:, :w] % 2) == 1


def rings_of(geom):
    if geom['type'] == 'Polygon':
        return geom['coordinates']
    return [r for poly in geom['coordinates'] for r in poly]


# ---------------------------------------------------------------- geometry export

def simplify_ring(ring, tol):
    p = np.round(np.asarray(ring, float), 3)
    keep = np.zeros(len(p), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(p) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = p[i], p[j]
        seg = b - a
        L = np.hypot(*seg)
        d = (np.abs(seg[0] * (p[i + 1:j, 1] - a[1]) - seg[1] * (p[i + 1:j, 0] - a[0])) / L
             if L > 0 else np.hypot(*(p[i + 1:j] - a).T))
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    q = np.round(p[keep], 2)
    q = q[np.r_[True, np.any(np.diff(q, axis=0) != 0, axis=1)]]
    if len(q) < 4:
        return None
    return q.tolist()


def simplify_geom(geom, tol=0.01):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    out = []
    for poly in polys:
        rings = [simplify_ring(r, tol) for r in poly]
        if rings[0] is None:
            continue
        out.append([r for r in rings if r is not None])
    if not out:
        return None
    return {'type': 'MultiPolygon', 'coordinates': out}


def load_regions():
    admins, features = [], []
    for iso in COUNTRIES:
        with open(os.path.join(CACHE, 'gb_%s_ADM1.geojson' % iso)) as f:
            gj = json.load(f)
        for feat in sorted(gj['features'], key=lambda f: f['properties']['shapeName']):
            name = feat['properties']['shapeName'].replace(' Region', '')
            name = NAME_FIXES.get((iso, name), name)
            admins.append({'i': len(admins), 'iso': iso, 'name': name,
                           'rings': rings_of(feat['geometry']), 'geom': feat['geometry']})
    with open(os.path.join(CACHE, 'ne_50m_admin_0_countries.geojson')) as f:
        ne = json.load(f)
    x0, y0, x1, y1 = BBOX
    for feat in ne['features']:
        pr = feat['properties']
        iso = pr['ADM0_A3']
        coords = np.array([pt for r in rings_of(feat['geometry']) for pt in r])
        if coords[:, 0].max() < x0 - 4 or coords[:, 0].min() > x1 + 4 \
                or coords[:, 1].max() < y0 - 4 or coords[:, 1].min() > y1 + 4:
            continue
        geom = simplify_geom(feat['geometry'], 0.02)
        if geom:
            features.append({'type': 'Feature', 'geometry': geom, 'properties': {
                'iso': iso, 'member': iso in COUNTRIES,
                'en': COUNTRY_NAMES.get(iso, (pr['NAME_EN'],))[0],
                'fr': COUNTRY_NAMES.get(iso, (None, pr['NAME_FR']))[1]}})
    return admins, features


# ---------------------------------------------------------------- network

def make_labs(rng):
    labs = []
    for lab_id, iso, kind, p_method, c_method, joined in LABS:
        rounds = []
        if joined:
            for year in range(joined, CURRENT_YEAR + 1):
                for half in (1, 2):
                    t = year - joined + (half - 1) / 2
                    sd = 2.2 * np.exp(-0.45 * t) + 0.7
                    z = {k: round(float(rng.normal(0, sd)), 2) for k in ('ph', 'soc', 'p', 'k')}
                    rounds.append({'round': '%d-%d' % (year, half), 'z': z})
        bias = {
            'ph': float(rng.normal(0, 0.15)),
            'k': float(rng.lognormal(0, 0.15)), 'zn': float(rng.lognormal(0, 0.2)),
            's': float(rng.lognormal(0, 0.2)), 'b': float(rng.lognormal(0, 0.25)),
        }
        labs.append({'id': lab_id, 'iso': iso, 'type': kind, 'pMethod': p_method,
                     'cMethod': c_method, 'ptJoined': joined, 'rounds': rounds, '_bias': bias})
    return labs


def pick(rng, items, weights):
    w = np.asarray(weights, float)
    return items[rng.choice(len(items), p=w / w.sum())]


def make_samples(rng, labs, admins, soil, valid, zone, crop_frac, transform):
    x0, dx, y0, dy = transform
    h, w = zone.shape
    lon_g, lat_g = cell_centres(zone.shape, transform)
    admin_grid = np.full(zone.shape, -1)
    for a in admins:
        admin_grid[(admin_grid < 0) & a['mask']] = a['i']
    # wetlands and peaty or forest-reserve soils are not typical farm fields
    usable = valid & (zone >= 1) & (admin_grid >= 0) & (soil['soc'] < 30)

    campaigns, rows = [], []
    for iso in COUNTRIES:
        country_labs = [l for l in labs if l['iso'] == iso]
        country_admins = [a for a in admins if a['iso'] == iso and a['cropland_ha'] > 0]
        n_country = 0
        while n_country < SAMPLE_TARGET[iso]:
            year = int(rng.choice(np.arange(2014, CURRENT_YEAR + 1),
                                  p=_year_weights(2014, CURRENT_YEAR)))
            lab = country_labs[rng.integers(len(country_labs))]
            purpose = PURPOSES[rng.integers(len(PURPOSES))]
            # embargoes apply to recent campaigns until their owners publish
            recent = year >= CURRENT_YEAR - 1
            tier = 'embargo' if recent and rng.random() < 0.45 else \
                pick(rng, [t for t, _ in TIERS], [p for _, p in TIERS])
            k = min(len(country_admins), int(rng.integers(1, 5)))
            chosen = rng.choice(len(country_admins), size=k, replace=False,
                                p=_norm([a['cropland_ha'] for a in country_admins]))
            chosen = [country_admins[i] for i in chosen]
            camp = {'id': None, 'iso': iso,
                    'lab': lab['id'], 'year': year, 'purpose': purpose[0], 'tier': tier,
                    'embargoUntil': year + 2 if tier == 'embargo' else None,
                    'admins': [a['i'] for a in chosen], 'n': 0}
            harmonised = lab['ptJoined'] is not None and year >= lab['ptJoined']
            for _ in range(int(rng.integers(3, 9))):
                a = chosen[rng.integers(len(chosen))]
                cells = np.flatnonzero((admin_grid == a['i']).ravel() & usable.ravel())
                if len(cells) == 0:
                    continue
                cell = cells[rng.choice(len(cells), p=_norm(crop_frac.ravel()[cells] + 1e-6))]
                cr, cc = divmod(cell, w)
                clon = lon_g[cr, cc] + rng.uniform(-dx / 2, dx / 2)
                clat = lat_g[cr, cc] + rng.uniform(dy / 2, -dy / 2)
                site = {'soc': rng.normal(0, 0.15), 'ph': rng.normal(0, 0.15),
                        'p': rng.normal(0, 0.45)}
                for _ in range(int(rng.integers(5, 14))):
                    lon, lat = clon + rng.normal(0, 0.02), clat + rng.normal(0, 0.02)
                    r = int(np.clip(np.floor((lat - y0) / dy), 0, h - 1))
                    c = int(np.clip(np.floor((lon - x0) / dx), 0, w - 1))
                    # keep each sample within its site's region (and country)
                    if not usable[r, c] or admin_grid[r, c] != a['i']:
                        lon, lat, r, c = clon, clat, cr, cc
                    s = sample_values(rng, soil, r, c, int(zone[r, c]), site, lab, harmonised)
                    s.update({'camp': len(campaigns), 'lab': lab['id'], 'iso': iso,
                              'admin': int(admin_grid[r, c]), 'zone': int(zone[r, c]),
                              'year': year, 'h': int(harmonised), 'lon': lon, 'lat': lat})
                    rows.append(s)
                    camp['n'] += 1
            if camp['n']:
                campaigns.append(camp)
                n_country += camp['n']
    for c in campaigns:
        c['id'] = '%s-%d-%s' % (c['iso'], c['year'], c['lab'].split('-')[1]) + \
            chr(ord('a') + sum(1 for d in campaigns[:campaigns.index(c)]
                               if d['iso'] == c['iso'] and d['year'] == c['year']
                               and d['lab'] == c['lab']))
    return campaigns, rows


def _norm(w):
    w = np.asarray(w, float)
    return w / w.sum()


def _year_weights(y0, y1):
    """More campaigns in recent years: the Hub's data grows over time."""
    return _norm(np.exp(0.12 * (np.arange(y0, y1 + 1) - y0)))


def sample_values(rng, soil, r, c, z, site, lab, harmonised):
    mapped = {p: soil[p][r, c] for p in SOIL_PROPS}
    d_soc = site['soc'] + rng.normal(0, 0.22)
    cultivated = CULTIVATION_SOC[z]
    soc = mapped['soc'] * cultivated * np.exp(d_soc)
    n = mapped['nitrogen'] * cultivated * np.exp(0.85 * d_soc + rng.normal(0, 0.08))
    ph = mapped['phh2o'] + site['ph'] + rng.normal(0, 0.2)
    clay = np.clip(mapped['clay'] + rng.normal(0, 3), 2, 70)
    sand = np.clip(mapped['sand'] + rng.normal(0, 4), 5, 95 - clay)
    cec = mapped['cec'] * np.exp(0.4 * d_soc + rng.normal(0, 0.12))

    rel_soc = max(soc, 1.0) / 6.0
    p_zone = {1: -0.05, 2: 0.0, 3: 0.05, 4: 0.1, 5: -0.25}[z]
    p = np.exp(np.log(8.0) + 0.45 * np.log(rel_soc) + p_zone - 0.3 * max(5.3 - ph, 0)
               + site['p'] + rng.normal(0, 0.5))
    k = cec * rng.lognormal(np.log(0.028), 0.35)
    zn = rng.lognormal(np.log(1.25), 0.45) * rel_soc ** 0.35 * np.exp(-0.25 * max(ph - 7, 0))
    s = rng.lognormal(np.log(8.0), 0.4) * rel_soc ** 0.45
    b = rng.lognormal(np.log(0.4), 0.45) * rel_soc ** 0.3

    # small analytical error on every value
    ph += rng.normal(0, 0.05)
    soc *= rng.lognormal(0, 0.04)
    p *= rng.lognormal(0, 0.08)
    if not harmonised:  # legacy values carry each lab's method and bias
        bias = lab['_bias']
        ph += bias['ph']
        if lab['cMethod'] == 'Walkley-Black':
            soc *= WB_RECOVERY
        p *= P_TO_M3[lab['pMethod']]
        k *= bias['k']
        zn *= bias['zn']
        s *= bias['s']
        b *= bias['b']
    return {'ph': ph, 'soc': soc, 'n': n, 'p': min(p, 150), 'k': k, 'cec': cec,
            'clay': clay, 'sand': sand, 'zn': zn, 's': s, 'b': b}


# ---------------------------------------------------------------- main

def main():
    rng = np.random.default_rng(SEED)
    soil, valid, transform = load_soil()
    shape = valid.shape
    zone, rain = make_zones(shape, transform)
    admins, countries = load_regions()

    lon, lat = cell_centres(shape, transform)
    cell_km2 = (RES * 111.32) * (RES * 110.57) * np.cos(np.radians(lat))
    crop_frac = np.vectorize(CROPLAND_SHARE.get)(zone).astype(float)
    crop_frac[(zone == 1) & (rain < 350)] = 0.05
    crop_frac[~valid] = 0

    admin_stats = []
    for a in admins:
        a['mask'] = rasterize(a['rings'], shape, transform)
        factor = CROPLAND_COUNTRY[a['iso']] * rng.lognormal(0, 0.2)
        by_zone = []
        for z in range(len(ZONES)):
            m = a['mask'] & (zone == z)
            if not m.any():
                continue
            area = float(cell_km2[m].sum())
            crop_ha = float((cell_km2[m] * crop_frac[m]).sum()) * 100 * factor
            hh = crop_ha / FARM_SIZE_HA[z] if z else 0.0
            by_zone.append({'zone': z, 'areaKm2': round(area), 'croplandHa': round(crop_ha, -2),
                            'households': round(hh, -2)})
        a['cropland_ha'] = sum(b['croplandHa'] for b in by_zone if b['zone'] >= 1)
        admin_stats.append({'i': a['i'], 'iso': a['iso'], 'name': a['name'], 'zones': by_zone})

    labs = make_labs(rng)
    campaigns, rows = make_samples(rng, labs, admins, soil, valid, zone, crop_frac, transform)

    write_outputs(admins, countries, np.where(valid, zone, NO_DATA), transform, labs, campaigns,
                  rows, admin_stats)
    write_summary(admins, campaigns, rows, admin_stats, labs)


def write_outputs(admins, countries, zone, transform, labs, campaigns, rows, admin_stats):
    os.makedirs(OUT, exist_ok=True)

    def dump(name, obj):
        with open(os.path.join(OUT, name), 'w') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

    admin_features = []
    for a in admins:
        geom = simplify_geom(a['geom'], 0.01)
        if geom:
            admin_features.append({'type': 'Feature', 'geometry': geom,
                                   'properties': {'i': a['i'], 'iso': a['iso'], 'name': a['name']}})
    dump('regions.json', {'countries': {'type': 'FeatureCollection', 'features': countries},
                          'admin1': {'type': 'FeatureCollection', 'features': admin_features}})

    x0, dx, y0, dy = transform
    dump('zones.json', {'zones': ZONES, 'rainBreaks': RAIN_BREAKS, 'forestRule': FOREST_RULE,
                        'noData': NO_DATA,
                        'grid': {'x0': x0, 'y0': y0, 'dx': dx, 'dy': dy,
                                 'w': zone.shape[1], 'h': zone.shape[0],
                                 'rows': [''.join(map(str, r)) for r in zone.tolist()]}})

    camp_by_idx = campaigns
    visible_tiers = {'open', 'members', 'aggregate'}
    cols = {k: [] for k in ['camp', 'admin', 'zone', 'year', 'h', 'lon', 'lat']
            + [p[0] for p in PROPERTIES]}
    for s in rows:
        camp = camp_by_idx[s['camp']]
        if camp['tier'] not in visible_tiers:
            continue  # embargoed: counted in campaign metadata only
        located = camp['tier'] in ('open', 'members')
        cols['camp'].append(s['camp'])
        cols['admin'].append(s['admin'])
        cols['zone'].append(s['zone'])
        cols['year'].append(s['year'])
        cols['h'].append(s['h'])
        # locations rounded to ~1 km to protect farmers' privacy
        cols['lon'].append(round(s['lon'], 2) if located else None)
        cols['lat'].append(round(s['lat'], 2) if located else None)
        for key, _, dec, _, _ in PROPERTIES:
            v = round(float(s[key]), dec)
            cols[key].append(int(v) if dec == 0 else v)
    dump('samples.json', cols)

    dump('network.json', {
        'members': [{'iso': iso, 'en': COUNTRY_NAMES[iso][0], 'fr': COUNTRY_NAMES[iso][1]}
                    for iso in COUNTRIES],
        'labs': [{k: v for k, v in l.items() if not k.startswith('_')} for l in labs],
        'campaigns': campaigns,
        'purposes': [{'key': k, 'en': en, 'fr': fr} for k, en, fr in PURPOSES],
        'adminStats': admin_stats,
    })

    boundary_meta = {}
    for iso in COUNTRIES:
        with open(os.path.join(CACHE, 'gb_%s_ADM1.meta.json' % iso)) as f:
            boundary_meta[iso] = json.load(f)
    dump('meta.json', {
        'generated': datetime.date.today().isoformat(), 'seed': SEED, 'currentYear': CURRENT_YEAR,
        'properties': [{'key': k, 'unit': u, 'decimals': d, 'en': en, 'fr': fr}
                       for k, u, d, en, fr in PROPERTIES],
        'thresholds': THRESHOLDS, 'farmSizeHa': FARM_SIZE_HA,
        'pToMehlich3': P_TO_M3, 'walkleyBlackRecovery': WB_RECOVERY,
        'cultivationSoc': CULTIVATION_SOC,
        'sources': {
            'soil': 'SoilGrids 2.0 (ISRIC), CC-BY 4.0, 0–30 cm weighted to 0–20 cm',
            'rain': 'WorldClim 2.1 bio12 and bio17 (annual and driest-quarter precipitation, 1970–2000), 10 arc-min',
            'countries': 'Natural Earth 1:50m admin-0 countries, public domain',
            'admin1': boundary_meta,
        },
    })


def write_summary(admins, campaigns, rows, admin_stats, labs):
    lines = []
    out = lines.append
    by_iso = {}
    for c in campaigns:
        d = by_iso.setdefault(c['iso'], {'campaigns': 0, 'samples': 0})
        d['campaigns'] += 1
        d['samples'] += c['n']
    out('Samples and campaigns by country')
    for iso, d in by_iso.items():
        crop = sum(z['croplandHa'] for a in admin_stats if a['iso'] == iso for z in a['zones'])
        hh = sum(z['households'] for a in admin_stats if a['iso'] == iso for z in a['zones'])
        out('  %s  %4d samples  %3d campaigns  cropland %5.1f Mha  farm households %5.1f M'
            % (iso, d['samples'], d['campaigns'], crop / 1e6, hh / 1e6))
    out('Total samples %d' % len(rows))
    tiers = {}
    for c in campaigns:
        tiers[c['tier']] = tiers.get(c['tier'], 0) + c['n']
    out('Samples by tier: %s' % tiers)
    out('Harmonised share: %.0f%%' % (100 * np.mean([s['h'] for s in rows])))
    out('')
    out('Median (10th–90th percentile) by zone, all samples')
    keys = [p[0] for p in PROPERTIES]
    for z in ZONES[1:]:
        sub = [s for s in rows if s['zone'] == z['id']]
        if not sub:
            continue
        out('  %s (n=%d)' % (z['en'], len(sub)))
        for k in keys:
            v = np.array([s[k] for s in sub])
            line = '    %-5s %7.2f  (%6.2f – %6.2f)' % (k, np.median(v), *np.percentile(v, [10, 90]))
            t = THRESHOLDS.get(k, {})
            if 'low' in t:
                line += '   below %g: %3.0f%%' % (t['low'], 100 * np.mean(v < t['low']))
            out(line)
    out('')
    out('Proficiency testing, latest round max |z|')
    for l in labs:
        last = l['rounds'][-1]['z'] if l['rounds'] else None
        out('  %s  joined %s  %s' % (l['id'], l['ptJoined'],
                                    max(abs(v) for v in last.values()) if last else '-'))
    text = '\n'.join(lines)
    with open(os.path.join(HERE, 'summary.txt'), 'w') as f:
        f.write(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
