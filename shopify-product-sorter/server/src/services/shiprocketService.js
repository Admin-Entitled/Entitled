import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");
const localTokenCachePath = path.join(repoRoot, ".cache", "shiprocket-token.json");
const sharedEnvPath = path.resolve(repoRoot, "../../shiprocket/shiprocket-dimensions-automation/.env");
const sharedTokenCachePath = path.resolve(
  repoRoot,
  "../../shiprocket/shiprocket-dimensions-automation/.cache/shiprocket-token.json",
);

let tokenCache = {
  token: "",
  expiresAt: 0,
};

function readSharedEnv() {
  if (!fs.existsSync(sharedEnvPath)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(sharedEnvPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").trim().replace(/^"|"$/g, "");
  }
  return values;
}

const sharedEnv = readSharedEnv();

function normalizedBaseUrl() {
  const raw = env.shiprocketBaseUrl || "https://apiv2.shiprocket.in";
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}

function getShiprocketCredentials() {
  return {
    email: env.shiprocketEmail || sharedEnv.SHIPROCKET_API_EMAIL || "",
    password: env.shiprocketPassword || sharedEnv.SHIPROCKET_API_PASSWORD || "",
  };
}

function isConfigured() {
  const credentials = getShiprocketCredentials();
  return Boolean(credentials.email && credentials.password);
}

function formatDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function readTokenCacheFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (payload?.token && payload?.expiresAt) {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
}

function writeTokenCacheFile(token, expiresAt) {
  fs.mkdirSync(path.dirname(localTokenCachePath), { recursive: true });
  fs.writeFileSync(localTokenCachePath, JSON.stringify({ token, expiresAt }, null, 2));
}

function clearTokenCaches() {
  tokenCache = { token: "", expiresAt: 0 };
  for (const cachePath of [localTokenCachePath, sharedTokenCachePath]) {
    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch {}
  }
}

async function authenticateShiprocket() {
  const credentials = getShiprocketCredentials();
  const response = await fetch(`${normalizedBaseUrl()}/v1/external/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(payload.message || payload.error || "Shiprocket authentication failed");
  }

  tokenCache = {
    token: payload.token,
    // ponytail: refresh early instead of decoding every JWT shape variation.
    expiresAt: Date.now() + (9 * 24 * 60 * 60 * 1000),
  };
  writeTokenCacheFile(tokenCache.token, tokenCache.expiresAt);
  return tokenCache.token;
}

async function getShiprocketToken() {
  if (env.shiprocketToken) {
    return env.shiprocketToken;
  }

  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  for (const cachePath of [localTokenCachePath, sharedTokenCachePath]) {
    const cached = readTokenCacheFile(cachePath);
    if (cached?.token && cached.expiresAt > Date.now()) {
      tokenCache = cached;
      return tokenCache.token;
    }
  }

  if (!isConfigured()) {
    throw new Error("Shiprocket credentials or token are missing");
  }

  return authenticateShiprocket();
}

async function shiprocketRequest(pathname, searchParams, retryOn401 = true) {
  const token = await getShiprocketToken();
  const url = new URL(`${normalizedBaseUrl()}${pathname}`);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && retryOn401) {
    clearTokenCaches();
    return shiprocketRequest(pathname, searchParams, false);
  }
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Shiprocket request failed (${response.status})`);
  }

  return payload;
}

export async function fetchShiprocketOrders({ days = 30 } = {}) {
  const hasAnyTokenSource =
    Boolean(env.shiprocketToken) ||
    Boolean(readTokenCacheFile(localTokenCachePath)?.token) ||
    Boolean(readTokenCacheFile(sharedTokenCachePath)?.token);

  if (!isConfigured() && !hasAnyTokenSource) {
    return {
      configured: false,
      orders: [],
      days,
    };
  }

  const cappedDays = Math.max(1, Math.min(Number(days) || 30, 30));
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - cappedDays);

  const configuredChannelId = env.shiprocketChannelId || sharedEnv.SHIPROCKET__CHANNEL_ID || "";
  const channelId = configuredChannelId ? Number(configuredChannelId) : undefined;
  const orders = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await shiprocketRequest("/v1/external/orders", {
      page,
      per_page: 100,
      sort: "DESC",
      sort_by: "id",
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      channel_id: Number.isFinite(channelId) ? channelId : undefined,
    });

    const batch = Array.isArray(payload.data) ? payload.data : [];
    orders.push(...batch);

    totalPages = Number(payload.meta?.pagination?.total_pages || 1);
    page += 1;
  }

  return {
    configured: true,
    orders,
    days: cappedDays,
  };
}
