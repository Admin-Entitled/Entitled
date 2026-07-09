function normalize(value, max) {
  if (!max || max <= 0) {
    return 0;
  }
  return value / max;
}

function recencyScore(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 14) return 1.0;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 60) return 0.5;
  if (ageDays <= 90) return 0.25;
  return 0.1;
}

const KNOWN_COLOR_PREFIXES = [
  "old navy",
  "navy blue",
  "light blue",
  "dark blue",
  "off white",
  "forest green",
  "olive green",
  "sky blue",
  "royal blue",
  "maroon",
  "orange",
  "beige",
  "black",
  "white",
  "brown",
  "green",
  "grey",
  "gray",
  "blue",
  "navy",
  "red",
  "pink",
  "tan",
];

function extractTypeAndColor(title) {
  const normalized = (title || "").trim();
  const lower = normalized.toLowerCase();

  for (const prefix of KNOWN_COLOR_PREFIXES) {
    if (!lower.startsWith(prefix)) {
      continue;
    }

    const color = normalized.slice(0, prefix.length).trim();
    const type = normalized.slice(prefix.length).trim();
    return {
      color: color || "Unknown",
      productType: type || normalized || "Unknown",
    };
  }

  return {
    color: normalized.split(/\s+/)[0] || "Unknown",
    productType: normalized,
  };
}

function inferProductType(product) {
  if (product.productType?.trim()) {
    return product.productType.trim();
  }
  const parts = product.title.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts[1];
  }
  if (parts.length === 2) {
    return extractTypeAndColor(parts[1]).productType;
  }
  return "Unknown";
}

function inferColor(product) {
  const parts = product.title.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts[parts.length - 1];
  }
  if (parts.length === 2) {
    return extractTypeAndColor(parts[1]).color;
  }
  return "Unknown";
}

function buildDimensionScores(products, pickKey) {
  const raw = {};

  for (const product of products) {
    const key = pickKey(product);
    if (!key) {
      continue;
    }

    if (!raw[key]) {
      raw[key] = { soldQuantity: 0, salesRevenue: 0 };
    }

    raw[key].soldQuantity += product.soldQuantity || 0;
    raw[key].salesRevenue += product.salesRevenue || 0;
  }

  const maxSold = Math.max(...Object.values(raw).map((entry) => entry.soldQuantity), 0);
  const maxRevenue = Math.max(...Object.values(raw).map((entry) => entry.salesRevenue), 0);
  const scores = {};

  for (const [key, entry] of Object.entries(raw)) {
    scores[key] = normalize(entry.soldQuantity, maxSold) * 0.5 + normalize(entry.salesRevenue, maxRevenue) * 0.5;
  }

  return scores;
}

function resolveStrategy(settings = {}) {
  return {
    brandPriorityWeight: Number(settings.brandPriorityWeight ?? 0.15),
    salesWeight: Number(settings.salesWeight ?? 0.25),
    inventoryWeight: Number(settings.inventoryWeight ?? 0.1),
    newProductBoost: Number(settings.newProductBoost ?? 0.35),
    lowSellerPenalty: Number(settings.lowSellerPenalty ?? 0.2),
    randomnessWeight: Number(settings.randomnessWeight ?? 0.15),
    brandTrendWeight: Number(settings.brandTrendWeight ?? 0.12),
    productTypeTrendWeight: Number(settings.productTypeTrendWeight ?? 0.08),
    colorTrendWeight: Number(settings.colorTrendWeight ?? 0.05),
  };
}

function buildProductScore(product, context) {
  const {
    maxima,
    brandPriorities,
    maxBrandPriority,
    trendScores,
    strategy,
  } = context;

  const salesScore = normalize(product.soldQuantity || 0, maxima.maxSoldQuantity);
  const inventoryScore = normalize(product.inventoryQuantity || 0, maxima.maxInventory);
  const freshnessScore = recencyScore(product.createdAt);
  const brandVal = brandPriorities[product.vendor] || 0;
  const brandScore = maxBrandPriority > 0 ? brandVal / maxBrandPriority : 0;
  const brandPriorityContribution = brandVal * strategy.brandPriorityWeight;
  const productType = inferProductType(product);
  const color = inferColor(product);
  const brandTrendScore = trendScores.brand[product.vendor] || 0;
  const productTypeTrendScore = trendScores.productType[productType] || 0;
  const colorTrendScore = trendScores.color[color] || 0;

  const baseScore =
    brandPriorityContribution +
    freshnessScore * strategy.newProductBoost +
    salesScore * strategy.salesWeight +
    inventoryScore * strategy.inventoryWeight +
    brandTrendScore * strategy.brandTrendWeight +
    productTypeTrendScore * strategy.productTypeTrendWeight +
    colorTrendScore * strategy.colorTrendWeight;

  const outOfStockPenalty = (product.inventoryQuantity || 0) <= 0 ? 0.1 : 1.0;
  const lowSellerFactor = (product.soldQuantity || 0) <= 2
    ? Math.max(0.25, 1 - strategy.lowSellerPenalty)
    : 1.0;

  return {
    baseScore: baseScore * outOfStockPenalty * lowSellerFactor,
    brandScore,
    brandPriorityContribution,
    newnessScore: freshnessScore,
    salesScore,
    inventoryScore,
    brandTrendScore,
    productTypeTrendScore,
    colorTrendScore,
    inferredProductType: productType,
    inferredColor: color,
  };
}

