const TRACKING_PREFIXES = ['utm_'];

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'yclid',
  'mc_cid', 'mc_eid', 'igshid', 'igsh', 'twclid', 'ttclid',
  '_ga', '_gl', 'ref_src', 'ref_url', 'spm', 'scm',
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p));
}

/**
 * Canonical form of a URL, used as the duplicate-detection key.
 * Non-http(s) and unparseable input is returned trimmed but otherwise untouched.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw.trim();

  // No explicit default-port stripping needed here: the WHATWG URL parser
  // already drops `:80` on http at parse time, and reassigning `protocol`
  // below drops `:443` for the new https scheme the same way. Both are
  // verified by the "drops default ports" cases in normalize-url.test.ts.
  url.protocol = 'https:';

  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  const kept = [...url.searchParams.entries()].filter(([key]) => !isTrackingParam(key));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  const isHashRoute = url.hash.startsWith('#!') || url.hash.startsWith('#/');
  if (!isHashRoute) url.hash = '';

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
