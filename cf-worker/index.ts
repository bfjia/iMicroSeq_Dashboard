// Cloudflare Worker entry: proxies CARTO map tiles and serves static assets from public/

/** Worker bindings */
export interface Env {
  /** Static asset fetcher (public folder) */
  ASSETS: {
    fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  };
  /** CARTO basemaps API key. Stored as a Worker secret so it never reaches the browser or git. */
  CARTO_API_KEY?: string;
}

// Map tiles requested by Leaflet: /tiles/light_all/{z}/{x}/{y}.png (or {y}@2x.png on retina screens)
const TILE_PATH = /^\/tiles\/light_all\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(@2x)?\.png$/;
const MAX_ZOOM = 20;

// Fetch a tile from CARTO with the API key added server-side
async function fetchTile(match: RegExpMatchArray, env: Env): Promise<Response> {
  const [, zs, xs, ys, retina = ''] = match;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys);
  const tilesPerSide = 2 ** z;
  if (z > MAX_ZOOM || x >= tilesPerSide || y >= tilesPerSide) {
    return new Response('Not found', { status: 404 });
  }
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

  // Pass on only the headers the browser needs
  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
    'Cache-Control': upstream.ok ? 'public, max-age=86400' : 'no-store',
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: unknown
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/tiles/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
      }
      const match = pathname.match(TILE_PATH);
      return match ? fetchTile(match, env) : new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
