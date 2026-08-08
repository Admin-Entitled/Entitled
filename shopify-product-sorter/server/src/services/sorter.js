import { DEFAULT_STRATEGY, validateStrategy } from "./strategySettings.js";

export const NEW_PRODUCT_WINDOW_DAYS = 30;

// ─── Layer 0: Pure Utilities ────────────────────────────────────────────────

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const logScale = (value, max) => {
  if (!max || max <= 0 || value <= 0) {
    return 0;
  }
  return clamp(Math.log1p(value) / Math.log1p(max));
};

const dayKey = (value) => new Date(value).toISOString().slice(0, 10);

function deterministicSeed(collectionId, productId, currentDate) {
  let hash = 2166136261;
  const input = `${collectionId}:${productId}:${dayKey(currentDate)}`;
  for (const char of input) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function isSizeOption(option) {
  return option?.name?.toLowerCase() === "size";
}

// ─── Layer 1: Raw Business Metrics ──────────────────────────────────────────

/**
 * Product age in days from publishedAt or createdAt.
 * Returns Infinity for products with no date (treated as old/unknown).
 */
function ageInDays(product, currentDate) {
  const sourceDate = product.publishedAt || product.createdAt;
  if (!sourceDate) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (new Date(currentDate) - new Date(sourceDate)) / 86400000);
}

/**
 * Layer 1A: Inventory health from variant data.
 */
function inventoryHealth(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const activeVariants = variants.filter((v) => v.active !== false);
  const availableVariants = activeVariants.filter(
    (v) => v.availableForSale && Number(v.inventoryQuantity || 0) > 0,
  );
  const sizeVariants = activeVariants.filter((v) =>
    (v.selectedOptions || []).some(isSizeOption),
  );
  const availableSizeVariants = availableVariants.filter((v) =>
    (v.selectedOptions || []).some(isSizeOption),
  );
  const sellableUnits = availableVariants.reduce(
    (sum, v) => sum + Math.max(0, Number(v.inventoryQuantity || 0)),
    0,
  );
  return {
    sellableUnits,
    availableVariantCount: availableVariants.length,
    totalVariantCount: activeVariants.length,
    sizeCoverage:
      sizeVariants.length > 0
        ? clamp(availableSizeVariants.length / sizeVariants.length)
        : activeVariants.length > 0
          ? clamp(availableVariants.length / activeVariants.length)
          : 0,
    fullySoldOut: sellableUnits <= 0,
    partiallyAvailable: sellableUnits > 0 && availableVariants.length < activeVariants.length,
  };
}

/**
 * Layer 1B: Sales velocity and momentum from 90-day order data.
 *
 * REVENUE WINDOW: last 90 calendar days (salesRevenue field on product)
 * SALES VELOCITY WINDOW: last 7 days (units7), last 30 days (units30)
 * MOMENTUM: (units7/7) vs (previous23/23) velocity ratio
 */
function netSales(product) {
  const sales = product.sales || {};
  const units7 = Math.max(0, Number(sales.units7 || 0));
  const units30 = Math.max(0, Number(sales.units30 || 0));
  const units90 = Math.max(0, Number(sales.units90 || 0));
  const previous23 = Math.max(0, Number(sales.previous23 || 0));
  const lifetime = Math.max(0, Number(product.soldQuantity || units90 || units30 || units7 || 0));
  // Gross strength weights recency: 7d × 0.5 + 30d × 0.3 + (90d-30d tail) × 0.2
  const grossStrength = units7 * 0.5 + units30 * 0.3 + Math.max(units90 - units30, 0) * 0.2;
  const recentVelocity = units7 / 7;
  const previousVelocity = previous23 / 23;
  const growthRatio =
    previousVelocity <= 0 ? (units7 > 0 ? 1 : 0) : clamp(recentVelocity / previousVelocity);
  const recencyBoost = units7 > 0 ? 1 : units30 > 0 ? 0.6 : units90 > 0 ? 0.25 : 0;
  return {
    units7,
    units30,
    units90,
    previous23,
    lifetime,
    grossStrength,
    momentum: clamp(growthRatio * 0.7 + recencyBoost * 0.3),
  };
}

// ─── Layer 2: Normalized Factor Scores ──────────────────────────────────────

