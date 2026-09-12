import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  GenerationHandle,
  GenerationRequest,
  GenerationResult,
  ModelCapability,
  OpenArtProvider,
  ProviderStatus,
  ReferenceImage,
  DryRunDiagnostics,
  GenerationStatusUpdate,
} from '../../shared/types.js';
import { resolveOpenArtCliExecutable } from './openart-cli-resolver.js';

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const transientStatuses = new Set([429, 500, 502, 503, 504]);
const MAX_OPENAI_PROMPT_LENGTH = 32_000;

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliAccount {
  id?: string;
  plan?: string;
  credits?: number;
}

export interface CliCost {
  config: Record<string, unknown>;
  unitCredits?: number;
  totalCredits?: number;
  quantity?: number;
}

export interface CliProviderOptions {
  binary?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  run?: (args: string[], options: { timeoutMs: number }) => Promise<CliRunResult>;
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  cacheFile?: string;
  readPersistedPath?: () => Promise<string | undefined>;
  persistPath?: (value: string) => Promise<void>;
}

function sanitizeDiagnostic(value: string) {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(
      /(token|secret|cookie|authorization|access_token|refresh_token)["'=:\s]+[^\s,}]+/gi,
      '$1=[redacted]',
    )
    .replace(/https:\/\/[^\s]+/gi, (url) =>
      url.includes('cdn.openart.ai') ? '[asset-url]' : '[url]',
    )
    .slice(0, 2000);
}

function parseJson<T>(stdout: string, operation: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    const fragment = extractJsonFragment(stdout);
    if (fragment !== undefined) return JSON.parse(fragment) as T;
    throw new Error(`OpenArt CLI returned malformed JSON for ${operation}.`);
  }
}

function extractJsonFragment(value: string) {
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== '{' && value[start] !== '[') continue;
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const character = value[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === '{' || character === '[') stack.push(character);
      else if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        if (stack.pop() !== expected) break;
        if (!stack.length) return value.slice(start, index + 1);
      }
    }
  }
  return undefined;
}

function sanitizeStructured(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeDiagnostic(value);
  if (Array.isArray(value)) return value.map(sanitizeStructured);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeStructured(item),
      ]),
    );
  return value;
}

function runCliProcess(binary: string, args: string[], timeoutMs: number): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${path.dirname(binary)}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          Object.assign(new Error(`OpenArt CLI timed out after ${timeoutMs}ms.`), {
            status: 408,
            stderr: sanitizeDiagnostic(stderr),
          }),
        ),
      );
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendProcessOutput(stdout, chunk.toString());
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendProcessOutput(stderr, chunk.toString());
    });
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish(() =>
        reject(
          error.code === 'ENOENT'
            ? new Error(`OpenArt CLI is not installed or OPENART_CLI_PATH is invalid: ${binary}`)
            : error,
        ),
      ),
    );
    const complete = (code: number | null) =>
      finish(() => {
        const result = { stdout, stderr, exitCode: code ?? 1 };
        if (result.exitCode !== 0) {
          const error = new Error(
            sanitizeDiagnostic(stderr || stdout || `OpenArt CLI exited with ${result.exitCode}.`),
          );
          Object.assign(error, { status: result.exitCode, stderr: sanitizeDiagnostic(stderr) });
          reject(error);
        } else resolve(result);
      });
    child.on('exit', complete);
    child.on('close', complete);
    child.stdin.end();
  });
}

function appendProcessOutput(existing: string, incoming: string) {
  return `${existing}${incoming}`.slice(-128 * 1024);
}

function mimeFor(file: string) {
  const ext = path.extname(file).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg'
    ? 'image/jpeg'
    : ext === '.webp'
      ? 'image/webp'
      : 'image/png';
}

