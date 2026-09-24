import { PluginSettingTab, Setting, type App } from 'obsidian';
import type { TerminalSettings } from '@/settings/settings';
import { normalizeAgentSettings } from './defaults';
import { AGENT_CATALOG } from './catalog';
import { launchAgent, launchShell, type LaunchHost } from './launcher';
import { readUsageSnapshots, formatUsageAside } from './usage';
import { UsageModal } from './usageModal';
import type { AgentId, AgentSettings, UsageSnapshot } from './types';
import type { TerminalService } from '@/services/terminal/terminalService';

export interface OrcaPluginHost {
  app: App;
  settings: TerminalSettings;
  manifest: { dir?: string };
  saveSettings: () => Promise<void>;
  addCommand: (command: { id: string; name: string; callback: () => void }) => void;
  addStatusBarItem: () => HTMLElement;
  registerInterval: (id: number) => number;
  getTerminalService: () => Promise<TerminalService>;
  openFreshTerminal: () => Promise<void>;
  openSettings: () => void;
}

let refreshUsageStatus: (() => void) | null = null;

async function openUsage(plugin: OrcaPluginHost): Promise<void> {
  const snapshots = await readUsageSnapshots(enabledUsageAgents(plugin));
  new UsageModal(plugin.app, snapshots).open();
}

function enabledUsageAgents(plugin: OrcaPluginHost): AgentId[] {
  const { agents } = plugin.settings.agentSettings;
  return (['grok', 'codex', 'claude-code'] as AgentId[]).filter((id) => agents[id]?.showUsage !== false);
}

export function registerOrca(plugin: OrcaPluginHost): void {
  plugin.addCommand({
    id: 'new-terminal-powershell',
    name: '新终端: PowerShell',
    callback: () => {
      void launchShell(host(plugin), process.platform === 'win32' ? 'pwsh' : 'pwsh', 'PowerShell');
    },
  });
  plugin.addCommand({
    id: 'new-terminal-cmd',
    name: '新终端: 命令提示符',
    callback: () => {
      void launchShell(host(plugin), 'cmd', '命令提示符');
    },
  });
  plugin.addCommand({
    id: 'new-terminal-gitbash',
    name: '新终端: Git Bash',
    callback: () => {
      void launchShell(host(plugin), 'gitbash', 'Git Bash');
    },
  });

  for (const agent of AGENT_CATALOG) {
    plugin.addCommand({
      id: `launch-${agent.id}`,
      name: agent.title,
      callback: () => {
        void launchAgent(host(plugin), agent.id);
      },
    });
  }

  plugin.addCommand({
    id: 'show-usage',
    name: '查看用量',
    callback: () => {
      void openUsage(plugin);
    },
  });

  plugin.addCommand({
    id: 'open-agent-settings',
    name: '智能体设置…',
    callback: () => plugin.openSettings(),
  });

  const status = plugin.addStatusBarItem();
  status.addClass('vault-agents-usage');
  status.addClass('is-clickable');
  let latest: UsageSnapshot[] = [];
  let inflight = false;
  const render = async () => {
    if (inflight) return;
    inflight = true;
    try {
      latest = await readUsageSnapshots(enabledUsageAgents(plugin));
      const enabled = enabledUsageAgents(plugin);
      const show = plugin.settings.agentSettings.showUsageInStatusBar && enabled.length > 0;
      status.toggleClass('is-hidden', !show);
      status.replaceChildren();
      if (!show) return;
      for (const snapshot of latest) {
        const item = status.createSpan({ cls: 'vault-agents-usage-item' });
        item.createSpan({ cls: 'vault-agents-usage-agent', text: snapshot.provider });
        item.createSpan({ cls: 'vault-agents-usage-rest', text: formatUsageAside(snapshot) });
      }
    } finally {
      inflight = false;
    }
  };
  refreshUsageStatus = () => {
    void render();
  };
  status.addEventListener('click', () => {
    new UsageModal(plugin.app, latest).open();
    void render();
  });
  void render();
  const refreshMs = Math.max(15, plugin.settings.agentSettings.usageRefreshSec) * 1000;
  plugin.registerInterval(window.setInterval(() => {
    void render();
  }, refreshMs));
}

function host(plugin: OrcaPluginHost): LaunchHost {
  return {
    app: plugin.app,
    getVaultPath: () => {
      const adapter = plugin.app.vault.adapter as { getBasePath?: () => string };
      return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : undefined;
    },
    getPluginDataDir: () => plugin.manifest.dir ?? '',
    getAgentSettings: () => plugin.settings.agentSettings,
    saveAgentSettings: async (settings: AgentSettings) => {
      plugin.settings.agentSettings = normalizeAgentSettings(settings);
      await plugin.saveSettings();
    },
    queueSession: async (session) => {
      const service = await plugin.getTerminalService();
      service.queueSession(session);
    },
    openFreshTerminal: () => plugin.openFreshTerminal(),
  };
}

