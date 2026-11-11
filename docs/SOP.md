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

GitHub deploys the site whenever `main` changes, and again every night. You do not deploy from your computer. This repo deploys the staging site `https://imicroseq-dashboard.bfjia.net`. Production: section 9.

### First deploy (once)

1. **Check the domain.** Cloudflare dashboard, account home: `bfjia.net` must be in the domain list of the account you will deploy to. If it is not, stop: that account cannot use the address.
2. **Create a deploy token.** Profile icon, My Profile, API Tokens, Create Token, "Edit Cloudflare Workers" template, Use template. Each policy's resources are behind its pencil icon:
   1. Zone policy, pencil: include the specific zone `bfjia.net` (or all zones). Save.
   2. Account policy, pencil: the account that owns `bfjia.net`. Save.
   3. Leave the User policy. Continue to summary, Create Token. Copy the token now; it is shown once.
3. **Copy the Account ID.** Workers & Pages overview, right-hand side.
4. **Give both to GitHub.** Repo, Settings, Secrets and variables, Actions, Secrets tab, New repository secret. Name `CLOUDFLARE_API_TOKEN`, paste the token, Add secret. Repeat with `CLOUDFLARE_ACCOUNT_ID`. On the Variables tab there must be no `WRANGLER_ENV` (or it is empty).
5. **Merge `dev` into `main`** (steps 2 and 3 of "Publish a change" below). The merge starts the deploy.
6. **Watch it.** Actions tab, "Build and deploy": yellow = running (10 to 15 minutes), green tick = live. Red: section 7.
7. **Store the map key on the Worker.** Only possible after step 6 (the Worker exists only after its first deploy). In the project folder:
   1. `npx wrangler login`. A browser opens; click Allow. If none opens, copy the link it prints into a browser.
   2. `npx wrangler secret put CARTO_API_KEY --env=""`. Paste the key, press Enter. It should end with "Success". It works at once; no redeploy.

   Or on the website: Cloudflare, Workers & Pages, `imicroseq-dashboard`, Settings, Variables and Secrets, Add. Type: Secret. Variable name: `CARTO_API_KEY`. Value: paste the key. Click Deploy. Later deploys from GitHub keep it.
8. **Check the site.** Open `https://imicroseq-dashboard.bfjia.net` (the first time, the address can take a few minutes to start working). Hero numbers appear, the map shows streets, and the Interactive Dashboard footer shows "Viral loads as of <today>".

### Publish a change

1. `git add -A`, `git commit -m "Describe the change"`, `git push origin dev`.
2. GitHub: Pull requests, New pull request, base `main`, compare `dev`, Create pull request.
3. After review: Merge pull request, Confirm merge.
4. The deploy starts by itself. Actions tab, "Build and deploy": yellow = running (10 to 15 minutes), green tick = live.
5. Check the site: the footer shows "fetched <date>" and, on the Interactive Dashboard, "Viral loads as of <today>".

Deploy without a change: Actions tab, Build and deploy, Run workflow, branch `main`.

Roll back: open the merged PR on GitHub, click Revert, merge the new PR. Alternatively re-run an older green run (Re-run all jobs); this rebuilds viral data from today.

Emergency only, if GitHub Actions is down: `npm run cf:deploy` from your computer (after `npx wrangler login`) builds and deploys staging in about 10 minutes.

## 4. Using the dashboard

