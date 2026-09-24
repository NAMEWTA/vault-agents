import type { AgentEntrySettings, AgentId, AgentSettings } from './types';

function entry(): AgentEntrySettings {
  return {
    enabled: true,
    cliPath: '',
    permissionMode: 'inherit',
    extraArgs: '',
    accountId: '',
  };
}

export const AGENT_IDS: readonly AgentId[] = ['grok', 'codex', 'claude-code', 'opencode'];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  globalPermissionMode: 'yolo',
  yoloAcknowledged: false,
  usageRefreshSec: 45,
  agents: {
    grok: entry(),
    codex: entry(),
    'claude-code': entry(),
    opencode: entry(),
  },
};

export function normalizeAgentSettings(value: Partial<AgentSettings> | null | undefined): AgentSettings {
  const agents = { ...DEFAULT_AGENT_SETTINGS.agents };
  for (const id of AGENT_IDS) {
    const incoming = value?.agents?.[id];
    agents[id] = {
      ...entry(),
      ...incoming,
      permissionMode: incoming?.permissionMode === 'yolo' || incoming?.permissionMode === 'manual'
        ? incoming.permissionMode
        : 'inherit',
    };
  }

  const mode = value?.globalPermissionMode === 'manual' ? 'manual' : 'yolo';
  const refresh = Number(value?.usageRefreshSec);
  return {
    globalPermissionMode: mode,
    yoloAcknowledged: Boolean(value?.yoloAcknowledged),
    usageRefreshSec: Number.isFinite(refresh) && refresh >= 15 ? refresh : 45,
    agents,
  };
}
