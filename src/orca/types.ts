export type AgentId = 'grok' | 'codex' | 'claude-code' | 'opencode';

export type PermissionMode = 'yolo' | 'manual';

export type AgentPermissionMode = 'inherit' | PermissionMode;

export interface AgentEntrySettings {
  enabled: boolean;
  cliPath: string;
  permissionMode: AgentPermissionMode;
  extraArgs: string;
  accountId: string;
  showUsage: boolean;
}

export interface AgentSettings {
  globalPermissionMode: PermissionMode;
  yoloAcknowledged: boolean;
  usageRefreshSec: number;
  showUsageInStatusBar: boolean;
  agents: Record<AgentId, AgentEntrySettings>;
}

export interface PendingTerminalSession {
  shellType: string;
  shellArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  title?: string;
}

export interface UsageWindow {
  name: string;
  usedPct: number | null;
  resetAt: string | null;
}

export interface UsageSnapshot {
  agentId: AgentId;
  provider: string;
  account: string | null;
  status: string;
  windows: UsageWindow[];
}
