import fs from 'node:fs/promises';
import path from 'node:path';

export interface AppPreferences {
  inputRoot?: string;
  outputRoot?: string;
  openArtCliPath?: string;
}

export async function readPreferences(file: string): Promise<AppPreferences> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as AppPreferences;
  } catch {
    return {};
  }
}

export async function writePreferences(file: string, preferences: AppPreferences) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(preferences, null, 2));
}
