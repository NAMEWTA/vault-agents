import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const WINDOWS_SKIP = new Set(['.cmd', '.bat', '.ps1']);

export function resolveCli(command: string, configuredPath: string, extraPath: string): string | null {
  const configured = configuredPath.trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const pathValue = [extraPath, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
  const entries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD;.PS1').split(';').filter(Boolean)
    : [''];

  const matches: string[] = [];
  for (const entry of entries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, process.platform === 'win32' ? `${command}${extension}` : command);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        matches.push(candidate);
      }
    }
  }

  const preferred = matches.find((candidate) => !WINDOWS_SKIP.has(path.extname(candidate).toLowerCase()));
  if (preferred) return preferred;
  if (matches[0]) return matches[0];

  for (const candidate of commonInstallPaths(command)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function commonInstallPaths(command: string): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return [
      path.join(local, 'Programs', command, `${command}.exe`),
      path.join(home, '.local', 'bin', `${command}.exe`),
      path.join(home, 'scoop', 'shims', `${command}.exe`),
    ];
  }
  return [
    path.join(home, '.local', 'bin', command),
    path.join('/opt/homebrew/bin', command),
    path.join('/usr/local/bin', command),
  ];
}
