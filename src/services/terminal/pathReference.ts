export interface ReferenceCaret {
  line: number;
  ch: number;
}

export interface ReferenceSelection {
  anchor: ReferenceCaret;
  head: ReferenceCaret;
}

export function stripUriSuffix(value: string): string {
  const trimmed = value.trim();
  const query = trimmed.search(/[?#]/);
  return query === -1 ? trimmed : trimmed.slice(0, query);
}

export function formatAbsoluteDropPaths(paths: string[]): string {
  const formatted = paths
    .map((path) => stripUriSuffix(path))
    .filter((path) => path.length > 0)
    .map(quotePathIfNeeded)
    .join(' ');
  return formatted ? `${formatted} ` : '';
}

export function formatReference(path: string, selections: readonly ReferenceSelection[] | null | undefined): string {
  const clean = stripUriSuffix(path);
  if (!clean || !selections || selections.length === 0) return clean;
  return selections.map((selection) => formatSelection(clean, selection)).join('\n');
}

export function toAbsoluteReferencePath(
  vaultBase: string,
  vaultPath: string,
  platform: 'win32' | 'posix' = 'posix',
): string {
  const clean = stripUriSuffix(vaultPath).replace(/\\/g, '/');
  if (platform === 'win32' ? /^[A-Za-z]:\//.test(clean) : clean.startsWith('/')) {
    return platform === 'win32' ? clean.replace(/\//g, '\\') : clean;
  }
  const base = vaultBase.replace(/[\\/]+$/, '');
  const parts = clean.split('/').filter((part) => part.length > 0);
  return platform === 'win32' ? [base, ...parts].join('\\') : [base, ...parts].join('/');
}

export function nextUsageDelayMs(baseSec: number, consecutiveFailures: number): number {
  const base = Math.max(15, baseSec) * 1000;
  const failures = Math.max(0, Math.floor(consecutiveFailures));
  const factor = Math.min(8, 2 ** Math.min(failures, 3));
  return base * factor;
}

function formatSelection(path: string, selection: ReferenceSelection): string {
  const startLine = Math.min(selection.anchor.line, selection.head.line);
  const endLine = Math.max(selection.anchor.line, selection.head.line);
  if (startLine !== endLine) {
    return `${path}:${startLine + 1}-${endLine + 1}`;
  }
  const startCh = Math.min(selection.anchor.ch, selection.head.ch);
  const endCh = Math.max(selection.anchor.ch, selection.head.ch);
  if (startCh === endCh) return `${path}:${startLine + 1}`;
  return `${path}:${startLine + 1}(${startCh + 1}-${endCh})`;
}

function quotePathIfNeeded(path: string): string {
  if (!/[\s"]/.test(path)) return path;
  return `"${path.replace(/"/g, '\\"')}"`;
}
