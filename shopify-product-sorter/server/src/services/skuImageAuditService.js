import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditPath = path.resolve(__dirname, "../../data/sku-image-actions.jsonl");

export function appendSkuImageAuditLog(entry) {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(auditPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export function getSkuImageAuditLogPath() {
  return auditPath;
}
