import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpenArtCliProvider, isCliTransientError } from './openart-cli.js';
import type { ReferenceImage } from '../../shared/types.js';

const reference = (file: string): ReferenceImage => ({ path: file, name: path.basename(file) });

describe('OpenArtCliProvider', () => {
  it('detects a missing CLI without throwing from isInstalled', async () => {
    const provider = new OpenArtCliProvider({ binary: '/definitely/missing/openart' });
    expect(await provider.isInstalled()).toBe(false);
  });

  it('parses account, models, forms, costs, uploads, and async results from JSON stdout', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-cli-test-'));
    const image = path.join(temp, 'unicode space Ü.png');
    await fs.writeFile(image, Buffer.from('not-real-but-a-supported-fixture'));
    const calls: string[][] = [];
    const provider = new OpenArtCliProvider({
      run: async (args) => {
        calls.push(args);
        const command = args.slice(0, 2).join(' ');
        if (args[0] === 'account')
          return {
            stdout: '{"plan":"Plus","credits":10515}',
            stderr: 'diagnostic only',
            exitCode: 0,
          };
        if (command === 'model list')
          return {
            stdout:
              '[{"id":"gpt-image-2","displayName":"GPT Image 2","modes":{"image":[{"mode":"image2image"}]}}]',
            stderr: '',
            exitCode: 0,
          };
        if (command === 'model form')
          return {
            stdout: '{"jsonSchema":{"properties":{"aspectRatio":{"enum":["1:1"]}}}}',
            stderr: '',
            exitCode: 0,
          };
        if (command === 'model cost')
          return {
            stdout: '{"items":[{"totalCredits":42,"config":{"resolutionTier":"2k"}}]}',
            stderr: '',
            exitCode: 0,
          };
        if (command === 'upload add')
          return {
            stdout:
              '{"status":"SUCCESS","uploadId":"upload-1","url":"https://cdn.openart.ai/reference.png"}',
            stderr: '',
            exitCode: 0,
          };
        if (command === 'generate image')
          return { stdout: '{"historyId":"creation-1"}', stderr: 'submitted', exitCode: 0 };
        if (command === 'creation get')
          return {
            stdout:
              '{"status":"completed","resultUrl":"https://cdn.openart.ai/result.png","creditsUsed":42}',
            stderr: '',
            exitCode: 0,
          };
        throw new Error(`unexpected fake command: ${args.join(' ')}`);
      },
    });
    expect(await provider.getAccount()).toEqual({ plan: 'Plus', credits: 10515 });
    expect((await provider.listModels())[0].id).toBe('gpt-image-2');
    expect((await provider.getModelForm('gpt-image-2', 'image2image')).jsonSchema).toBeTruthy();
    expect((await provider.estimateCost('gpt-image-2', 'image2image'))[0].totalCredits).toBe(42);
    const first = await provider.uploadReference(reference(image));
    expect(first).toBe('https://cdn.openart.ai/reference.png');
    expect(await provider.uploadReference(reference(image))).toBe(first);
    const handle = await provider.submitGeneration(
      {
        prompt: 'safe $(touch /tmp/should-not-run)',
        references: [reference(image)],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 1,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      [first],
    );
    expect(handle.generationId).toBe('creation-1');
    expect((await provider.waitForGeneration(handle)).resultUrls).toEqual([
      'https://cdn.openart.ai/result.png',
    ]);
    expect(calls.some((args) => args.includes('safe $(touch /tmp/should-not-run)'))).toBe(true);
  });

  it('rejects malformed JSON and unsupported result hosts', async () => {
    const malformed = new OpenArtCliProvider({
      run: async () => ({ stdout: 'not json', stderr: '', exitCode: 0 }),
    });
    await expect(malformed.getAccount()).rejects.toThrow('malformed JSON');
    const provider = new OpenArtCliProvider({
      fetch: async () => new Response('ok', { status: 200 }),
    });
    await expect(
      provider.downloadResult('https://example.com/result.png', '/tmp/result.png'),
    ).rejects.toThrow('approved CDN');
  });

  it('blocks prompts over the confirmed provider limit before invoking the CLI', async () => {
    const calls: string[][] = [];
    const provider = new OpenArtCliProvider({
      run: async (args) => {
        calls.push(args);
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });
    await expect(
      provider.submitGeneration(
        {
          prompt: 'x'.repeat(32_001),
          references: [],
          settings: {
            model: 'gpt-image-2',
            outputs: 1,
            concurrency: 1,
            retryLimit: 0,
            overwrite: false,
            allImagesAsReferences: false,
          },
        },
        [],
      ),
    ).rejects.toThrow('blocked before submission');
    expect(calls).toHaveLength(0);
  });

  it('rejects app.asar virtual paths before invoking the CLI', async () => {
    const calls: string[][] = [];
    const provider = new OpenArtCliProvider({
      run: async (args) => {
        calls.push(args);
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });
    await expect(
      provider.uploadReference({
        path: '/opt/Images/resources/app.asar/resources/presets/reference.png',
        name: 'reference.png',
      }),
    ).rejects.toThrow('app.asar');
    expect(calls).toHaveLength(0);
  });

  it('classifies rate limits as transient', () =>
    expect(isCliTransientError(Object.assign(new Error('rate limit'), { status: 429 }))).toBe(
      true,
    ));

  it('preserves presentation-first ordering and blocks model reference limits', async () => {
    const calls: string[][] = [];
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        calls.push(args);
        if (args[0] === 'model' && args[1] === 'form')
          return {
            stdout:
              '{"jsonSchema":{"properties":{"visualReferences":{"minItems":1,"maxItems":2}}}}',
            stderr: '',
            exitCode: 0,
          };
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });
    const request = {
      prompt: 'ordered',
      references: [
        { name: 'presentation.webp', path: '/tmp/presentation.webp' },
        { name: 'product.jpeg', path: '/tmp/product.jpeg' },
      ],
      orderedInputs: [
        {
          order: 1,
          role: 'presentation' as const,
          label: 'PRESENTATION REFERENCE',
          image: { name: 'presentation.webp', path: '/tmp/presentation.webp' },
        },
        {
          order: 2,
          role: 'product' as const,
          label: 'PRODUCT SOURCE',
          image: { name: 'product.jpeg', path: '/tmp/product.jpeg' },
        },
      ],
      settings: {
        model: 'gpt-image-2',
        outputs: 1,
        concurrency: 1,
        retryLimit: 1,
        overwrite: false,
        allImagesAsReferences: false,
      },
    };
    await provider.submitGeneration(request, ['presentation-url', 'product-url']);
    const generate = calls.find((args) => args[0] === 'generate')!;
    expect(generate.indexOf('presentation-url')).toBeLessThan(generate.indexOf('product-url'));
    const limited = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) =>
        args[0] === 'model'
          ? {
              stdout: '{"jsonSchema":{"properties":{"visualReferences":{"maxItems":1}}}}',
              stderr: '',
              exitCode: 0,
            }
          : { stdout: '{}', stderr: '', exitCode: 0 },
    });
    await expect(
      limited.submitGeneration(request, ['presentation-url', 'product-url']),
    ).rejects.toThrow('at most 1');
    await expect(
      limited.submitGeneration(
        { ...request, orderedInputs: [request.orderedInputs[1], request.orderedInputs[0]] },
        ['presentation-url', 'product-url'],
      ),
    ).rejects.toThrow('first OpenArt image');
  });

  it('supports version, login, status, dry-run, result download, and terminal failures', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-cli-result-'));
    const calls: string[][] = [];
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        calls.push(args);
        if (args[0] === 'version') return { stdout: 'openart 0.1.1', stderr: '', exitCode: 0 };
        if (args[0] === 'account')
          return { stdout: '{"plan":"Plus","credits":9}', stderr: '', exitCode: 0 };
        if (args[0] === 'model' && args[1] === 'form')
          return {
            stdout: '{"jsonSchema":{"properties":{"visualReferences":{"maxItems":1}}}}',
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'generate')
          return {
            stdout: '{"body":{"endpoint":"POST /api/cli/v1/generate"}}',
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'login') return { stdout: '', stderr: '', exitCode: 0 };
        if (args[0] === 'creation' && args[1] === 'get')
          return { stdout: '{"status":"failed"}', stderr: '', exitCode: 0 };
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
      fetch: async () => new Response('image-bytes', { status: 200 }),
    });
    expect(await provider.isInstalled()).toBe(true);
    expect(await provider.getVersion()).toContain('0.1.1');
    expect((await provider.status()).credits).toBe(9);
    await provider.login();
    const output = path.join(temp, 'result.png');
    await provider.downloadResult('https://cdn.openart.ai/result.png', output);
    expect(await fs.readFile(output, 'utf8')).toBe('image-bytes');
    const dryRun = await provider.submitGeneration(
      {
        prompt: 'dry',
        references: [{ name: 'presentation.webp', path: '/tmp/presentation.webp' }],
        orderedInputs: [
          {
            order: 1,
            role: 'presentation',
            label: 'PRESENTATION REFERENCE',
            image: { name: 'presentation.webp', path: '/tmp/presentation.webp' },
          },
        ],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 1,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      ['presentation-url'],
    );
    expect((await provider.waitForGeneration(dryRun)).creditsUsed).toBe(0);
    const failed = new OpenArtCliProvider({
      run: async () => ({ stdout: '{"status":"failed"}', stderr: '', exitCode: 0 }),
    });
    await expect(failed.waitForGeneration({ generationId: 'failed-1' })).rejects.toThrow('failed');
    expect(calls.some((args) => args[0] === 'login')).toBe(true);
  });

  it('parses nested dry-run estimates and preserves sanitized diagnostics', async () => {
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        if (args[0] === 'version') return { stdout: 'openart 9.9.9', stderr: '', exitCode: 0 };
        if (args[0] === 'model' && args[1] === 'form')
          return {
            stdout: '{"jsonSchema":{"properties":{"visualReferences":{"maxItems":2}}}}',
            stderr: 'form diagnostic',
            exitCode: 0,
          };
        if (args[0] === 'generate')
          return {
            stdout:
              '{"data":{"pricing":{"estimated_credits":41},"assetUrl":"https://cdn.openart.ai/x.png"}}',
            stderr: 'Bearer secret-token diagnostic',
            exitCode: 0,
          };
        return { stdout: '{}', stderr: '', exitCode: 0 };
      },
    });
    const handle = await provider.submitGeneration(
      {
        prompt: 'diagnostic prompt',
        references: [{ name: 'presentation.png', path: '/tmp/presentation.png' }],
        orderedInputs: [
          {
            order: 1,
            role: 'presentation',
            label: 'PRESENTATION REFERENCE',
            image: { name: 'presentation.png', path: '/tmp/presentation.png' },
          },
        ],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 0,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      ['https://cdn.openart.ai/reference.png'],
    );
    expect(handle.estimatedCredits).toBe(41);
    expect(handle.dryRunDiagnostics).toMatchObject({
      cliVersion: 'openart 9.9.9',
      estimateAvailable: true,
      estimateSource: '$.data.pricing.estimated_credits',
      exitCode: 0,
    });
    expect(handle.dryRunDiagnostics?.stderr).toContain('Bearer [redacted]');
    expect(handle.dryRunDiagnostics?.parsedJson).toEqual({
      data: { pricing: { estimated_credits: 41 }, assetUrl: '[asset-url]' },
    });
  });

  it('separates provider validation from an unavailable credit estimate', async () => {
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        if (args[0] === 'model' && args[1] === 'form')
          return { stdout: '{"jsonSchema":{"properties":{}}}', stderr: '', exitCode: 0 };
        if (args[0] === 'version') return { stdout: 'openart 1.0.0', stderr: '', exitCode: 0 };
        return { stdout: '{"status":"validated"}', stderr: 'no price field', exitCode: 0 };
      },
    });
    const handle = await provider.submitGeneration(
      {
        prompt: 'no price',
        references: [{ name: 'presentation.png', path: '/tmp/presentation.png' }],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 0,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      ['reference-url'],
    );
    expect(handle.estimatedCredits).toBeUndefined();
    expect(handle.dryRunDiagnostics?.estimateAvailable).toBe(false);
  });

  it('parses JSON surrounded by CLI log lines without trusting unrelated numbers', async () => {
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        if (args[0] === 'model' && args[1] === 'form')
          return {
            stdout: 'form log\n{"jsonSchema":{"properties":{}}}\n',
            stderr: '',
            exitCode: 0,
          };
        if (args[0] === 'version') return { stdout: 'openart test', stderr: '', exitCode: 0 };
        return {
          stdout: 'request log: 123\n{"metadata":{"amount":42,"tokens":999}}\ncomplete log',
          stderr: '',
          exitCode: 0,
        };
      },
    });
    const handle = await provider.submitGeneration(
      {
        prompt: 'mixed output',
        references: [{ name: 'reference.png', path: '/tmp/reference.png' }],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 0,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      ['reference-url'],
    );
    expect(handle.estimatedCredits).toBeUndefined();
    expect(handle.dryRunDiagnostics?.estimateAvailable).toBe(false);
    expect(handle.dryRunDiagnostics?.parsedJson).toEqual({
      metadata: { amount: 42, tokens: 999 },
    });
  });

  it('does not parse an estimate that appears only on stderr', async () => {
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async (args) => {
        if (args[0] === 'model' && args[1] === 'form')
          return { stdout: '{"jsonSchema":{"properties":{}}}', stderr: '', exitCode: 0 };
        if (args[0] === 'version') return { stdout: 'openart test', stderr: '', exitCode: 0 };
        return { stdout: '{"status":"validated"}', stderr: '{"estimatedCredits":42}', exitCode: 0 };
      },
    });
    const handle = await provider.submitGeneration(
      {
        prompt: 'stderr price',
        references: [{ name: 'reference.png', path: '/tmp/reference.png' }],
        settings: {
          model: 'gpt-image-2',
          outputs: 1,
          concurrency: 1,
          retryLimit: 0,
          overwrite: false,
          allImagesAsReferences: false,
        },
      },
      ['reference-url'],
    );
    expect(handle.estimatedCredits).toBeUndefined();
  });

  it('preserves CLI failure diagnostics without approving generation', async () => {
    const provider = new OpenArtCliProvider({
      dryRun: true,
      run: async () => {
        const error = Object.assign(new Error('OpenArt CLI failed'), {
          status: 401,
          stderr: 'authentication expired',
        });
        throw error;
      },
    });
    await expect(
      provider.submitGeneration(
        {
          prompt: 'failure',
          references: [{ name: 'reference.png', path: '/tmp/reference.png' }],
          settings: {
            model: 'gpt-image-2',
            outputs: 1,
            concurrency: 1,
            retryLimit: 0,
            overwrite: false,
            allImagesAsReferences: false,
          },
        },
        ['reference-url'],
      ),
    ).rejects.toThrow();
  });

  it('extracts nested provider failure code and message from creation status', async () => {
    const provider = new OpenArtCliProvider({
      run: async (args) =>
        args[0] === 'creation'
          ? {
              stdout: JSON.stringify({
                history: {
                  status: 'failed',
                  failed_code: 'upstream_error',
                  failed_reason:
                    "[openai] 400 Invalid 'prompt': string too long. Expected a string with maximum length 32000, but got a string with length 50733 instead.",
                },
                resources: [{ status: 'failed', url: '' }],
              }),
              stderr: '',
              exitCode: 0,
            }
          : { stdout: '{}', stderr: '', exitCode: 0 },
    });
    const failure = await provider
      .waitForGeneration({ generationId: 'failed-history' })
      .catch((error) => error as Error & { providerCode?: string; providerMessage?: string });
    expect(failure.providerCode).toBe('upstream_error');
    expect(failure.providerMessage).toContain("Invalid 'prompt': string too long");
    expect(failure.message).toContain('upstream_error');
  });
});