async function readUploadCache(file: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeUploadCache(file: string, cache: Record<string, string>) {
  try {
    await fs.writeFile(file, JSON.stringify(cache), { mode: 0o600 });
  } catch {
    /* cache is an optimization, never a generation blocker */
  }
}

function valueAt(record: unknown, keys: string[]): unknown {
  if (!record || typeof record !== 'object') return undefined;
  const object = record as Record<string, unknown>;
  for (const key of keys) if (object[key] !== undefined) return object[key];
  return undefined;
}

function findStrings(record: unknown, keys: string[], depth = 0): string[] {
  if (depth > 5 || !record || typeof record !== 'object') return [];
  const object = record as Record<string, unknown>;
  const direct = keys.flatMap((key) => {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return [value];
    if (Array.isArray(value))
      return value.filter((item): item is string => typeof item === 'string');
    return [];
  });
  if (direct.length) return direct;
  return Object.values(object).flatMap((value) => findStrings(value, keys, depth + 1));
}

function findValue(record: unknown, keys: string[], depth = 0): unknown {
  if (depth > 6 || !record || typeof record !== 'object') return undefined;
  const object = record as Record<string, unknown>;
  for (const key of keys) if (object[key] !== undefined) return object[key];
  for (const value of Object.values(object)) {
    const nested = findValue(value, keys, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function parseGenerationId(payload: unknown): string {
  const candidate = valueAt(payload, ['historyId', 'creationId', 'generationId', 'id']);
  if (typeof candidate === 'string' && candidate.trim()) return candidate;
  if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const nested = parseGenerationId(value);
        if (nested) return nested;
      }
    }
  }
  throw new Error('OpenArt CLI response did not contain a validated generation ID.');
}

function parseGenerationResult(payload: unknown, fallbackId: string): GenerationResult {
  const rawStatus = findValue(payload, ['status', 'state']);
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';
  const urls = findStrings(payload, [
    'resultUrl',
    'resultURL',
    'url',
    'imageUrl',
    'downloadUrl',
    'outputUrl',
  ]);
  const creditsValue = valueAt(payload, ['creditsUsed', 'credits', 'cost', 'totalCredits']);
  const creditsUsed = typeof creditsValue === 'number' ? creditsValue : undefined;
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    const failure = parseProviderFailure(payload);
    const providerCode = failure?.code ?? 'failed';
    const providerMessage = failure?.message ?? `OpenArt generation ${fallbackId} failed.`;
    const error = new Error(
      `OpenArt generation ${fallbackId} failed (${providerCode}): ${providerMessage}`,
    );
    Object.assign(error, { providerCode, providerMessage });
    throw error;
  }
  if (!urls.length) throw new Error('OpenArt CLI response did not contain a validated result URL.');
  return { generationId: fallbackId, resultUrls: [...new Set(urls)], creditsUsed };
}

export function parseProviderFailure(payload: unknown) {
  const rawStatus = findValue(payload, ['status', 'state']);
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';
  if (!['failed', 'error', 'cancelled', 'canceled'].includes(status)) return undefined;
  const rawCode = findValue(payload, ['failed_code', 'failedCode', 'error_code', 'errorCode']);
  const rawMessage = findValue(payload, [
    'failed_reason',
    'failedReason',
    'error_message',
    'errorMessage',
    'message',
  ]);
  return {
    code: typeof rawCode === 'string' ? sanitizeDiagnostic(rawCode) : 'failed',
    message:
      typeof rawMessage === 'string'
        ? sanitizeDiagnostic(rawMessage)
        : 'OpenArt generation failed.',
  };
}

async function validateReference(image: ReferenceImage) {
  const resolved = path.resolve(image.path);
  if (resolved.split(path.sep).includes('app.asar'))
    throw new Error('OpenArt CLI cannot receive an app.asar virtual path.');
  if (!supportedExtensions.has(path.extname(resolved).toLowerCase()))
    throw new Error(`Unsupported reference image type: ${image.name}`);
  const stat = await fs.stat(resolved).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`Reference image is not a readable file: ${image.name}`);
  await fs.access(resolved, fs.constants.R_OK);
  return resolved;
}

