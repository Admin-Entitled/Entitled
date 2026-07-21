import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";
import { csvColumns } from "../services/legacyCsv.js";
import { importLegacyCsv, syncDeliveryOrders } from "../services/reconciliationService.js";
import { listOrders, resetManualResolution, setManualResolution } from "../services/deliveryRepository.js";

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), "delivery-resolution"), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, done) => done(null, file.originalname.toLowerCase().endsWith(".csv")) });
const date = /^\d{4}-\d{2}-\d{2}$/;
const range = (body) => { const { start, end } = body || {}; if (!date.test(start || "") || !date.test(end || "") || start > end) throw new Error("Choose a valid date range"); return { start, end }; };
const errorResponse = (res, error) => res.status(error.message.includes("valid") || error.message.includes("CSV") ? 400 : 502).json({ error: error.message || "Request failed", category: error.category || "application" });

router.get("/orders", (req, res) => res.json(listOrders({ filter: req.query.filter || "ALL", search: String(req.query.search || ""), page: Math.max(1, Number(req.query.page) || 1), pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 50)) })));
router.post("/sync", async (req, res) => { try { res.json({ summary: await syncDeliveryOrders(range(req.body)), data: listOrders() }); } catch (error) { errorResponse(res, error); } });
router.post("/orders/:id/manual", (req, res) => { if (!Number(req.params.id) || !["DELIVERED", "NOT_DELIVERED"].includes(req.body?.resolution)) return res.status(400).json({ error: "Choose Delivered or Not Delivered" }); setManualResolution(Number(req.params.id), req.body.resolution, String(req.body.note || "").slice(0, 1000)); res.json({ ok: true }); });
router.post("/orders/:id/reset-manual", (req, res) => { resetManualResolution(Number(req.params.id)); res.json({ ok: true }); });
router.post("/legacy-csv", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload a CSV file" });
  try { const text = await fs.readFile(req.file.path, "utf8"); if (req.body.mapping) return res.json({ result: importLegacyCsv({ text, filename: req.file.originalname, mapping: JSON.parse(req.body.mapping) }) }); try { res.json({ result: importLegacyCsv({ text, filename: req.file.originalname }) }); } catch (error) { if (/required reconciliation columns/i.test(error.message)) res.status(422).json({ error: error.message, columns: csvColumns(text), needsMapping: true }); else throw error; } } catch (error) { errorResponse(res, error); } finally { await fs.unlink(req.file.path).catch(() => {}); }
});

export default router;
