import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBinaryAssetUrls } from './binaryDownloadUrls.ts';

test('resolveBinaryAssetUrls builds GitHub Release URLs for Unix binaries', () => {
  const urls = resolveBinaryAssetUrls({
    version: '0.0.2',
    platform: 'linux',
    arch: 'x64',
    source: 'github-release',
  });

  assert.equal(
    urls.url,
    'https://github.com/NAMEWTA/vault-agents/releases/download/0.0.2/vault-agents-server-linux-x64'
  );
  assert.equal(
    urls.checksumUrl,
    'https://github.com/NAMEWTA/vault-agents/releases/download/0.0.2/vault-agents-server-linux-x64.sha256'
  );
});

test('resolveBinaryAssetUrls ignores the legacy R2 source and still uses GitHub', () => {
  const urls = resolveBinaryAssetUrls({
    version: '0.0.2',
    platform: 'win32',
    arch: 'x64',
    source: 'cloudflare-r2',
  });

  assert.equal(
    urls.url,
    'https://github.com/NAMEWTA/vault-agents/releases/download/0.0.2/vault-agents-server-win32-x64.exe'
  );
});

test('resolveBinaryAssetUrls builds GitHub latest fallback URLs', () => {
  const urls = resolveBinaryAssetUrls({
    version: '0.0.2',
    platform: 'darwin',
    arch: 'arm64',
    source: 'github-release',
    releaseChannel: 'latest',
  });

  assert.equal(
    urls.url,
    'https://github.com/NAMEWTA/vault-agents/releases/latest/download/vault-agents-server-darwin-arm64'
  );
});