export class OpenArtCliProvider implements OpenArtProvider {
  readonly name = 'cli' as const;
  private readonly binary?: string;
  private resolvedPath?: string;
  private readPersistedPath?: () => Promise<string | undefined>;
  private persistPath?: (value: string) => Promise<void>;
  private readonly dryRun: boolean;
  private readonly timeoutMs: number;
  private readonly runCommand: (
    args: string[],
    options: { timeoutMs: number },
  ) => Promise<CliRunResult>;
  private readonly fetcher: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly assetCache = new Map<string, string>();
  private readonly uploadCacheFile: string;
  private accountIdentity = 'unknown-account';
  private readonly formCache = new Map<
    string,
    { model: string; mode: string; media: string; jsonSchema: Record<string, unknown> }
  >();

  constructor(options: CliProviderOptions = {}) {
    this.binary = options.binary;
    this.readPersistedPath = options.readPersistedPath;
    this.persistPath = options.persistPath;
    this.uploadCacheFile =
      options.cacheFile ??
      process.env.OPENART_UPLOAD_CACHE ??
      path.join(process.cwd(), '.openart-upload-cache.json');
    this.dryRun = options.dryRun ?? false;
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
    this.fetcher = options.fetch ?? fetch;
    this.pollIntervalMs =
      options.pollIntervalMs ?? Number(process.env.OPENART_CLI_POLL_INTERVAL_MS ?? 2_000);
    this.runCommand = options.run ?? (async (args, runOptions) => {
      const resolved = await this.resolveExecutable();
      return runCliProcess(resolved.path, args, runOptions.timeoutMs);
    });
  }

  configureExecutablePersistence(read: () => Promise<string | undefined>, write: (value: string) => Promise<void>) {
    this.readPersistedPath = read;
    this.persistPath = write;
  }

  async resolveExecutable() {
    if (this.resolvedPath) return { path: this.resolvedPath, version: '' };
    const resolved = await resolveOpenArtCliExecutable({
      persistedPath: await this.readPersistedPath?.(),
      envPath: process.env.OPENART_CLI_PATH,
      explicitPath: this.binary,
      ...(this.binary ? { knownPaths: [] } : {}),
    });
    this.resolvedPath = resolved.path;
    await this.persistPath?.(resolved.path);
    return resolved;
  }

  async checkReadiness() {
    return this.resolveExecutable();
  }

  async selectExecutable(value: string) {
    const resolved = await resolveOpenArtCliExecutable({ explicitPath: value });
    this.resolvedPath = resolved.path;
    await this.persistPath?.(resolved.path);
    return resolved;
  }

  async isInstalled() {
    try {
      await this.runCommand(['version'], { timeoutMs: 15_000 });
      return true;
    } catch {
      return false;
    }
  }

  async getVersion() {
    const result = await this.runCommand(['version'], { timeoutMs: 15_000 });
    return result.stdout.trim();
  }

  async login() {
    await this.runCommand(['login'], { timeoutMs: 10 * 60_000 });
  }

  async getAccount(): Promise<CliAccount> {
    const result = await this.runJson(['account']);
    const account = (
      result.user && typeof result.user === 'object' ? result.user : result
    ) as Record<string, unknown>;
    const plan = typeof result.plan === 'string' ? result.plan : undefined;
    const credits =
      typeof result.credits === 'number'
        ? result.credits
        : typeof account.credits === 'number'
          ? account.credits
          : undefined;
    const id =
      typeof result.id === 'string'
        ? result.id
        : typeof account.id === 'string'
          ? account.id
          : undefined;
    if (id) this.accountIdentity = id;
    return { id, plan, credits };
  }

  async status(): Promise<ProviderStatus> {
    const [version, account] = await Promise.all([this.getVersion(), this.getAccount()]);
    return {
      connected: true,
      provider: 'cli',
      version,
      plan: account.plan,
      credits: account.credits,
      message: 'Authenticated OpenArt CLI',
    };
  }

