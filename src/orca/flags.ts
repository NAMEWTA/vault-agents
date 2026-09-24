import type { AgentId, AgentSettings, PermissionMode } from './types';

const YOLO_FLAGS: Record<AgentId, readonly string[]> = {
  grok: ['--permission-mode', 'bypassPermissions'],
  codex: ['--dangerously-bypass-approvals-and-sandbox'],
  'claude-code': ['--dangerously-skip-permissions'],
  opencode: [],
};

export function effectivePermission(settings: AgentSettings, agentId: AgentId): PermissionMode {
  const override = settings.agents[agentId]?.permissionMode ?? 'inherit';
  if (override === 'yolo' || override === 'manual') {
    return override;
  }
  return settings.globalPermissionMode;
}

export function launchArgs(settings: AgentSettings, agentId: AgentId): string[] {
  const extra = (settings.agents[agentId]?.extraArgs ?? '').trim();
  if (extra.length > 0) {
    return splitArgs(extra);
  }
  if (effectivePermission(settings, agentId) === 'yolo') {
    return [...YOLO_FLAGS[agentId]];
  }
  return [];
}

export function splitArgs(value: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of value.matchAll(pattern)) {
    args.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return args.filter((part) => part.length > 0);
}
