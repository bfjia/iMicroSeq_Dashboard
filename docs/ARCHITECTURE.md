# Architecture

Proof-of-concept dashboard for the [Canadian iMicroSeq Data Portal](https://imicroseq-dataportal.ca/). Vanilla JavaScript (ES modules), no framework, no bundler. Charts: Vega-Lite. Map: Leaflet. Hosting: Cloudflare Workers free tier (a hard constraint, see [Free-tier budget](#free-tier-budget)).

## Overview

```
Browser ── pages, JS, viral data files ──► Cloudflare static assets (free, no Worker run)
   ├── POST /api/graphql ──► Worker ──► edge cache (1 h) ──► portal GraphQL API
   └── GET  /tiles/...   ──► Worker ──► CARTO basemap (API key added here)
GitHub Actions (nightly) ── npm test ── build viral files ── wrangler deploy
```

- Most data is queried live from the portal's Arranger GraphQL API through the Worker, which caches identical queries.
- Viral loads are the exception: the API cannot average values, so a nightly job downloads the RT-PCR records and writes small JSON files that ship with the site.
- Only `/api/*` and `/tiles/*` run the Worker (`run_worker_first` in `wrangler.toml`). All other requests are free static-asset requests. No KV, D1 or R2; only the Cache API.

## Environments

| | Staging | Production |
|---|---|---|
| Domain | `imicroseq-dashboard.bfjia.net` | `dashboard.imicroseq-dataportal.ca` |
| Worker name | `imicroseq-dashboard` | `dashboard-imicroseq-dataportal-ca` (`[env.production]`) |
| Repo | `bfjia/iMicroSeq_Dashboard` (this one) | a separate production repo |
| Deploy command | `wrangler deploy --env=""` | `wrangler deploy --env production` |
| `WRANGLER_ENV` repo variable | empty | `production` |

Going to production is a pull request from this repo into the production repo, not a file copy. Never run `--env production` from this repo: the old production Worker keeps serving the production domain until cutover. See `docs/SOP.md`, section 9.

## Request flow per page

| Panel | Source | Requests | Rule |
|---|---|---|---|
| At a Glance: hero cards, breakdown, map, cumulative chart | `loadIndex()` in `public/js/index.js` | 1 GraphQL request, shared by all four | Hits total; site buckets with `top_hits` (lat, lon, province); organism, collecting organisation and environmental site buckets; date stats and daily histogram. A second aggregation block, filtered to the last `ACTIVE_DAYS`, gives active sites. "Now" is rounded to UTC midnight so the cache key is stable all day. |
| Monthly by organism | `monthlyByOrganism()` | 1 more, when scrolled into view | One aliased aggregation block per calendar month (~175 blocks, ~0.5-0.8 s). Largest 7 organisms keep a colour, the rest are "Other". |
| Map | `public/js/map.js` | 0 extra (reuses the index query), plus map tiles | One marker per site. Sites with no usable GPS (175 of 670 when measured: "Not Provided", "Restricted Access" or blank in the sampled record) sit at the province capital from `public/data/ProvinceCapitalCoords.csv`. Samples with no site (~19,662) are not shown. Click a marker: `dashboard.html?site=<name>#viral`. |
| Explorer | `public/js/dashboard.js` | 1 "dimensions" request, then 1 per chart | Dimensions: buckets per field, date stats, daily histogram. Category x category: one aliased block per top-7 segment value plus one "Other" block. Time axis: one block per period. Values differing only by ontology suffix are merged. Totals match the dimension totals exactly. |
| Completeness | `completenessRows()` | 1 | Buckets with `include_missing` per field in `COMPLETENESS_FIELDS`; numeric and date fields use `stats.count`. Multivalued fields (e.g. purpose of sampling) are clamped so each sample counts once (an approximation). |
| Viral loads | `public/js/viral.js` | `public/data/viral/index.json` (no-cache) + 1 data file per selection (`?v=<generatedAt>`) | Static files from `public/data/viral/`, built nightly. Default view: Alberta / All / All / Influenza A virus / all genes / C/ml, last 12 months. |

Each panel loads when it scrolls near the viewport (`whenVisible`). Identical queries in one page view are memoised (`public/js/api.js`).

## Worker

`cf-worker/index.ts`.

| Route | Behaviour |
|---|---|
| `POST /api/graphql` | Forwards to the portal Arranger endpoint. Cache key = SHA-256 of the body. Stores only 200 responses without GraphQL `errors`, for 3600 s. Sets `x-cache: HIT` or `MISS` and `x-fetched-at` (shown in the footer). Rejects non-POST (405), bodies over 64 KB (413) and any body containing `mutation` (400). Cloudflare compresses the response. |
| `GET /tiles/light_all/{z}/{x}/{y}{r}.png` | Fetches the CARTO basemap tile with `CARTO_API_KEY`, cached at the edge for a week; errors are not cached. Returns 503 if the secret is missing, 404 for out-of-range tiles. |
| anything else | `ASSETS` (static files). |

If the proxy fails, `public/js/api.js` calls the portal API directly, retrying once after 0.8 s. Static headers (browser cache lifetimes) are in `public/_headers`.

## Nightly pipeline

`.github/workflows/deploy.yml`. Triggers: every night at 08:30 UTC, every push to `main`, manual run (Actions tab).

1. Check out the repo; set up Node 24 (`.nvmrc`).
2. `npm ci`
3. `npm test`
4. `npm run build:data` runs `scripts/build-viral-loads.mjs` (~10 minutes; 227,138 RT-PCR rows, paging slows from ~0.5 s to ~6 s per page partway through).
5. `npx wrangler deploy --env="$WRANGLER_ENV"`

Failure behaviour: if any step fails (for example the build finds a different row count than the API reported), nothing deploys and the site keeps the previous data. The build also writes to a temporary folder and swaps it in only on success.

GitHub disables scheduled workflows after 60 days with no repo activity (re-enable in the Actions tab). Scheduled runs only use the default branch (`main`); development happens on `dev`.

Build output (`public/data/viral/`, gitignored): 420 files in the last full build (315 site, 92 city, 12 province, 1 index), 9.4 MB raw, ~2.5 MB gzipped. Peak build memory ~217 MB. Values are rounded to 4 significant digits.

| File | Content |
|---|---|
| `public/data/viral/index.json` | `{generatedAt, records, p:[{n,id,t,c:[{n,id,t,s:[{n,id,t}]}]}], lookup}`. `p` is province > city > site; `t` = `{organism:{gene:[units]}}`; `lookup` maps site name to `[province, city]`. |
| `public/data/viral/site/<id>.json` | `{organism:{gene:{unit:{d:[dates], v:[[values]], r?:[[ratios]]}}}}` |
| `public/data/viral/city/<id>.json`, `public/data/viral/province/<id>.json` | Same shape, but `v[i]` and `r[i]` are `[n, sum, sumsq]` (`r[i]` is 0 when none) so groups combine exactly |

PMMoV ratios (`r`) currently exist only for Ontario (171 of 315 sites).

## Data rules

Shared by the browser and the build in `public/js/rules.js`; constants in `public/js/config.js`.

| Rule | Detail |
|---|---|
| `trimBrackets` | Removes ontology suffixes: `Alberta [GAZ:00002560]` becomes `Alberta`. |
| Null terms | `NULL_TERMS` (Not Provided, Not Applicable, Not Collected, Missing, Restricted Access, `__missing__`, blank) are excluded from hero counts. The old site counted them: sites 672 to 670, organisms 6 to 5, data sources 24 to 23. |
| Viral assay | Only `VIRAL_ASSAY` (RT-PCR) records. |
| Target organism | A blank target taxon counts as SARS-CoV-2. |
| SARS-CoV-2 cap | Values above `SARS2_MAX` (2000) are dropped before averaging. The cap ignores units; kept from the old site. |
| Plottable values | Numeric text only. |
| Averages | Per-date mean and SEM. "All" views combine `[n, sum, sumsq]` exactly. |
| LOESS | Tricube weights, degree 2, span `LOESS_SPAN` (0.2); same as the old site. R reference scripts in `scripts/smoothing/`. |
| PMMoV normalisation | Target value divided by the mean of the same record's PMMoV values above 0 in the same unit. **Awaiting scientific sign-off.** |

Known data caveats: catchment population is empty (0% recorded, so per-capita rates are not offered); viral lineage is filled for only ~44 records; measurement units are mixed.

## Charts

- Palette (`PALETTE`): 8 colours validated for colour-blind separation, brand blue `#4A63E7` first. "Other" is gray (`OTHER_COLOR`). Never more than 8 series.
- Every chart has a legend or tooltip and a "Show data table" view (`dataTable()` in `public/js/charts.js`).
- URL state, so a view can be shared by copying the address: explorer `x`, `seg`, `pct`; viral `province`, `city`, `site`, `organism`, `gene`, `unit`, `from`, `to`, `norm`, `log`. Each page script touches only its own keys.

## Files map

| Path | Purpose |
|---|---|
| `public/index.html`, `public/js/index.js`, `public/js/map.js` | At a Glance page |
| `public/dashboard.html`, `public/js/dashboard.js` | Explorer and completeness |
| `public/js/viral.js` | Viral loads panel (styles are in `public/styles.css`) |
| `public/js/config.js` | Every setting a maintainer changes |
| `public/js/api.js` | GraphQL client, SQON helpers, aliased queries |
| `public/js/rules.js` | Data rules shared with the build |
| `public/js/charts.js` | Vega config, panels, tables, URL state, footer |
| `public/styles.css` | Global styles |
| `public/_headers` | Browser cache headers |
| `public/data/` | `public/data/CAN.geo.json`, `public/data/ProvinceCapitalCoords.csv`, generated `public/data/viral/` |
| `cf-worker/index.ts` | Worker |
| `scripts/build-viral-loads.mjs` | Nightly viral build |
| `scripts/smoothing/` | R LOESS reference scripts |
| `wrangler.toml` | Worker name, domains, assets, `run_worker_first` |
| `.github/workflows/deploy.yml` | Nightly build and deploy |
| `test/` | Tests |

## Secrets

| Secret | Where | Used for |
|---|---|---|
| `CARTO_API_KEY` | Worker secret, set per Worker (environment); `.dev.vars` locally (gitignored) | Basemap tiles |
| `CLOUDFLARE_API_TOKEN` | GitHub repo secret ("Edit Cloudflare Workers" token template) | Deploy |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repo secret | Deploy |

Never put a key in `public/` or commit it. Who rotates them: `<fill in: name or role>`.

## Free-tier budget

| Limit | Value | Use here |
|---|---|---|
| Worker requests | 100,000 per day | Mostly map tiles, ~15-25 per map view; plus uncached GraphQL queries |
| Worker CPU | 10 ms per request | Proxy and tile code is light |
| Static files | 20,000 | One file per viral site, city and province, plus the pages; count them after a build (`find public -type f \| wc -l`) |

At the request limit, data queries fall back to the portal API directly (slower, uncompressed) and basemap tiles fail. Static pages keep working. 

## Arranger API quirks

- Aggregation fields are `data__<field>`; SQON field names are `data.<field>`.
- Dates filter as epoch milliseconds and only have stats and histogram, no buckets.
- Filters must be groups (`and`); `filter_by_term` needs a group; `op: 'not'` works.
- The offset window is 10,000 rows, so paging uses `searchAfter` with a total sort (date, then sample id).
- 1,000-row sorted pages take ~0.6 s; 5,000-row pages time out.
- Responses arrive uncompressed with no cache headers, which is why the proxy exists.

## Testing

`npm test` runs `node --test "test/*.test.js"`, and the deploy workflow runs it before building.

| File | Covers |
|---|---|
| `test/rules.test.js` | `trimBrackets`, null terms, coordinates, viral rules, stats merging, date keys, `slug` |
| `test/viral.test.js` | LOESS against the old implementation, series and stats merging, record parsing, PMMoV ratio, build output tree and ids, chart spec |
| `test/docs.test.js` | Every relative link and backticked file path in `README.md`, `CLAUDE.md` and `docs/*.md` exists |
