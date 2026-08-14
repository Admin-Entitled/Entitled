import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorBoundary.js";
import {
  metaGet,
  metaGetAllPagesDetailed,
  META_ERROR_CODES,
} from "./metaAdsClient.js";
import { normalizeInsights, parseMetaDateRange } from "./metaAdsService.js";

const REPORT_PAGE_LIMIT = 500;
const REPORT_TIMEOUT_NAME = "MetaReport";

// Keep this registry explicit. Meta evolves fields and account permissions;
// rejected groups are recorded in manifest.json instead of being hidden.
export const META_REPORT_FIELD_REGISTRY = Object.freeze({
  account: [
    "id", "account_id", "name", "account_status", "currency", "timezone_name",
    "timezone_offset_hours_utc", "business", "business_name", "spend_cap", "amount_spent",
    "balance", "min_campaign_group_spend_cap", "tax_id", "funding_source_details",
    "created_time", "disable_reason",
  ],
  campaigns: [
    "id", "account_id", "name", "status", "effective_status", "configured_status",
    "objective", "buying_type", "bid_strategy", "budget_rebalance_flag", "daily_budget",
    "lifetime_budget", "budget_remaining", "start_time", "stop_time", "created_time",
    "updated_time", "special_ad_categories", "special_ad_category_country", "issues_info",
    "promoted_object", "recommendations", "source_campaign_id", "smart_promotion_type",
  ],
  adsets: [
    "id", "account_id", "campaign_id", "name", "status", "effective_status", "configured_status",
    "optimization_goal", "billing_event", "bid_amount", "bid_strategy", "bid_constraints",
    "daily_budget", "lifetime_budget", "budget_remaining", "start_time", "end_time",
    "created_time", "updated_time", "targeting", "promoted_object", "attribution_spec",
    "destination_type", "is_dynamic_creative", "frequency_control_specs", "learning_stage_info",
    "pacing_type", "rf_prediction_id", "source_adset_id",
  ],
  ads: [
    "id", "account_id", "campaign_id", "adset_id", "name", "status", "effective_status",
    "configured_status", "created_time", "updated_time", "creative", "tracking_specs",
    "conversion_specs", "ad_review_feedback", "issues_info", "recommendations",
    "source_ad_id", "bid_amount",
  ],
  creatives: [
    "id", "account_id", "name", "title", "body", "object_story_spec", "asset_feed_spec",
    "image_hash", "image_url", "thumbnail_url", "video_id", "object_url", "call_to_action_type",
    "url_tags", "link_url",
  ],
});

export const META_REPORT_INSIGHT_FIELDS = Object.freeze([
  "account_id", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "date_start", "date_stop", "spend", "impressions", "reach", "frequency", "clicks",
  "unique_clicks", "inline_link_clicks", "outbound_clicks", "ctr", "unique_ctr",
  "inline_link_click_ctr", "cpc", "cpm", "cpp", "cost_per_unique_click", "video_30_sec_watched_actions",
  "video_avg_time_watched_actions", "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p95_watched_actions", "video_p100_watched_actions",
  "video_play_actions", "video_thruplay_watched_actions", "actions", "action_values",
  "cost_per_action_type", "conversions", "conversion_values", "cost_per_conversion",
  "purchase_roas", "website_purchase_roas", "mobile_app_purchase_roas", "social_spend",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
]);

const BREAKDOWN_PACKS = [
  { name: "demographics_age_gender", breakdowns: "age,gender" },
  { name: "geography_country", breakdowns: "country" },
  { name: "geography_region", breakdowns: "region" },
  { name: "placement_platform_position", breakdowns: "publisher_platform,platform_position" },
  { name: "placement_device", breakdowns: "device_platform" },
  { name: "hourly_advertiser_timezone", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" },
];

function reportError(message, details = {}) {
  return new AppError(META_ERROR_CODES.API_ERROR, message, { statusCode: 502, details });
}

function scrubString(value) {
  return String(value)
    .replace(/access_token=[^&\s]+/gi, "access_token=REDACTED")
    .replace(/appsecret_proof=[^&\s]+/gi, "appsecret_proof=REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
}

export function sanitizeMetaPayload(value, key = "") {
  if (value === null || value === undefined) return value;
  if (/access[_-]?token|appsecret|authorization|cookie/i.test(key)) return "REDACTED";
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeMetaPayload(entry, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeMetaPayload(entryValue, entryKey),
    ]));
  }
  return value;
}

