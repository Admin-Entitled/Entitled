import path from 'node:path';
export const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export function isVisibleFile(name: string) {
  return !name.startsWith('.') && !name.startsWith('~$') && !name.endsWith('.tmp');
}
export function numericPrefix(stem: string) {
  return stem.match(/^([0-9]+)/)?.[1] ?? '';
}
export function safeOutputName(name: string) {
  const base = path
    .basename(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  return base || 'result.png';
}
export function versionOutputPath(outputPath: string, exists: (candidate: string) => boolean) {
  if (!exists(outputPath)) return outputPath;
  const ext = path.extname(outputPath);
  const stem = outputPath.slice(0, -ext.length);
  let index = 2;
  let candidate = `${stem}_v${index}${ext}`;
  while (exists(candidate)) {
    index += 1;
    candidate = `${stem}_v${index}${ext}`;
  }
  return candidate;
}
