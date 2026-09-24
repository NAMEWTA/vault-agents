import { Modal, type App } from 'obsidian';
import type { UsageSnapshot } from './types';

export class UsageModal extends Modal {
  constructor(app: App, private readonly snapshots: UsageSnapshot[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vault-agents-usage-modal');
    contentEl.createEl('h2', { text: '用量' });
    contentEl.createEl('p', {
      text: '和 Orca 一样读取本机登录态。Claude / Codex / Grok 只使用各自 CLI 已经保存的凭证，不另接付费 API key。',
    });

    if (this.snapshots.length === 0) {
      contentEl.createEl('p', { text: '还没有用量数据。' });
      return;
    }

    for (const snapshot of this.snapshots) {
      const card = contentEl.createDiv({ cls: 'vault-agents-usage-card' });
      const title = snapshot.account ? `${snapshot.provider} · ${snapshot.account}` : snapshot.provider;
      card.createEl('h3', { text: title });
      if (snapshot.windows.length === 0) {
        card.createEl('p', { text: snapshot.status });
        continue;
      }
      for (const window of snapshot.windows) {
        const row = card.createDiv({ cls: 'vault-agents-usage-row' });
        row.createSpan({ cls: 'vault-agents-usage-name', text: window.name });
        const track = row.createDiv({ cls: 'vault-agents-usage-track' });
        const pct = window.usedPct ?? 0;
        const fill = track.createDiv({ cls: 'vault-agents-usage-fill' });
        fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (pct >= 80) fill.addClass('is-high');
        else if (pct >= 60) fill.addClass('is-mid');
        row.createSpan({ cls: 'vault-agents-usage-pct', text: window.usedPct === null ? '-' : `${window.usedPct}%` });
        row.createSpan({ cls: 'vault-agents-usage-reset', text: window.resetAt ? `重置 ${window.resetAt}` : '' });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
