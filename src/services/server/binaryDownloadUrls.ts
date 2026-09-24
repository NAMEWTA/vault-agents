import type { BinaryDownloadSource } from '../../settings/settings';

export const GITHUB_RELEASE_REPOSITORY = 'NAMEWTA/vault-agents';
export const SERVER_BINARY_PREFIX = 'vault-agents-server';

interface BinaryInfo {
  filename: string;
  url: string;
  checksumUrl: string;
}

export interface BinaryDownloadConfig {
  source: BinaryDownloadSource;
}

export interface ResolveBinaryAssetUrlsOptions extends BinaryDownloadConfig {
  version: string;
  platform?: NodeJS.Platform;
  arch?: string;
  releaseChannel?: 'version' | 'latest';
}

export function buildBinaryFilename(platform: string, arch: string): string {
  const ext = platform === 'win32' ? '.exe' : '';
  return `${SERVER_BINARY_PREFIX}-${platform}-${arch}${ext}`;
}

export function resolveBinaryAssetUrls(options: ResolveBinaryAssetUrlsOptions): BinaryInfo {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const filename = buildBinaryFilename(platform, arch);
  const releaseBaseUrl = options.releaseChannel === 'latest'
    ? `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/latest/download`
    : `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/download/${options.version}`;

  return {
    filename,
    url: `${releaseBaseUrl}/${filename}`,
    checksumUrl: `${releaseBaseUrl}/${filename}.sha256`,
  };
}