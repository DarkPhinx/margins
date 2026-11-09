// @vitest-environment node
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentType, deepLinkIn, fileFor, isAppUrl, isExternalUrl } from '../electron/paths';

const root = join(sep === '\\' ? 'C:\\' : '/', 'Program Files', 'Margins', 'dist-desktop');

describe('the Windows app serving its own files', () => {
  it('answers its own addresses only', () => {
    expect(isAppUrl('margins://app/bsb/JHN/3')).toBe(true);
    expect(isAppUrl('margins://other/x')).toBe(false);
    expect(isAppUrl('https://app/x')).toBe(false);
    expect(isAppUrl('not a url')).toBe(false);
    expect(fileFor(root, 'https://example.com/index.html')).toBeNull();
  });

  it('serves files from inside the program, ignoring the query', () => {
    expect(fileFor(root, 'margins://app/bibles/bsb/JHN.json')).toEqual({ file: join(root, 'bibles', 'bsb', 'JHN.json'), page: false });
    expect(fileFor(root, 'margins://app/words/orig/43.json?v=abc')).toEqual({ file: join(root, 'words', 'orig', '43.json'), page: false });
  });

  it('gives index.html for any page address, as a single-page app needs', () => {
    const index = { file: join(root, 'index.html'), page: true };
    expect(fileFor(root, 'margins://app/')).toEqual(index);
    expect(fileFor(root, 'margins://app')).toEqual(index);
    expect(fileFor(root, 'margins://app/bsb/JHN/3')).toEqual(index);
    expect(fileFor(root, 'margins://app/signin?code=abc')).toEqual(index);
  });

  it('never reads outside the program', () => {
    expect(fileFor(root, 'margins://app/..%2f..%2fsecret.txt')).toBeNull();
    expect(fileFor(root, 'margins://app/%2e%2e%5c%2e%2e%5csecret.txt')).toBeNull();
    expect(fileFor(root, 'margins://app/bibles%00.json')).toBeNull();
    expect(fileFor(root, 'margins://app/%E0%A4%A')).toBeNull();
    // The folder's name as a prefix isn't enough.
    expect(fileFor(root, 'margins://app/..%2fdist-desktop-other%2fx.json')).toBeNull();
  });

  it('sends web and email links to the browser, nothing else', () => {
    expect(isExternalUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    expect(isExternalUrl('http://example.com')).toBe(true);
    expect(isExternalUrl('mailto:someone@example.com')).toBe(true);
    expect(isExternalUrl('file:///C:/Windows/system32/calc.exe')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('margins://app/')).toBe(false);
  });

  it('finds a margins:// link among the arguments Windows starts it with', () => {
    expect(deepLinkIn(['C:\\Margins\\Margins.exe', '--allow-file-access', 'margins://app/signin?code=1'])).toBe('margins://app/signin?code=1');
    expect(deepLinkIn(['C:\\Margins\\Margins.exe'])).toBeNull();
    expect(deepLinkIn(['margins://elsewhere/x'])).toBeNull();
  });

  it('labels files by kind', () => {
    expect(contentType('a/index.html')).toMatch(/^text\/html/);
    expect(contentType('JHN.JSON')).toMatch(/^application\/json/);
    expect(contentType('font.woff2')).toBe('font/woff2');
    expect(contentType('x.bin')).toBe('application/octet-stream');
  });
});
