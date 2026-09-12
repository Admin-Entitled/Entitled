export type JobStatus =
  | 'preparing'
  | 'ready'
  | 'confirmation_open'
  | 'submitting'
  | 'submitted'
  | 'queued'
  | 'uploading'
  | 'finalising'
  | 'processing'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'failed_before_submission'
  | 'interrupted'
  | 'skipped'
  | 'cancelled';
export type JobFailureStage =
  | 'local_validation_failed'
  | 'uploading'
  | 'upload_failed'
  | 'submission_failed'
  | 'ambiguous_submission'
  | 'provider_generation_failed'
  | 'polling_failed'
  | 'download_failed'
  | 'finalisation_failed'
  | 'local_output_missing'
  | 'result_url_missing'
  | 'failed_before_submission'
  | 'interrupted_before_submission';
export type ProviderName = 'mcp' | 'cli' | 'mock';
export interface ReferenceImage {
  path: string;
  name: string;
}
export type ProductImageRole =
  | 'FRONT'
  | 'BACK'
  | 'DETAIL'
  | 'LABEL_BRANDING'
  | 'FABRIC'
  | 'MEASUREMENT'
  | 'APPROVED_PROMPT_01'
  | 'UNASSIGNED'
  | 'IGNORE';
export interface ProductSourceImage extends ReferenceImage {
  detectedRole: ProductImageRole;
  role: ProductImageRole;
  roleCandidates?: ProductImageRole[];
}
export interface ProductRoleMapping {
  path: string;
  name: string;
  detectedRole: ProductImageRole;
  role: ProductImageRole;
}
export type ImageInputRole = 'presentation' | 'product' | 'measurement';
export interface OrderedImageInput {
  order: number;
  role: ImageInputRole;
  label: string;
  image: ReferenceImage;
}
export type PersistedInputRole = 'presentation_reference' | 'product_source' | 'measurement_source';
export interface UploadedInputRecord {
  order: number;
  role: PersistedInputRole;
  localPath: string;
  sha256: string;
  uploadedUrl?: string;
  uploadedAt?: string;
}
export interface MappingRow {
  id: string;
  product: string;
  order: number;
  promptKey: string;
  promptFile?: string;
  references: ReferenceImage[];
  outputType: string;
  presentationReference?: ReferenceImage;
  measurementReference?: ReferenceImage;
  productInputs: ReferenceImage[];
  sourceImages?: ProductSourceImage[];
  includedProductInputs?: ProductSourceImage[];
  excludedProductInputs?: ProductSourceImage[];
  orderedInputs: OrderedImageInput[];
  outputName: string;
  enabled: boolean;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  completePrompt?: string;
}
export interface PreflightAsset {
  order: number;
  role: PersistedInputRole;
  path: string;
  name: string;
  sha256: string;
  width?: number;
  height?: number;
  format?: string;
}
export interface FidelityPreflightReport {
  label: 'RAW GARMENT FIDELITY TEST — NOT FINAL PRODUCTION OUTPUT';
  createdAt: string;
  enabledJobCount: number;
  presentationReference: PreflightAsset;
  productSources: PreflightAsset[];
  promptPath: string;
  promptText: string;
  completePrompt: string;
  orderedProviderInputs: Array<{
    order: number;
    role: PersistedInputRole;
    localPath: string;
  }>;
  model: string;
  supportedSettings: Record<string, unknown>;
  unsupportedProductionSettings: string[];
  estimatedCredits?: number;
  durableOutputDirectory: string;
  proposedOutputPath: string;
  generationSubmitted: false;
}
export interface PresetPrompt {
  number: number;
  name: string;
  file: string;
  reference?: string;
  special?: 'size-chart';
  text: string;
  canonicalPath?: string;
  canonicalSha256?: string;
  canonicalFound: boolean;
  referencePath?: string;
  ready: boolean;
  missingReason?: string;
}
export interface EntitledPreset {
  id: string;
  name: string;
  prompts: PresetPrompt[];
  imageRulesPath?: string;
  imageRulesSha256?: string;
  visualSystemPath?: string;
  visualSystemSha256?: string;
  imageRulesText?: string;
  visualSystemText?: string;
  masterRulesReady: boolean;
}
export interface ProductScanSummary {
  product: string;
  images: ProductSourceImage[];
  selectedPromptNumbers: number[];
  jobCount: number;
  errors: string[];
  enabled: boolean;
}
export interface ManifestRow {
  order: number;
  promptKey: string;
  promptFile: string;
  referencePatterns: string[];
  outputName: string;
  enabled: boolean;
  presentationReference?: string;
  productPatterns?: string[];
  measurementReference?: string;
  outputType?: string;
}
export interface BatchSettings {
  model: string;
  aspectRatio?: string;
  resolution?: string;
  outputs: number;
  seed?: number;
  concurrency: number;
  retryLimit: number;
  overwrite: boolean;
  allImagesAsReferences: boolean;
  /** Legacy fields are retained only for historical records. */
  estimatedCredits?: number;
  dryRunDiagnostics?: DryRunDiagnostics;
}
export interface ModelCapability {
  id: string;
  name: string;
  modes?: string[];
  schema: Record<string, unknown>;
  estimatedCreditsPerOutput?: number;
}
export interface ProviderStatus {
  connected: boolean;
  provider: ProviderName;
  workspace?: string;
  credits?: number;
  version?: string;
  plan?: string;
  message?: string;
}
export interface PreviewResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}
export interface GenerationRequest {
  prompt: string;
  references: ReferenceImage[];
  orderedInputs?: OrderedImageInput[];
  settings: BatchSettings;
}
export interface GenerationHandle {
  generationId: string;
  assetIds?: string[];
  dryRun?: boolean;
  estimatedCredits?: number;
  dryRunDiagnostics?: DryRunDiagnostics;
}
export interface DryRunDiagnostics {
  exitCode: number;
  parsedJson?: unknown;
  stdout: string;
  stderr: string;
  cliVersion?: string;
  args: string[];
  estimateAvailable: boolean;
  estimateSource?: string;
}
export interface GenerationResult {
  generationId: string;
  resultUrls: string[];
  creditsUsed?: number;
}
export interface GenerationStatusUpdate {
  status: 'queued' | 'processing';
  checkedAt: string;
}
export interface OpenArtProvider {
  readonly name: ProviderName;
  status(): Promise<ProviderStatus>;
  models(): Promise<ModelCapability[]>;
  uploadReferences(images: ReferenceImage[]): Promise<string[]>;
  generate(request: GenerationRequest, assetIds: string[]): Promise<GenerationHandle>;
  waitForResult(
    handle: GenerationHandle,
    signal?: AbortSignal,
    onStatus?: (update: GenerationStatusUpdate) => void,
  ): Promise<GenerationResult>;
  downloadResult(url: string, destination: string): Promise<void>;
  login(): Promise<void>;
}
export interface JobRecord {
  id: string;
  runId?: string;
  mappingId?: string;
  product: string;
  promptKey: string;
  promptFile?: string;
  references: string[];
  orderedInputs: UploadedInputRecord[];
  sourceMappings?: ProductRoleMapping[];
  completePrompt?: string;
  outputPath: string;
  model: string;
  settings: BatchSettings;
  generationId?: string;
  status: JobStatus;
  attemptCount?: number;
  retries: number;
  failureStage?: JobFailureStage;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  error?: string;
  startedAt?: string;
  createdAt?: string;
  submittedAt?: string;
  lastStatusAt?: string;
  endedAt?: string;
  creditsUsed?: number;
  estimatedCredits?: number;
  creditDifference?: number;
  actualCreditsSource?: 'provider' | 'balance-derived';
  outputExists?: boolean;
  dryRunDiagnostics?: DryRunDiagnostics;
  balanceBefore?: number;
  balanceAfter?: number;
  hidden?: boolean;
  promptHash?: string;
  batchFingerprint?: string;
  rawOutputPath?: string;
  finalOutputPath?: string;
}

export interface ValidationReport {
  ok: boolean;
  validatedAt: string;
  fingerprint?: string;
  providerStatus: ProviderStatus;
  cliReadiness?: { ready: boolean; version?: string; path?: string; error?: string };
  products: number;
  jobs: number;
  errors: string[];
  warnings: string[];
  inputs: Array<{ path: string; role: string; sha256: string; size: number }>;
  promptLengths: Array<{ promptKey: string; length: number; promptHash: string }>;
  outputPaths: string[];
}

export type JobEventStage = JobStatus | JobFailureStage;

export interface RunRecord {
  runId: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  status: JobStatus;
  batchFingerprint: string;
  inputRoot: string;
  outputRoot: string;
  settings: BatchSettings;
}