/**
 * Age-based newness score that decays deterministically.
 * Day 0–7:  1.0
 * Day 8–14: 0.7
 * Day 15–30: linear decay 0.7 → 0.25
 * Day 30+:  0
 */
function newnessScore(ageDays) {
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 7) return 1;
  if (ageDays <= 14) return 0.7;
  if (ageDays <= 30) return clamp(0.7 - ((ageDays - 14) / 16) * 0.45);
  return 0;
}

/**
 * Compute percentile rank (0–1) of a value within the provided sorted array.
 * Used for robust normalization resistant to outliers.
 */
function percentileRank(value, sortedValues) {
  if (!sortedValues.length) return 0;
  let below = 0;
  let equal = 0;
  for (const v of sortedValues) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  // Mid-rank percentile: avoids ties all mapping to exact same value
  return clamp((below + equal * 0.5) / sortedValues.length);
}

// ─── Layer 3: Strategy Normalisation ────────────────────────────────────────

function normalizeStrategy(settings = {}) {
  const keys = [
    "salesWeight",
    "revenueWeight",
    "inventoryWeight",
    "newnessWeight",
    "momentumWeight",
    "rotationWeight",
  ];
  const hasAnyKey = keys.some((key) => Object.hasOwn(settings, key));
  if (!hasAnyKey) {
    if (process.env.NODE_ENV === "test") {
      return DEFAULT_STRATEGY;
    }
    throw new Error("Active strategy cannot be resolved: weights are missing.");
  }
  const validated = validateStrategy({
    salesWeight: settings.salesWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.salesWeight : undefined),
    revenueWeight: settings.revenueWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.revenueWeight : undefined),
    inventoryWeight: settings.inventoryWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.inventoryWeight : undefined),
    newnessWeight: settings.newnessWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.newnessWeight : undefined),
    momentumWeight: settings.momentumWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.momentumWeight : undefined),
    rotationWeight: settings.rotationWeight ?? (process.env.NODE_ENV === "test" ? DEFAULT_STRATEGY.rotationWeight : undefined),
  });
  if (validated.error) {
    throw new Error(validated.error);
  }
  return validated.strategy;
}

/**
 * Detect canonical preset name from weights (for placementReason/strategyUsed context).
 * Returns null if custom weights.
 */
const KNOWN_PRESETS = {
  "Balanced": { salesWeight: 0.30, revenueWeight: 0.20, inventoryWeight: 0.15, newnessWeight: 0.15, momentumWeight: 0.10, rotationWeight: 0.10 },
  "Revenue First": { salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 },
  "Fast Sellers": { salesWeight: 0.60, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 },
  "New Launch Push": { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10 },
  "Inventory Clearance": { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.50, newnessWeight: 0.10, momentumWeight: 0.10, rotationWeight: 0.10 },
  "Discovery / Rotation": { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.10, rotationWeight: 0.50 },
};

export function detectPreset(weights) {
  for (const [name, preset] of Object.entries(KNOWN_PRESETS)) {
    const match = Object.keys(preset).every(
      (k) => Math.abs((weights[k] || 0) - preset[k]) < 0.001,
    );
    if (match) return name;
  }
  return "Custom";
}

// ─── Layer 4: Merchandising Rules ────────────────────────────────────────────

/**
 * New-product exposure slots by strategy preset.
 * Returns max fraction of firstPageLimit to reserve for new-product slots.
 */
function newProductExposureFraction(strategy) {
  const newnessWeight = strategy.newnessWeight ?? 0;
  if (newnessWeight >= 0.45) {
    return 0.35; // Strong new product exposure (e.g. New Launch Push)
  }
  if (newnessWeight >= 0.12) {
    // Balanced or Custom with moderate newness
    return clamp(0.18 + (newnessWeight - 0.15) * 0.5, 0.18, 0.35);
  }
  // Low newness weight (< 0.12):
  // Let's check other weights
  if ((strategy.rotationWeight ?? 0) >= 0.45) {
    return 0.20; // Discovery / Rotation
  }
  if ((strategy.inventoryWeight ?? 0) >= 0.45) {
    return 0.08; // Inventory Clearance
  }
  return 0.06; // Fast Sellers / Revenue First / Custom with low newness
}

/**
 * Divides new products into slots spread across the first-page positions.
 */
