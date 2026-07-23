import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_STRATEGY = Object.freeze({
  salesWeight: 0.4,
  inventoryWeight: 0.25,
  newnessWeight: 0.2,
  momentumWeight: 0.1,
  rotationWeight: 0.05,
});

const strategyKeys = Object.keys(DEFAULT_STRATEGY);
const defaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/strategy-settings.json");
const settingsPath = process.env.STRATEGY_SETTINGS_FILE || defaultPath;

export function validateStrategy(input) {
  if (!input || typeof input !== "object") return { error: "All five strategy weights are required." };
  const strategy = {};
  for (const key of strategyKeys) {
    if (!Object.hasOwn(input, key) || !Number.isFinite(Number(input[key])) || Number(input[key]) < 0) {
      return { error: `Invalid ${key}.` };
    }
    strategy[key] = Number(input[key]);
  }
  if (Math.round(Object.values(strategy).reduce((sum, value) => sum + value, 0) * 100) !== 100) {
    return { error: "Strategy weights must total exactly 1.00." };
  }
  return { strategy };
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getStrategySettings(collectionId) {
  const saved = (await readStore())[collectionId];
  const validated = validateStrategy(saved);
  return { collectionId, ...(validated.strategy || DEFAULT_STRATEGY) };
}

export async function saveStrategySettings(collectionId, input) {
  const validated = validateStrategy(input);
  if (validated.error) throw new Error(validated.error);
  const store = await readStore();
  store[collectionId] = validated.strategy;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, settingsPath);
  return { collectionId, ...validated.strategy };
}