function json(value) {
  return JSON.stringify(sanitizeMetaPayload(value), null, 2);
}

function csvSafe(value) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object" ? JSON.stringify(sanitizeMetaPayload(value)) : scrubString(value);
  // Protect Excel/Sheets users from provider-controlled formula strings while
  // preserving the exact value in the raw JSON export.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rowsToCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const columns = [...new Set(list.flatMap((row) => Object.keys(row || {})))];
  if (columns.length === 0) return "\ufeff\n";
  return `\ufeff${columns.map(csvSafe).join(",")}\n${list.map((row) => columns.map((column) => csvSafe(row?.[column])).join(",")).join("\n")}\n`;
}

function mergeKey(row, idField = "id") {
  const id = row?.[idField] || row?.id || row?.account_id || "row";
  return [id, row?.date_start || "", row?.date_stop || "", row?.breakdowns ? JSON.stringify(row.breakdowns) : ""].join("|");
}

async function fetchFieldGroups({ pathName, params, groups, operationName, idField = "id", manifestNode, errors }) {
  const merged = new Map();
  const requested = new Set();
  const returned = new Set();
  for (const group of groups) {
    group.forEach((field) => requested.add(field));
    try {
      const result = await metaGetAllPagesDetailed(pathName, {
        ...params,
        fields: group.join(","),
        limit: 100,
      }, { operationName: `${REPORT_TIMEOUT_NAME}_${operationName}`, pageLimit: REPORT_PAGE_LIMIT });
      for (const row of result.data) {
        const key = mergeKey(row, idField);
        merged.set(key, { ...(merged.get(key) || {}), ...sanitizeMetaPayload(row) });
        Object.keys(row || {}).forEach((field) => returned.add(field));
      }
      manifestNode.pages = Math.max(manifestNode.pages || 0, result.pages);
      manifestNode.paginationComplete = manifestNode.paginationComplete !== false && result.paginationComplete;
      if (result.truncated) manifestNode.truncated = true;
    } catch (error) {
      manifestNode.failedGroups = [...(manifestNode.failedGroups || []), group];
      errors.push({ operation: operationName, fields: group, code: error.code || META_ERROR_CODES.API_ERROR, message: error.message });
    }
  }
  manifestNode.requestedFields = [...requested];
  manifestNode.returnedFields = [...returned];
  manifestNode.unsupportedFields = [...requested].filter((field) => !returned.has(field));
  return [...merged.values()];
}

function objectFieldGroups(fields) {
  const identity = fields.slice(0, 8);
  const remainder = fields.slice(8);
  const groups = [identity];
  for (let index = 0; index < remainder.length; index += 8) groups.push([...identity, ...remainder.slice(index, index + 8)]);
  return groups.filter((group) => group.length > 0);
}

async function fetchEntity({ name, endpoint, fields, errors }) {
  const node = { requested: true, returned: 0, pages: 0, paginationComplete: true, truncated: false };
  const rows = await fetchFieldGroups({
    pathName: endpoint,
    params: {},
    groups: objectFieldGroups(fields),
    operationName: `FetchReport${name}`,
    manifestNode: node,
    errors,
  });
  node.returned = rows.length;
  return { rows, node };
}

