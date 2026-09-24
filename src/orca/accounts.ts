import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentCatalogEntry } from './catalog';

export function accountEnv(agent: AgentCatalogEntry, accountId: string, pluginDataDir: string): Record<string, string> {
  const id = accountId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id || !pluginDataDir || agent.accountKind === 'none') {
    return {};
  }
  const home = path.join(pluginDataDir, 'accounts', agent.accountKind, id, 'home');
  fs.mkdirSync(home, { recursive: true });
  if (agent.accountKind === 'codex') {
    return { CODEX_HOME: home };
  }
  return { CLAUDE_CONFIG_DIR: home };
}