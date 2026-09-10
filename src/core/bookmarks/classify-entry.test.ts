import { describe, expect, it } from 'vitest';
import { isScannable } from './classify-entry';

describe('isScannable', () => {
  it('accepts ordinary public http(s) urls', () => {
    expect(isScannable('https://example.com/a')).toBe(true);
    expect(isScannable('http://example.com')).toBe(true);
  });

  it('rejects non-web schemes', () => {
    for (const url of [
      'javascript:void(0)',
      'file:///Users/me/notes.txt',
      'chrome://extensions',
      'chrome-extension://abc/page.html',
      'data:text/html,hi',
      'about:blank',
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('rejects loopback and private hosts', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1/x',
      'http://[::1]/x',
      'http://192.168.1.10/x',
      'http://10.0.0.5/x',
      'http://172.16.4.2/x',
      'http://169.254.1.1/x',
      'http://nas.local/x',
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('rejects unparseable input', () => {
    expect(isScannable('not a url')).toBe(false);
  });

  it('rejects IPv6 private, link-local, unspecified, and mapped hosts', () => {
    for (const url of [
      'http://[fd00::1]/', // unique-local, fc00::/7
      'http://[fe80::1]/', // link-local, fe80::/10
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
      'http://[::]/', // unspecified address
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('rejects widened IPv4 private ranges', () => {
    for (const url of [
      'http://0.0.0.0/x', // 0.0.0.0/8
      'http://0.1.2.3/x', // 0.0.0.0/8
      'http://100.64.0.1/x', // CGNAT, 100.64.0.0/10
      'http://100.127.255.255/x', // CGNAT, 100.64.0.0/10
    ]) {
      expect(isScannable(url), url).toBe(false);
    }
  });

  it('does not reject ordinary domains that merely start with IPv6-ish hex prefixes', () => {
    expect(isScannable('http://fcbook.example/')).toBe(true);
    expect(isScannable('http://fe80.example.com/')).toBe(true);
  });

  it('accepts ordinary public IPv6 hosts and boundary-adjacent IPv4 hosts', () => {
    expect(isScannable('http://[2001:db8::1]/')).toBe(true);
    expect(isScannable('http://100.63.0.1/x')).toBe(true); // just below CGNAT range
    expect(isScannable('http://100.128.0.1/x')).toBe(true); // just above CGNAT range
  });
});
