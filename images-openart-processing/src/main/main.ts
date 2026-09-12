import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanBatch } from './core/prompt-mapping.js';
import { JobDatabase } from './db.js';
import { BatchEngine } from './engine.js';
import { MockOpenArtProvider } from './providers/mock.js';
import { OpenArtCliProvider, parseProviderFailure } from './providers/openart-cli.js';
import { OpenArtMcpProvider } from './providers/openart-mcp.js';
import { readPreferences, writePreferences } from './preferences.js';
import { validateOutputDirectory } from './core/output-directory.js';
import { createFidelityPreflight } from './core/fidelity-preflight.js';
import {
  applyEntitledRoleOverride,
  loadEntitledPreset,
  scanEntitledProducts,
  scanFlatFrontImages,
  scanLabeledBatchFolder,
} from './core/entitled-preset.js';
import { resolveEntitledPresetRoot } from './core/preset-path.js';
import { createBatchFingerprint } from './core/batch-fingerprint.js';
import { resolvePreviewPath } from './core/preview-path.js';
import {
  compileEntitledProviderPrompt,
  RUNTIME_PROMPT_SAFETY_CEILING,
} from './core/runtime-prompt-compiler.js';
import { BatchStartCoordinator } from './batch-start-coordinator.js';
import { validateBatch } from './core/validate-batch.js';
import { createSingleWindow, onceCleanup, safeSend } from './electron-lifecycle.js';
import sharp from 'sharp';
import type { BatchSettings, EntitledPreset, JobRecord, OpenArtProvider } from '../shared/types.js';
import type { PreviewResult } from '../shared/types.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | undefined;
let database: JobDatabase;
let engine: BatchEngine;
let batchStarter: BatchStartCoordinator;
let preferencesFile: string;
let diagnosticsFile: string | undefined;
let presetCache: Promise<EntitledPreset> | undefined;
const previewRoots = new Set<string>();
const providers: Record<string, OpenArtProvider> = {
  cli: new OpenArtCliProvider(),
  mock: new MockOpenArtProvider(),
  mcp: new OpenArtMcpProvider(),
};
let activeProvider: OpenArtProvider = providers.cli;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const shutdown = onceCleanup(() => database?.close());

if (!hasSingleInstanceLock) app.quit();

const recentDiagnostics = new Set<string>();
function recordDiagnostic(message: string) {
  if (!diagnosticsFile || recentDiagnostics.has(message)) return;
  recentDiagnostics.add(message);
  if (recentDiagnostics.size > 200) recentDiagnostics.clear();
  void (async () => {
    await fs.mkdir(path.dirname(diagnosticsFile!), { recursive: true });
    const stat = await fs.stat(diagnosticsFile!).catch(() => undefined);
    if (stat && stat.size >= 5 * 1024 * 1024) {
      for (let index = 3; index >= 1; index -= 1) {
        const from = `${diagnosticsFile}.${index}`;
        const to = `${diagnosticsFile}.${index + 1}`;
        await fs.rename(from, to).catch(() => undefined);
      }
      await fs.rename(diagnosticsFile!, `${diagnosticsFile}.1`).catch(() => undefined);
    }
    await fs.appendFile(diagnosticsFile!, `${new Date().toISOString()} ${message}\n`);
  })().catch(() => undefined);
}

function sendJobsUpdate(jobs: JobRecord[]) {
  safeSend(window, 'jobs:update', jobs);
}