async function fetchAccount(errors) {
  const node = { requested: true, returned: 0, pages: 1, paginationComplete: true, truncated: false };
  const groups = objectFieldGroups(META_REPORT_FIELD_REGISTRY.account);
  const merged = {};
  const returned = new Set();
  for (const group of groups) {
    try {
      const response = await metaGet(`act_${env.metaAdAccountId}`, { fields: group.join(",") }, { operationName: `${REPORT_TIMEOUT_NAME}_FetchAccount` });
      Object.assign(merged, sanitizeMetaPayload(response));
      Object.keys(response || {}).forEach((field) => returned.add(field));
    } catch (error) {
      errors.push({ operation: "account", fields: group, code: error.code || META_ERROR_CODES.API_ERROR, message: error.message });
    }
  }
  node.returned = Object.keys(merged).length > 0 ? 1 : 0;
  node.requestedFields = META_REPORT_FIELD_REGISTRY.account;
  node.returnedFields = [...returned];
  node.unsupportedFields = META_REPORT_FIELD_REGISTRY.account.filter((field) => !returned.has(field));
  return { account: merged, node };
}

function insightGroups() {
  const fields = [...META_REPORT_INSIGHT_FIELDS];
  const groups = [];
  for (let index = 0; index < fields.length; index += 12) groups.push(fields.slice(index, index + 12));
  return groups;
}

async function fetchInsights({ level, idField, range, daily, errors }) {
  const node = { requested: true, returned: 0, pages: 0, paginationComplete: true, truncated: false, level, daily };
  const params = {
    level,
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    ...(daily ? { time_increment: 1 } : {}),
  };
  const rows = await fetchFieldGroups({
    pathName: `act_${env.metaAdAccountId}/insights`,
    params,
    groups: insightGroups().map((group) => [...new Set([idField, ...group])]),
    operationName: `FetchReport${level}${daily ? "Daily" : "Aggregate"}Insights`,
    idField,
    manifestNode: node,
    errors,
  });
  node.returned = rows.length;
  return { rows, node };
}

async function fetchBreakdowns(range, errors) {
  const datasets = [];
  for (const pack of BREAKDOWN_PACKS) {
    const node = { name: pack.name, breakdowns: pack.breakdowns, requested: true, returned: 0, pages: 0, paginationComplete: true, status: "COMPLETE" };
    try {
      const result = await metaGetAllPagesDetailed(`act_${env.metaAdAccountId}/insights`, {
        level: "account",
        time_range: JSON.stringify({ since: range.since, until: range.until }),
        breakdowns: pack.breakdowns,
        fields: META_REPORT_INSIGHT_FIELDS.slice(0, 18).join(","),
        limit: 100,
      }, { operationName: `${REPORT_TIMEOUT_NAME}_Breakdown_${pack.name}`, pageLimit: REPORT_PAGE_LIMIT });
      const rows = result.data.map(sanitizeMetaPayload);
      node.returned = rows.length;
      node.pages = result.pages;
      node.paginationComplete = result.paginationComplete;
      node.truncated = result.truncated;
      datasets.push({ ...pack, rows });
    } catch (error) {
      node.status = "UNSUPPORTED_OR_FAILED";
      node.reason = error.message;
      errors.push({ operation: `breakdown:${pack.name}`, code: error.code || META_ERROR_CODES.API_ERROR, message: error.message });
      datasets.push({ ...pack, rows: [], node });
    }
    datasets[datasets.length - 1].node = node;
  }
  return datasets;
}

async function fetchCreatives(ads, errors) {
  const ids = [...new Set(ads.map((ad) => ad?.creative?.id || ad?.creative_id).filter(Boolean).map(String))];
  const rows = [];
  for (const id of ids) {
    try {
      const response = await metaGet(id, { fields: META_REPORT_FIELD_REGISTRY.creatives.join(",") }, { operationName: `${REPORT_TIMEOUT_NAME}_FetchCreative` });
      rows.push(sanitizeMetaPayload(response));
    } catch (error) {
      errors.push({ operation: "creatives", id, code: error.code || META_ERROR_CODES.API_ERROR, message: error.message });
    }
  }
  return { rows, node: { requested: true, returned: rows.length, pages: 1, paginationComplete: true, sourceIds: ids.length } };
}

