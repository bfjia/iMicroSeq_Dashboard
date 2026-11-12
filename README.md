# iMicroSeq Dashboard

Proof-of-concept dashboard for the [Canadian iMicroSeq Data Portal](https://imicroseq-dataportal.ca/): summary numbers, sampling activity, a site map, a sample explorer, wastewater viral-load trends, and a metadata completeness check for data stewards.

- **Staging:** [imicroseq-dashboard.bfjia.net](https://imicroseq-dashboard.bfjia.net) (this repo)
- **Production:** [dashboard.imicroseq-dataportal.ca](https://dashboard.imicroseq-dataportal.ca) (production repo, after cutover)

## How it works

Everything runs on Cloudflare Workers' free tier. The pages are static files; charts query the portal's GraphQL API **live** through a small Worker route that caches identical queries at the edge for an hour. Viral loads are the one exception: their values can't be averaged by the API, so Cloudflare Workers Builds rebuilds small per-site data files on every push to `main` and every night, and deploys them with the site.

```
Browser ── pages, JS, viral data files ──► Cloudflare static assets
   ├── /api/graphql ──► Worker ──► edge cache (1 h) ──► portal GraphQL API
   └── /tiles/...   ──► Worker ──► CARTO basemap (API key stays server-side)
Workers Builds (push to main, nightly) ── build viral data ──► wrangler deploy
```

## Start here

| You want to… | Read |
|---|---|
| Set up, run, publish, use or look after the site (no development background needed) | [docs/SOP.md](docs/SOP.md) |
| Understand the code, data flow and data rules | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Change a label, field, colour or threshold | `public/js/config.js` (see [docs/SOP.md](docs/SOP.md), "Common changes") |

## Quick start

```bash
nvm use            # Node 24 (see .nvmrc)
npm install
npm run dev        # http://localhost:8787
npm test
```

## License

MIT, see [LICENSE](LICENSE).
