import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocalDevBypassAllowed, requireAdminAuth, requireRouteAuth } from "./authBoundary.js";

describe("Authorization Boundary Middleware (SEC-002)", () => {
  it("disables local dev bypass in production environment", () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.equal(isLocalDevBypassAllowed({}), false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("allows local dev bypass in non-production environment", () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "test";
      assert.equal(isLocalDevBypassAllowed({}), true);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("requireAdminAuth passes valid X-Admin-Secret header", () => {
    const originalSecret = process.env.ADMIN_SECRET;
    try {
      process.env.ADMIN_SECRET = "super-secret-admin-key";
      let calledNext = false;
      const req = { headers: { "x-admin-secret": "super-secret-admin-key" } };
      const res = {};
      const next = () => {
        calledNext = true;
      };

      requireAdminAuth(req, res, next);
      assert.equal(calledNext, true);
    } finally {
      process.env.ADMIN_SECRET = originalSecret;
    }
  });

  it("requireAdminAuth passes valid Bearer token authorization", () => {
    const originalSecret = process.env.ADMIN_SECRET;
    try {
      process.env.ADMIN_SECRET = "super-secret-admin-key";
      let calledNext = false;
      const req = { headers: { authorization: "Bearer super-secret-admin-key" } };
      const res = {};
      const next = () => {
        calledNext = true;
      };

      requireAdminAuth(req, res, next);
      assert.equal(calledNext, true);
    } finally {
      process.env.ADMIN_SECRET = originalSecret;
    }
  });

  it("requireAdminAuth rejects unauthorized requests in production with 403 Forbidden", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.ADMIN_SECRET;
    try {
      process.env.NODE_ENV = "production";
      process.env.ADMIN_SECRET = "super-secret-admin-key";

      let statusSet = 0;
      let jsonPayload = null;
      const req = { headers: {} };
      const res = {
        status(code) {
          statusSet = code;
          return this;
        },
        json(payload) {
          jsonPayload = payload;
          return this;
        },
      };
      let calledNext = false;
      const next = () => {
        calledNext = true;
      };

      requireAdminAuth(req, res, next);

      assert.equal(calledNext, false);
      assert.equal(statusSet, 403);
      assert.equal(jsonPayload.success, false);
      assert.equal(jsonPayload.code, "FORBIDDEN");
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.ADMIN_SECRET = originalSecret;
    }
  });

  it("requireRouteAuth permits public diagnostic routes", () => {
    let calledNext = false;
    const req = { path: "/health", headers: {} };
    const res = {};
    const next = () => {
      calledNext = true;
    };

    requireRouteAuth(req, res, next);
    assert.equal(calledNext, true);
  });

  it("requireRouteAuth passes valid X-API-Token or Bearer header", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.API_SECRET;
    try {
      process.env.NODE_ENV = "production";
      process.env.API_SECRET = "super-secret-api-key";

      let calledNext = false;
      const req = { path: "/collections", headers: { "x-api-token": "super-secret-api-key" } };
      const res = {};
      const next = () => {
        calledNext = true;
      };

      requireRouteAuth(req, res, next);
      assert.equal(calledNext, true);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.API_SECRET = originalSecret;
    }
  });

  it("requireRouteAuth rejects unauthorized requests in production with 401 Unauthorized", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.API_SECRET;
    try {
      process.env.NODE_ENV = "production";
      process.env.API_SECRET = "super-secret-api-key";

      let statusSet = 0;
      let jsonPayload = null;
      const req = { path: "/collections", headers: {} };
      const res = {
        status(code) {
          statusSet = code;
          return this;
        },
        json(payload) {
          jsonPayload = payload;
          return this;
        },
      };
      let calledNext = false;
      const next = () => {
        calledNext = true;
      };

      requireRouteAuth(req, res, next);

      assert.equal(calledNext, false);
      assert.equal(statusSet, 401);
      assert.equal(jsonPayload.success, false);
      assert.equal(jsonPayload.code, "UNAUTHORIZED");
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.API_SECRET = originalSecret;
    }
  });
});
