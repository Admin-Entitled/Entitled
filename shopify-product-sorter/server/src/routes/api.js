import express from "express";
import systemRouter from "./system.js";
import collectionsRouter from "./collections.js";
import sorterRouter from "./sorter.js";
import salesIntelligenceRouter from "./salesIntelligence.js";
import skuMediaRouter from "./skuMedia.js";

const router = express.Router();

router.use(systemRouter);
router.use(collectionsRouter);
router.use(sorterRouter);
router.use(salesIntelligenceRouter);
router.use(skuMediaRouter);

export default router;
