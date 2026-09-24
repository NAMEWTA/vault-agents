import { MarkdownView, type App } from 'obsidian';
import { formatReference, toAbsoluteReferencePath, type ReferenceSelection } from '@/services/terminal/pathReference';

export function collectReferences(app: App, kind: 'relative' | 'absolute'): string | null {
  const activeType = app.workspace.activeLeaf?.view?.getViewType();
  if (activeType === 'markdown') {
    return referenceFromEditor(app, kind);
  }
  if (activeType === 'file-explorer') {
    return referenceFromExplorer(app, kind);
  }

  const explorer = referenceFromExplorer(app, kind);
  if (explorer) return explorer;
  return referenceFromEditor(app, kind);
}

function referenceFromEditor(app: App, kind: 'relative' | 'absolute'): string | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView)
    ?? app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .find((item): item is MarkdownView => item instanceof MarkdownView);
  const file = view?.file;
  if (!view || !file?.path) return null;
  const selections = view.editor.listSelections() as ReferenceSelection[];
  return withKind(app, file.path, selections, kind);
}

function referenceFromExplorer(app: App, kind: 'relative' | 'absolute'): string | null {
  const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
  const root = leaf?.view?.containerEl;
  if (!root) return null;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(
    '.nav-file-title.is-selected, .nav-folder-title.is-selected, .nav-file-title.is-active, .nav-folder-title.is-active',
  ));
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const path = node.getAttribute('data-path')?.trim() ?? '';
    if (!path || path.includes('://') || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  if (paths.length === 0) return null;
  return paths.map((path) => withKind(app, path, null, kind)).filter((item) => item.length > 0).join('\n');
}

function withKind(
  app: App,
  vaultPath: string,
  selections: readonly ReferenceSelection[] | null,
  kind: 'relative' | 'absolute',
): string {
  const relative = vaultPath.replace(/\\/g, '/');
  if (!relative || relative.includes('://')) return '';
  const path = kind === 'absolute'
    ? toAbsoluteReferencePath(vaultBase(app), relative, process.platform === 'win32' ? 'win32' : 'posix')
    : relative;
  return formatReference(path, selections);
}

function vaultBase(app: App): string {
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
}
