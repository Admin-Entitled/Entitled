import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

export function getSkuImageAuditLogPath() {
  return env.skuImageAuditPath;
}

export function appendSkuImageAuditLog(entry) {
  const auditPath = getSkuImageAuditLogPath();
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(auditPath, `${JSON.stringify(payload)}\n`, "utf8");
}
