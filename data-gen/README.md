# Synthetic data generator

Builds the **synthetic** dataset behind the Soil Health Hub demonstrator. Requires Python 3.7+ and numpy, with no GIS libraries.

```
python3 fetch.py      # download public source layers to cache/ (~10 MB, once)
python3 generate.py   # write ../docs/data/*.json and summary.txt
```

Output is deterministic for a given seed (`SEED` in `generate.py`). `summary.txt` has per-zone medians and the share of samples below each interpretation threshold, for a soil scientist to check.

## What is real and what is invented

| Real (public sources) | Invented (synthetic) |
|---|---|
| Country outlines: Natural Earth 1:50m, public domain | Every sample, campaign and laboratory |
| First-level regions: geoBoundaries (licence per country in `cache/*.meta.json`) | Proficiency-test rounds and z-scores |
| Annual and driest-quarter rainfall: WorldClim 2.1, used to delimit approximate agro-ecological zones | Data-sharing tiers and embargoes |
| Mapped pH, SOC, total N, CEC, clay and sand: SoilGrids 2.0, CC-BY 4.0, used as the expected value at each sample location | Field-to-field variation around mapped values |
| | Extractable P, K, Zn, S and B, modelled from mapped properties |
| | Cropland area and farm-household numbers |

## Known simplifications (for expert correction)

- **Zones** are drawn from rainfall alone, with humid forest separated from derived savanna by driest-quarter rainfall. They are not an official agro-ecological zone scheme.
- **SoilGrids accuracy is lower in data-sparse regions such as the Sahel.** Its clay and CEC values there are probably too high for the sandy dune soils. Correcting this kind of error with local data is part of the case for the Hub.
- **Organic carbon and N** in cultivated fields are scaled down from SoilGrids' mapped averages, by between 0.9 (Sahel) and 0.65 (humid forest).
- **Thresholds** in `meta.json` are indicative. Real critical levels depend on extraction method, crop and source.
- **Lab harmonisation:** values from labs not yet in proficiency testing keep their method differences (Walkley-Black under-recovery, Bray-1 and Olsen P relative to Mehlich-3) and a random lab bias. After a lab joins, its values are treated as harmonised.
- **Sample locations** in the exported data are rounded to about 1 km. Aggregate-only campaigns have no coordinates, and embargoed campaigns appear only as counts.
- **Laboratory labels are generic** (e.g. "NG-1, National soil laboratory"). No real institution is named.

## Output files (`docs/data/`)

- `regions.json`: countries (members plus neighbours, for context) and first-level regions
- `zones.json`: zone definitions plus a 0.05° zone grid (digit per cell; 9 = sea/no data)
- `samples.json`: column arrays, one entry per sample (embargoed samples excluded)
- `network.json`: members, labs and proficiency rounds, campaigns, and cropland/household stats per region × zone
- `meta.json`: property definitions, thresholds, conversion factors and source attributions
