import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UsageSnapshot, UsageWindow } from './types';

const REQUEST_TIMEOUT_MS = 10_000;

export async function readUsageSnapshots(): Promise<UsageSnapshot[]> {
  const snapshots = await Promise.all([
    safeRead('Claude', readClaudeUsage),
    safeRead('Codex', readCodexUsage),
    safeRead('Grok', readGrokUsage),
  ]);
  return snapshots;
}

async function safeRead(provider: string, read: () => Promise<UsageSnapshot>): Promise<UsageSnapshot> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取失败';
    return { provider, account: null, status: message, windows: [] };
  }
}

async function readClaudeUsage(): Promise<UsageSnapshot> {
  const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  const credentials = readJson(credentialsPath);
  const oauth = asRecord(credentials?.claudeAiOauth);
  const token = typeof oauth?.accessToken === 'string' ? oauth.accessToken : '';
  if (!token) {
    return { provider: 'Claude', account: null, status: '未登录，先运行 claude', windows: [] };
  }
  const data = await requestJson('https://api.anthropic.com/api/oauth/usage', {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
    'User-Agent': 'claude-code/2.1.0',
    Accept: 'application/json',
  });
  const windows = [
    mapPercentWindow('5小时', asRecord(data.five_hour), ['utilization', 'used_percentage']),
    mapPercentWindow('每周', asRecord(data.seven_day), ['utilization', 'used_percentage']),
  ].filter((window): window is UsageWindow => window !== null);
  return {
    provider: 'Claude',
    account: null,
    status: windows.length > 0 ? '已读取' : '已登录，暂无用量数字',
    windows,
  };
}

async function readCodexUsage(): Promise<UsageSnapshot> {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const auth = readJson(path.join(home, 'auth.json'));
  const tokens = asRecord(auth?.tokens);
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token : '';
  if (!accessToken) {
    return { provider: 'Codex', account: null, status: '未登录，先运行 codex', windows: [] };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'codex-cli',
    'OpenAI-Beta': 'codex-1',
    originator: 'Codex Desktop',
    Accept: 'application/json',
  };
  if (typeof tokens?.account_id === 'string' && tokens.account_id) {
    headers['ChatGPT-Account-Id'] = tokens.account_id;
  }
  const data = await requestJson('https://chatgpt.com/backend-api/wham/usage', headers);
  const rateLimit = asRecord(data.rate_limit);
  const windows = [
    mapCodexWindow(asRecord(rateLimit?.primary_window)),
    mapCodexWindow(asRecord(rateLimit?.secondary_window)),
  ].filter((window): window is UsageWindow => window !== null);
  const plan = typeof data.plan_type === 'string' ? data.plan_type : null;
  return {
    provider: 'Codex',
    account: plan,
    status: windows.length > 0 ? '已读取' : '已登录，暂无用量数字',
    windows,
  };
}

async function readGrokUsage(): Promise<UsageSnapshot> {
  const session = readGrokSession();
  if (!session) {
    return { provider: 'Grok', account: null, status: '未登录，先运行 grok login', windows: [] };
  }
  if (session.expiresAtMs !== null && session.expiresAtMs - Date.now() <= 5 * 60 * 1000) {
    return { provider: 'Grok', account: session.email, status: '登录已过期，先运行一次 grok', windows: [] };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    Accept: 'application/json',
  };
  if (session.userId) headers['x-userid'] = session.userId;
  const data = await requestJson('https://cli-chat-proxy.grok.com/v1/billing?format=credits', headers);
  const config = asRecord(data.config) ?? data;
  const windows: UsageWindow[] = [];
  const weekly = numberField(config, ['creditUsagePercent']);
  if (weekly !== null) {
    windows.push({
      name: '每周',
      usedPct: clampPct(weekly),
      resetAt: resetLabel(stringField(asRecord(config.currentPeriod) ?? {}, ['end']) ?? stringField(config, ['billingPeriodEnd'])),
    });
  }
  const monthly = monthlyPercent(config);
  if (monthly) windows.push(monthly);
  return {
    provider: 'Grok',
    account: session.email,
    status: windows.length > 0 ? '已读取' : '已登录，暂无用量数字',
    windows,
  };
}

function readGrokSession(): { accessToken: string; userId: string | null; email: string | null; expiresAtMs: number | null } | null {
  const home = process.env.GROK_HOME || path.join(os.homedir(), '.grok');
  const parsed = readJson(path.join(home, 'auth.json'));
  if (!parsed) return null;
  const entries = Object.entries(parsed);
  const preferred = entries.find(([key]) => key === 'https://auth.x.ai' || key.startsWith('https://auth.x.ai::'));
  const chosen = asRecord((preferred ?? entries[0])?.[1]);
  const accessToken = typeof chosen?.key === 'string' ? chosen.key : '';
  if (!accessToken) return null;
  const expires = typeof chosen?.expires_at === 'string' ? Date.parse(chosen.expires_at) : Number.NaN;
  return {
    accessToken,
    userId: typeof chosen?.user_id === 'string' ? chosen.user_id : null,
    email: typeof chosen?.email === 'string' ? chosen.email : null,
    expiresAtMs: Number.isFinite(expires) ? expires : null,
  };
}

function mapCodexWindow(record: Record<string, unknown> | null): UsageWindow | null {
  if (!record) return null;
  const used = numberField(record, ['used_percent', 'used_percentage']);
  if (used === null) return null;
  const seconds = numberField(record, ['limit_window_seconds']);
  const name = seconds !== null && seconds > 8 * 60 * 60 ? '每周' : '5小时';
  const reset = record.reset_at;
  const resetAt = typeof reset === 'number'
    ? resetLabel(new Date(reset > 10_000_000_000 ? reset : reset * 1000).toISOString())
    : resetLabel(typeof reset === 'string' ? reset : null);
  return { name, usedPct: clampPct(used), resetAt };
}

function mapPercentWindow(name: string, record: Record<string, unknown> | null, keys: string[]): UsageWindow | null {
  if (!record) return null;
  const used = numberField(record, keys);
  if (used === null) return null;
  return {
    name,
    usedPct: clampPct(used),
    resetAt: resetLabel(stringField(record, ['resets_at', 'resetsAt'])),
  };
}

function monthlyPercent(config: Record<string, unknown>): UsageWindow | null {
  const limit = money(config.monthlyLimit);
  const used = money(config.used);
  if (limit === null || used === null || limit <= 0) return null;
  return {
    name: '每月',
    usedPct: clampPct((used / limit) * 100),
    resetAt: resetLabel(stringField(asRecord(config.currentPeriod) ?? {}, ['end']) ?? stringField(config, ['billingPeriodEnd'])),
  };
}

function money(value: unknown): number | null {
  const record = asRecord(value);
  const raw = record?.val;
  const num = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

function resetLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
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
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function requestJson(url: string, headers: Record<string, string>, redirects = 3): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout: REQUEST_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location && redirects > 0) {
        response.resume();
        resolve(requestJson(new URL(location, url).toString(), headers, redirects - 1));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        try {
          const parsed = asRecord(JSON.parse(body));
          if (!parsed) {
            reject(new Error('用量响应不是对象'));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('用量响应无法解析'));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('用量请求超时'));
    });
    request.on('error', reject);
  });
}
