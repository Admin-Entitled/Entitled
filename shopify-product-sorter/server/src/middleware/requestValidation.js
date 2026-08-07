import { AppError } from "./errorBoundary.js";

export function validateRequest(schema) {
  return (req, res, next) => {
    const issues = [];

    if (schema.params) {
      const paramIssues = validateObject(req.params, schema.params, "params");
      issues.push(...paramIssues);
    }

    if (schema.query) {
      const queryIssues = validateObject(req.query, schema.query, "query");
      issues.push(...queryIssues);
    }

    if (schema.body) {
      const bodyIssues = validateObject(req.body, schema.body, "body");
      issues.push(...bodyIssues);
    }

    if (issues.length > 0) {
      throw new AppError("VALIDATION_ERROR", "Request validation failed", {
        statusCode: 400,
        details: issues,
      });
    }

    next();
  };
}

function validateObject(data, rules, location) {
  const issues = [];
  const target = data || {};

  // Check unexpected fields if strict is enabled
  if (rules._strict) {
    const allowedKeys = new Set(Object.keys(rules).filter(k => !k.startsWith("_")));
    for (const key of Object.keys(target)) {
      if (!allowedKeys.has(key)) {
        issues.push({
          path: `${location}.${key}`,
          code: "UNEXPECTED_FIELD",
          message: `Unexpected field: '${key}'`,
        });
      }
    }
  }

  for (const [key, rule] of Object.entries(rules)) {
    if (key.startsWith("_")) continue;

    const value = target[key];
    const present = value !== undefined && value !== null && value !== "";

    if (rule.required && !present) {
      issues.push({
        path: `${location}.${key}`,
        code: "REQUIRED_FIELD_MISSING",
        message: `Field '${key}' is required`,
      });
      continue;
    }

    if (present) {
      if (rule.type === "string" && typeof value !== "string") {
        issues.push({
          path: `${location}.${key}`,
          code: "INVALID_TYPE",
          message: `Field '${key}' must be a string`,
        });
      } else if (rule.type === "array" && !Array.isArray(value)) {
        issues.push({
          path: `${location}.${key}`,
          code: "INVALID_TYPE",
          message: `Field '${key}' must be an array`,
        });
      } else if (rule.type === "boolean" && typeof value !== "boolean" && value !== "true" && value !== "false") {
        issues.push({
          path: `${location}.${key}`,
          code: "INVALID_TYPE",
          message: `Field '${key}' must be a boolean`,
        });
      } else if (rule.type === "enum" && rule.values && !rule.values.includes(value)) {
        issues.push({
          path: `${location}.${key}`,
          code: "INVALID_VALUE",
          message: `Field '${key}' must be one of: ${rule.values.join(", ")}`,
        });
      }
    }
  }

  return issues;
}
