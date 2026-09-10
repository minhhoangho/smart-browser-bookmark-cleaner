// 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8, 169.254.0.0/16,
// 172.16.0.0/12, 192.168.0.0/16.
const PRIVATE_IPV4 =
  /^(0\.|10\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

// fc00::/7 (unique-local, the RFC 4193 analogue of 192.168.x.x).
const IPV6_UNIQUE_LOCAL = /^f[cd][0-9a-f]{2}:/i;
// fe80::/10 (link-local).
const IPV6_LINK_LOCAL = /^fe[89ab][0-9a-f]:/i;

/**
 * True when `host` is an IPv6 literal (already stripped of its brackets) that
 * must never be scanned: the unspecified address, unique-local, link-local,
 * or any IPv4-mapped form. Any IPv4-mapped address (`::ffff:a.b.c.d`, which
 * the URL parser may serialize with the IPv4 tail in compressed hex, e.g.
 * `::ffff:7f00:1`) is rejected outright rather than decoded and re-checked —
 * a bookmark pointing at one is never a legitimate public target.
 */
function isUnscannableIpv6(host: string): boolean {
  if (!host.includes(':')) return false; // not an IPv6 literal at all
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('::ffff:')) return true;
  return IPV6_UNIQUE_LOCAL.test(host) || IPV6_LINK_LOCAL.test(host);
}

/** True when this URL may be sent to the network by the link scanner. */
export function isScannable(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local')) return false;
  if (isUnscannableIpv6(host)) return false;
  if (PRIVATE_IPV4.test(host)) return false;

  return true;
}
