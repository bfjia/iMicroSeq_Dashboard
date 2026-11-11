# CLAUDE.md

Proof-of-concept dashboard for the [Canadian iMicroSeq Data Portal](https://imicroseq-dataportal.ca/). Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Non-developer procedures: [docs/SOP.md](docs/SOP.md).

## Hard constraints

- Hosting is **Cloudflare Workers free tier**. No paid features (KV/D1/R2 not used; Cache API only).
- Data is fetched **live** from the portal GraphQL API wherever possible. Only viral loads are precomputed (Cloudflare Workers Builds, on push to main and nightly via the Worker cron and a deploy hook), because measurement values are text and can't be aggregated by the API.
- No domain names in code: all paths are relative. Domains live only in `wrangler.toml`.
- Keep every existing disclaimer text on the pages word-for-word.
- Code style: plain, minimal ("caveman") vanilla JS ES modules. No framework, no bundler, no new runtime dependencies.

## Layout

| Path | Purpose |
|---|---|
| `cf-worker/index.ts` | Worker: `POST /api/graphql` cached proxy, `/tiles/...` CARTO proxy, nightly cron that calls `DEPLOY_HOOK_URL`; all else static |
| `public/js/config.js` | Every tunable (fields, labels, colours, thresholds, API URLs) |
| `public/js/rules.js` | Data rules shared by browser and nightly build |
| `public/js/api.js` | `gql()` (proxy, then direct fallback), SQON helpers, `aliased()` multi-block queries |
| `public/js/charts.js` | Vega-Lite config, panel loading/error states, data tables, URL state, footer |
| `public/js/index.js`, `public/js/map.js` | At a Glance page |
| `public/js/dashboard.js`, `public/js/viral.js` | Interactive Dashboard page |
| `scripts/build-viral-loads.mjs` | Nightly build of `public/data/viral/` (gitignored) |
| `test/` | `node:test` unit tests, including a docs path check |

## Commands

```bash
npm run dev          # wrangler dev (restart it after adding files: file watching doesn't work on /mnt/d)
npm test
npm run build:data   # ~10 min, fetches all RT-PCR records
npm run build        # test + build:data; the Workers Builds build command
npm run cf:deploy    # emergency manual deploy to staging; never run --env production from this repo
```

## Arranger API quirks

Aggregation fields are `data__<field>`; SQON `fieldName` uses `data.<field>`; date fields filter as epoch ms and only support `stats`/`histogram`; `filters` and `filter_by_term` need a group (`{op:'and',content:[…]}`); `op:'not'` works; row paging past 10,000 needs `searchAfter`; sorted pages over ~1,000 rows can time out. Stored values may carry ontology ids (`"Alberta [GAZ:00002566]"`); `trimBrackets()` strips them.

## Data specification

`data_specification/fields.tsv` and `data_specification/enums.tsv` describe every field. `query_examples/` has a reference Arranger client. Both folders are local only (gitignored).
