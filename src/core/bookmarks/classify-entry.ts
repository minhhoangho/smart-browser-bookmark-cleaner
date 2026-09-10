const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

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
  if (host === '::1' || host === '0.0.0.0') return false;
  if (host.endsWith('.local')) return false;
  if (PRIVATE_IPV4.test(host)) return false;

  return true;
}
