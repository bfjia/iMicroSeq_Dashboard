// Cloudflare Worker entry: serves static assets from public/

/** Worker bindings: ASSETS is the static asset fetcher (public folder) */
export interface Env {
  ASSETS: {
    fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: unknown
  ): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