function explode(rows, field, level) {
  return rows.flatMap((row) => (Array.isArray(row?.[field]) ? row[field].map((entry) => ({
    entity_level: level,
    entity_id: row.id || row[`${level}_id`] || row.account_id || "",
    campaign_id: row.campaign_id || "",
    adset_id: row.adset_id || "",
    ad_id: row.ad_id || "",
    date_start: row.date_start || "",
    date_stop: row.date_stop || "",
    action_type: entry.action_type || "",
    value: entry.value ?? "",
    ...Object.fromEntries(Object.entries(entry).filter(([key]) => !["action_type", "value"].includes(key))),
  })) : []));
}

function derivedRows(rows, level) {
  return rows.map((row) => {
    const normalized = normalizeInsights(row);
    return {
      entity_level: level,
      entity_id: row.id || row[`${level}_id`] || row.account_id || "",
      date_start: row.date_start || "",
      date_stop: row.date_stop || "",
      spend: normalized.spend,
      purchases: normalized.purchases,
      purchase_value: normalized.purchaseValue,
      cost_per_purchase: normalized.costPerPurchase,
      purchase_roas: normalized.purchaseRoas,
      source: "APPLICATION_DERIVED",
    };
  });
}

function addFile(archive, filePath, content) {
  archive.append(typeof content === "string" ? Buffer.from(content) : content, { name: filePath });
}

async function writeArchive(files, outputPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const [name, content] of files) addFile(archive, name, content);
    archive.finalize().catch(reject);
  });
}

function levelFiles(level, aggregate, daily) {
  return [
    [`insights/${level}_insights.json`, json({ records: aggregate })],
    [`insights/${level}_insights.csv`, rowsToCsv(aggregate)],
    [`daily/${level}_daily.json`, json({ records: daily })],
    [`daily/${level}_daily.csv`, rowsToCsv(daily)],
  ];
}

