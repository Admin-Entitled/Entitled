import type {
  GenerationHandle,
  GenerationRequest,
  GenerationResult,
  ModelCapability,
  OpenArtProvider,
  ProviderStatus,
  ReferenceImage,
} from '../../shared/types.js';
/** Runtime adapter boundary. Tool names and arguments are injected from the live MCP schema, never guessed here. */
export class OpenArtMcpProvider implements OpenArtProvider {
  readonly name = 'mcp' as const;
  constructor(
    private readonly client?: {
      callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    },
  ) {}
  private requireClient() {
    if (!this.client)
      throw new Error(
        'OpenArt MCP client is not available inside Electron. Use the official CLI fallback or configure an MCP bridge.',
      );
    return this.client;
  }
  private unavailable(): never {
    throw new Error(
      'OpenArt MCP schema has not been bound; inspect live tools before enabling credit-consuming calls.',
    );
  }
  async status(): Promise<ProviderStatus> {
    this.requireClient();
    return this.unavailable();
  }
  async models(): Promise<ModelCapability[]> {
    this.requireClient();
    return this.unavailable();
  }
  async uploadReferences(_images: ReferenceImage[]): Promise<string[]> {
    return this.unavailable();
  }
  async generate(_request: GenerationRequest, _assetIds: string[]): Promise<GenerationHandle> {
    return this.unavailable();
  }
  async waitForResult(_handle: GenerationHandle): Promise<GenerationResult> {
    return this.unavailable();
  }
  async downloadResult(_url: string, _destination: string): Promise<void> {
    return this.unavailable();
  }
  async login() {
    throw new Error('Use `codex mcp login openart` for OAuth.');
  }
}