export function renderAgentSettings(tab: PluginSettingTab, plugin: OrcaPluginHost): void {
  const { containerEl } = tab;
  containerEl.createEl('h3', { text: '智能体' });
  containerEl.createEl('p', {
    text: '默认 YOLO。Grok 是 --permission-mode bypassPermissions，Codex 是 --dangerously-bypass-approvals-and-sandbox，Claude 是 --dangerously-skip-permissions。额外参数非空时不再自动附加。',
  });

  new Setting(containerEl)
    .setName('全局权限')
    .setDesc('YOLO 跳过确认。Manual 不附加危险参数。')
    .addDropdown((dropdown) => {
      dropdown
        .addOption('yolo', 'YOLO')
        .addOption('manual', 'Manual')
        .setValue(plugin.settings.agentSettings.globalPermissionMode)
        .onChange(async (value) => {
          plugin.settings.agentSettings.globalPermissionMode = value === 'manual' ? 'manual' : 'yolo';
          await plugin.saveSettings();
        });
    });

  for (const agent of AGENT_CATALOG) {
    const entry = plugin.settings.agentSettings.agents[agent.id];
    new Setting(containerEl)
      .setName(agent.title)
      .setDesc(agent.installDocsUrl)
      .addText((text) => {
        text
          .setPlaceholder('CLI 绝对路径，留空则自动探测')
          .setValue(entry.cliPath)
          .onChange(async (value) => {
            plugin.settings.agentSettings.agents[agent.id].cliPath = value.trim();
            await plugin.saveSettings();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption('inherit', '跟随全局')
          .addOption('yolo', 'YOLO')
          .addOption('manual', 'Manual')
          .setValue(entry.permissionMode)
          .onChange(async (value) => {
            const mode = value === 'yolo' || value === 'manual' ? value : 'inherit';
            plugin.settings.agentSettings.agents[agent.id].permissionMode = mode;
            await plugin.saveSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder('额外参数，非空则覆盖默认 flag')
          .setValue(entry.extraArgs)
          .onChange(async (value) => {
            plugin.settings.agentSettings.agents[agent.id].extraArgs = value;
            await plugin.saveSettings();
          });
      });

    if (agent.accountKind !== 'none') {
      new Setting(containerEl)
        .setName(`${agent.title} 账户`)
        .setDesc('留空用本机默认登录。填写 ID 后，之后启动的终端使用插件目录里的独立 home，不影响已经打开的终端。')
        .addText((text) => {
          text
            .setPlaceholder('账户 ID，例如 work')
            .setValue(entry.accountId)
            .onChange(async (value) => {
              plugin.settings.agentSettings.agents[agent.id].accountId = value.trim();
              await plugin.saveSettings();
            });
        });
    }

    if (agent.id === 'grok' || agent.id === 'codex' || agent.id === 'claude-code') {
      new Setting(containerEl)
        .setName(`${agent.title} 用量`)
        .setDesc('关闭后，状态栏和用量面板都不再显示这个智能体。')
        .addToggle((toggle) => {
          toggle
            .setValue(entry.showUsage)
            .onChange(async (value) => {
              plugin.settings.agentSettings.agents[agent.id].showUsage = value;
              await plugin.saveSettings();
              refreshUsageStatus?.();
            });
        });
    }
  }

  new Setting(containerEl)
    .setName('状态栏显示用量')
    .setDesc('总开关。下面每个智能体还可以单独关闭。状态栏在名字右侧显示剩余额度，以及周刷新时间。')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.agentSettings.showUsageInStatusBar)
        .onChange(async (value) => {
          plugin.settings.agentSettings.showUsageInStatusBar = value;
          await plugin.saveSettings();
          refreshUsageStatus?.();
        });
    });

  new Setting(containerEl)
    .setName('检查用量')
    .setDesc('读取本机 Claude、Codex、Grok CLI 的登录态。Grok 会用本地 auth.json 向 cli-chat-proxy.grok.com 查询额度。')
    .addButton((button) => {
      button.setButtonText('查看').onClick(() => {
        void openUsage(plugin);
      });
    });
}

export function isAgentId(value: string): value is AgentId {
  return AGENT_CATALOG.some((agent) => agent.id === value);
}