export async function createMetaAdsReport({ since, until, preset = "custom" } = {}) {
  const range = parseMetaDateRange({ since, until });
  const errors = [];
  const generatedAt = new Date().toISOString();
  const accountResult = await fetchAccount(errors);
  const account = accountResult.account;
  const accountId = String(account.id || env.metaAdAccountId);
  const manifest = {
    exportGeneratedAt: generatedAt,
    metaApiVersion: env.metaApiVersion,
    adAccountId: `act_…${accountId.slice(-4)}`,
    accountName: account.name || null,
    accountCurrency: account.currency || null,
    accountTimezone: account.timezone_name || null,
    scope: "FULL_AD_ACCOUNT",
    permissions: {
      detected: false,
      note: "The read-only Marketing API responses do not expose the connected token's full scope list; provider permission failures are recorded per request.",
    },
    selectedDateRange: { ...range, preset },
    status: "COMPLETE_FOR_ACCESSIBLE_DATA",
    attribution: { provider: "Meta Marketing API", dashboardRange: range },
    entities: {},
    insights: { levels: {}, fieldsRequested: META_REPORT_INSIGHT_FIELDS, warnings: [] },
    breakdowns: { attempted: [], completed: [], failed: [] },
    warnings: [],
    providerErrors: errors,
    unsupportedFields: [],
    permissionRestrictedFields: [],
    requestSpecs: {
      account: { endpoint: `act_${env.metaAdAccountId}`, fields: META_REPORT_FIELD_REGISTRY.account },
      campaigns: { endpoint: `act_${env.metaAdAccountId}/campaigns`, fields: META_REPORT_FIELD_REGISTRY.campaigns },
      adsets: { endpoint: `act_${env.metaAdAccountId}/adsets`, fields: META_REPORT_FIELD_REGISTRY.adsets },
      ads: { endpoint: `act_${env.metaAdAccountId}/ads`, fields: META_REPORT_FIELD_REGISTRY.ads },
      creatives: { fields: META_REPORT_FIELD_REGISTRY.creatives, idsDerivedFromAds: true },
      insights: { levels: ["account", "campaign", "adset", "ad"], fields: META_REPORT_INSIGHT_FIELDS, since: range.since, until: range.until },
      breakdowns: BREAKDOWN_PACKS,
    },
    security: { sanitized: true, accessTokenLeaks: 0, formulaInjectionSafe: true },
  };

  const campaignsResult = await fetchEntity({ name: "Campaigns", endpoint: `act_${env.metaAdAccountId}/campaigns`, fields: META_REPORT_FIELD_REGISTRY.campaigns, errors });
  const adsetsResult = await fetchEntity({ name: "AdSets", endpoint: `act_${env.metaAdAccountId}/adsets`, fields: META_REPORT_FIELD_REGISTRY.adsets, errors });
  const adsResult = await fetchEntity({ name: "Ads", endpoint: `act_${env.metaAdAccountId}/ads`, fields: META_REPORT_FIELD_REGISTRY.ads, errors });
  const creativesResult = await fetchCreatives(adsResult.rows, errors);
  manifest.entities = {
    account: accountResult.node,
    campaigns: campaignsResult.node,
    adsets: adsetsResult.node,
    ads: adsResult.node,
    creatives: creativesResult.node,
  };

  const levels = [
    { key: "account", fileKey: "account", level: "account", idField: "account_id" },
    { key: "campaigns", fileKey: "campaign", level: "campaign", idField: "campaign_id" },
    { key: "adsets", fileKey: "adset", level: "adset", idField: "adset_id" },
    { key: "ads", fileKey: "ad", level: "ad", idField: "ad_id" },
  ];
  const insightData = {};
  for (const item of levels) {
    const aggregate = await fetchInsights({ ...item, range, daily: false, errors });
    const daily = await fetchInsights({ ...item, range, daily: true, errors });
    insightData[item.key] = { aggregate: aggregate.rows, daily: daily.rows };
    manifest.insights.levels[item.key] = { aggregate: aggregate.node, daily: daily.node };
  }

  const breakdowns = await fetchBreakdowns(range, errors);
  manifest.breakdowns.attempted = breakdowns.map(({ name, breakdowns: requested }) => ({ name, requested }));
  manifest.breakdowns.completed = breakdowns.filter((entry) => entry.node.status === "COMPLETE").map(({ name }) => name);
  manifest.breakdowns.failed = breakdowns.filter((entry) => entry.node.status !== "COMPLETE").map((entry) => ({ name: entry.name, reason: entry.node.reason }));
  manifest.unsupportedFields = [...new Set([
    ...Object.values(manifest.entities).flatMap((node) => node.unsupportedFields || []),
    ...Object.values(manifest.insights.levels).flatMap((level) => [...(level.aggregate?.unsupportedFields || []), ...(level.daily?.unsupportedFields || [])]),
  ])];
  manifest.permissionRestrictedFields = [...new Set(
    errors.filter((error) => error.code === META_ERROR_CODES.PERMISSION_DENIED).flatMap((error) => error.fields || []),
  )];
  manifest.providerErrors = errors;
  const accountAggregate = insightData.account.aggregate[0] || {};
  const accountDerived = normalizeInsights(accountAggregate);
  const dailyAdditiveSpend = insightData.account.daily.reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const dailyAdditiveImpressions = insightData.account.daily.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  manifest.reconciliation = {
    dashboardComparable: {
      spend: accountDerived.spend,
      purchases: accountDerived.purchases,
      purchaseValue: accountDerived.purchaseValue,
      purchaseRoas: accountDerived.purchaseRoas,
      costPerPurchase: accountDerived.costPerPurchase,
    },
    additiveDailyChecks: {
      spend: { aggregate: accountDerived.spend, dailySum: dailyAdditiveSpend, difference: accountDerived.spend - dailyAdditiveSpend },
      impressions: { aggregate: Number(accountAggregate.impressions || 0), dailySum: dailyAdditiveImpressions, difference: Number(accountAggregate.impressions || 0) - dailyAdditiveImpressions },
    },
    nonAdditiveMetrics: ["reach", "frequency"],
  };
  if (errors.length || manifest.breakdowns.failed.length || Object.values(manifest.entities).some((node) => node.truncated)) {
    manifest.status = "PARTIAL_COMPLETE";
  }

  const files = [];
  files.push(["manifest.json", json(manifest)]);
  files.push(["README.txt", [
    "Meta Ads Full Report",
    "",
    `Account: ${account.name || accountId}`,
    `Currency: ${account.currency || "—"}`,
    `Timezone: ${account.timezone_name || "—"}`,
    `Date range: ${range.since} through ${range.until}`,
    `Generated: ${generatedAt}`,
    "",
    "Raw JSON preserves sanitized provider structures. CSV files flatten scalar fields and serialize nested data as JSON.",
    "Actions/action_values contain one row per returned Meta action type.",
    "APPLICATION_DERIVED files are dashboard-normalized metrics and are not replacements for raw Meta fields.",
    "See manifest.json for pagination, unsupported fields, permission limitations, warnings, and provider errors.",
  ].join("\n")]);
  files.push(["account/account.json", json(account)]);
  files.push(["account/account.csv", rowsToCsv([account])]);
  for (const [name, result] of [["campaigns", campaignsResult], ["adsets", adsetsResult], ["ads", adsResult], ["creatives", creativesResult]]) {
    files.push([`${name}/${name}.json`, json({ records: result.rows })]);
    files.push([`${name}/${name}.csv`, rowsToCsv(result.rows)]);
  }
  for (const item of levels) {
    const data = insightData[item.key];
    files.push(...levelFiles(item.fileKey, data.aggregate, data.daily));
    files.push([`derived/${item.fileKey}_derived.csv`, rowsToCsv(derivedRows(data.aggregate, item.level))]);
    files.push([`actions/${item.fileKey}_actions.csv`, rowsToCsv(explode(data.aggregate, "actions", item.level))]);
    files.push([`actions/${item.fileKey}_action_values.csv`, rowsToCsv(explode(data.aggregate, "action_values", item.level))]);
    files.push([`actions/${item.fileKey}_cost_per_action_type.csv`, rowsToCsv(explode(data.aggregate, "cost_per_action_type", item.level))]);
  }
  for (const breakdown of breakdowns) {
    files.push([`breakdowns/${breakdown.name}.json`, json({ breakdowns: breakdown.breakdowns, records: breakdown.rows })]);
    files.push([`breakdowns/${breakdown.name}.csv`, rowsToCsv(breakdown.rows)]);
  }
  files.push(["raw/provider_requests_manifest.json", json({
    apiVersion: env.metaApiVersion,
    sanitized: true,
    pagination: manifest.entities,
    insights: manifest.insights.levels,
    breakdowns: manifest.breakdowns,
  })]);

  const tokenNeedles = [env.metaAccessToken, "access_token=", "Authorization: Bearer"]
    .filter((value) => value && value.length > 4);
  const combined = files.map(([, content]) => String(content)).join("\n");
  if (tokenNeedles.some((needle) => combined.includes(needle))) {
    throw reportError("Meta report secret-sanitization check failed.", { operation: "MetaReportSecretScan" });
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "meta-ads-report-"));
  const filename = `meta-ads-report_${range.since}_to_${range.until}.zip`;
  const filePath = path.join(tempDir, filename);
  await writeArchive(files, filePath);
  return { filePath, filename, manifest, tempDir };
}

export async function cleanupMetaAdsReport(report) {
  if (!report?.tempDir) return;
  await fsp.rm(report.tempDir, { recursive: true, force: true });
}
