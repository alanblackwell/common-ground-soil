"""Download the public source layers used to anchor the synthetic data.

Everything lands in data-gen/cache/ (not committed). Sources:
  - SoilGrids 2.0 (ISRIC), CC-BY 4.0: https://soilgrids.org
  - WorldClim 2.1 annual precipitation (bio12) and precipitation of the driest
    quarter (bio17), 10 arc-min: https://worldclim.org
  - geoBoundaries ADM1 (simplified; licences vary by country, recorded in
    cache/*.meta.json): https://www.geoboundaries.org
  - Natural Earth 1:50m countries (public domain), for consistent national
    outlines and neighbouring-country context: https://www.naturalearthdata.com
"""
import io
import json
import os
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')

COUNTRIES = ['NGA', 'NER', 'BEN', 'GHA', 'BFA', 'MLI']
BBOX = (-12.5, 4.0, 16.0, 25.5)  # lon0, lat0, lon1, lat1
RES = 0.05
SOIL_PROPS = ['phh2o', 'soc', 'nitrogen', 'cec', 'clay', 'sand']
DEPTHS = ['0-5cm', '5-15cm', '15-30cm']

WCS = ('https://maps.isric.org/mapserv?map=/map/{p}.map&SERVICE=WCS&VERSION=2.0.1'
       '&REQUEST=GetCoverage&COVERAGEID={p}_{d}_mean&FORMAT=image/tiff'
       '&SUBSET=long({x0},{x1})&SUBSET=lat({y0},{y1})'
       '&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326'
       '&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326'
       '&RESOLUTION=long({r})&RESOLUTION=lat({r})')
WORLDCLIM = 'https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip'
NATURAL_EARTH = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
                 'master/geojson/ne_50m_admin_0_countries.geojson')
GB_API = 'https://www.geoboundaries.org/api/current/{ed}/{iso}/{lvl}/'
# gbOpen merges and misspells Niger's regions; the OCHA/IGNN edition is correct.
GB_EDITION = {('NER', 'ADM1'): 'gbHumanitarian'}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'soil-hub-demo/0.1'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def fetch_to(path, url):
    if os.path.exists(path):
        return
    print('fetching', os.path.basename(path))
    data = get(url)
    with open(path, 'wb') as f:
        f.write(data)


def main():
    os.makedirs(CACHE, exist_ok=True)
    x0, y0, x1, y1 = BBOX
    for p in SOIL_PROPS:
        for d in DEPTHS:
            fetch_to(os.path.join(CACHE, '%s_%s.tif' % (p, d)),
                     WCS.format(p=p, d=d, x0=x0, x1=x1, y0=y0, y1=y1, r=RES))

    bio = ['wc2.1_10m_bio_12.tif', 'wc2.1_10m_bio_17.tif']
    if not all(os.path.exists(os.path.join(CACHE, b)) for b in bio):
        print('fetching WorldClim bio (~50 MB)')
        with zipfile.ZipFile(io.BytesIO(get(WORLDCLIM))) as z:
            for b in bio:
                with open(os.path.join(CACHE, b), 'wb') as f:
                    f.write(z.read(b))

    fetch_to(os.path.join(CACHE, 'ne_50m_admin_0_countries.geojson'), NATURAL_EARTH)

    for iso in COUNTRIES:
        for lvl in ('ADM1',):
            path = os.path.join(CACHE, 'gb_%s_%s.geojson' % (iso, lvl))
            if os.path.exists(path):
                continue
            ed = GB_EDITION.get((iso, lvl), 'gbOpen')
            meta = json.loads(get(GB_API.format(ed=ed, iso=iso, lvl=lvl)))
            fetch_to(path, meta['simplifiedGeometryGeoJSON'])
            with open(path[:-8] + '.meta.json', 'w') as f:
                json.dump({'edition': ed,
                           'source': meta.get('boundarySource') or meta.get('boundarySource-1'),
                           'year': meta.get('boundaryYearRepresented'),
                           'license': meta.get('boundaryLicense'),
                           'licenseSource': meta.get('licenseSource')}, f, indent=1)


if __name__ == '__main__':
    main()