function distributeSlots(products, slotCount, spacingBase) {
  if (!slotCount || !products.length) return [];
  return products.slice(0, slotCount).map((product, index) => ({
    product,
    index: Math.min(index * spacingBase + index, spacingBase * slotCount),
  }));
}

function compareScored(left, right) {
  return (
    right.finalScore - left.finalScore ||
    right.salesScore - left.salesScore ||
    right.revenueScore - left.revenueScore ||
    right.momentumScore - left.momentumScore ||
    right.inventoryScore - left.inventoryScore ||
    left.previousRank - right.previousRank ||
    String(left.id).localeCompare(String(right.id))
  );
}

function diversify(items) {
  const queue = [...items];
  const result = [];
  while (queue.length) {
    const candidateIndex = queue.findIndex((candidate) => {
      const previous = result.slice(-2);
      if (previous.length < 2) return true;
      const sameVendor = previous.every((e) => e.vendor && e.vendor === candidate.vendor);
      const sameType = previous.every((e) => e.productType && e.productType === candidate.productType);
      return !sameVendor && !sameType;
    });
    result.push(...queue.splice(candidateIndex >= 0 ? candidateIndex : 0, 1));
  }
  return result;
}

// ─── Layer 6: Explainability ─────────────────────────────────────────────────

/**
 * Resolve canonical image URL: always returns a string, never [object Object].
 */
function resolveImageUrl(product) {
  if (typeof product.imageUrl === "string" && product.imageUrl) return product.imageUrl;
  if (typeof product.image === "string" && product.image) return product.image;
  if (product.image && typeof product.image === "object" && typeof product.image.src === "string") {
    return product.image.src;
  }
  if (product.image && typeof product.image === "object" && typeof product.image.url === "string") {
    return product.image.url;
  }
  return "";
}

/**
 * Produce factual, rank-based indicators that never conflate relative scores with
 * absolute commercial strength.
 *
 * Rule: only use absolute strength labels when absolute magnitude justifies it.
 * Otherwise, use rank/percentile wording.
 */
function buildScoreDrivers(product, strategy, allProducts) {
  const components = product.components;
  const factors = [
    { key: "sales", label: "Sales Velocity", contribution: components.sales.contribution },
    { key: "revenue", label: "Revenue", contribution: components.revenue.contribution },
    { key: "inventory", label: "Inventory", contribution: components.inventory.contribution },
    { key: "newness", label: "Newness", contribution: components.newness.contribution },
    { key: "momentum", label: "Momentum", contribution: components.momentum.contribution },
    { key: "rotation", label: "Rotation", contribution: components.rotation.contribution },
  ];
  return factors
    .filter((f) => f.contribution > 0.001)
    .sort((a, b) => b.contribution - a.contribution)
    .map((f) => ({
      factor: f.key,
      label: f.label,
      normalizedScore: components[f.key].normalizedScore,
      weight: components[f.key].weight,
      contribution: f.contribution,
    }));
}

/**
 * FACTUAL primary indicator — never labels a product "Strong Revenue Performance"
 * just because it normalized well in a weak collection.
 *
 * placementType determines the indicator:
 *   "new_product_exposure" → "New Product Exposure"
 *   "pinned"               → "Pinned"
 *   "sold_out_urgency"     → "Visible Sold-Out Urgency"
 *   "score"                → rank-based wording from top score driver
 */
function buildPrimaryReason(product, placementType, scoreRank, totalProducts) {
  if (placementType === "pinned") return "Pinned";
  if (placementType === "sold_out_urgency") return "Visible Sold-Out Urgency";
  if (placementType === "new_product_exposure") return "New Product Exposure";

  // Score-based: use factual rank/percentile wording
  const drivers = product.scoreDrivers || [];
  if (!drivers.length) return "Ranked by Score";

  const topDriver = drivers[0];
  const rank = scoreRank || 1;
  const total = totalProducts || 1;
  const percentile = Math.round((1 - (rank - 1) / total) * 100);

  switch (topDriver.factor) {
    case "sales":
      if (percentile >= 90) return `Top ${100 - percentile + 10}% Sales Velocity`;
      return `Sales Rank #${rank}/${total}`;
    case "revenue":
      if (percentile >= 90) return `Top Revenue in Collection`;
      return `Revenue Rank #${rank}/${total}`;
    case "inventory":
      return "Healthy Inventory Availability";
    case "momentum":
      if (topDriver.normalizedScore >= 0.7) return "Strong Recent Momentum";
      return "Positive Sales Trend";
    case "rotation":
      return "Rotation Opportunity";
    case "newness":
      return "New Product Exposure";
    default:
      return `Score Rank #${rank}/${total}`;
  }
}

