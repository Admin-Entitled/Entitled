export function naturalCompare(a: string, b: string): number {
  const tokenize = (value: string) =>
    value
      .toLocaleLowerCase()
      .split(/(\d+)/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = tokenize(a);
  const right = tokenize(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    if (typeof l === 'number' && typeof r === 'number') return l - r;
    return String(l).localeCompare(String(r));
  }
  return 0;
}
