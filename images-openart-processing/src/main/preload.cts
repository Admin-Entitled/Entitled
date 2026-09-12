import type { BatchSettings } from '../shared/types.js';
import type { FidelityPreflightReport } from '../shared/types.js';
import type { PreviewResult } from '../shared/types.js';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('openartApp', {
  scan: (payload: { root: string; allImagesAsReferences: boolean }) =>
    ipcRenderer.invoke('batch:scan', payload),
  run: (payload: {
    rows: any[];
    inputRoot: string;
    outputRoot: string;
    settings: BatchSettings;
    dryRun: boolean;
  }) => ipcRenderer.invoke('batch:run', payload),
  start: (payload: {
    requestId: string;
    expectedFingerprint: string;
    rows: any[];
    inputRoot: string;
    outputRoot: string;
    settings: BatchSettings;
  }) => ipcRenderer.invoke('batch:start', payload),
  pause: () => ipcRenderer.invoke('batch:pause'),
  resume: () => ipcRenderer.invoke('batch:resume'),
  cancel: () => ipcRenderer.invoke('batch:cancel'),
  preset: () => ipcRenderer.invoke('preset:list'),
  scanProducts: (payload: { root: string; promptNumbers: number[] }) =>
    ipcRenderer.invoke('products:scan', payload),
  overrideProductRole: (payload: { row: unknown; sourcePath: string; role: string }) =>
    ipcRenderer.invoke('products:role-override', payload),
  fingerprint: (payload: { rows: any[]; outputRoot: string; settings: BatchSettings }) =>
    ipcRenderer.invoke('batch:fingerprint', payload),
  validateBatch: (payload: {
    rows: any[];
    inputRoot: string;
    outputRoot: string;
    settings: BatchSettings;
  }) => ipcRenderer.invoke('batch:validate', payload),
  jobs: () => ipcRenderer.invoke('jobs:list'),
  hideJob: (id: string) => ipcRenderer.invoke('jobs:hide', id),
  getInputRoot: () => ipcRenderer.invoke('input:get'),
  setInputRoot: (directory: string) => ipcRenderer.invoke('input:set', directory),
  getOutputRoot: () => ipcRenderer.invoke('output:get'),
  setOutputRoot: (directory: string) => ipcRenderer.invoke('output:set', directory),
  status: () => ipcRenderer.invoke('provider:status'),
  models: () => ipcRenderer.invoke('provider:models'),
  login: () => ipcRenderer.invoke('provider:login'),
  selectProvider: (name: 'cli' | 'mock' | 'mcp') => ipcRenderer.invoke('provider:select', name),
  estimateCost: (payload: { model: string; mode: 'text2image' | 'image2image' }) =>
    ipcRenderer.invoke('provider:cost', payload),
  getModelForm: (payload: { model: string; mode: 'text2image' | 'image2image' }) =>
    ipcRenderer.invoke('provider:form', payload),
  createFidelityPreflight: (payload: any) => ipcRenderer.invoke('fidelity:preflight', payload),
  saveFidelityPreflight: (report: FidelityPreflightReport) =>
    ipcRenderer.invoke('fidelity:save-preflight', report),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  pickFile: (kind: 'image' | 'prompt' = 'image') => ipcRenderer.invoke('file:pick', kind),
  selectOpenArtCli: () => ipcRenderer.invoke('file:pick-cli'),
  reveal: (file: string) => ipcRenderer.invoke('file:reveal', file),
  openFile: (file: string) => ipcRenderer.invoke('file:open', file),
  openFolder: (directory: string) => ipcRenderer.invoke('folder:open', directory),
  preview: (file: string): Promise<PreviewResult> => ipcRenderer.invoke('file:preview', file),
  onJobs: (listener: (jobs: any[]) => void) => {
    const wrapped = (_: Electron.IpcRendererEvent, jobs: any[]) => listener(jobs);
    ipcRenderer.on('jobs:update', wrapped);
    return () => ipcRenderer.removeListener('jobs:update', wrapped);
  },
});