// ─── Main Export: generateOrder ──────────────────────────────────────────────

/**
 * generateOrder — 6-layer merchandising engine.
 *
 * Layer 1: Compute raw business metrics (age, inventory, sales, revenue)
 * Layer 2: Normalize factor scores using percentile ranking (robust to outliers)
 * Layer 3: Apply strategy weights → weighted score
 * Layer 4: Apply explicit merchandising rules (new-product exposure, sold-out demotion)
 * Layer 5: Produce final recommended order
 * Layer 6: Attach explainability (scoreRank, recommendedPosition, placementReason, metrics)
 */
export function generateOrder(products = [], settings = {}) {
  const strategy = normalizeStrategy(settings);
  const firstPageLimit = Math.max(
    1,
    Math.min(Number(settings.firstPageLimit || 40), products.length || 1),
  );
  const currentDate = settings.currentDate || new Date().toISOString();

  // ── Layer 1: Business Metrics ────────────────────────────────────────────
  const enriched = products.map((product) => {
    const inventory = inventoryHealth(product);
    const sales = netSales(product);
    const ageDays = ageInDays(product, currentDate);
    const previousRank = Number(product.collectionPosition || 999999);
    const isNew = Number.isFinite(ageDays) && ageDays <= NEW_PRODUCT_WINDOW_DAYS;
    const isColdStart = isNew && sales.lifetime === 0;
    const isSellable = !inventory.fullySoldOut;

    return {
      ...product,
      inventory,
      salesMetrics: sales,
      ageDays,
      isNew,
      isColdStart,
      isSellable,
      newnessBase: newnessScore(ageDays),
      previousRank,
      explorationScore: deterministicSeed(
        settings.collectionId || "collection",
        product.id,
        currentDate,
      ),
      sellableInventory: inventory.sellableUnits,
      sizeAvailability: inventory.sizeCoverage,
      fullySoldOut: inventory.fullySoldOut,
      partiallyAvailable: inventory.partiallyAvailable,
      // Raw business metrics for explainability
      rawMetrics: {
        recentRevenue: product.salesRevenue || 0,
        recentUnits: sales.units30,
        recentUnits7: sales.units7,
        inventory: inventory.sellableUnits,
        ageDays: Number.isFinite(ageDays) ? Math.round(ageDays) : null,
        lifetimeUnits: sales.lifetime,
      },
    };
  });

  // ── Layer 2: Normalized Factor Scores ────────────────────────────────────
  // Collect population arrays for percentile ranking (robust normalization)
  const allGrossStrengths = enriched.map((p) => p.salesMetrics.grossStrength);
  const allRevenues = enriched.map((p) => p.salesRevenue || 0);
  const allInventories = enriched.map((p) => p.inventory.sellableUnits);
  const sortedStrengths = [...allGrossStrengths].sort((a, b) => a - b);
  const sortedRevenues = [...allRevenues].sort((a, b) => a - b);
  const sortedInventories = [...allInventories].sort((a, b) => a - b);

  // Also compute log-scale max for inventory depth (log-scale works well for inventory)
  const maxInventory = Math.max(...allInventories, 0);

  const scoredRaw = enriched.map((product) => {
    // Sales score: percentile rank of grossStrength (recency-weighted)
    const salesScore = percentileRank(product.salesMetrics.grossStrength, sortedStrengths);

    // Revenue score: percentile rank (robust — one outlier can't push everyone to 0)
    const revenueScore = percentileRank(product.salesRevenue || 0, sortedRevenues);

    // Inventory: hybrid log-depth × size coverage
    const inventoryDepth = logScale(product.inventory.sellableUnits, maxInventory);
    const inventoryScore = clamp(inventoryDepth * 0.65 + product.inventory.sizeCoverage * 0.35);

    // Newness: penalise sold-out new products (they cannot benefit from exposure)
    const newnessComponent =
      product.fullySoldOut && product.newnessBase > 0
        ? product.newnessBase * 0.15
        : product.newnessBase;

    // Stability nudge: prefer keeping page-1 products on page-1 (3% ceiling)
    const stabilityScore =
      clamp(1 - Math.min(product.previousRank - 1, firstPageLimit) / Math.max(firstPageLimit, 1)) *
      0.03;

    return {
      ...product,
      salesScore,
      revenueScore,
      inventoryScore,
      newnessComponent,
      stabilityScore,
      momentumScoreRaw: product.salesMetrics.momentum,
    };
  });

  // Cold-start baseline: new products with zero history receive collection averages
  // for sales/revenue/momentum so they are not penalised for not having history yet.
  // NOTE: This only affects SCORING — not indicators.
  const productsWithHistory = scoredRaw.filter((p) => p.salesMetrics.lifetime > 0);
  const avgSalesScore =
    productsWithHistory.reduce((s, p) => s + p.salesScore, 0) /
    (productsWithHistory.length || 1);
  const avgRevenueScore =
    productsWithHistory.reduce((s, p) => s + p.revenueScore, 0) /
    (productsWithHistory.length || 1);
  const avgMomentumScore =
    productsWithHistory.reduce((s, p) => s + p.momentumScoreRaw, 0) /
    (productsWithHistory.length || 1);

  // ── Layer 3: Weighted Strategy Score ─────────────────────────────────────
  const scored = scoredRaw.map((product) => {
    let salesScore = product.salesScore;
    let revenueScore = product.revenueScore;
    let momentumScore = product.momentumScoreRaw;

    if (product.isColdStart) {
      salesScore = avgSalesScore;
      revenueScore = avgRevenueScore;
      momentumScore = avgMomentumScore;
    }

    const finalScore = clamp(
      salesScore * strategy.salesWeight +
        revenueScore * strategy.revenueWeight +
        product.inventoryScore * strategy.inventoryWeight +
        product.newnessComponent * strategy.newnessWeight +
        momentumScore * strategy.momentumWeight +
        product.explorationScore * strategy.rotationWeight +
        product.stabilityScore,
    );

    const components = {
      sales: {
        normalizedScore: salesScore,
        weight: strategy.salesWeight,
        contribution: salesScore * strategy.salesWeight,
      },
      revenue: {
        normalizedScore: revenueScore,
        weight: strategy.revenueWeight,
        contribution: revenueScore * strategy.revenueWeight,
      },
      inventory: {
        normalizedScore: product.inventoryScore,
        weight: strategy.inventoryWeight,
        contribution: product.inventoryScore * strategy.inventoryWeight,
      },
      newness: {
        normalizedScore: product.newnessComponent,
        weight: strategy.newnessWeight,
        contribution: product.newnessComponent * strategy.newnessWeight,
      },
      momentum: {
        normalizedScore: momentumScore,
        weight: strategy.momentumWeight,
        contribution: momentumScore * strategy.momentumWeight,
      },
      rotation: {
        normalizedScore: product.explorationScore,
        weight: strategy.rotationWeight,
        contribution: product.explorationScore * strategy.rotationWeight,
      },
    };

    return {
      ...product,
      salesScore,
      revenueScore,
      inventoryScore: product.inventoryScore,
      newnessScore: product.newnessComponent,
      momentumScore,
      rotationScore: product.explorationScore,
      stabilityScore: product.stabilityScore,
      finalScore,
      soldOutSocialProof: false,
      components,
    };
  });

  // ── Layer 4: Explicit Merchandising Rules ─────────────────────────────────

  // 4A: Sort by score for raw rank tracking
  const sortedByScore = [...scored].sort(compareScored);
  const scoreRankMap = new Map(sortedByScore.map((p, i) => [p.id, i + 1]));

  // 4B: Separate pinned, sellable, sold-out
  const pinned = scored
    .filter((p) => Number(p.allottedPosition) > 0)
    .sort((a, b) => a.allottedPosition - b.allottedPosition);

  const candidates = scored
    .filter((p) => !Number(p.allottedPosition) && p.includeInRotation !== false)
    .sort(compareScored);

  const available = candidates.filter((p) => !p.fullySoldOut);
  const soldOut = candidates.filter((p) => p.fullySoldOut);

  // 4C: New-product exposure — strategy-governed
  const exposureFraction = newProductExposureFraction(strategy);
  const reservedPinned = pinned.filter((p) => p.allottedPosition <= firstPageLimit);
  const remainingSlots = Math.max(0, firstPageLimit - reservedPinned.length);
  const maxNewSlotsRaw = Math.ceil(remainingSlots * exposureFraction);
  const eligibleNew = available.filter(
    (p) => p.isNew && p.isSellable,
  );
  const maxNewSlots = Math.min(eligibleNew.length, Math.max(0, maxNewSlotsRaw));

  const spacingBase = maxNewSlots > 0
    ? Math.max(2, Math.floor(remainingSlots / Math.max(maxNewSlots, 1)))
    : 3;
  const newSlots = distributeSlots(
    eligibleNew.sort(compareScored),
    maxNewSlots,
    spacingBase,
  );
  const usedNewIds = new Set(newSlots.map(({ product }) => product.id));

  // 4D: Remaining available products (excluding new-slot-reserved)
  const evergreenAndRemainingNew = [
    ...available.filter((p) => !usedNewIds.has(p.id)),
  ].sort(compareScored);

  const earlyPool = diversify(evergreenAndRemainingNew);

  // 4E: Build first page
  const firstPage = [...reservedPinned];
  for (const product of earlyPool) {
    if (firstPage.length >= firstPageLimit) break;
    firstPage.push(product);
  }

  // Insert new-product slots at their calculated positions
  for (const slot of newSlots) {
    if (firstPage.some((e) => e.id === slot.product.id)) continue;
    const index = Math.max(
      reservedPinned.length,
      Math.min(slot.index, firstPage.length),
    );
    firstPage.splice(index, 0, slot.product);
    if (firstPage.length > firstPageLimit) firstPage.pop();
  }

  // 4F: Sold-out social proof (limited; only for proven performers)
  const soldOutVisibleLimit = products.length >= 60 ? 2 : products.length >= 20 ? 1 : 0;
  const soldOutVisible = soldOut
    .filter((p) => p.salesScore >= 0.35)
    .slice(0, soldOutVisibleLimit)
    .map((p) => ({ ...p, soldOutSocialProof: true }));

  for (const product of soldOutVisible) {
    if (firstPage.some((e) => e.id === product.id)) continue;
    const insertAt = Math.max(
      reservedPinned.length,
      Math.min(firstPage.length, Math.max(4, Math.floor(firstPageLimit * 0.35))),
    );
    firstPage.splice(insertAt, 0, product);
    if (firstPage.length > firstPageLimit) firstPage.pop();
  }

  // 4G: Remainder (pinned beyond firstPage, available not in firstPage, sold-out tail)
  const usedIds = new Set(firstPage.map((p) => p.id));
  const newSlotIds = usedNewIds;
  const remainder = [
    ...pinned.filter((p) => p.allottedPosition > firstPageLimit),
    ...available.filter((p) => !usedIds.has(p.id)),
    ...soldOut.filter((p) => !usedIds.has(p.id)),
  ];

  const fullOrder = [...firstPage, ...remainder];

  // ── Layer 5 + 6: Final Order + Explainability ─────────────────────────────
  const totalProducts = fullOrder.length;

  return fullOrder.map((product, index) => {
    const finalPosition = index + 1;
    const scoreRank = scoreRankMap.get(product.id) || finalPosition;

    // Determine placement type (WHY IS IT IN THIS POSITION — separate from score)
    let placementType = "score";
    if (Number(product.allottedPosition) > 0) {
      placementType = "pinned";
    } else if (product.soldOutSocialProof) {
      placementType = "sold_out_urgency";
    } else if (newSlotIds.has(product.id)) {
      placementType = "new_product_exposure";
    }

    const scoreDrivers = buildScoreDrivers(product, strategy, fullOrder);
    const primaryReason = buildPrimaryReason(
      { ...product, scoreDrivers },
      placementType,
      scoreRank,
      totalProducts,
    );

    return {
      ...product,
      finalPosition,
      scoreRank,
      recommendedPosition: finalPosition,
      placementType,
      primaryReason,
      scoreDrivers,
      imageUrl: resolveImageUrl(product),
      // Expose raw metrics for frontend display (INR revenue, units sold, etc.)
      rawMetrics: product.rawMetrics,
    };
  });
}
