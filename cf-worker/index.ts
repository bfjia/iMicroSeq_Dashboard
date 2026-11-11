// Cloudflare Worker. Everything else is static assets from public/:
//   POST /api/graphql  -> portal GraphQL API, responses edge-cached for an hour
//   GET  /tiles/...    -> CARTO map tiles, API key added here so it never reaches the browser
//   nightly cron       -> calls the Workers Builds deploy hook, which rebuilds viral data and redeploys

export interface Env {
  ASSETS: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  CARTO_API_KEY?: string;
  DEPLOY_HOOK_URL?: string;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const ARRANGER = 'https://arranger-environmental.imicroseq-dataportal.ca/graphql';
const CACHE_SECONDS = 3600;
const MAX_BODY = 64 * 1024;

const TILE_PATH = /^\/tiles\/light_all\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(@2x)?\.png$/;
const MAX_ZOOM = 20;

// ─── GraphQL proxy ───────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function graphql(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Query too large', { status: 413 });
  if (/\bmutation\b/i.test(body)) return new Response('Read-only', { status: 400 });

  // Cache API only stores GET, so key the POST body as a GET URL on our own host.
  const origin = new URL(request.url).origin;
  const key = new Request(`${origin}/__cache/graphql/${await sha256(body)}`);
  const cache = (caches as unknown as { default: Cache }).default;

  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', 'HIT');
    return res;
  }

  const upstream = await fetch(ARRANGER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await upstream.text();
  const ok = upstream.ok && !text.includes('"errors":');
  const res = new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': ok ? `public, max-age=${CACHE_SECONDS}` : 'no-store',
      'x-fetched-at': new Date().toISOString(),
      'x-cache': 'MISS',
    },
  });
  if (ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ─── Map tiles ───────────────────────────────────────────────────────────────

async function tile(match: RegExpMatchArray, env: Env): Promise<Response> {
  const [, zs, xs, ys, retina = ''] = match;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);
  const side = 2 ** z;
  if (z > MAX_ZOOM || x >= side || y >= side) return new Response('Not found', { status: 404 });
  if (!env.CARTO_API_KEY) {
    console.error('CARTO_API_KEY secret is not set');
    return new Response('Map tiles are not configured', { status: 503 });
  }
  const url =
    `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}${retina}.png` +
    `?key=${encodeURIComponent(env.CARTO_API_KEY)}`;
  // Cache good tiles at the edge for a week; don't cache errors
  const upstream = await fetch(url, {
    cf: { cacheTtlByStatus: { '200-299': 604800, '400-599': 0 } },
  } as RequestInit);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': upstream.ok ? 'public, max-age=86400' : 'no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/graphql') return graphql(request, ctx);
    if (pathname.startsWith('/tiles/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
      }
      const match = pathname.match(TILE_PATH);
      return match ? tile(match, env) : new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    if (!env.DEPLOY_HOOK_URL) {
      console.error('DEPLOY_HOOK_URL secret is not set; nightly rebuild skipped');
      return;
    }
    ctx.waitUntil(
      fetch(env.DEPLOY_HOOK_URL, { method: 'POST' }).then((res) => {
        if (!res.ok) console.error(`Deploy hook failed: ${res.status}`);
        else console.log('Nightly rebuild started');
      }),
    );
  },
};
