import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { env, resetEnvOverrides } from "../config/env.js";
import {
  META_REPORT_FIELD_REGISTRY,
  META_REPORT_INSIGHT_FIELDS,
  createMetaAdsReport,
  cleanupMetaAdsReport,
  rowsToCsv,
  sanitizeMetaPayload,
} from "./metaAdsReportService.js";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test("Meta report utilities preserve nested data and neutralize CSV formulas", () => {
  const payload = sanitizeMetaPayload({
    targeting: { age_min: 18 },
    actions: [{ action_type: "purchase", value: "2" }],
    access_token: "secret-value",
  });
  assert.deepEqual(payload.targeting, { age_min: 18 });
  assert.deepEqual(payload.actions, [{ action_type: "purchase", value: "2" }]);
  assert.equal(payload.access_token, "REDACTED");
  const csv = rowsToCsv([{ name: "=SUM(A1:A2)", targeting: { age_min: 18 } }]);
  assert.match(csv, /'=SUM\(A1:A2\)/);
  assert.match(csv, /age_min/);
});

test("Meta report registry covers entities, broad insights, and action arrays", async () => {
  assert.ok(META_REPORT_FIELD_REGISTRY.campaigns.includes("issues_info"));
  assert.ok(META_REPORT_FIELD_REGISTRY.adsets.includes("targeting"));
  assert.ok(META_REPORT_FIELD_REGISTRY.ads.includes("tracking_specs"));
  assert.ok(META_REPORT_FIELD_REGISTRY.creatives.includes("object_story_spec"));
  assert.ok(META_REPORT_INSIGHT_FIELDS.includes("actions"));
  assert.ok(META_REPORT_INSIGHT_FIELDS.includes("action_values"));
  assert.ok(META_REPORT_INSIGHT_FIELDS.includes("purchase_roas"));
});

test("Meta report records pagination/field limitations and preserves every action type", async () => {
  const previousFetch = global.fetch;
  const previousToken = env.metaAccessToken;
  const previousAccount = env.metaAdAccountId;
  env.metaAccessToken = "test-meta-report-token";
  env.metaAdAccountId = "1234567890";
  global.fetch = async (input) => {
    const url = String(input);
    const fields = decodeURIComponent(new URL(url).searchParams.get("fields") || "");
    const path = new URL(url).pathname;
    if (path.endsWith("/act_1234567890")) {
      return response({ id: "1234567890", name: "Test Account", currency: "INR", timezone_name: "Asia/Kolkata" });
    }
    if (path.includes("/insights")) {
      return response({ data: [{
        account_id: "1234567890", campaign_id: "c1", campaign_name: "=unsafe", adset_id: "as1", ad_id: "a1",
        date_start: "2026-08-02", date_stop: "2026-08-08", spend: "10", impressions: "10", clicks: "1",
        actions: [
          { action_type: "purchase", value: "1" },
          { action_type: "add_to_cart", value: "2" },
          { action_type: "custom_event", value: "3" },
        ],
        action_values: [
          { action_type: "purchase", value: "20" },
          { action_type: "custom_event", value: "30" },
        ],
        purchase_roas: [{ action_type: "omni_purchase", value: "2" }],
      }] });
    }
    if (path.endsWith("/campaigns")) return response({ data: [{ id: "c1", name: "Campaign", status: "ACTIVE" }] });
    if (path.endsWith("/adsets")) return response({ data: [{ id: "as1", campaign_id: "c1", name: "Ad Set" }] });
    if (path.endsWith("/ads")) return response({ data: [{ id: "a1", adset_id: "as1", campaign_id: "c1", name: "Ad", creative: { id: "cr1" } }] });
    if (path.endsWith("/cr1")) return response({ id: "cr1", name: "Creative", object_story_spec: { link_data: { message: "hello" } } });
    throw new Error(`Unexpected Meta test URL for fields ${fields}: ${url}`);
  };
  let report;
  try {
    report = await createMetaAdsReport({ since: "2026-08-02", until: "2026-08-08", preset: "custom" });
    assert.equal(report.manifest.selectedDateRange.since, "2026-08-02");
    assert.equal(report.manifest.selectedDateRange.until, "2026-08-08");
    assert.equal(report.manifest.scope, "FULL_AD_ACCOUNT");
    assert.ok(report.manifest.entities.campaigns.paginationComplete);
    assert.ok(report.manifest.insights.levels.campaigns.aggregate.returned >= 1);
    const listing = execFileSync("unzip", ["-l", report.filePath], { encoding: "utf8" });
    assert.match(listing, /manifest\.json/);
    assert.match(listing, /campaigns\/campaigns\.json/);
    assert.match(listing, /actions\/campaign_actions\.csv/);
    assert.match(listing, /raw\/provider_requests_manifest\.json/);
    const manifestText = execFileSync("unzip", ["-p", report.filePath, "manifest.json"], { encoding: "utf8" });
    assert.doesNotMatch(manifestText, /test-meta-report-token/);
  } finally {
    if (report) await cleanupMetaAdsReport(report);
    global.fetch = previousFetch;
    env.metaAccessToken = previousToken;
    env.metaAdAccountId = previousAccount;
    resetEnvOverrides();
    if (report?.filePath) await assert.rejects(fs.access(report.filePath));
  }
});
