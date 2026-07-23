import { DEFAULT_STRATEGY, validateStrategy } from "./strategySettings.js";

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

function ageInDays(product, currentDate) {
  const sourceDate = product.publishedAt || product.createdAt;
  if (!sourceDate) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (new Date(currentDate) - new Date(sourceDate)) / 86400000);
}

function newnessScore(ageDays) {
  if (!Number.isFinite(ageDays)) {
    return 0;
  }

  if (ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 14) {
    return 0.7;
  }

  if (ageDays <= 30) {
    return clamp(0.7 - ((ageDays - 14) / 16) * 0.45);
  }

  return 0;
}

function inventoryHealth(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const activeVariants = variants.filter((variant) => variant.active !== false);
  const availableVariants = activeVariants.filter(
    (variant) => variant.availableForSale && Number(variant.inventoryQuantity || 0) > 0,
  );
  const sizeVariants = activeVariants.filter((variant) =>
    (variant.selectedOptions || []).some(isSizeOption),
  );
  const availableSizeVariants = availableVariants.filter((variant) =>
    (variant.selectedOptions || []).some(isSizeOption),
  );
  const sellableUnits = availableVariants.reduce(
    (sum, variant) => sum + Math.max(0, Number(variant.inventoryQuantity || 0)),
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

function netSales(product) {
  const sales = product.sales || {};
  const units7 = Math.max(0, Number(sales.units7 || 0));
  const units30 = Math.max(0, Number(sales.units30 || 0));
  const units90 = Math.max(0, Number(sales.units90 || 0));
  const previous23 = Math.max(0, Number(sales.previous23 || 0));
  const lifetime = Math.max(0, Number(product.soldQuantity || units90 || units30 || units7 || 0));
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

function normalizeStrategy(settings = {}) {
  const validated = validateStrategy({
    salesWeight: settings.salesWeight ?? DEFAULT_STRATEGY.salesWeight,
    inventoryWeight: settings.inventoryWeight ?? DEFAULT_STRATEGY.inventoryWeight,
    newnessWeight: settings.newnessWeight ?? DEFAULT_STRATEGY.newnessWeight,
    momentumWeight: settings.momentumWeight ?? DEFAULT_STRATEGY.momentumWeight,
    rotationWeight: settings.rotationWeight ?? DEFAULT_STRATEGY.rotationWeight,
  });

  return validated.strategy || DEFAULT_STRATEGY;
}

function compareScored(left, right) {
  return (
    right.finalScore - left.finalScore ||
    right.salesScore - left.salesScore ||
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
      if (previous.length < 2) {
        return true;
      }

      const sameVendor = previous.every((entry) => entry.vendor && entry.vendor === candidate.vendor);
      const sameType = previous.every(
        (entry) => entry.productType && entry.productType === candidate.productType,
      );

      return !sameVendor && !sameType;
    });

    result.push(...queue.splice(candidateIndex >= 0 ? candidateIndex : 0, 1));
  }

  return result;
}

function distributeSlots(products, slotCount, spacingBase) {
  if (!slotCount || !products.length) {
    return [];
  }

  return products.slice(0, slotCount).map((product, index) => ({
    product,
    index: Math.min(index * spacingBase + index, spacingBase * slotCount),
  }));
}

export function generateOrder(products = [], settings = {}) {
  const strategy = normalizeStrategy(settings);
  const firstPageLimit = Math.max(1, Math.min(Number(settings.firstPageLimit || 40), products.length || 1));
  const currentDate = settings.currentDate || "2026-07-22T00:00:00.000Z";

  const enriched = products.map((product) => {
    const inventory = inventoryHealth(product);
    const sales = netSales(product);
    const ageDays = ageInDays(product, currentDate);
    const previousRank = Number(product.collectionPosition || 999999);

    return {
      ...product,
      inventory,
      salesMetrics: sales,
      ageDays,
      newnessBase: newnessScore(ageDays),
      previousRank,
      explorationScore: deterministicSeed(settings.collectionId || "collection", product.id, currentDate),
      sellableInventory: inventory.sellableUnits,
      sizeAvailability: inventory.sizeCoverage,
      fullySoldOut: inventory.fullySoldOut,
      partiallyAvailable: inventory.partiallyAvailable,
    };
  });

  const maxSales = Math.max(...enriched.map((product) => product.salesMetrics.grossStrength), 0);
  const maxInventory = Math.max(...enriched.map((product) => product.inventory.sellableUnits), 0);

  const scored = enriched.map((product) => {
    const salesScore = logScale(product.salesMetrics.grossStrength, maxSales);
    const inventoryDepth = logScale(product.inventory.sellableUnits, maxInventory);
    const inventoryScore = clamp(inventoryDepth * 0.65 + product.inventory.sizeCoverage * 0.35);
    const newnessComponent =
      product.fullySoldOut && product.newnessBase > 0 ? product.newnessBase * 0.15 : product.newnessBase;
    const stabilityScore = clamp(1 - Math.min(product.previousRank - 1, firstPageLimit) / Math.max(firstPageLimit, 1)) * 0.03;
    const finalScore = clamp(
      salesScore * strategy.salesWeight +
        inventoryScore * strategy.inventoryWeight +
        newnessComponent * strategy.newnessWeight +
        product.salesMetrics.momentum * strategy.momentumWeight +
        product.explorationScore * strategy.rotationWeight +
        stabilityScore,
    );

    return {
      ...product,
      salesScore,
      inventoryScore,
      newnessScore: newnessComponent,
      momentumScore: product.salesMetrics.momentum,
      rotationScore: product.explorationScore,
      stabilityScore,
      finalScore,
      soldOutSocialProof: false,
    };
  });

  const pinned = scored
    .filter((product) => Number(product.allottedPosition) > 0)
    .sort((left, right) => left.allottedPosition - right.allottedPosition);

  const candidates = scored
    .filter((product) => !Number(product.allottedPosition) && product.includeInRotation !== false)
    .sort(compareScored);

  const available = candidates.filter((product) => !product.fullySoldOut);
  const soldOut = candidates.filter((product) => product.fullySoldOut);
  const eligibleNew = available.filter((product) => product.ageDays <= 30);
  const evergreen = available.filter((product) => product.ageDays > 30);

  const reservedPinned = pinned.filter((product) => product.allottedPosition <= firstPageLimit);
  const remainingSlots = Math.max(0, firstPageLimit - reservedPinned.length);
  const maxNewSlots = Math.min(
    eligibleNew.length,
    Math.max(1, Math.min(4, Math.ceil(firstPageLimit * 0.15))),
  );
  const newSlots = distributeSlots(eligibleNew.sort(compareScored), maxNewSlots, Math.max(2, Math.floor(firstPageLimit / Math.max(maxNewSlots, 1))));
  const usedNewIds = new Set(newSlots.map(({ product }) => product.id));

  const earlyPool = diversify(
    [
      ...evergreen,
      ...available.filter((product) => !usedNewIds.has(product.id) && product.ageDays <= 30),
    ].sort(compareScored),
  );

  const firstPage = [...reservedPinned];
  for (const product of earlyPool) {
    if (firstPage.length >= firstPageLimit) {
      break;
    }
    firstPage.push(product);
  }

  for (const slot of newSlots) {
    if (firstPage.some((entry) => entry.id === slot.product.id)) {
      continue;
    }
    const index = Math.max(reservedPinned.length, Math.min(slot.index, firstPage.length));
    firstPage.splice(index, 0, slot.product);
    if (firstPage.length > firstPageLimit) {
      firstPage.pop();
    }
  }

  const soldOutVisibleLimit = products.length >= 60 ? 2 : products.length >= 20 ? 1 : 0;
  const soldOutVisible = soldOut
    .filter((product) => product.salesScore >= 0.35)
    .slice(0, soldOutVisibleLimit)
    .map((product) => ({ ...product, soldOutSocialProof: true }));

  for (const product of soldOutVisible) {
    if (firstPage.some((entry) => entry.id === product.id)) {
      continue;
    }
    const insertAt = Math.max(
      reservedPinned.length,
      Math.min(firstPage.length, Math.max(4, Math.floor(firstPageLimit * 0.35))),
    );
    firstPage.splice(insertAt, 0, product);
    if (firstPage.length > firstPageLimit) {
      firstPage.pop();
    }
  }

  const usedIds = new Set(firstPage.map((product) => product.id));
  const remainder = [
    ...pinned.filter((product) => product.allottedPosition > firstPageLimit),
    ...available.filter((product) => !usedIds.has(product.id)),
    ...soldOut.filter((product) => !usedIds.has(product.id)),
  ];

  return [...firstPage, ...remainder].map((product, index) => ({
    ...product,
    finalPosition: index + 1,
    primaryReason: Number(product.allottedPosition) > 0
      ? "Pinned"
      : product.soldOutSocialProof
        ? "Visible sold-out urgency"
        : product.newnessScore >= 0.45 && product.ageDays <= 30
          ? "New product discovery"
          : product.salesScore >= product.momentumScore
            ? "Net sales strength"
            : product.momentumScore > 0.45
              ? "Recent momentum"
              : product.inventoryScore >= 0.45
                ? "Inventory and size coverage"
                : "Deterministic exploration",
  }));
}
