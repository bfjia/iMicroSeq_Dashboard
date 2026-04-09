## iMicroSeq Dashboard

POPULATE WITH TEXT :)

### Testing and Deploying to Cloudflare Workers

The app can run as a Cloudflare Worker with static assets:

1. **Prerequisites**: [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and a Cloudflare account. Log in with `npx wrangler login`.

2. **Local dev**: `npm run cf:dev` (TEST first locally before deploying).

3. **Deploy**: `npm run cf:deploy` (DEPLOY to cloudflare's edge network. The site will be live at imicroseq-dashboard.bfjia.net).

**Site data:** After updating `data/imicroseq.csv.xz`, regenerate assets under `public/data/` with `bash scripts/update_website_data.sh` (runs the Python builders). Chart payloads are **gzip-compressed JSON** (`.json.gz`); the browser decompresses them in `app.js`. For local testing, serve over HTTP (e.g. `npx serve public` or `python -m http.server --directory public`); opening the HTML file directly (`file://`) will not load data.


# HOW CLOUDFLARE WORKER WORKS WITH THIS APP:

## 1. What gets deployed

When you run `wrangler deploy` (or `npm run cf:deploy`):

- **Worker script**  
  Your `cf-worker/index.ts` is compiled and deployed; it forwards requests to static assets via the ASSETS binding.

- **Static assets**  
  Everything under `public/` (HTML, CSS, JS, images) is uploaded and attached to the Worker via the **ASSETS** binding (`[assets]` in `wrangler.toml`). Those files are stored on Cloudflare’s edge; they are **not** served by your own server.

So: one deployment = one Worker + one set of static files, both at the edge.

---

## 2. What happens on each request

All requests to your domain (e.g. `https://imicroseq-dashboard.bfjia.net`) that match your **routes** in `wrangler.toml` are sent to this Worker. The Worker’s **fetch** handler runs and decides how to respond.

```
Request → Cloudflare edge → Your Worker fetch() → Response
```

Inside the Worker:

1. **URL is checked**  
   `const url = new URL(request.url)` so you can branch on path (and host, etc.).

2. **Everything (HTML, CSS, JS, images, `/data/*.json.gz`)**  
   - For each path (e.g. `/`, `/styles.css`, `/app.js`, `/data/index_hero_stats.json.gz`, `/img/...`):
     - The Worker does **not** serve a file itself.
     - It forwards the request to the **ASSETS** binding: `return env.ASSETS.fetch(request)`.
   - **ASSETS** is a built-in binding that:
     - Looks up the requested path in the uploaded `public/` files.
     - Serves the matching file (with correct content-type, caching, etc.).
     - Returns 404 if there’s no matching asset.

So: **all responses** are static files from `public/` served through ASSETS (including gzip-compressed chart data under `/data/`).

---

## 3. Flow in one picture

```
Browser
   │
   ├─ GET /                    → Worker → ASSETS.fetch(request) → index.html
   ├─ GET /styles.css           → Worker → ASSETS.fetch(request) → styles.css
   ├─ GET /app.js               → Worker → ASSETS.fetch(request) → app.js
   ├─ GET /data/index_hero_stats.json.gz → Worker → ASSETS.fetch(request) → gzip
   └─ GET /img/imicroseq-logo.png → Worker → ASSETS.fetch(request) → image
```

---

## 4. Important details

- **Edge execution**  
  The Worker runs in Cloudflare’s data centers (edge), close to users. There is no long-lived server; each request triggers a short run of your `fetch` handler.

- **No Node/Express at runtime**  
  The Worker uses the **Fetch API** (Request/Response) and **env.ASSETS**. Local and production both run the same Worker (via `wrangler dev` or Cloudflare).

- **Caching**  
  Cloudflare can cache static assets at the edge based on the ASSETS binding’s behavior and response headers.

- **Custom domain**  
  The `routes` in `wrangler.toml` (e.g. `pattern = "imicroseq-dashboard.bfjia.net"` with `zone_name = "bfjia.net"`) tell Cloudflare to run this Worker for that host. DNS for `imicroseq-dashboard.bfjia.net` points to Cloudflare, so traffic hits the edge and then your Worker.

In short: **the Worker forwards every request to ASSETS**, which delivers the static files from `public/`.