Proof of concept for demonstration only. Not for scientific interpretation. Check numbers against the [data portal](https://imicroseq-dataportal.ca/).

**Freshness.** All panels except viral loads are live, cached up to 1 hour. Viral loads are rebuilt nightly. The footer shows both dates.

**Share a view.** Set the controls, copy the browser address.

| Panel | Shows and controls | Notes |
|---|---|---|
| Hero cards (At a Glance) | Samples, sites, active sites (last 12 months), organisms, data sources, latest sample | "Not Provided", "Not Applicable" and blank are not counted. |
| Sampling Activity | Samples per month by organism; Monthly or Cumulative buttons | Up to 7 organisms coloured, rest "Other" (gray). |
| Environmental Sites | Samples per site type and share | Top 8 plus "Other". |
| Sample Coverage | One circle per site, size = samples, blue = active, gray = historical. Hover for details, click to open its viral loads | Sites without GPS sit at their province capital. Samples with no site are not shown (count under the map). Click the map once to enable scroll zoom. |
| Sample breakdown | X axis and Segment By dropdowns, swap button, Count or Percent | Max 7 segments plus "Other". |
| Metadata completeness | None | Per field: Recorded, Not provided or not applicable, Blank. Multivalued fields are approximate. |
| Viral loads | Province, City, Site, Organism, Gene Target, Measurement Unit; From and To dates; 3m, 6m, 12m, All; switches: line, full-series LOESS, PMMoV normalisation, log scale | RT-PCR only. Dots are the mean per date with error bars (SEM); the dashed line is a smoothed trend. Default: Alberta, Influenza A virus, last 12 months. "All" combines data without correcting for differences between labs. PMMoV normalisation awaits scientific sign-off and currently has data only for Ontario. |

## 5. Maintain

Monthly:

1. Actions tab: recent "Build and deploy" runs are green.
2. Interactive Dashboard footer: viral date is within a day or two.
3. Cloudflare, Workers & Pages, the Worker, Metrics: requests well under 100,000 per day.
4. GitHub stops the nightly schedule after 60 days without repo activity. If it stopped: Actions tab, Enable workflow.

Every three months: `npm install -D wrangler@latest`, `npm test`, publish (section 3). Check the pinned chart library versions in `public/index.html` and `public/dashboard.html`.

Rotate a key: map key, get a new one from CARTO, run `npx wrangler secret put CARTO_API_KEY --env=""`, update `.dev.vars`. Cloudflare token, create a new one (section 3, first deploy, step 2), replace the GitHub secret, delete the old token.

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
| Completeness field | Add `host_age: 'Host age',` to `COMPLETENESS_FIELDS` |
| Another "no value" term | Add `'Unknown',` to `NULL_TERMS` |

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Map blank, tiles 503 | `CARTO_API_KEY` missing on the Worker | `npx wrangler secret put CARTO_API_KEY --env=""` || Panel says "Could not load this from the data portal" | Portal API down, or ad blocker | Disable ad blockers, click Try again, check the portal |
| Viral data is old | Nightly workflow failing | Actions tab: open the latest red run, read the failing step |
| Red at "Build viral-load files" | Portal API changed, or row count mismatch | Re-run all jobs once. If it repeats, send the log to the developer. The site keeps the last good data. |
| Red at "Deploy to Cloudflare" | Token, account ID or domain | Check both secrets. `bfjia.net` must be in that Cloudflare account and in the token's Zone policy (section 3, first deploy, steps 1 and 2). If the error is about the domain, edit the token and add DNS Write to the Zone policy |
| Numbers look odd | Data issue | Compare with the [data portal](https://portal-ui.imicroseq-dataportal.ca/explorer/environmental) |
| Local 404 on a new file | Server started before the file existed | Ctrl+C, `npm run dev` |

## 8. Handover

| Access | Where |
|---|---|
| GitHub repo admin | Repo, Settings, Collaborators |
| Cloudflare account member | Cloudflare, Manage Account, Members |
| CARTO key | `<fill in: who owns the CARTO account>` |
| Secrets | `CARTO_API_KEY` (Worker), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (GitHub). Rotate when someone leaves (section 5). |

Contacts: data portal `<fill in: data portal contact>`; Cloudflare account owner `<fill in>`; key rotation `<fill in>`.

## 9. Move to production

Production is a separate repo; you open a pull request from this repo into it. Never deploy with `--env production` from this repo.

1. If the repos share no history: `git remote add prod <fill in: production repo URL>`, then `git push prod dev`.
2. In the production repo (Settings, Secrets and variables, Actions) add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and variable `WRANGLER_ENV` = `production`. Do this before merging.
3. Ensure the production Worker has the map key: `npx wrangler secret put CARTO_API_KEY --env production` (it may already have one).
4. Open a pull request into the production repo's `main` and merge it.
5. Run the workflow manually (section 3); wait for green.
6. Check `https://dashboard.imicroseq-dataportal.ca`: pages load, footer dates current, map shows tiles.
7. In the production repo update the live links in `README.md` and `CLAUDE.md`, and `HELP_URL` in `public/js/config.js`. Publish.
