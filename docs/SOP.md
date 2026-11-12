# Standard operating procedures

For people who are not developers. Type commands exactly as shown. How the system works: [ARCHITECTURE.md](ARCHITECTURE.md).

Jargon: **repo** = the project on GitHub; **branch** = a line of changes (we work on `dev`, the live site follows `main`); **pull request** = a request to move changes between branches; **Worker** = the Cloudflare program serving the site; **secret** = a key stored privately.

## 1. Setup

Once only.

1. **Access.** You need write access to the GitHub repo `bfjia/iMicroSeq_Dashboard`, a Cloudflare account that owns the Worker, and the CARTO map key (ask `<fill in: data portal contact>`).
2. **Install Node 24 and Git** from [nodejs.org](https://nodejs.org/) and [git-scm.com](https://git-scm.com/downloads) (macOS: `brew install node@24 git` also works). Open a terminal (Windows: Git Bash) and type `node --version`. It should start with `v24`.
3. **Download the project.** `git clone https://github.com/bfjia/iMicroSeq_Dashboard.git`, then `cd iMicroSeq_Dashboard`, then `git checkout dev`.
4. **Install its software.** `npm install`. No red errors should appear.
5. **Add the map key.** Create a file `.dev.vars` in the project folder with one line: `CARTO_API_KEY=<paste the key>`. It is never uploaded.
6. **First deploy:** section 3.

## 2. Run locally

1. `npm run dev`
2. Open `http://localhost:8787/` (At a Glance) or `http://localhost:8787/dashboard.html`.
3. Edit, save, refresh. Stop with Ctrl+C.

Viral loads stay empty until you run `npm run build:data` (about 10 minutes; ends with "Wrote ... files"). If the project is under `/mnt` in WSL, restart `npm run dev` after adding new files.

Before publishing run `npm test` (expect `fail 0`).

## 3. Deploy and publish

Cloudflare (Workers Builds) builds and deploys the site whenever `main` changes. Every night at 08:30 UTC the Worker calls a deploy hook, which starts the same build, so viral data is refreshed. You do not deploy from your computer. This repo deploys the staging site `https://imicroseq-dashboard.bfjia.net`. Production: section 9.

A build runs `npm run build` (tests, then about 10 minutes of viral data), then `npx wrangler deploy --env=""`. If any step fails, nothing deploys and the site keeps the previous version.

### First deploy (once)

1. **Check the domain.** Cloudflare dashboard, account home: `bfjia.net` must be in the domain list of the account you will deploy to. If it is not, stop: that account cannot use the address.
2. **Connect the repo.**
   - Worker `imicroseq-dashboard` already exists: Workers & Pages, `imicroseq-dashboard`, Settings, Build, Connect.
   - It does not exist: Workers & Pages, Create, Import a repository. The project name must be exactly `imicroseq-dashboard` (the `name` in `wrangler.toml`).

   Then: sign in to GitHub and allow the Cloudflare app access to `bfjia/iMicroSeq_Dashboard`. Pick that repo and fill in:

   | Setting | Value |
   |---|---|
   | Branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy --env=""` |
   | Builds for non-production branches | Off (each build costs about 15 build minutes) |

   Save (or Create and deploy).
3. **Watch the build.** The Worker, Deployments tab (build list). Running takes 10 to 15 minutes; success = live. Failed: section 7.
4. **Store the map key on the Worker.** Command line, in the project folder:
   1. `npx wrangler login`. A browser opens; click Allow. If none opens, copy the link it prints into a browser.
   2. `npx wrangler secret put CARTO_API_KEY --env=""`. Paste the key, press Enter. It should end with "Success". It works at once; no redeploy.

   Or on the website: the Worker, Settings, Variables and Secrets, Add. Type: Secret. Variable name: `CARTO_API_KEY`. Value: paste the key. Click Deploy. Later builds keep it.
5. **Set up the nightly rebuild.**
   1. The Worker, Settings, Build, Deploy Hooks, Create. Name `nightly`, branch `main`. Copy the URL and keep it in your password manager; anyone with it can start a build.
   2. Store it like the map key, with the name `DEPLOY_HOOK_URL`: `npx wrangler secret put DEPLOY_HOOK_URL --env=""`, or the website method in step 4.
6. **Check the site.** Open `https://imicroseq-dashboard.bfjia.net` (the first time, the address can take a few minutes to start working). Hero numbers appear, the map shows streets, and the footer says "current data is from <today>". The next morning the date should move on by itself.
7. **If you used GitHub Actions before:** delete the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (repo, Settings, Secrets and variables, Actions), then delete that token in Cloudflare (My Profile, API Tokens).

### Publish a change

1. `git add -A`, `git commit -m "Describe the change"`, `git push origin dev`.
2. GitHub: Pull requests, New pull request, base `main`, compare `dev`, Create pull request.
3. After review: Merge pull request, Confirm merge.
4. The build starts by itself (the Worker, Deployments tab). 10 to 15 minutes; success = live.
5. Check the site: the footer shows when live data was fetched and "current data is from <today>" for viral loads.

Deploy without a change: `curl -X POST "<deploy hook URL>"` (from step 5), or retry the latest build in the build list.

Roll back: the Worker, Deployments, pick an earlier version, Rollback. This lasts until the next build (the next merge or that night), so also revert the change: open the merged PR on GitHub, click Revert, merge the new PR.

Emergency only, if Cloudflare builds are down: `npm run cf:deploy` from your computer (after `npx wrangler login`) tests, builds and deploys staging in about 10 minutes.

## 4. Using the dashboard

Proof of concept for demonstration only. Not for scientific interpretation. Check numbers against the [data portal](https://imicroseq-dataportal.ca/).

**Freshness.** All panels except viral loads are live, cached up to 1 hour. Viral loads are rebuilt nightly. The footer shows both dates.

**Share a view.** Set the controls, copy the browser address.

| Panel | Shows and controls | Notes |
|---|---|---|
| Hero cards (At a Glance) | Samples, sites, active sites (last 12 months), organisms, data sources, latest sample | "Not Provided", "Not Applicable" and blank are not counted. |
| Samples Captured Over Time | Total samples to date (Cumulative, the default) or samples per month by organism (Monthly) | Monthly: up to 7 organisms coloured, rest "Other" (gray). |
| Environmental Sites | One bar split by site type, share in the legend | Top 8 plus "Other". |
| Sample Coverage | One circle per site, size = samples, blue = active, light blue = historical. Hover for details, click to open its viral loads | Sites without GPS sit at their province capital. Samples with no site are not shown. Click the map once to enable scroll zoom. |
| Sample breakdown | X axis and Segment By dropdowns, swap button, Count or Percent | Max 7 segments plus "Other". |
| Data quality checks (for data stewards) | Own page, not in the main menu. Interactive Dashboard footer: Show data quality checks (or open `/qa`) | Five checks: metadata completeness (required fields marked), latest sample per data source (orange = none in 12 months), values written more than one way, sites without usable coordinates, and viral measurement values that are not plotted (from the nightly build). Report problems to the data portal team; fix them at the source, not here. Hidden, not protected: anyone can open it. |
| Viral loads | Province, City, Site, Organism, Gene Target, Measurement Unit; From and To dates; 3m, 6m, 12m, All; switches: line, full-series LOESS, PMMoV normalisation, log scale | RT-PCR only. Dots are the mean per date with error bars (SEM); the solid gray line is a smoothed trend. Default: Alberta, Influenza A virus, last 12 months. "All" combines data without correcting for differences between labs. PMMoV normalisation awaits scientific sign-off and currently has data only for Ontario. |

## 5. Maintain

Monthly:

1. The Worker, Deployments tab: recent builds succeeded, one per night.
2. Footer: the viral loads date is within a day or two.
3. Cloudflare, Workers & Pages, the Worker, Metrics: requests well under 100,000 per day.
4. Build minutes (account billing or usage page): well under 3,000 per month (expect about 500).

Every three months: `npm install -D wrangler@latest`, `npm test`, publish (section 3). Check the pinned chart library versions in `public/index.html`, `public/dashboard.html` and `public/qa.html`.

Rotate a key: map key, get a new one from CARTO, run `npx wrangler secret put CARTO_API_KEY --env=""`, update `.dev.vars`. Deploy hook: delete it (Settings, Build, Deploy Hooks), create a new one, store it again (section 3, first deploy, step 5).

If the portal adds or renames fields: update the names in `public/js/config.js` (section 6), preview, publish.

## 6. Common changes

In `public/js/config.js`. Then preview (section 2), `npm test`, publish (section 3). Field names must match the portal exactly.

| Change | Before, after |
|---|---|
| Add an explorer field | Add `host_age: 'Host age',` to `EXPLORER_FIELDS` |
| Rename a label | `organism: 'Organism',` becomes `organism: 'Species',` |
| Active-site window | `ACTIVE_DAYS = 365;` becomes `180` |
| Colours | Edit hex codes in `PALETTE` (max 8, check colour-blind separation) |
| Named segments | `EXPLORER_TOP_N = 7;` becomes `5` (max 7) |
| Completeness field | Add `host_age: 'Host age',` to `COMPLETENESS_FIELDS` (and to `REQUIRED_FIELDS` if the specification requires it) |
| Spelling check field | Add `geo_loc_name_county: 'County',` to `QA_NAME_FIELDS` |
| Another "no value" term | Add `'Unknown',` to `NULL_TERMS` |

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Map blank, tiles 503 | `CARTO_API_KEY` missing on the Worker | `npx wrangler secret put CARTO_API_KEY --env=""` |
| Panel says "Could not load this from the data portal" | Portal API down, or ad blocker | Disable ad blockers, click Try again, check the portal |
| Viral data is old, no build that night | `DEPLOY_HOOK_URL` missing or the hook was deleted | The Worker, Logs: look for "DEPLOY_HOOK_URL secret is not set" or "Deploy hook failed". Redo section 3, first deploy, step 5 |
| Viral data is old, builds failing | See the build log | The Worker, Deployments, open the failed build, read the last red lines |
| Build log ends in "Build was timed out" | Portal API slow; builds stop at 20 minutes | Retry later. If it keeps happening, send the log to the developer. The site keeps the last good data. |
| Build fails in `build-viral-loads` | Portal API changed, or row count mismatch | Retry once. If it repeats, send the log to the developer. The site keeps the last good data. |
| Build fails at the deploy step | Worker name or domain | The Worker name must equal `name` in `wrangler.toml`; `bfjia.net` must be in this Cloudflare account |
| Numbers look odd | Data issue | Compare with the [data portal](https://portal-ui.imicroseq-dataportal.ca/explorer/environmental) |
| Local 404 on a new file | Server started before the file existed | Ctrl+C, `npm run dev` |

## 8. Handover

| Access | Where |
|---|---|
| GitHub repo admin | Repo, Settings, Collaborators |
| Cloudflare account member | Cloudflare, Manage Account, Members |
| CARTO key | `<fill in: who owns the CARTO account>` |
| Cloudflare app on GitHub | GitHub, Settings, Applications, Cloudflare Workers and Pages: which repos it can read |
| Secrets | `CARTO_API_KEY`, `DEPLOY_HOOK_URL` (both on the Worker). Rotate when someone leaves (section 5). |

Contacts: data portal `<fill in: data portal contact>`; Cloudflare account owner `<fill in>`; key rotation `<fill in>`.

## 9. Move to production

Production is a separate repo; you open a pull request from this repo into it. Never deploy with `--env production` from this repo.

1. If the repos share no history: `git remote add prod <fill in: production repo URL>`, then `git push prod dev`.
2. Open a pull request into the production repo's `main` and merge it. Nothing deploys yet.
3. In the Cloudflare account that owns `imicroseq-dataportal.ca`: Workers & Pages, `dashboard-imicroseq-dataportal-ca`, Settings, Build, Connect. Same settings as section 3, step 2, except: the production repo, and deploy command `npx wrangler deploy --env production`. The first build starts the cutover.
4. Map key, if the Worker has none yet: `npx wrangler secret put CARTO_API_KEY --env production`.
5. Nightly rebuild: create a deploy hook on that Worker (section 3, step 5), then `npx wrangler secret put DEPLOY_HOOK_URL --env production`.
6. Check `https://dashboard.imicroseq-dataportal.ca`: pages load, footer dates current, map shows tiles.
7. In the production repo update the live links in `README.md` and `CLAUDE.md`, and `HELP_URL` in `public/js/config.js`. Publish.
8. Optional: disconnect or delete the staging Worker `imicroseq-dashboard` to save build minutes (both Workers share the account's 3,000 if they are in the same account).
