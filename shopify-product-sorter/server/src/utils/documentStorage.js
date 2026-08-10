import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

const STORAGE_DIR = path.resolve(process.env.EXPENSE_STORAGE_DIR || "./uploads/expenses");

/**
 * Save an uploaded bill document to the safe uploads directory.
 * Prevents traversal and collision.
 *
 * @param {object} file - Express multer file object
 * @returns {Promise<{ storageKey: string, originalName: string }>}
 */
export async function storeBillDocument(file) {
  if (!file) throw new Error("No file provided");
  
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  // Sanitize filename to prevent directory traversal
  const rawName = file.originalname || "invoice.pdf";
  const cleanExt = path.extname(rawName).toLowerCase();
  
  // Size limit validation (10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File exceeds maximum limit of 10MB");
  }

  // Validate file types (PDF, PNG, JPG, JPEG)
  const allowedExts = [".pdf", ".png", ".jpg", ".jpeg"];
  if (!allowedExts.includes(cleanExt)) {
    throw new Error("Unsupported file format. Only PDF, PNG, and JPG/JPEG are allowed.");
  }

  // Double check MIME type safety
  const allowedMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error("Invalid MIME type.");
  }

  // Generate unique file name
  const uniqueName = `${crypto.randomUUID()}${cleanExt}`;
  const targetPath = path.join(STORAGE_DIR, uniqueName);

  // Validate the absolute path is inside the STORAGE_DIR directory
  if (!targetPath.startsWith(STORAGE_DIR)) {
    throw new Error("Traversal attempt blocked");
  }

  // Move file from temp upload path
  await fs.rename(file.path, targetPath);

  return {
    storageKey: uniqueName,
    originalName: rawName,
  };
}

/**
 * Retrieve absolute file path for a given storage key.
 *
 * @param {string} storageKey
 * @returns {string}
 */
export function getBillDocumentPath(storageKey) {
  if (!storageKey) return null;
  // Prevent traversal via path components
  const cleanKey = path.basename(storageKey);
  const targetPath = path.join(STORAGE_DIR, cleanKey);
  
  if (!targetPath.startsWith(STORAGE_DIR)) {
    throw new Error("Access denied");
  }
  
  return targetPath;
}