async function providerStatus() {
  try {
    return await activeProvider.status();
  } catch (error) {
    return {
      connected: false,
      provider: activeProvider.name,
      message: error instanceof Error ? error.message : 'Provider unavailable',
    };
  }
}
function createWindow() {
  window = createSingleWindow(window, () => new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }));
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    recordDiagnostic(`Preload failed: ${path.basename(preloadPath)}: ${error.message}`);
  });
  window.once('closed', () => {
    window = undefined;
  });
  if (!app.isPackaged) window.loadURL('http://127.0.0.1:5173');
  else window.loadFile(path.join(__dirname, '../../dist/index.html'));
}
if (hasSingleInstanceLock) app.whenReady().then(() => {
  database = new JobDatabase(path.join(app.getPath('userData'), 'jobs.sqlite'));
  diagnosticsFile = path.join(app.getPath('userData'), 'logs', 'app.log');
  preferencesFile = path.join(app.getPath('userData'), 'preferences.json');
  const cli = providers.cli as OpenArtCliProvider;
  cli.configureExecutablePersistence(
    async () => (await readPreferences(preferencesFile)).openArtCliPath,
    async (value) => writePreferences(preferencesFile, { ...(await readPreferences(preferencesFile)), openArtCliPath: value }),
  );
  engine = new BatchEngine(activeProvider, database, sendJobsUpdate);
  batchStarter = new BatchStartCoordinator(engine, database);
  ipcMain.handle('batch:scan', (_, payload: { root: string; allImagesAsReferences: boolean }) =>
    scanBatch(payload.root, payload.allImagesAsReferences),
  );
  ipcMain.handle(
    'batch:validate',
    async (
      _,
      payload: { rows: any[]; inputRoot: string; outputRoot: string; settings: BatchSettings },
    ) => {
      const report = await validateBatch(
        payload.rows,
        payload.inputRoot,
        payload.outputRoot,
        payload.settings,
      );
      try {
        const ready = await (providers.cli as OpenArtCliProvider).checkReadiness();
        return { ...report, cliReadiness: { ready: true, version: ready.version, path: ready.path } };
      } catch (error) {
        return { ...report, ok: false, cliReadiness: { ready: false, error: error instanceof Error ? error.message : 'OpenArt CLI not found' }, errors: [...report.errors, 'OpenArt CLI not found'] };
      }
    },
  );
  ipcMain.handle(
    'batch:run',
    (
      _,
      payload: {
        rows: any[];
        inputRoot: string;
        outputRoot: string;
        settings: BatchSettings;
        dryRun: boolean;
      },
    ) =>
      engine.run(
        payload.rows,
        payload.inputRoot,
        payload.outputRoot,
        payload.settings,
        payload.dryRun,
      ),
  );
  ipcMain.handle(
    'batch:start',
    async (
      _,
      payload: {
        requestId: string;
        expectedFingerprint: string;
        rows: any[];
        inputRoot: string;
        outputRoot: string;
        settings: BatchSettings;
      },
    ) => {
      if (!/^[a-f0-9-]{16,64}$/i.test(payload.requestId))
        throw new Error('Invalid generation request identifier.');
      if (!/^[a-f0-9]{64}$/i.test(payload.expectedFingerprint))
        throw new Error('Invalid local validation fingerprint.');
      return batchStarter.start({
        ...payload,
        preSubmitValidation: async () =>
          revalidateSubmission(payload, entitledPresetRoot(), await getPreset()),
      });
    },
  );
  ipcMain.handle('batch:pause', () => engine.pause());
  ipcMain.handle('batch:resume', () => engine.resume());
  ipcMain.handle('batch:cancel', () => engine.cancelPending());
  const entitledPresetRoot = () =>
    resolveEntitledPresetRoot({
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
    });
  previewRoots.add(path.resolve(entitledPresetRoot()));
  const getPreset = () => (presetCache ??= loadEntitledPreset(entitledPresetRoot()));
  ipcMain.handle('preset:list', () => getPreset());
  ipcMain.handle('products:scan', async (_, payload: { root: string; promptNumbers: number[]; mode?: 'product-folders' | 'flat-front' | 'labeled-batch' }) => {
    previewRoots.add(await fs.realpath(payload.root));
    const preset = await getPreset();
    if (payload.mode === 'flat-front') return scanFlatFrontImages(payload.root, preset);
    if (payload.mode === 'labeled-batch') return scanLabeledBatchFolder(payload.root, preset);
    return scanEntitledProducts(payload.root, preset, payload.promptNumbers);
  });
  ipcMain.handle(
    'products:role-override',
    (_, payload: { row: any; sourcePath: string; role: any }) =>
      applyEntitledRoleOverride(payload.row, payload.sourcePath, payload.role),
  );
  ipcMain.handle(
    'batch:fingerprint',
    (_, payload: { rows: any[]; outputRoot: string; settings: BatchSettings }) =>
      createBatchFingerprint(payload.rows, payload.outputRoot, payload.settings),
  );
  ipcMain.handle('jobs:list', () => database.all());
  ipcMain.handle('jobs:hide', (_, id: string) => {
    database.hide(id);
    const jobs = database.all();
    sendJobsUpdate(jobs);
    return jobs;
  });
  ipcMain.handle('input:get', async () => {
    const inputRoot = (await readPreferences(preferencesFile)).inputRoot;
    if (inputRoot)
      previewRoots.add(await fs.realpath(inputRoot).catch(() => path.resolve(inputRoot)));
    return inputRoot;
  });
  ipcMain.handle('input:set', async (_, inputRoot: string) => {
    const resolved = await fs.realpath(inputRoot);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error('Product input root is not a directory.');
    await writePreferences(preferencesFile, {
      ...(await readPreferences(preferencesFile)),
      inputRoot: resolved,
    });
    previewRoots.add(resolved);
    return resolved;
  });
  ipcMain.handle('output:get', async () => {
    const outputRoot = (await readPreferences(preferencesFile)).outputRoot;
    if (outputRoot)
      previewRoots.add(await fs.realpath(outputRoot).catch(() => path.resolve(outputRoot)));
    return outputRoot;
  });
  ipcMain.handle('output:set', async (_, outputRoot: string) => {
    const validated = await validateOutputDirectory(outputRoot, true);
    await writePreferences(preferencesFile, {
      ...(await readPreferences(preferencesFile)),
      outputRoot: validated,
    });
    previewRoots.add(await fs.realpath(validated));
    return validated;
  });
  ipcMain.handle('provider:status', () => providerStatus());
  ipcMain.handle('provider:models', async () => {
    try {
      return await activeProvider.models();
    } catch {
      return [];
    }
  });
  ipcMain.handle('provider:login', async () => {
    await activeProvider.login();
    return providerStatus();
  });
  ipcMain.handle('provider:select', async (_, name: string) => {
    const next = providers[name];
    if (!next) throw new Error(`Unknown provider: ${name}`);
    activeProvider = next;
    engine.setProvider(next);
    return providerStatus();
  });
  ipcMain.handle(
    'provider:cost',
    async (_, payload: { model: string; mode: 'text2image' | 'image2image' }) => {
      const provider = activeProvider as OpenArtCliProvider;
      if (typeof provider.estimateCost !== 'function') return [];
      return provider.estimateCost(payload.model, payload.mode);
    },
  );
  ipcMain.handle(
    'provider:form',
    async (_, payload: { model: string; mode: 'text2image' | 'image2image' }) => {
      const provider = activeProvider as OpenArtCliProvider;
      if (typeof provider.getModelForm !== 'function') return {};
      return provider.getModelForm(payload.model, payload.mode);
    },
  );
  ipcMain.handle(
    'fidelity:preflight',
    async (_, payload: Parameters<typeof createFidelityPreflight>[0]) =>
      createFidelityPreflight(payload),
  );
  ipcMain.handle('fidelity:save-preflight', async (_, report: any) => {
    const directory = await validateOutputDirectory(report.durableOutputDirectory, false);
    const file = path.join(directory, 'raw-garment-fidelity-preflight.json');
    await fs.writeFile(file, JSON.stringify(report, null, 2));
    return file;
  });
  ipcMain.handle('folder:pick', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('file:pick', async (_, kind: 'image' | 'prompt' = 'image') => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters:
        kind === 'prompt'
          ? [{ name: 'Prompt files', extensions: ['txt'] }]
          : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('provider:cli-select', async (_, value: string) => {
    const cli = providers.cli as OpenArtCliProvider;
    const resolved = await cli.selectExecutable(value);
    return { ready: true, version: resolved.version, path: resolved.path };
  });
  ipcMain.handle('file:pick-cli', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const cli = providers.cli as OpenArtCliProvider;
    const resolved = await cli.selectExecutable(result.filePaths[0]);
    return { ready: true, version: resolved.version, path: resolved.path };
  });
  ipcMain.handle('file:reveal', (_, file: string) => shell.showItemInFolder(file));
  ipcMain.handle('file:open', (_, file: string) => shell.openPath(file));
  ipcMain.handle('folder:open', (_, directory: string) => shell.openPath(directory));
  ipcMain.handle('file:preview', async (_, file: string) => {
    const resolved = await resolvePreviewPath(file, previewRoots);
    if (!resolved.path) return { ok: false, error: resolved.error } satisfies PreviewResult;
    let thumbnailError = '';
    try {
      const previewBuffer = await sharp(resolved.path)
        .resize(180, 180, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      return {
        ok: true,
        dataUrl: `data:image/png;base64,${previewBuffer.toString('base64')}`,
      } satisfies PreviewResult;
    } catch (error) {
      thumbnailError = error instanceof Error ? error.message : 'sharp preview failed';
    }
    return {
      ok: false,
      error: `Preview decode failed for ${path.basename(resolved.path)}: ${thumbnailError}`,
    } satisfies PreviewResult;
  });
  createWindow();
  void enrichHistoricalFailures()
    .then(() => engine.resumePersisted())
    .catch((error) => {
      recordDiagnostic(
        `Persisted OpenArt recovery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    shutdown();
    app.quit();
  }
});
app.on('before-quit', () => shutdown());
app.on('second-instance', () => {
  if (!window || window.isDestroyed()) return void createWindow();
  if (window.isMinimized()) window.restore();
  window.focus();
});
app.on('render-process-gone', (_event, _webContents, details) =>
  recordDiagnostic(`Renderer process exited: ${details.reason}`),
);
app.on('child-process-gone', (_event, details) =>
  recordDiagnostic(`Child process exited: ${details.type}:${details.reason}`),
);
process.on('uncaughtException', (error) => recordDiagnostic(`Uncaught exception: ${error.message}`));
process.on('unhandledRejection', (reason) =>
  recordDiagnostic(`Unhandled rejection: ${reason instanceof Error ? reason.message : 'unknown error'}`),
);

async function validateProviderRows(rows: any[]) {
  for (const row of rows) {
    for (const input of row.orderedInputs ?? []) {
      const resolved = path.resolve(input.image.path);
      if (resolved.split(path.sep).includes('app.asar'))
        throw new Error(`Provider input is an app.asar virtual path: ${input.image.name}`);
      const stat = await fs.stat(resolved).catch(() => undefined);
      if (!stat?.isFile())
        throw new Error(`Provider input is not a regular file: ${input.image.name}`);
      await fs.access(resolved, fs.constants.R_OK);
    }
  }
}

async function revalidateSubmission(
  payload: {
    expectedFingerprint: string;
    rows: any[];
    outputRoot: string;
    settings: BatchSettings;
  },
  presetRoot: string,
  loadedPreset?: EntitledPreset,
) {
  await validateOutputDirectory(payload.outputRoot, false);
  await validateProviderRows(payload.rows);
  const preset = loadedPreset ?? (await loadEntitledPreset(presetRoot));
  if (!preset.imageRulesText || !preset.visualSystemText)
    throw new Error('Local validation failed: canonical master prompt files are unavailable.');
  for (const row of payload.rows.filter((candidate) => candidate.enabled)) {
    const number = Number(row.promptKey);
    const source = preset.prompts.find((prompt) => prompt.number === number);
    if (!source?.text)
      throw new Error(`Local validation failed: canonical Prompt ${row.promptKey} is unavailable.`);
    const compiled = compileEntitledProviderPrompt(
      source.text,
      preset.imageRulesText,
      preset.visualSystemText,
      number,
    );
    if (compiled.length >= RUNTIME_PROMPT_SAFETY_CEILING)
      throw new Error(
        `Local validation failed: Prompt ${row.promptKey} is ${compiled.length} characters; the safety ceiling is ${RUNTIME_PROMPT_SAFETY_CEILING}.`,
      );
    if (compiled.prompt !== row.completePrompt)
      throw new Error(
        `Local validation failed: Prompt ${row.promptKey} changed after Validate Batch.`,
      );
  }
  const fingerprint = await createBatchFingerprint(
    payload.rows,
    payload.outputRoot,
    payload.settings,
  );
  if (!crypto.timingSafeEqual(Buffer.from(fingerprint), Buffer.from(payload.expectedFingerprint)))
    throw new Error(
      'Local validation failed: inputs, roles, prompt, settings, or files changed after Validate Batch.',
    );
}

async function enrichHistoricalFailures() {
  if (!(activeProvider instanceof OpenArtCliProvider)) return;
  const incomplete = database
    .all()
    .filter(
      (job) => job.status === 'failed' && Boolean(job.generationId) && !job.providerErrorMessage,
    );
  for (const job of incomplete) {
    const payload = await activeProvider
      .getGenerationStatus(job.generationId!)
      .catch(() => undefined);
    const failure = parseProviderFailure(payload);
    if (failure) database.updateProviderFailure(job.id, failure.code, failure.message);
  }
  sendJobsUpdate(database.all());
}
