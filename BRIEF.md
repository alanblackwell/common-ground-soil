# Design brief: Soil Health Hub demonstrator

*Draft 1, 31 October 2026. Prepared by Alan Blackwell for discussion with the Regional Hub for Fertilizer and Soil Health for West Africa and the Sahel.*

## Purpose

This is an interactive concept demonstrator, hosted on GitHub Pages, that shows how a shared system for collecting and visualising soil-sample analyses could:

1. act as a **boundary object** between soil scientists and development economists. Each community reads the same data in its own terms, and the system makes the translation between them visible.
2. help **build long-term relationships and trust** among Hub members, by making contribution, credit, data control and shared problems visible.
3. make the case for **customised software** that supports cross-disciplinary professional work, and for the opportunity this creates for food production in sub-Saharan Africa.

The demonstrator uses **synthetic data** throughout. Its job is to start conversations, not to report findings.

## Audiences

- **First recipient:** a development economist at the Hub, who may pass it to colleagues, including soil scientists.
- **Soil scientists** will judge it on plausible values, transparent methods and honest uncertainty.
- **Development economists and policy staff** will judge it on decision relevance: hectares and households affected, returns, and targeting.
- **Hub member representatives** will judge it on fairness: are they credited, do they keep control of their data, and does any country dominate?

## Scope

- **Countries:** Nigeria, Niger, Benin, Ghana, Burkina Faso and Mali.
- **Main spatial unit:** agro-ecological zones that cross national borders (Sahelian, Sudanian, Guinean/northern savanna, derived savanna/forest transition, humid forest), shown together with national and first-level administrative boundaries.
- **Reference crops:** maize, sorghum and millet, chosen to suit each zone.

## Design principles

1. **One structure, two lenses.** The map, zones and samples are shared. A single toggle switches the vocabulary, the variables and the units between the soil lens and the economics lens. The translation step (soil constraint → recommendation → yield response → return) is always visible, never hidden.
2. **Shared problems, not league tables.** Do not rank countries. Show zones that cross borders, and show each member its own position in the regional picture.
3. **Credit and control are visible.** Every sample has a contributor. Every contributor has a data-sharing tier that they set themselves.
4. **Honesty about uncertainty and origins.** Show the number of samples, the lab method, harmonisation status and confidence wherever a value is aggregated.
5. **Invite correction.** A visible "known simplifications, please correct us" panel presents the demo as a draft for experts to improve.
6. **Synthetic, and obviously so.** Every view carries a "synthetic data" marker, so screenshots cannot be mistaken for findings.
7. **Built for the region.** English and French. Fast on low bandwidth and on phones. No dependence on external tile servers.

## Views

| # | View | Soil lens | Economics lens |
|---|------|-----------|----------------|
| 1 | **Shared zones map** | Sample points and zone or admin aggregates for pH, SOC, N, P, K, CEC and micronutrients (Zn, S, B). Sample count and confidence shown per unit. | Hectares and households in each zone, main nutrient constraint, estimated yield gap. |
| 2 | **Recommendation scenario** | Which nutrients limit yield where, and the blend each zone would need. | A single national blend (e.g. NPK 20:10:10) compared with zone-specific blends: value-cost ratio, area above VCR 2, and cost per extra tonne, all with uncertainty bands. |
| 3 | **Network and contribution** | Labs, methods and proficiency-test (harmonisation) status over time. | Members, samples contributed, data-sharing tiers, and what each member gets back. |
| 4 | **Dialogue layer** | Notes attached to regions, written in role as a soil scientist and as an economist, including one disagreement about interpretation. All clearly invented. | Same notes, same regions. |
| 5 | **About and how it works** | Data sources, generation method and known simplifications. | System architecture (ingestion → harmonisation → aggregation → views) and how it would be customised for the Hub. |

A short guided walkthrough (about 5 steps) tells a policy story across views 1–3: "A ministry is deciding whether to keep a single national blend or target blends by zone." The views remain free to explore afterwards.

## Synthetic data approach

- **Basis:** sample soil properties from public gridded products, **iSDAsoil** and **SoilGrids** (both CC-BY 4.0, cited). Add measurement noise and lab-method offsets, and use realistic clustered sampling campaigns with uneven density and some missing values.
- **Variables:** pH (H₂O), SOC, total N, extractable P, exchangeable K, CEC, sand and clay, and Zn, S and B where available. Depth 0–20 cm.
- **Economic context:** use published fertilizer and crop price ranges (AfricaFertilizer.org, FAOSTAT) and a **stylised** yield-response function, clearly labelled as illustrative.
- **Contributors:** use generic labels such as "Nigeria, national lab 1", not real institution names, so that no fake data is attributed to a real organisation.
- **Reproducibility:** generate everything with a seeded Python script, kept in the repository, whose output is small pre-aggregated JSON. Pointing the script at real data later is part of the argument for the system.

## Technical outline

- **Site:** static, either plain HTML/JS or a small Vite build, deployed to GitHub Pages.
- **Rendering:** D3 for the map and charts, using simplified embedded boundaries (geoBoundaries or Natural Earth). No tile server.
- **Text:** an EN/FR string table.
- **Payload:** target under about 2 MB in total.

## Not in scope for this demonstrator

- Real data, user accounts, uploads or a back end. Data-sharing tiers and the dialogue layer are mock-ups only.
- Real agronomic recommendations of any kind.
- Use of Hub, ECOWAS or member-institution branding.

## Open questions for the Hub contact

1. Which policy decision is most current for the Hub (blend formulation, subsidy targeting, soil-testing investment, or something else)? The guided scenario should be about that decision.
2. Could a Hub soil scientist review the demo after a first build?
3. Is there a preferred agro-ecological zone scheme already in use at the Hub?
4. Are there sensitivities among members we should know about, such as data sharing or country comparisons?

## How we will know it works

As a boundary object, it works if people from each community use it to ask the other community specific questions. As a trust-building tool, it works if member representatives can see their own contribution, control and benefit. These will be judged by observing walkthrough sessions, and by the feedback that comes back through the Hub contact.
