import fs from 'node:fs/promises';
import type {
  GenerationHandle,
  GenerationRequest,
  GenerationResult,
  ModelCapability,
  OpenArtProvider,
  ProviderStatus,
  ReferenceImage,
} from '../../shared/types.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
export class MockOpenArtProvider implements OpenArtProvider {
  readonly name = 'mock' as const;
  async status(): Promise<ProviderStatus> {
    return {
      connected: true,
      provider: 'mock',
      workspace: 'Local mock workspace',
      credits: 9999,
      message: 'No credits are spent by the mock provider.',
    };
  }
  async models(): Promise<ModelCapability[]> {
    return [
      {
        id: 'mock-model',
        name: 'Mock Image Model',
        modes: ['image2image'],
        schema: {
          aspectRatio: ['1:1', '16:9'],
          resolution: ['1024x1024'],
          outputs: { min: 1, max: 4 },
        },
        estimatedCreditsPerOutput: 0,
      },
    ];
  }
  async uploadReferences(images: ReferenceImage[]) {
    return images.map((image) => `mock:${image.path}`);
  }
  async generate(_request: GenerationRequest, _assetIds: string[]): Promise<GenerationHandle> {
    return { generationId: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  }
  async waitForResult(handle: GenerationHandle): Promise<GenerationResult> {
    return { generationId: handle.generationId, resultUrls: ['mock://result'], creditsUsed: 0 };
  }
  async downloadResult(_url: string, destination: string) {
    await fs.writeFile(destination, png);
  }
  async login() {}
}
