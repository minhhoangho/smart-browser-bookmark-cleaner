import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './normalize-url';

describe('normalizeUrl', () => {
  it('unifies scheme, www, case, and trailing slash', () => {
    expect(normalizeUrl('http://www.Example.com/Docs/')).toBe('https://example.com/Docs');
  });

  it('keeps the root path stable', () => {
    expect(normalizeUrl('https://example.com')).toBe(normalizeUrl('https://example.com/'));
  });

  it('drops tracking params but keeps meaningful ones', () => {
    expect(normalizeUrl('https://example.com/p?utm_source=x&fbclid=y&id=7'))
      .toBe('https://example.com/p?id=7');
  });

  it('is insensitive to query parameter order', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1'))
      .toBe(normalizeUrl('https://example.com/p?a=1&b=2'));
  });

  it('drops a plain fragment but keeps a hash route', () => {
    expect(normalizeUrl('https://example.com/p#intro')).toBe('https://example.com/p');
    expect(normalizeUrl('https://example.com/#/settings')).toBe('https://example.com/#/settings');
    expect(normalizeUrl('https://example.com/#!/inbox')).toBe('https://example.com/#!/inbox');
  });

  it('drops default ports but keeps explicit ones', () => {
    expect(normalizeUrl('http://example.com:80/a')).toBe('https://example.com/a');
    expect(normalizeUrl('http://example.com:8080/a')).toBe('https://example.com:8080/a');
  });

  it('returns non-http input and unparseable input untouched', () => {
    expect(normalizeUrl('javascript:void(0)')).toBe('javascript:void(0)');
    expect(normalizeUrl('  not a url  ')).toBe('not a url');
  });
});
