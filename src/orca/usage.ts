import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UsageSnapshot, UsageWindow } from './types';

export function readUsageSnapshots(): UsageSnapshot[] {
  return [readClaudeUsage(), readCodexUsage()];
}

function readClaudeUsage(): UsageSnapshot {
  const home = os.homedir();
  const files = [
    path.join(home, '.claude.json'),
    path.join(home, '.claude', '.claude.json'),
    path.join(home, '.claude', 'stats-cache.json'),
  ];
  for (const file of files) {
    const data = readJson(file);
    if (!data) continue;
    const windows = extractWindows(data);
    if (windows.length > 0) {
      return { provider: 'Claude', status: '已读取本地用量', windows };
    }
    if (data.oauthAccount || data.primaryApiKey || data.userID) {
      return { provider: 'Claude', status: '已登录，暂无用量数字', windows: [] };
    }
  }
  return { provider: 'Claude', status: '未登录或暂无用量', windows: [] };
}

function readCodexUsage(): UsageSnapshot {
  const home = path.join(os.homedir(), '.codex');
  if (!fs.existsSync(home)) {
    return { provider: 'Codex', status: '未登录或暂无用量', windows: [] };
  }
  const candidates = [
    path.join(home, 'auth.json'),
    path.join(home, 'config.toml'),
  ];
  const signedIn = candidates.some((file) => fs.existsSync(file));
  const windows = walkForWindows(home, 0);
  if (windows.length > 0) {
    return { provider: 'Codex', status: '已读取本地用量', windows };
  }
  return {
    provider: 'Codex',
    status: signedIn ? '已登录，暂无用量数字' : '未登录或暂无用量',
    windows: [],
  };
}

function walkForWindows(dir: string, depth: number): UsageWindow[] {
  if (depth > 2) return [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const windows: UsageWindow[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      windows.push(...walkForWindows(full, depth + 1));
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    const data = readJson(full);
    if (data) windows.push(...extractWindows(data));
  }
  return windows.slice(0, 4);
}

function extractWindows(data: Record<string, unknown>): UsageWindow[] {
  const source = asRecord(data.rate_limits) ?? asRecord(data.rateLimits) ?? data;
  const windows: UsageWindow[] = [];
  for (const [name, value] of Object.entries(source)) {
    const record = asRecord(value);
    if (!record) continue;
    const used = numberField(record, ['used_percentage', 'usedPercentage', 'utilization']);
    if (used === null) continue;
    const reset = stringField(record, ['resets_at', 'resetsAt', 'reset_at']);
    windows.push({ name, usedPct: clampPct(used), resetAt: reset });
  }
  return windows;
}

function clampPct(value: number): number {
  const pct = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(999, Math.round(pct * 10) / 10));
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return asRecord(parsed);
  } catch {
    return null;
  }
}
