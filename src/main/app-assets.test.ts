import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppAssetPath } from './app-assets';

const assetRoot = path.resolve('dist');

describe('resolveAppAssetPath', () => {
  it('maps the protocol root to the built index', () => {
    expect(resolveAppAssetPath(assetRoot, '/')).toBe(
      path.join(assetRoot, 'index.html'),
    );
  });

  it('resolves nested application assets', () => {
    expect(resolveAppAssetPath(assetRoot, '/assets/app.js')).toBe(
      path.join(assetRoot, 'assets', 'app.js'),
    );
  });

  it.each([
    '/../package.json',
    '/assets/../../package.json',
    '/%2e%2e/package.json',
    '/assets/%2e%2e/%2e%2e/package.json',
    '/assets%5c..%5c..%5cpackage.json',
  ])('rejects path traversal: %s', (requestPath) => {
    expect(resolveAppAssetPath(assetRoot, requestPath)).toBeNull();
  });

  it.each([
    '/bad%2',
    '/bad%00name',
    '/asset:stream',
    '/asset./file.js',
    '/CON.txt',
    '/assets/NUL',
  ])(
    'rejects malformed or ambiguous paths: %s',
    (requestPath) => {
      expect(resolveAppAssetPath(assetRoot, requestPath)).toBeNull();
    },
  );
});
