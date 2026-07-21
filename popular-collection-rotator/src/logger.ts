import fs from "node:fs";
import path from "node:path";
import { nowIso, timestampForFilename } from "./utils";

export type JsonRecord = Record<string, unknown>;

export class JsonlLogger {
  private readonly filePath: string;

  constructor(logDir: string) {
    const absDir = path.resolve(logDir);
    fs.mkdirSync(absDir, { recursive: true });
    this.filePath = path.join(absDir, `run-${timestampForFilename()}.jsonl`);
  }

  get path(): string {
    return this.filePath;
  }

  write(type: string, payload: JsonRecord = {}): void {
    const row = {
      type,
      timestamp: nowIso(),
      ...payload
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(row)}\n`, "utf8");
    // Keep console output concise for Render logs while preserving full JSONL on disk.
    console.log(JSON.stringify({ type, timestamp: row.timestamp }));
  }
}
