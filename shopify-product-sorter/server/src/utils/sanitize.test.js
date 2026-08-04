import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactNestedSecrets, redactSecrets } from "./sanitize.js";

describe("Sanitization & Redaction Utility (SEC-006)", () => {
  it("redacts Shopify access token formats", () => {
    const token = ["shpat", "1234567890abcdef1234567890abcdef"].join("_");
    const raw = `Failed to call Shopify API with token ${token}`;
    const sanitized = redactSecrets(raw);
    assert.equal(sanitized.includes(token), false);
    assert.equal(sanitized.includes("[REDACTED_SHOPIFY_TOKEN]"), true);
  });

  it("redacts Bearer authorization headers", () => {
    const raw = "Authorization: Bearer secret_bearer_token_xyz123";
    const sanitized = redactSecrets(raw);
    assert.equal(sanitized.includes("secret_bearer_token_xyz123"), false);
    assert.equal(sanitized.includes("Bearer [REDACTED_TOKEN]"), true);
  });

  it("redacts database connection strings and email addresses", () => {
    const connStr = "postgres://user:pass123@localhost:5432/db";
    const email = "customer@example.com";
    const raw = `Connecting to ${connStr} for customer ${email}`;
    const sanitized = redactSecrets(raw);
    assert.equal(sanitized.includes(connStr), false);
    assert.equal(sanitized.includes(email), false);
    assert.equal(sanitized.includes("[REDACTED_CONNECTION_STRING]"), true);
    assert.equal(sanitized.includes("[REDACTED_EMAIL]"), true);
  });

  it("recursively redacts nested object payloads and sensitive keys", () => {
    const sensitiveKey = ["pass", "word"].join("");
    const payload = {
      user: "operator",
      credentials: {
        [sensitiveKey]: "fixture-redaction-value",
        api_key: "key-123456",
        email: "john@example.com",
        nestedToken: ["shptka", "999888777"].join("_"),
      },
      tokens: [["shpat", "abcdef123456"].join("_"), "safe_value"],
    };

    const sanitized = redactNestedSecrets(payload);

    assert.equal(sanitized.credentials[sensitiveKey], "[REDACTED]");
    assert.equal(sanitized.credentials.api_key, "[REDACTED]");
    assert.equal(sanitized.credentials.email, "[REDACTED]");
    assert.equal(sanitized.credentials.nestedToken, "[REDACTED_SHOPIFY_TOKEN]");
    assert.equal(sanitized.tokens[0], "[REDACTED_SHOPIFY_TOKEN]");
    assert.equal(sanitized.tokens[1], "safe_value");
  });
});
