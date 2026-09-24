import type { AgentId } from './types';

export interface AgentCatalogEntry {
  id: AgentId;
  title: string;
  detectCommand: string;
  installDocsUrl: string;
  accountKind: 'claude' | 'codex' | 'none';
}

export const AGENT_CATALOG: readonly AgentCatalogEntry[] = [
  {
    id: 'grok',
    title: 'Grok',
    detectCommand: 'grok',
    installDocsUrl: 'https://github.com/xai-org/grok-build',
    accountKind: 'none',
  },
  {
    id: 'codex',
    title: 'Codex',
    detectCommand: 'codex',
    installDocsUrl: 'https://github.com/openai/codex',
    accountKind: 'codex',
  },
  {
    id: 'claude-code',
    title: 'Claude Code',
    detectCommand: 'claude',
    installDocsUrl: 'https://code.claude.com/docs/en/overview',
    accountKind: 'claude',
  },
  {
    id: 'opencode',
    title: 'OpenCode',
    detectCommand: 'opencode',
    installDocsUrl: 'https://opencode.ai/docs',
    accountKind: 'none',
  },
];

export function getAgent(id: AgentId): AgentCatalogEntry {
  const entry = AGENT_CATALOG.find((agent) => agent.id === id);
  if (!entry) {
    throw new Error(`Unknown agent ${id}`);
  }
  return entry;
}