  async listModels(): Promise<ModelCapability[]> {
    const payload = await this.runJson(['model', 'list']);
    if (!Array.isArray(payload))
      throw new Error('OpenArt model list response did not contain an array.');
    return payload
      .filter((model) => typeof model === 'object' && model !== null)
      .map((model) => {
        const value = model as Record<string, unknown>;
        const modes = Object.values(value.modes ?? {})
          .flatMap((items) =>
            Array.isArray(items)
              ? items.map((item) =>
                  typeof item === 'object' && item
                    ? (item as Record<string, unknown>).mode
                    : undefined,
                )
              : [],
          )
          .filter((mode): mode is string => typeof mode === 'string');
        return {
          id: String(value.id ?? ''),
          name: String(value.displayName ?? value.id ?? ''),
          modes,
          schema: { description: value.description ?? '', modes: value.modes ?? {} },
        };
      })
      .filter(
        (model) =>
          model.id && model.modes.some((mode) => mode === 'image2image' || mode === 'text2image'),
      );
  }

  async models() {
    return this.listModels();
  }

  async getModelForm(model: string, mode: 'text2image' | 'image2image') {
    const cached = this.formCache.get(`${model}:${mode}`);
    if (cached) return cached;
    const payload = await this.runJson(['model', 'form', model, mode]);
    if (!payload || typeof payload !== 'object' || !('jsonSchema' in payload))
      throw new Error('OpenArt model form response did not contain jsonSchema.');
    const form = payload as {
      model: string;
      mode: string;
      media: string;
      jsonSchema: Record<string, unknown>;
    };
    this.formCache.set(`${model}:${mode}`, form);
    return form;
  }

