# Common Ground: soil information concept demonstrator

An interactive concept demonstrator, using **synthetic data**, of a shared soil-information system for the Regional Hub for Fertilizer and Soil Health for West Africa and the Sahel. It is designed as a boundary object between soil scientists and development economists. See [BRIEF.md](BRIEF.md) for the design brief.

## Layout

- `BRIEF.md`: design brief
- `data-gen/`: Python generator for the synthetic dataset (see its README)
- `docs/`: the static site, served by GitHub Pages
  - `index.html`, `css/`, `js/`: no build step; plain ES modules plus D3 7.9.0 (vendored in `vendor/`)
  - `data/`: generated JSON

## Run locally

```
cd docs && python3 -m http.server 8000
```

Then open <http://localhost:8000>. A local server is needed because browsers block `fetch` from `file://` pages.

## Regenerate the data

```
cd data-gen && python3 fetch.py && python3 generate.py
```

## Deploy to GitHub Pages

Push the repository to GitHub, then under **Settings → Pages** choose *Deploy from a branch*, branch `main`, folder `/docs`. The site is public even if the repository is private, so keep the synthetic-data notices in place.

## Views

1. **Shared map**: zones, regions or samples, with a soil-science or economics lens, and a six-step translation chain from soil test to policy lever.
2. **Fertilizer scenario**: a single national blend compared with zone-specific blends, using a stylised response model with adjustable prices and rates.
3. **Members & labs**: contribution, reciprocity, data-sharing tiers and proficiency testing.
4. **Dialogue**: illustrative cross-disciplinary threads attached to places.
5. **About**: what is real, the architecture, known simplifications and sources.

The URL hash records the current state, so any view can be shared as a link.
