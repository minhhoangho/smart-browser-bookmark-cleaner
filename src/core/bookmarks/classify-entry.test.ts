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
});
