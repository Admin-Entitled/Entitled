import { mkdirSync } from "node:fs";

export function nowIso(): string {
  return new Date().toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

export function toStringClean(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) {
        return;
      }
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => run());
  await Promise.all(workers);
  return results;
}

export function normalizeStatus(input: string): "ACTIVE" | "DRAFT" | null {
  const v = input.trim().toUpperCase();
  if (v === "ACTIVE") return "ACTIVE";
  if (v === "DRAFT") return "DRAFT";
  return null;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}
