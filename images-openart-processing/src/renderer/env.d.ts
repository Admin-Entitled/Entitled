import type {
  BatchSettings,
  JobRecord,
  MappingRow,
  ModelCapability,
  ProviderStatus,
  FidelityPreflightReport,
  EntitledPreset,
  ProductScanSummary,
  PreviewResult,
  ValidationReport,
} from '../shared/types.js';

declare global {
  interface Window {
    openartApp: {
      scan: (payload: { root: string; allImagesAsReferences: boolean }) => Promise<MappingRow[]>;
      run: (payload: {
        rows: MappingRow[];
        inputRoot: string;
        outputRoot: string;
        settings: BatchSettings;
        dryRun: boolean;
      }) => Promise<JobRecord[]>;
      start: (payload: {
        requestId: string;
        expectedFingerprint: string;
        rows: MappingRow[];
        inputRoot: string;
        outputRoot: string;
        settings: BatchSettings;
      }) => Promise<{ runId: string; jobs: JobRecord[] }>;
      pause: () => Promise<void>;
      resume: () => Promise<void>;
      cancel: () => Promise<void>;
      preset: () => Promise<EntitledPreset>;
      scanProducts: (payload: { root: string; promptNumbers: number[]; mode?: 'product-folders' | 'flat-front' }) => Promise<{
        rows: MappingRow[];
        summaries: ProductScanSummary[];
      }>;
      overrideProductRole: (payload: {
        row: MappingRow;
        sourcePath: string;
        role: string;
      }) => Promise<MappingRow>;
      fingerprint: (payload: {
        rows: MappingRow[];
        outputRoot: string;
        settings: BatchSettings;
      }) => Promise<string>;
      validateBatch: (payload: {
        rows: MappingRow[];
        inputRoot: string;
        outputRoot: string;
        settings: BatchSettings;
      }) => Promise<ValidationReport>;
      jobs: () => Promise<JobRecord[]>;
      hideJob: (id: string) => Promise<JobRecord[]>;
      getInputRoot: () => Promise<string | undefined>;
      setInputRoot: (directory: string) => Promise<string>;
      getOutputRoot: () => Promise<string | undefined>;
      setOutputRoot: (directory: string) => Promise<string>;
      status: () => Promise<ProviderStatus>;
      models: () => Promise<ModelCapability[]>;
      login: () => Promise<ProviderStatus>;
      selectProvider: (name: 'cli' | 'mock' | 'mcp') => Promise<ProviderStatus>;
      estimateCost: (payload: {
        model: string;
        mode: 'text2image' | 'image2image';
      }) => Promise<
        Array<{ config: Record<string, unknown>; totalCredits?: number; unitCredits?: number }>
      >;
      getModelForm: (payload: { model: string; mode: 'text2image' | 'image2image' }) => Promise<{
        jsonSchema?: {
          properties?: Record<string, { enum?: string[]; default?: unknown; type?: string }>;
        };
      }>;
      dryRunProvider: (payload: {
        row: MappingRow;
        rows: MappingRow[];
        settings: BatchSettings;
      }) => Promise<{
        handle: { generationId: string; dryRun?: boolean };
        estimatedCredits?: number;
        providerValidation: 'passed';
        estimateAvailable: boolean;
        diagnostics?: {
          exitCode: number;
          parsedJson?: unknown;
          stdout: string;
          stderr: string;
          cliVersion?: string;
          args: string[];
          estimateAvailable: boolean;
          estimateSource?: string;
        };
        orderedInputs: MappingRow['orderedInputs'];
        prompt?: string;
      }>;
      createFidelityPreflight: (payload: {
        presentationPath: string;
        productPaths: string[];
        promptPath: string;
        outputRoot: string;
        model: string;
        supportedSettings: Record<string, unknown>;
        estimatedCredits?: number;
      }) => Promise<{ report: FidelityPreflightReport; row: MappingRow }>;
      saveFidelityPreflight: (report: FidelityPreflightReport) => Promise<string>;
      pickFolder: () => Promise<string | undefined>;
      pickFile: (kind?: 'image' | 'prompt') => Promise<string | undefined>;
      selectOpenArtCli: () => Promise<{ ready: boolean; version?: string; path?: string } | undefined>;
      reveal: (file: string) => Promise<void>;
      openFile: (file: string) => Promise<string>;
      openFolder: (directory: string) => Promise<string>;
      preview: (file: string) => Promise<PreviewResult>;
      onJobs: (listener: (jobs: JobRecord[]) => void) => () => void;
    };
  }
}

export {};