  async estimateCost(model: string, mode: 'text2image' | 'image2image'): Promise<CliCost[]> {
    const payload = await this.runJson(['model', 'cost', '--model', model, '--mode', mode]);
    const items = valueAt(payload, ['items']);
    if (!Array.isArray(items)) throw new Error('OpenArt cost response did not contain items.');
    return items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        config: (item.config && typeof item.config === 'object' ? item.config : {}) as Record<
          string,
          unknown
        >,
        unitCredits: typeof item.unitCredits === 'number' ? item.unitCredits : undefined,
        quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
        totalCredits: typeof item.totalCredits === 'number' ? item.totalCredits : undefined,
      }));
  }

  async uploadReference(image: ReferenceImage): Promise<string> {
    const resolved = await validateReference(image);
    const buffer = await fs.readFile(resolved);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const key = `${this.accountIdentity}:${hash}:${buffer.byteLength}:${mimeFor(image.path)}`;
    const persisted = await readUploadCache(this.uploadCacheFile);
    const cached = this.assetCache.get(key) ?? persisted[key];
    if (cached) return cached;
    const result = await this.runJson(['upload', 'add', resolved]);
    if (
      result.status !== 'SUCCESS' ||
      typeof result.url !== 'string' ||
      typeof result.uploadId !== 'string'
    )
      throw new Error('OpenArt upload response did not contain status SUCCESS, uploadId, and url.');
    this.assetCache.set(key, result.url);
    await writeUploadCache(this.uploadCacheFile, { ...persisted, [key]: result.url });
    return result.url;
  }

  async uploadReferences(images: ReferenceImage[]) {
    return Promise.all(images.map((image) => this.uploadReference(image)));
  }

  async submitGeneration(
    request: GenerationRequest,
    assetIds: string[],
  ): Promise<GenerationHandle> {
    return this.submitGenerationInternal(request, assetIds, this.dryRun);
  }

  async dryRunGeneration(request: GenerationRequest, assetIds: string[]) {
    return this.submitGenerationInternal(request, assetIds, true);
  }

  private async submitGenerationInternal(
    request: GenerationRequest,
    assetIds: string[],
    dryRun: boolean,
  ): Promise<GenerationHandle> {
    if (request.prompt.length > MAX_OPENAI_PROMPT_LENGTH) {
      const error = new Error(
        `OpenArt generation was blocked before submission: prompt length ${request.prompt.length} exceeds the provider limit of ${MAX_OPENAI_PROMPT_LENGTH} characters.`,
      );
      Object.assign(error, { status: 422, code: 'PROMPT_TOO_LONG' });
      throw error;
    }
    const orderedInputs =
      request.orderedInputs ??
      request.references.map((image, index) => ({
        order: index + 1,
        role: index === 0 ? ('presentation' as const) : ('product' as const),
        label: index === 0 ? 'PRESENTATION REFERENCE' : 'PRODUCT SOURCE',
        image,
      }));
    if (orderedInputs.length !== assetIds.length)
      throw new Error(
        'OpenArt image-input mapping changed before submission; no images were dropped or reordered.',
      );
    if (orderedInputs[0]?.role !== 'presentation')
      throw new Error('The first OpenArt image must be a presentation reference.');
    if (orderedInputs.slice(1).some((input) => input.role === 'presentation'))
      throw new Error('Only Image 1 may be a presentation reference.');
    if (request.settings.outputs !== 1)
      throw new Error(
        'The installed OpenArt CLI does not expose an image-count flag; production CLI processing currently supports exactly one output per job.',
      );
    const form = await this.getModelForm(request.settings.model, 'image2image');
    const properties = form.jsonSchema.properties;
    const visualReferences =
      properties && typeof properties === 'object'
        ? (properties as Record<string, unknown>).visualReferences
        : undefined;
    const maxItems =
      visualReferences &&
      typeof visualReferences === 'object' &&
      typeof (visualReferences as Record<string, unknown>).maxItems === 'number'
        ? ((visualReferences as Record<string, unknown>).maxItems as number)
        : undefined;
    const minItems =
      visualReferences &&
      typeof visualReferences === 'object' &&
      typeof (visualReferences as Record<string, unknown>).minItems === 'number'
        ? ((visualReferences as Record<string, unknown>).minItems as number)
        : undefined;
    if (minItems !== undefined && assetIds.length < minItems)
      throw new Error(`The selected OpenArt model requires at least ${minItems} image inputs.`);
    if (maxItems !== undefined && assetIds.length > maxItems)
      throw new Error(`The selected OpenArt model accepts at most ${maxItems} visual references.`);
    if (maxItems === undefined && assetIds.length > 16)
      throw new Error(
        'The selected OpenArt model accepts more references than the CLI safety limit of 16.',
      );
    const args = [
      'generate',
      'image',
      request.prompt,
      '--model',
      request.settings.model,
      '--async',
    ];
    for (const asset of assetIds) args.push('--image', asset);
    if (dryRun) args.push('--dry-run');
    const command = await this.runJsonDetailed(args);
    const estimated = parseEstimatedCredits(command.payload);
    if (dryRun) {
      const diagnostics: DryRunDiagnostics = {
        ...command.diagnostics,
        cliVersion: await this.getVersion().catch(() => undefined),
        parsedJson: sanitizeStructured(command.payload),
        estimateAvailable: estimated.value !== undefined,
        estimateSource: estimated.source,
      };
      return {
        generationId: 'dry-run',
        assetIds,
        dryRun: true,
        estimatedCredits: estimated.value,
        dryRunDiagnostics: diagnostics,
      };
    }
    return { generationId: parseGenerationId(command.payload), assetIds };
  }

  async generate(request: GenerationRequest, assetIds: string[]) {
    return this.submitGeneration(request, assetIds);
  }

  async getGenerationStatus(generationId: string) {
    return this.runJson(['creation', 'get', generationId]);
  }

  async waitForGeneration(
    handle: GenerationHandle,
    signal?: AbortSignal,
    onStatus?: (update: GenerationStatusUpdate) => void,
  ): Promise<GenerationResult> {
    if (handle.dryRun) return { generationId: handle.generationId, resultUrls: [], creditsUsed: 0 };
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('OpenArt status polling was cancelled.');
      const payload = await this.getGenerationStatus(handle.generationId);
      const rawStatus = findValue(payload, ['status', 'state']);
      const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';
      if (['completed', 'succeeded', 'success'].includes(status))
        return parseGenerationResult(payload, handle.generationId);
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status))
        return parseGenerationResult(payload, handle.generationId);
      onStatus?.({
        status: ['queued', 'pending', 'waiting'].includes(status) ? 'queued' : 'processing',
        checkedAt: new Date().toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    const error = new Error(`OpenArt generation ${handle.generationId} status polling timed out.`);
    Object.assign(error, { providerCode: 'polling_timeout', providerMessage: error.message });
    throw error;
  }

  async waitForResult(
    handle: GenerationHandle,
    signal?: AbortSignal,
    onStatus?: (update: GenerationStatusUpdate) => void,
  ) {
    return this.waitForGeneration(handle, signal, onStatus);
  }

  async downloadResults(urls: string[], directory: string) {
    await fs.mkdir(directory, { recursive: true });
    return Promise.all(
      urls.map(async (url, index) => {
        const destination = path.join(directory, `openart-result-${index + 1}.png`);
        await this.downloadResult(url, destination);
        return destination;
      }),
    );
  }

  async downloadResult(url: string, destination: string) {
    if (process.env.OPENART_FAKE_CLI_E2E === '1' && url === 'fake-openart://result') {
      if (process.env.OPENART_FAKE_MODE === 'download-failure')
        throw Object.assign(new Error('Fake result download failed.'), {
          providerCode: 'fake_download_failure',
        });
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      await fs.writeFile(destination, png, { flag: 'wx' });
      return;
    }
    if (!/^https:\/\/cdn\.openart\.ai\//.test(url))
      throw new Error('OpenArt result URL was not an approved CDN URL.');
    const response = await this.fetcher(url);
    if (!response.ok) {
      const error = new Error(`OpenArt result download failed with HTTP ${response.status}`);
      Object.assign(error, { status: response.status });
      throw error;
    }
    const data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, data, { flag: 'wx' });
  }

  async runJson(args: string[]): Promise<any> {
    return (await this.runJsonDetailed(args)).payload;
  }

  private async runJsonDetailed(args: string[]) {
    const result = await this.runCommand([...args, '--json', '--no-input'], {
      timeoutMs: this.timeoutMs,
    });
    return {
      payload: parseJson(result.stdout, args.join(' ')),
      diagnostics: {
        exitCode: result.exitCode,
        stdout: sanitizeDiagnostic(result.stdout),
        stderr: sanitizeDiagnostic(result.stderr),
        args: args.map(sanitizeDiagnostic),
        estimateAvailable: false,
      } satisfies DryRunDiagnostics,
    };
  }
}

function parseEstimatedCredits(payload: unknown): { value?: number; source?: string } {
  const keys = new Set([
    'estimatedcredits',
    'creditsrequired',
    'requiredcredits',
    'creditcost',
    'totalcredits',
    'credits',
  ]);
  function visit(value: unknown, location: string, depth = 0): { value?: number; source?: string } {
    if (depth > 8 || !value || typeof value !== 'object') return {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
      if (keys.has(normalized)) {
        const number = typeof child === 'number' ? child : Number(child);
        if (Number.isFinite(number)) return { value: number, source: `${location}.${key}` };
      }
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nested = visit(child, `${location}.${key}`, depth + 1);
      if (nested.value !== undefined) return nested;
    }
    return {};
  }
  return visit(payload, '$');
}

export function isCliTransientError(error: unknown) {
  const status = (error as { status?: number }).status;
  return typeof status === 'number' && transientStatuses.has(status);
}
