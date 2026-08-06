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
import { AppError } from "../middleware/errorBoundary.js";
import { validateRequest } from "../middleware/requestValidation.js";

const addSkuImageSchema = {
  body: {
    sku: { type: "string", required: true },
    productId: { type: "string", required: true },
    variantId: { type: "string", required: true },
  },
};

const addSkuImageUploadSchema = {
  body: {
    sku: { type: "string", required: true },
    productId: { type: "string", required: true },
    variantId: { type: "string", required: true },
  },
};

const addSkuImageUrlSchema = {
  body: {
    sku: { type: "string", required: true },
    productId: { type: "string", required: true },
    variantId: { type: "string", required: true },
    imageUrl: { type: "string", required: true },
  },
};

const deleteSkuImageSchema = {
  body: {
    productId: { type: "string", required: true },
    mediaId: { type: "string", required: true },
  },
};

const reorderSkuImageSchema = {
  body: {
    productId: { type: "string", required: true },
    orderedMediaIds: { type: "array", required: true },
  },
};

const bulkAddSkuImageSchema = {
  body: {
    items: { type: "array", required: true },
  },
};

const bulkDeletePreviewSchema = {
  body: {
    items: { type: "array", required: true },
  },
};

const bulkDeleteConfirmSchema = {
  body: {
    previewRows: { type: "array", required: true },
  },
};

const router = Router();
function Router() {
  return express.Router();
}

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

router.get("/sku-images/search", async (req, res, next) => {
  try {
    const skuInput = req.query.sku || "";
    const result = await searchSkuImageProducts({ skuInput, loadAll: false });
    res.json(result);
  } catch (error) {
    logError("Failed to search SKU image products", error, { sku: req.query.sku });
    next(error);
  }
});

router.post("/sku-images/load-all", async (req, res, next) => {
  try {
    const result = await searchSkuImageProducts({ loadAll: true });
    res.json(result);
  } catch (error) {
    logError("Failed to load all SKU image products", error);
    next(error);
  }
});

router.post("/sku-images/add", validateRequest(addSkuImageSchema), async (req, res, next) => {
  try {
    const result = await addImageToSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to add SKU image", error, req.body);
    next(error);
  }
});

router.post("/sku-images/add-upload", upload.single("image"), validateRequest(addSkuImageUploadSchema), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError("MISSING_FILE", "Image file is required", { statusCode: 400 });
    }
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
    next(error);
  }
});

router.post("/sku-images/add-url", validateRequest(addSkuImageUrlSchema), async (req, res, next) => {
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
    next(error);
  }
});

router.post("/sku-images/delete", validateRequest(deleteSkuImageSchema), async (req, res, next) => {
  try {
    const result = await deleteImageFromSkuProduct(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to delete SKU image", error, req.body);
    next(error);
  }
});

router.post("/sku-images/reorder", validateRequest(reorderSkuImageSchema), async (req, res, next) => {
  try {
    const { orderedMediaIds } = req.body;
    if (orderedMediaIds.length === 0) {
      throw new AppError("VALIDATION_ERROR", "orderedMediaIds must be a non-empty array", { statusCode: 400 });
    }
    const result = await reorderSkuProductImages(req.body);
    res.json(result);
  } catch (error) {
    logError("Failed to reorder SKU images", error, req.body);
    next(error);
  }
});

router.post("/sku-images/bulk-add", validateRequest(bulkAddSkuImageSchema), async (req, res, next) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      throw new AppError("VALIDATION_ERROR", "No SKU/product items supplied for bulk add", { statusCode: 400 });
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
    next(error);
  }
});

router.post("/sku-images/bulk-add-upload", upload.single("image"), async (req, res, next) => {
  try {
    let items;
    try {
      items = normalizeSkuItems(JSON.parse(req.body.items || "[]"));
    } catch (e) {
      throw new AppError("VALIDATION_ERROR", "Items parameter is not valid JSON", { statusCode: 400 });
    }
    if (!items.length) {
      throw new AppError("VALIDATION_ERROR", "No SKU/product items supplied for bulk add upload", { statusCode: 400 });
    }
    if (!req.file) {
      throw new AppError("MISSING_FILE", "Image file is required", { statusCode: 400 });
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
    next(error);
  }
});

router.post("/sku-images/bulk-delete-preview", validateRequest(bulkDeletePreviewSchema), async (req, res, next) => {
  try {
    const items = normalizeSkuItems(req.body.items);
    if (!items.length) {
      throw new AppError("VALIDATION_ERROR", "No SKU/product items supplied for bulk delete preview", { statusCode: 400 });
    }
    const result = await previewBulkDelete({
      items,
      positionMode: req.body.positionMode,
      imageNumber: req.body.imageNumber,
    });
    res.json(result);
  } catch (error) {
    logError("Failed to preview bulk delete", error);
    next(error);
  }
});

router.post("/sku-images/bulk-delete-confirm", validateRequest(bulkDeleteConfirmSchema), async (req, res, next) => {
  try {
    const previewRows = Array.isArray(req.body.previewRows) ? req.body.previewRows : [];
    if (!previewRows.length) {
      throw new AppError("VALIDATION_ERROR", "previewRows must be a non-empty array", { statusCode: 400 });
    }
    const result = await confirmBulkDelete({ previewRows });
    res.json(result);
  } catch (error) {
    logError("Failed to confirm bulk delete", error);
    next(error);
  }
});

export default router;
