import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export const DEFAULT_STRATEGY = Object.freeze({
  salesWeight: 0.30,
  revenueWeight: 0.20,
  inventoryWeight: 0.15,
  newnessWeight: 0.15,
  momentumWeight: 0.10,
  rotationWeight: 0.10,
});

const strategyKeys = Object.keys(DEFAULT_STRATEGY);
const getSettingsPath = () => env.strategySettingsFile;

export function computeStrategyHash(weights) {
  const hashString = [
    `salesWeight:${Number(weights.salesWeight).toFixed(4)}`,
    `revenueWeight:${Number(weights.revenueWeight).toFixed(4)}`,
    `inventoryWeight:${Number(weights.inventoryWeight).toFixed(4)}`,
    `newnessWeight:${Number(weights.newnessWeight).toFixed(4)}`,
    `momentumWeight:${Number(weights.momentumWeight).toFixed(4)}`,
    `rotationWeight:${Number(weights.rotationWeight).toFixed(4)}`
  ].join("|");
  return crypto.createHash("sha256").update(hashString).digest("hex");
}

export function validateStrategy(input) {
  if (!input || typeof input !== "object") {
    return { error: "All six strategy weights are required." };
  }
  const strategy = {};
  for (const key of strategyKeys) {
    if (!Object.hasOwn(input, key) || !Number.isFinite(Number(input[key])) || Number(input[key]) < 0 || Number(input[key]) > 1) {
      return { error: `Invalid ${key}.` };
    }
    strategy[key] = Number(input[key]);
  }
  const sum = Object.values(strategy).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1.0) > 1e-4) {
    return { error: "Strategy weights must total exactly 1.00." };
  }
  return { strategy };
}

async function readStore() {
  const settingsPath = getSettingsPath();
  let rawData = {};
  try {
    const content = await fs.readFile(settingsPath, "utf8");
    rawData = JSON.parse(content);
  } catch {
    rawData = {};
  }

  if (!rawData || typeof rawData !== "object") {
    rawData = {};
  }

  let migrated = false;

  // Initialize __global__ if missing
  if (!rawData["__global__"]) {
    const defaultHash = computeStrategyHash(DEFAULT_STRATEGY);
    rawData["__global__"] = {
      weights: { ...DEFAULT_STRATEGY },
      version: 1,
      updatedAt: new Date().toISOString(),
      hash: defaultHash,
    };
    migrated = true;
  }

  // Iterate and migrate existing keys
  for (const key of Object.keys(rawData)) {
    const entry = rawData[key];
    if (entry && typeof entry === "object") {
      // Check if it's in the old structure (directly has weight keys instead of nested weights object)
      if (!Object.hasOwn(entry, "weights")) {
        let weights = { ...entry };

        // Proportional migration for 5 weights (lacking revenueWeight)
        if (!Object.hasOwn(weights, "revenueWeight")) {
          const salesWeight = (weights.salesWeight ?? 0.4) * 0.8;
          const inventoryWeight = (weights.inventoryWeight ?? 0.25) * 0.8;
          const newnessWeight = (weights.newnessWeight ?? 0.2) * 0.8;
          const momentumWeight = (weights.momentumWeight ?? 0.1) * 0.8;
          const rotationWeight = (weights.rotationWeight ?? 0.05) * 0.8;
          const revenueWeight = 0.20;

          weights = {
            salesWeight,
            revenueWeight,
            inventoryWeight,
            newnessWeight,
            momentumWeight,
            rotationWeight,
          };
        }

        const hash = computeStrategyHash(weights);
        const newEntry = {
          weights,
          version: 1,
          updatedAt: new Date().toISOString(),
          hash,
        };

        if (key !== "__global__") {
          newEntry.override = true;
        }

        rawData[key] = newEntry;
        migrated = true;
      }
    }
  }

  if (migrated) {
    try {
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(rawData, null, 2)}\n`, "utf8");
      await fs.rename(temporaryPath, settingsPath);
    } catch (e) {
      console.error("Failed to save migrated settings file:", e);
    }
  }

  return rawData;
}

export async function resolveEffectiveStrategy(collectionId) {
  const store = await readStore();

  if (collectionId && store[collectionId] && store[collectionId].override) {
    const entry = store[collectionId];
    return {
      source: "collection",
      weights: {
        salesWeight: Number(entry.weights.salesWeight),
        revenueWeight: Number(entry.weights.revenueWeight),
        inventoryWeight: Number(entry.weights.inventoryWeight),
        newnessWeight: Number(entry.weights.newnessWeight),
        momentumWeight: Number(entry.weights.momentumWeight),
        rotationWeight: Number(entry.weights.rotationWeight),
      },
      version: entry.version || 1,
      hash: entry.hash || computeStrategyHash(entry.weights),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  if (store["__global__"]) {
    const entry = store["__global__"];
    return {
      source: "global",
      weights: {
        salesWeight: Number(entry.weights.salesWeight),
        revenueWeight: Number(entry.weights.revenueWeight),
        inventoryWeight: Number(entry.weights.inventoryWeight),
        newnessWeight: Number(entry.weights.newnessWeight),
        momentumWeight: Number(entry.weights.momentumWeight),
        rotationWeight: Number(entry.weights.rotationWeight),
      },
      version: entry.version || 1,
      hash: entry.hash || computeStrategyHash(entry.weights),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  const defaultHash = computeStrategyHash(DEFAULT_STRATEGY);
  return {
    source: "global",
    weights: { ...DEFAULT_STRATEGY },
    version: 1,
    hash: defaultHash,
    updatedAt: new Date().toISOString(),
  };
}

export async function getStrategySettings(collectionId) {
  const resolved = await resolveEffectiveStrategy(collectionId);
  return {
    collectionId,
    ...resolved.weights,
    version: resolved.version,
    hash: resolved.hash,
    source: resolved.source,
  };
}

export async function saveStrategySettings(collectionId, input) {
  const validated = validateStrategy(input);
  if (validated.error) throw new Error(validated.error);

  const store = await readStore();
  const weights = validated.strategy;
  const hash = computeStrategyHash(weights);

  const isGlobalSave = collectionId === "__global__" || input.override === false;
  const targetKey = isGlobalSave ? "__global__" : collectionId;

  const existing = store[targetKey] || {};
  const currentVersion = existing.version || 0;

  const newEntry = {
    weights,
    version: currentVersion + 1,
    updatedAt: new Date().toISOString(),
    hash,
  };

  if (isGlobalSave) {
    store["__global__"] = newEntry;
    if (collectionId && collectionId !== "__global__") {
      delete store[collectionId];
    }
  } else {
    newEntry.override = true;
    store[collectionId] = newEntry;
  }

  const settingsPath = getSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, settingsPath);

  // Read back to verify
  const storeCheck = await readStore();
  const persistedEntry = storeCheck[targetKey];
  if (!persistedEntry) {
    throw new Error("Failed to persist strategy settings: entry not found after write.");
  }
  for (const key of strategyKeys) {
    if (Math.abs(Number(persistedEntry.weights[key]) - Number(weights[key])) > 1e-4) {
      throw new Error(`Failed to persist strategy settings: weights mismatch for ${key}.`);
    }
  }

  return {
    collectionId,
    ...weights,
    version: newEntry.version,
    hash: newEntry.hash,
    source: isGlobalSave ? "global" : "collection",
  };
}