export function generateOrder(products, settings) {
  const total = products.length;
  const firstPageLimit = Math.min(settings.firstPageLimit || 40, total);
  const brandPriorities = settings.brandPriorities || {};
  const strategy = resolveStrategy(settings);

  const maxima = {
    maxSoldQuantity: Math.max(...products.map((p) => p.soldQuantity || 0), 0),
    maxInventory: Math.max(...products.map((p) => p.inventoryQuantity || 0), 0),
  };

  const maxBrandPriority = Math.max(...products.map((p) => brandPriorities[p.vendor] || 0), 1);
  const trendScores = {
    brand: buildDimensionScores(products, (product) => product.vendor || "Unknown"),
    productType: buildDimensionScores(products, (product) => inferProductType(product)),
    color: buildDimensionScores(products, (product) => inferColor(product)),
  };

  const pinnedProducts = [];
  const eligibleProducts = [];
  const hiddenProducts = [];

  for (const product of products) {
    const scores = buildProductScore(product, {
      maxima,
      brandPriorities,
      maxBrandPriority,
      trendScores,
      strategy,
    });
    const randomScore = Math.random() * strategy.randomnessWeight;
    const scoredProduct = {
      ...product,
      baseScore: scores.baseScore,
      brandScore: scores.brandScore,
      brandPriorityContribution: scores.brandPriorityContribution,
      newnessScore: scores.newnessScore,
      salesScore: scores.salesScore,
      inventoryScore: scores.inventoryScore,
      brandTrendScore: scores.brandTrendScore,
      productTypeTrendScore: scores.productTypeTrendScore,
      colorTrendScore: scores.colorTrendScore,
      productType: product.productType || scores.inferredProductType,
      inferredColor: scores.inferredColor,
      randomnessScore: randomScore,
      weightedScore: scores.baseScore + randomScore,
    };

    if (product.allottedPosition && product.allottedPosition > 0) {
      pinnedProducts.push(scoredProduct);
    } else if (product.includeInRotation) {
      eligibleProducts.push(scoredProduct);
    } else {
      hiddenProducts.push(scoredProduct);
    }
  }

  pinnedProducts.sort((a, b) => a.allottedPosition - b.allottedPosition);
  eligibleProducts.sort((a, b) => b.weightedScore - a.weightedScore);

  const positivePriorityVendors = Object.entries(brandPriorities)
    .filter(([, value]) => Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  const promotedBrandProducts = [];
  for (const [vendor] of positivePriorityVendors) {
    const bestMatch = eligibleProducts.find((product) => product.vendor === vendor);
    if (bestMatch) {
      promotedBrandProducts.push(bestMatch);
    }
  }

  const firstPage = [];
  const actualPinnedLimit = Math.min(pinnedProducts.length, firstPageLimit);
  for (let index = 0; index < actualPinnedLimit; index += 1) {
    firstPage.push(pinnedProducts[index]);
  }

  const promotionWindow = Math.min(firstPageLimit, 10);
  const promotedIds = new Set();
  while (firstPage.length < promotionWindow && promotedBrandProducts.length > 0) {
    const nextPromoted = promotedBrandProducts.shift();
    if (!nextPromoted || promotedIds.has(nextPromoted.id)) {
      continue;
    }
    firstPage.push({
      ...nextPromoted,
      manualPriorityPromoted: true,
    });
    promotedIds.add(nextPromoted.id);
  }

  const remainingSlots = firstPageLimit - firstPage.length;
  const remainingEligible = eligibleProducts.filter((product) => !promotedIds.has(product.id));
  const eligibleFirstPage = remainingEligible.slice(0, remainingSlots);
  const eligibleRemaining = remainingEligible.slice(remainingSlots);

  for (const product of eligibleFirstPage) {
    firstPage.push(product);
  }

  eligibleRemaining.sort((a, b) => b.baseScore - a.baseScore);
  const pinnedRemaining = pinnedProducts.slice(actualPinnedLimit);
  const remaining = [...pinnedRemaining, ...eligibleRemaining, ...hiddenProducts];
  const fullOrder = [...firstPage, ...remaining];

  return fullOrder.map((product, index) => ({
    ...product,
    finalPosition: index + 1,
  }));
}
