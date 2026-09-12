import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compileEntitledProviderPrompt,
  RUNTIME_PROMPT_SAFETY_CEILING,
} from './runtime-prompt-compiler.js';

const root = path.resolve('resources/presets/entitled-v1');
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function canonical() {
  const [rules, visual] = await Promise.all([
    fs.readFile(path.join(root, 'masters/ENTITLED_IMAGE_RULES.md'), 'utf8'),
    fs.readFile(path.join(root, 'masters/ENTITLED_VISUAL_SYSTEM.md'), 'utf8'),
  ]);
  return { rules, visual };
}

describe('compiled provider prompts', () => {
  it('keeps canonical source hashes unchanged', async () => {
    const expected = {
      'masters/ENTITLED_VISUAL_SYSTEM.md':
        '4b9504bf27ca5769bcb08a83a7d874bd7f7588b87400086f49d815a726a55718',
      'masters/ENTITLED_IMAGE_RULES.md':
        '502e50244089b5c38bac62948d0f587b5e23b6147e258169f6636c297f946b6d',
      'prompts/01.txt': 'b17b1cfbb689609364bd950133579a6a1db0b4d72a2a956d75fb5b21fe8ab7f4',
      'prompts/02.txt': 'b268b5aec404211422bed56a1e29abfd2331e9d87279e15068c64969d9269494',
      'prompts/03.txt': '40691f7563453b0813c272a40fb3cc177220bb257b5da37b79036cb88f7da199',
      'prompts/04.txt': 'a80733b235c842425ca069f1fbc4e9ed812a3e550c2e4f53ab438189db1c382f',
      'prompts/05.txt': '9447c4448ac9ec7dd3d03bad5f128372dff678f745cf8cb1e3dee001f935f4d7',
      'prompts/06.txt': '4909bedb8a16a2c72e80758955d35bc7ce515248f796d69615331e02143fceec',
      'prompts/07.txt': '191dfc988541317ed37bb38f96a1e5cb1ca7ce408652926eda75e85b87ca797e',
      'prompts/08.txt': '923704c7e043da9a5cd7935ea66e435d796cc1522a009cced55440f31e552436',
      'prompts/09.txt': 'fd7c2b0668d9d5568478c7b31d434c90a3c8923dc17ac32414c548ce0907965e',
      'prompts/10.txt': '5716714d2b2f6388637d921004e68402d549e798504f6998ed3637615f1e6bbe',
    };
    for (const [relative, expectedHash] of Object.entries(expected))
      expect(hash(await fs.readFile(path.join(root, relative), 'utf8'))).toBe(expectedHash);
  });

  it('compiles every numbered prompt below the safety ceiling', async () => {
    const { rules, visual } = await canonical();
    const lengths: number[] = [];
    for (let number = 1; number <= 10; number += 1) {
      const text = await fs.readFile(
        path.join(root, 'prompts', `${String(number).padStart(2, '0')}.txt`),
        'utf8',
      );
      const compiled = compileEntitledProviderPrompt(text, rules, visual, number);
      lengths.push(compiled.length);
      expect(compiled.length).toBeLessThan(RUNTIME_PROMPT_SAFETY_CEILING);
      expect(compiled.prompt).not.toContain('MASTER REFERENCES');
      expect(new Set(compiled.sections.map((section) => section.name)).size).toBe(
        compiled.sections.length,
      );
    }
    expect(lengths).toEqual([25717, 11375, 11238, 11309, 12002, 16099, 14905, 23679, 11105, 12583]);
  });

  it('keeps Prompt 01 authority, sleeve and composition rules without cross-prompt leakage', async () => {
    const { rules, visual } = await canonical();
    const prompt01 = await fs.readFile(path.join(root, 'prompts/01.txt'), 'utf8');
    const compiled = compileEntitledProviderPrompt(prompt01, rules, visual, 1).prompt;
    expect(compiled).toContain('ruler-straight');
    expect(compiled).toContain('curved armhole');
    expect(compiled).toContain('#EDEBE8');
    expect(compiled).not.toContain('OUTDOOR LIFESTYLE MOVEMENT HERO');
    expect(compiled).not.toContain('SHOPIFY SIZE CHART');
    expect(compiled).not.toContain('ENTITLED_IMAGE_RULES.md');
    expect(compiled).not.toContain('ENTITLED_VISUAL_SYSTEM.md');
  });

  it('retains Prompt 08 front-back linkage and Prompt 10 dependency rules', async () => {
    const { rules, visual } = await canonical();
    const prompt08 = await fs.readFile(path.join(root, 'prompts/08.txt'), 'utf8');
    const prompt10 = await fs.readFile(path.join(root, 'prompts/10.txt'), 'utf8');
    const compiled08 = compileEntitledProviderPrompt(prompt08, rules, visual, 8).prompt;
    const compiled10 = compileEntitledProviderPrompt(prompt10, rules, visual, 10).prompt;
    expect(compiled08).toContain('01 / 08 FRONT-BACK PRESENTATION MATCH');
    expect(compiled10).toContain('approved final isolated front product image');
    expect(compiled10).toContain('measurement source images or files');
    expect(compiled10).toContain('official ENTITLED logo');
    expect(compiled10).not.toContain('OUTDOOR LIFESTYLE MOVEMENT HERO');
  });
});
