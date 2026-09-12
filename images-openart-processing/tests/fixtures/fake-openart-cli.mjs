#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const statePath = process.env.OPENART_FAKE_STATE;
const mode = process.env.OPENART_FAKE_MODE ?? 'success';
if (!statePath) throw new Error('OPENART_FAKE_STATE is required.');

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { generationCalls: 0, statusCalls: 0, commands: [] };
  }
};
const writeState = (state) => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
const record = (kind) => {
  const state = readState();
  const next = { ...state, commands: [...state.commands, kind] };
  writeState(next);
  return next;
};
const output = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (args[0] === 'version') {
  process.stdout.write('openart 0.1.1-fake-e2e\n');
} else if (args[0] === 'account') {
  record('account');
  output({ plan: 'Fake E2E', credits: 1000 });
} else if (args[0] === 'model' && args[1] === 'list') {
  record('model-list');
  output([
    {
      id: 'gpt-image-2',
      displayName: 'GPT Image 2',
      modes: { image: [{ mode: 'image2image' }] },
    },
  ]);
} else if (args[0] === 'model' && args[1] === 'form') {
  record('model-form');
  output({
    model: 'gpt-image-2',
    mode: 'image2image',
    media: 'image',
    jsonSchema: { properties: { visualReferences: { minItems: 1, maxItems: 16 } } },
  });
} else if (args[0] === 'upload' && args[1] === 'add') {
  record(`upload:${path.basename(args[2] ?? '')}`);
  await wait(Number(process.env.OPENART_FAKE_UPLOAD_DELAY_MS ?? 2000));
  output({
    status: 'SUCCESS',
    uploadId: `upload-${path.basename(args[2] ?? 'image')}`,
    url: `https://cdn.openart.ai/fake/${encodeURIComponent(path.basename(args[2] ?? 'image'))}`,
  });
} else if (args[0] === 'generate' && args[1] === 'image') {
  const dryRun = args.includes('--dry-run');
  if (dryRun) {
    record('dry-run');
    output({ body: { endpoint: 'POST /api/cli/v1/generate', validated: true } });
  } else {
    const state = record('generate');
    writeState({ ...state, generationCalls: state.generationCalls + 1 });
    output({ historyId: 'fake-e2e-creation-1' });
  }
} else if (args[0] === 'creation' && args[1] === 'get') {
  const state = record('creation-get');
  const statusCalls = state.statusCalls + 1;
  writeState({ ...state, statusCalls });
  if (mode === 'poll-interruption') {
    process.stderr.write('temporary status connection interruption\n');
    process.exitCode = 1;
  } else if (mode === 'provider-failure') {
    output({
      history: {
        id: args[2],
        status: 'failed',
        failed_code: 'fake_upstream_error',
        failed_reason: 'Fake provider rejected the request.',
      },
      resources: [{ status: 'failed', url: '' }],
    });
  } else if (statusCalls === 1) {
    output({ history: { id: args[2], status: 'queued' }, resources: [] });
  } else if (statusCalls === 2) {
    output({ history: { id: args[2], status: 'processing' }, resources: [] });
  } else {
    output({
      history: { id: args[2], status: 'completed' },
      resources: [{ status: 'completed', url: 'fake-openart://result' }],
    });
  }
} else {
  process.stderr.write(`Unsupported fake command: ${args.join(' ')}\n`);
  process.exitCode = 2;
}
