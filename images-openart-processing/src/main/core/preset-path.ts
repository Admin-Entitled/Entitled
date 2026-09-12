import path from 'node:path';

export interface PresetPathContext {
  appPath: string;
  resourcesPath: string;
  isPackaged: boolean;
}

export function resolveEntitledPresetRoot(context: PresetPathContext): string {
  return context.isPackaged
    ? path.join(context.resourcesPath, 'presets', 'entitled-v1')
    : path.join(context.appPath, 'resources', 'presets', 'entitled-v1');
}
