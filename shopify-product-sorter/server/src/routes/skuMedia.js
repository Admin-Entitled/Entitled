import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import {
  addImageToSkuProduct,
  bulkAddImageToSkuProducts,
  confirmBulkDelete,
  deleteImageFromSkuProduct,
  previewBulkDelete,
  reorderSkuProductImages,
  searchSkuImageProducts,
} from "../services/shopifyMediaService.js";
import { logError } from "../utils/logger.js";

const router = express.Router();

const upload = multer({
  dest: path.join(os.tmpdir(), "sku-image-manager-uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype?.startsWith("image/")) {
      callback(null, true);
      return;
    }
    callback(new Error("Only image uploads are allowed"));
  },
});

function normalizeSkuItems(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && item.productId && item.variantId && item.sku)
      .map((item) => ({
        sku: item.sku,
        productTitle: item.productTitle || item.title || "Untitled product",
        productId: item.productId,
        variantId: item.variantId,
      }))
    : [];
}

async function buildUploadPayload(file) {
  if (!file?.path) {
    throw new Error("Image file is required");
  }

  const buffer = await fs.readFile(file.path);
  await fs.unlink(file.path).catch(() => {});

  return {
    fileName: file.originalname,
    mimeType: file.mimetype || "image/jpeg",
    contentBase64: buffer.toString("base64"),
  };
}

router.get("/sku-images/search", async (req, res) => {
  try {
    const skuInput = req.query.sku || "";
    const result = await searchSkuImageProducts({ skuInput, loadAll: false });
    res.json(result);
  } catch (error) {
    logError("Failed to search SKU image products", error, { sku: req.query.sku });
    res.status(500).json({ error: "Failed to search SKU image products", detail: error.message });
  }
});

router.post("/sku-images/load-all", async (req, res) => {
  try {
    const result = await searchSkuImageProducts({ loadAll: true });
    res.json(result);
  } catch (error) {
    logError("Failed to load all SKU image products", error);
    res.status(500).json({ error: "Failed to load all SKU image products", detail: error.message });
  }
});

router.post("/sku-images/add", async (req, res) => {
  try {
    const result = await addImageToSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to add SKU image", error, req.body);
    res.status(500).json({ error: "Failed to add SKU image", detail: error.message });
  }
});

router.post("/sku-images/add-upload", upload.single("image"), async (req, res) => {
  try {
    const uploadPayload = await buildUploadPayload(req.file);
    const result = await addImageToSkuProduct({
      sku: req.body.sku,
      variantId: req.body.variantId,
      productId: req.body.productId,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
      upload: uploadPayload,
    });
    res.json(result);
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    logError("Failed to add uploaded SKU image", error, { body: req.body, file: req.file?.originalname });
    res.status(500).json({ error: "Failed to add uploaded SKU image", detail: error.message });
  }
});

router.post("/sku-images/add-url", async (req, res) => {
  try {
    const result = await addImageToSkuProduct({
      sku: req.body.sku,
      variantId: req.body.variantId,
      productId: req.body.productId,
      imageUrl: req.body.imageUrl,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to add URL SKU image", error, req.body);
    res.status(500).json({ error: "Failed to add URL SKU image", detail: error.message });
  }
});

router.post("/sku-images/delete", async (req, res) => {
  try {
    const result = await deleteImageFromSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to delete SKU image", error, req.body);
    res.status(500).json({ error: "Failed to delete SKU image", detail: error.message });
  }
});

router.post("/sku-images/reorder", async (req, res) => {
  try {
    const { orderedMediaIds } = req.body;
    if (!Array.isArray(orderedMediaIds) || !orderedMediaIds.length) {
      return res.status(400).json({ error: "orderedMediaIds must be a non-empty array" });
    }
    const result = await reorderSkuProductImages(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to reorder SKU images", error, req.body);
    res.status(500).json({ error: "Failed to reorder SKU images", detail: error.message });
  }
});

router.post("/sku-images/bulk-add", async (req, res) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk add" });
    }
    const result = await bulkAddImageToSkuProducts({
      items,
      imageUrl: req.body.imageUrl,
      altText: req.body.altText,
      positionMode: req.body.positionMode,
      imageNumber: req.body.imageNumber,
      upload: req.body.upload,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to bulk add SKU image", error);
    res.status(500).json({ error: "Failed to bulk add SKU image", detail: error.message });
  }
});

router.post("/sku-images/bulk-add-upload", upload.single("image"), async (req, res) => {
  try {
    const items = normalizeSkuItems(JSON.parse(req.body.items || "[]"));
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk add upload" });
    }
    const uploadPayload = await buildUploadPayload(req.file);
    const result = await bulkAddImageToSkuProducts({
      items,
      altText: req.body.altText,
      positionMode: req.body.positionMode || "last",
      imageNumber: req.body.imageNumber,
      upload: uploadPayload,
    });
    res.json(result);
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    logError("Failed to bulk add uploaded SKU image", error);
    res.status(500).json({ error: "Failed to bulk add uploaded SKU image", detail: error.message });
  }
});

router.post("/sku-images/bulk-delete-preview", async (req, res) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      return res.status(400).json({ error: "No SKU/product items supplied for bulk delete preview" });
    }
    const result = await previewBulkDelete({
      items,
      positionMode: req.body.positionMode,
      imageNumber: req.body.imageNumber,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to preview bulk delete", error);
    res.status(500).json({ error: "Failed to preview bulk delete", detail: error.message });
  }
});

router.post("/sku-images/bulk-delete-confirm", async (req, res) => {
  try {
    const previewRows = Array.isArray(req.body.previewRows) ? req.body.previewRows : [];
    if (!previewRows.length) {
      return res.status(400).json({ error: "previewRows must be a non-empty array" });
    }
    const result = await confirmBulkDelete({ previewRows });
    res.json(result);
  } catch (error) {
    logError("Failed to confirm bulk delete", error);
    res.status(500).json({ error: "Failed to confirm bulk delete", detail: error.message });
  }
});

export default router;
