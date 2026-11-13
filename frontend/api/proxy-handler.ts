/** Общая логика Edge-прокси: используется и в Vercel-функции, и в dev-сервере. */

export const ALLOWED_HOSTS = new Set([
  'exoplanetarchive.ipac.caltech.edu',
  'gea.esac.esa.int',
  'voparis-tap-planeto.obspm.fr',
  'archives.ia2.inaf.it',
  'simbad.cfa.harvard.edu',
  'simbad.cds.unistra.fr',
  'simbad.u-strasbg.fr',
  'exo.mast.stsci.edu',
]);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export async function handleProxyRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get('u');
  if (!raw) return json(400, { error: 'missing ?u=<encoded url>' });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json(400, { error: 'invalid url' });
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return json(403, { error: 'only http(s) allowed' });
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return json(403, { error: `host not allowed: ${target.hostname}` });
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'follow',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (err) {
    return json(502, { error: `upstream fetch failed: ${(err as Error).message}` });
  }

  const out = new Headers(CORS_HEADERS);
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) out.set('Content-Type', upstreamType);
  out.set('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
