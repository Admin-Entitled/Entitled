import { describe, expect, it } from 'vitest';
import { resolveEntitledPresetRoot } from './preset-path.js';

describe('preset path resolution', () => {
  it('keeps development resources under the app root', () => {
    expect(
      resolveEntitledPresetRoot({
        appPath: '/workspace/app',
        resourcesPath: '/workspace/app/resources',
        isPackaged: false,
      }),
    ).toBe('/workspace/app/resources/presets/entitled-v1');
  });

  it('uses extraResources outside app.asar when packaged', () => {
    const resolved = resolveEntitledPresetRoot({
      appPath: '/opt/app/resources/app.asar',
      resourcesPath: '/opt/app/resources',
      isPackaged: true,
    });
    expect(resolved).toBe('/opt/app/resources/presets/entitled-v1');
    expect(resolved).not.toContain('app.asar');
  });
});
