import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const STORAGE_DIR = path.resolve(process.env.EXPENSE_STORAGE_DIR || "./uploads/expenses");
const TEMP_STORAGE_DIR = path.join(STORAGE_DIR, ".imports");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const FILE_SIGNATURES = {
  PDF: { mimeType: "application/pdf", extension: ".pdf" },
  PNG: { mimeType: "image/png", extension: ".png" },
  JPEG: { mimeType: "image/jpeg", extension: ".jpg" },
};

function sanitizeExtension(value) {
  return path.extname(String(value || "")).toLowerCase();
}

function ensureInsideDirectory(targetPath, baseDir) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

async function readFileHeader(filePath, bytes = 16) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function detectDocumentSignature(buffer) {
  if (!buffer?.length) {
    return null;
  }
  const header = buffer.toString("binary");
  if (header.startsWith("%PDF")) {
    return FILE_SIGNATURES.PDF;
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return FILE_SIGNATURES.PNG;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return FILE_SIGNATURES.JPEG;
  }
  return null;
}

export async function validateUploadedDocument(file) {
  if (!file) {
    throw new Error("No file provided");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds maximum limit of 10MB");
  }

  const header = await readFileHeader(file.path);
  const signature = detectDocumentSignature(header);
  if (!signature) {
    throw new Error("Unsupported file format. Only PDF, PNG, and JPG/JPEG are allowed.");
  }

  const originalExtension = sanitizeExtension(file.originalname);
  const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
  if (originalExtension && !allowedExtensions.includes(originalExtension)) {
    throw new Error("Unsupported file format. Only PDF, PNG, and JPG/JPEG are allowed.");
  }

  if (file.mimetype && ![signature.mimeType, "image/jpg"].includes(file.mimetype)) {
    throw new Error("Invalid MIME type.");
  }

  return signature;
}

export async function computeDocumentHash(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function storeBillDocument(file) {
  if (!file) throw new Error("No file provided");

  const signature = await validateUploadedDocument(file);
  await ensureDirectory(STORAGE_DIR);

  const uniqueName = `${crypto.randomUUID()}${signature.extension}`;
  const targetPath = path.join(STORAGE_DIR, uniqueName);
  if (!ensureInsideDirectory(targetPath, STORAGE_DIR)) {
    throw new Error("Traversal attempt blocked");
  }

  await fs.rename(file.path, targetPath);

  return {
    storageKey: uniqueName,
    originalName: file.originalname || `bill${signature.extension}`,
    mimeType: signature.mimeType,
    documentHash: await computeDocumentHash(targetPath),
  };
}

export async function stageBillImportDocument(file) {
  if (!file) {
    throw new Error("No file provided");
  }

  const signature = await validateUploadedDocument(file);
  await ensureDirectory(TEMP_STORAGE_DIR);

  const importId = crypto.randomUUID();
  const stagedStorageKey = `${importId}${signature.extension}`;
  const stagedPath = path.join(TEMP_STORAGE_DIR, stagedStorageKey);
  if (!ensureInsideDirectory(stagedPath, TEMP_STORAGE_DIR)) {
    throw new Error("Traversal attempt blocked");
  }

  await fs.rename(file.path, stagedPath);
  const documentHash = await computeDocumentHash(stagedPath);

  return {
    importId,
    stagedStorageKey,
    stagedPath,
    originalName: file.originalname || `bill${signature.extension}`,
    mimeType: signature.mimeType,
    extension: signature.extension,
    size: file.size,
    documentHash,
  };
}

function getImportMetadataPath(importId) {
  return path.join(TEMP_STORAGE_DIR, `${path.basename(importId)}.json`);
}

export async function persistImportMetadata(importId, payload) {
  await ensureDirectory(TEMP_STORAGE_DIR);
  const metadataPath = getImportMetadataPath(importId);
  if (!ensureInsideDirectory(metadataPath, TEMP_STORAGE_DIR)) {
    throw new Error("Traversal attempt blocked");
  }
  await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2), "utf8");
  return metadataPath;
}

export async function readImportMetadata(importId) {
  const metadataPath = getImportMetadataPath(importId);
  const raw = await fs.readFile(metadataPath, "utf8");
  return JSON.parse(raw);
}

export async function finalizeImportedBillDocument(importId) {
  const metadata = await readImportMetadata(importId);
  await ensureDirectory(STORAGE_DIR);
  const sourcePath = getTemporaryBillDocumentPath(metadata.stagedStorageKey);
  const finalStorageKey = `${crypto.randomUUID()}${metadata.extension || sanitizeExtension(metadata.originalName) || ".pdf"}`;
  const targetPath = path.join(STORAGE_DIR, finalStorageKey);
  if (!ensureInsideDirectory(targetPath, STORAGE_DIR)) {
    throw new Error("Traversal attempt blocked");
  }
  await fs.rename(sourcePath, targetPath);
  return {
    storageKey: finalStorageKey,
    originalName: metadata.originalName,
    documentHash: metadata.documentHash,
    mimeType: metadata.mimeType,
  };
}

export async function discardImportedBillDocument(importId) {
  const metadataPath = getImportMetadataPath(importId);
  let stagedStorageKey = null;
  try {
    const metadata = await readImportMetadata(importId);
    stagedStorageKey = metadata.stagedStorageKey;
  } catch {
    stagedStorageKey = null;
  }

  if (stagedStorageKey) {
    const stagedPath = getTemporaryBillDocumentPath(stagedStorageKey);
    await fs.unlink(stagedPath).catch(() => {});
  }
  await fs.unlink(metadataPath).catch(() => {});
}

export async function cleanupExpiredImportedBillDocuments(maxAgeMs = 6 * 60 * 60 * 1000) {
  await ensureDirectory(TEMP_STORAGE_DIR);
  const entries = await fs.readdir(TEMP_STORAGE_DIR, { withFileTypes: true });
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    const entryPath = path.join(TEMP_STORAGE_DIR, entry.name);
    const stat = await fs.stat(entryPath).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) {
      continue;
    }
    await fs.unlink(entryPath).catch(() => {});
  }
}

export function getBillDocumentPath(storageKey) {
  if (!storageKey) return null;
  const cleanKey = path.basename(storageKey);
  const targetPath = path.join(STORAGE_DIR, cleanKey);
  if (!ensureInsideDirectory(targetPath, STORAGE_DIR)) {
    throw new Error("Access denied");
  }
  return targetPath;
}

export function getTemporaryBillDocumentPath(stagedStorageKey) {
  if (!stagedStorageKey) {
    return null;
  }
  const cleanKey = path.basename(stagedStorageKey);
  const targetPath = path.join(TEMP_STORAGE_DIR, cleanKey);
  if (!ensureInsideDirectory(targetPath, TEMP_STORAGE_DIR)) {
    throw new Error("Access denied");
  }
  return targetPath;
}
