import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface ResolvedOpenArtCli {
  path: string;
  version: string;
}

export interface ResolveOptions {
  persistedPath?: string;
  envPath?: string;
  previousPath?: string;
  explicitPath?: string;
  knownPaths?: string[];
  shellPath?: string;
  probe?: (candidate: string) => Promise<string | undefined>;
}

async function defaultProbe(candidate: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(candidate, ['--version'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${path.dirname(candidate)}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); resolve(undefined); }, 15_000);
    child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-4096); });
    child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-4096); });
    child.once('error', () => { clearTimeout(timer); resolve(undefined); });
    child.once('close', (code) => {
      clearTimeout(timer);
      const version = output.trim();
      resolve(code === 0 && /openart/i.test(version) ? version : undefined);
    });
  });
}

function expand(value: string | undefined) {
  if (!value) return undefined;
  return value.startsWith('~/') ? path.join(process.env.HOME ?? '', value.slice(2)) : value;
}

async function candidatePath(value: string | undefined) {
  const expanded = expand(value);
  if (!expanded || !path.isAbsolute(expanded) || expanded.includes(`${path.sep}app.asar`)) return undefined;
  try {
    const canonical = await fs.realpath(expanded);
    const stat = await fs.stat(canonical);
    await fs.access(canonical, fs.constants.R_OK | fs.constants.X_OK);
    return stat.isFile() ? canonical : undefined;
  } catch { return undefined; }
}

export async function resolveOpenArtCliExecutable(options: ResolveOptions = {}): Promise<ResolvedOpenArtCli> {
  const home = process.env.HOME ?? '';
  const known = options.knownPaths ?? [
    path.join(home, '.local/bin/openart'), path.join(home, '.local/share/pnpm/openart'),
    path.join(home, '.npm-global/bin/openart'), '/usr/local/bin/openart', '/usr/bin/openart',
    ...(process.env.NVM_BIN ? [path.join(process.env.NVM_BIN, 'openart')] : []),
    path.join(path.dirname(process.execPath), 'openart'),
  ];
  const values = options.explicitPath
    ? [options.explicitPath]
    : [options.persistedPath, options.envPath, options.previousPath, ...known];
  const probe = options.probe ?? defaultProbe;
  for (const value of values) {
    const candidate = await candidatePath(value);
    if (!candidate) continue;
    const version = await probe(candidate);
    if (version) return { path: candidate, version };
  }
  if (options.explicitPath) throw new Error(`OpenArt CLI path is invalid: ${options.explicitPath}`);
  const shell = options.shellPath ?? process.env.SHELL ?? '/bin/sh';
  const discovered = await new Promise<string | undefined>((resolve) => {
    const child = spawn(shell, ['-lc', 'command -v openart'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.once('error', () => resolve(undefined));
    child.once('close', () => resolve(output.trim().split('\n')[0]));
  });
  const candidate = await candidatePath(discovered);
  if (candidate) {
    const version = await probe(candidate);
    if (version) return { path: candidate, version };
  }
  throw new Error('OpenArt CLI not found. Select the OpenArt CLI executable or set OPENART_CLI_PATH to an absolute executable path.');
}
