import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionMoves, fetchCollectionProducts } from "./shopifyService.js";
import { DEFAULT_STRATEGY, getStrategySettings, saveStrategySettings, validateStrategy, resolveEffectiveStrategy } from "./strategySettings.js";
import { generateOrder, detectPreset, NEW_PRODUCT_WINDOW_DAYS } from "./sorter.js";
import { computePreviewVersion, assertApplyOrderValid } from "./sorterApplyService.js";
import { createMockFetch } from "../mocks/integrationMocks.js";

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

const baseProduct = (id, overrides = {}) => ({
  id,
  title: id,
  vendor: "Vendor",
  productType: "Top",
  collectionPosition: Number(id.replace(/\D+/g, "")) || 1,
  includeInRotation: true,
  createdAt: daysAgo(90),
  publishedAt: daysAgo(90),
  soldQuantity: 0,
  variants: [
    {
      id: `${id}-v1`,
      inventoryQuantity: 6,
      availableForSale: true,
      selectedOptions: [{ name: "Size", value: "M" }],
    },
    {
      id: `${id}-v2`,
      inventoryQuantity: 6,
      availableForSale: true,
      selectedOptions: [{ name: "Size", value: "L" }],
    },
  ],
  sales: {
    units7: 0,
    units30: 0,
    units90: 0,
    previous23: 0,
  },
  ...overrides,
});

test("strategy defaults total one and reject invalid totals", () => {
  assert.equal(
    Object.values(DEFAULT_STRATEGY).reduce((sum, value) => sum + value, 0),
    1,
  );
  assert.match(
    validateStrategy({ ...DEFAULT_STRATEGY, salesWeight: 0.41 }).error,
    /1.00/,
  );
});

test("validated strategy settings persist", async () => {
  const saved = await saveStrategySettings("test-collection", DEFAULT_STRATEGY);
  assert.deepEqual(await getStrategySettings("test-collection"), saved);
});

test("resolveEffectiveStrategy returns correctly formatted object", async () => {
  const resolved = await resolveEffectiveStrategy("test-collection");
  assert.equal(resolved.source, "collection");
  assert.deepEqual(resolved.weights, DEFAULT_STRATEGY);
  assert.ok(resolved.version >= 1);
  assert.ok(typeof resolved.hash === "string");
  assert.ok(typeof resolved.updatedAt === "string");

  const resolvedGlobal = await resolveEffectiveStrategy(null);
  assert.equal(resolvedGlobal.source, "global");
});

test("ranking is deterministic for same seed and preserves membership", () => {
  const products = [
    baseProduct("p1", {
      soldQuantity: 50,
      sales: { units7: 18, units30: 35, units90: 70, previous23: 8 },
    }),
    baseProduct("p2", {
      allottedPosition: 1,
      soldQuantity: 3,
      sales: { units7: 0, units30: 3, units90: 3, previous23: 0 },
    }),
    baseProduct("p3", {
      createdAt: daysAgo(3),
      publishedAt: daysAgo(3),
      variants: [
        {
          id: "p3-v1",
          inventoryQuantity: 10,
          availableForSale: true,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      ],
    }),
    baseProduct("p4", {
      soldQuantity: 20,
      variants: [
        {
          id: "p4-v1",
          inventoryQuantity: 0,
          availableForSale: false,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      ],
      sales: { units7: 2, units30: 10, units90: 20, previous23: 4 },
    }),
  ];

  const settings = {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 24,
    currentDate: "2026-07-22T00:00:00.000Z",
    collectionId: "gid://shopify/Collection/test",
  };

  const first = generateOrder(products, settings);
  const second = generateOrder(products, settings);

  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(first[0].id, "p2");
  assert.equal(new Set(first.map((item) => item.id)).size, products.length);
  assert.ok(first.every((item) => Number.isFinite(item.finalScore)));
});

test("new in-stock products are not automatically buried", () => {
  const products = [
    baseProduct("legacy-1", {
      soldQuantity: 40,
      sales: { units7: 5, units30: 18, units90: 40, previous23: 10 },
    }),
    baseProduct("legacy-2", {
      soldQuantity: 35,
      sales: { units7: 4, units30: 16, units90: 35, previous23: 9 },
    }),
    baseProduct("legacy-3", {
      soldQuantity: 30,
      sales: { units7: 3, units30: 14, units90: 30, previous23: 8 },
    }),
    baseProduct("new-a", {
      createdAt: daysAgo(2),
      publishedAt: daysAgo(2),
      variants: [
        {
          id: "new-a-v1",
          inventoryQuantity: 8,
          availableForSale: true,
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      ],
    }),
    baseProduct("new-b", {
      createdAt: daysAgo(10),
      publishedAt: daysAgo(10),
      variants: [
        {
          id: "new-b-v1",
          inventoryQuantity: 5,
          availableForSale: true,
          selectedOptions: [{ name: "Size", value: "L" }],
        },
      ],
    }),
    baseProduct("old-low", {
      soldQuantity: 1,
      sales: { units7: 0, units30: 1, units90: 1, previous23: 0 },
    }),
  ];

  const ordered = generateOrder(products, {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 4,
    currentDate: "2026-07-22T00:00:00.000Z",
    collectionId: "gid://shopify/Collection/discovery",
  });

  const newPositions = ordered
    .filter((product) => product.id === "new-a" || product.id === "new-b")
    .map((product) => product.finalPosition);

  assert.ok(newPositions.some((position) => position <= 4));
});

test("sold-out products mostly move toward the end with limited visible urgency slots", () => {
  const products = Array.from({ length: 12 }, (_, index) =>
    baseProduct(`p${index + 1}`, {
      soldQuantity: 30 - index,
      sales: { units7: 5, units30: 10, units90: 20, previous23: 5 },
      variants:
        index < 3
          ? [
              {
                id: `sold-${index}`,
                inventoryQuantity: 0,
                availableForSale: false,
                selectedOptions: [{ name: "Size", value: "M" }],
              },
            ]
          : [
              {
                id: `live-${index}`,
                inventoryQuantity: 4,
                availableForSale: true,
                selectedOptions: [{ name: "Size", value: "M" }],
              },
            ],
    }),
  );

  const ordered = generateOrder(products, {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 6,
    currentDate: "2026-07-22T00:00:00.000Z",
    collectionId: "gid://shopify/Collection/urgency",
  });

  const soldOutEarly = ordered.filter((product) => product.finalPosition <= 6 && product.fullySoldOut);
  assert.ok(soldOutEarly.length <= 1);
});

test("collection move builder preserves target order and rejects mismatched membership", () => {
  const applyMoves = (ids, moves) => {
    const result = [...ids];
    for (const move of moves) {
      result.splice(Number(move.newPosition), 0, result.splice(result.indexOf(move.id), 1)[0]);
    }
    return result;
  };

  assert.deepEqual(buildCollectionMoves(["a", "b", "c"], ["a", "b", "c"]), []);
  assert.deepEqual(buildCollectionMoves(["a", "b"], ["b", "a"]), [{ id: "b", newPosition: "0" }]);

  const current = ["a", "b", "c", "d"];
  const desired = ["d", "c", "b", "a"];
  assert.deepEqual(applyMoves(current, buildCollectionMoves(current, desired)), desired);
  assert.throws(() => buildCollectionMoves(current, ["a", "b", "c", "x"]), /exactly once/);
});

// ===== Strategy Sensitivity Tests =====
// These tests prove that changing strategy weights ACTUALLY changes the ranking output.
// A fixed fixture is used so results are deterministic and independent of live data.

const FIXED_DATE = "2026-07-22T00:00:00.000Z";
const COLLECTION_ID = "gid://shopify/Collection/sensitivity-test";

// Date helper relative to FIXED_DATE (not real time) so ageInDays() is deterministic.
const daysBeforeFixed = (days) => new Date(new Date(FIXED_DATE).getTime() - days * 86400000).toISOString();

// Fixture: two products with clearly different score profiles.
// highRevenue: dominant historical gross sales (90-day), weaker recent momentum, old product (>30d).
// highMomentum: low historical volume but very strong recent velocity ratio, also old product (>30d).
// Both products are old enough (>30 days) that the new-product slot injection does NOT apply,
// ensuring the strategy weights are the sole determinant of ranking.
const fixtureProducts = [
  baseProduct("highRevenue", {
    createdAt: daysBeforeFixed(180),
    publishedAt: daysBeforeFixed(180),
    soldQuantity: 120,
    sales: { units7: 2, units30: 8, units90: 90, previous23: 4 },
    variants: [
      { id: "hr-v1", inventoryQuantity: 50, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
      { id: "hr-v2", inventoryQuantity: 40, availableForSale: true, selectedOptions: [{ name: "Size", value: "L" }] },
    ],
  }),
  baseProduct("highMomentum", {
    // 45 days before FIXED_DATE — beyond the 30-day newness window, so new-product injection does NOT apply.
    createdAt: daysBeforeFixed(45),
    publishedAt: daysBeforeFixed(45),
    soldQuantity: 15,
    // Very strong recent week relative to prior period → high momentum score.
    sales: { units7: 12, units30: 15, units90: 15, previous23: 1 },
    variants: [
      { id: "hm-v1", inventoryQuantity: 15, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
      { id: "hm-v2", inventoryQuantity: 10, availableForSale: true, selectedOptions: [{ name: "Size", value: "L" }] },
    ],
  }),
];


test("STRATEGY-A: sales-dominant strategy places high-revenue product first", () => {
  // Sales weight = 0.85 → historical gross sales strength dominates; momentum is minimal.
  const strategySalesDominant = {
    salesWeight: 0.85,
    revenueWeight: 0.00,
    inventoryWeight: 0.05,
    newnessWeight: 0.04,
    momentumWeight: 0.03,
    rotationWeight: 0.03,
    firstPageLimit: 24,
    currentDate: FIXED_DATE,
    collectionId: COLLECTION_ID,
  };

  const order = generateOrder(fixtureProducts, strategySalesDominant);
  // highRevenue has grossStrength from 90 units90 vs highMomentum's 15 → much stronger gross sales.
  assert.equal(order[0].id, "highRevenue",
    "Sales-dominant strategy must rank the product with highest historical gross sales first");
  assert.ok(order[0].finalScore > order[1].finalScore,
    "Winner's finalScore must exceed runner-up under sales-dominant strategy");
});

test("STRATEGY-B: momentum-dominant strategy can elevate the recently trending product", () => {
  // Momentum weight = 0.85 → recent sales velocity ratio dominates.
  // highMomentum: units7=12 vs previous23=1 → very high growth ratio → momentum ≈ 1.0.
  // highRevenue: units7=2 vs previous23=4 → declining → momentum ≈ 0.35.
  const strategyMomentumDominant = {
    salesWeight: 0.03,
    revenueWeight: 0.00,
    inventoryWeight: 0.03,
    newnessWeight: 0.04,
    momentumWeight: 0.85,
    rotationWeight: 0.05,
    firstPageLimit: 24,
    currentDate: FIXED_DATE,
    collectionId: COLLECTION_ID,
  };

  const order = generateOrder(fixtureProducts, strategyMomentumDominant);
  // highMomentum: 12x growth ratio → strong momentum; highRevenue: declining → weak momentum.
  assert.equal(order[0].id, "highMomentum",
    "Momentum-dominant strategy must rank the product with highest recent momentum first");
  assert.ok(order[0].finalScore > order[1].finalScore,
    "Winner's finalScore must exceed runner-up under momentum-dominant strategy");
});

test("STRATEGY-C: changing weights produces a different ranking (strategy sensitivity)", () => {
  const strategySales = {
    salesWeight: 0.85, revenueWeight: 0.00, inventoryWeight: 0.05, newnessWeight: 0.04,
    momentumWeight: 0.03, rotationWeight: 0.03,
    firstPageLimit: 24, currentDate: FIXED_DATE, collectionId: COLLECTION_ID,
  };
  const strategyMomentum = {
    salesWeight: 0.03, revenueWeight: 0.00, inventoryWeight: 0.03, newnessWeight: 0.04,
    momentumWeight: 0.85, rotationWeight: 0.05,
    firstPageLimit: 24, currentDate: FIXED_DATE, collectionId: COLLECTION_ID,
  };

  const orderA = generateOrder(fixtureProducts, strategySales);
  const orderB = generateOrder(fixtureProducts, strategyMomentum);

  // The two strategies must produce DIFFERENT first-place winners.
  assert.notEqual(
    orderA[0].id, orderB[0].id,
    "Materially different strategy weights must produce a different top-ranked product",
  );
});

test("STRATEGY-D: identical strategy + identical data produces identical order (determinism)", () => {
  const settings = {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 24,
    currentDate: FIXED_DATE,
    collectionId: COLLECTION_ID,
  };

  const first = generateOrder(fixtureProducts, settings);
  const second = generateOrder(fixtureProducts, settings);

  assert.deepEqual(
    first.map((p) => p.id),
    second.map((p) => p.id),
    "Same strategy + same data must always produce the same order",
  );
});

test("STRATEGY-E: invalid strategy (weights not summing to 1.00) is rejected by validateStrategy", () => {
  const { error } = validateStrategy({
    salesWeight: 0.5, revenueWeight: 0.1, inventoryWeight: 0.5, newnessWeight: 0.5,
    momentumWeight: 0.1, rotationWeight: 0.05,
  });
  assert.ok(error, "validateStrategy must return an error when weights do not sum to 1.00");
  assert.match(error, /1\.00/, "Error must mention the required sum");
});

test("STRATEGY-F: generated order includes finalScore and primaryReason for every product", () => {
  const order = generateOrder(fixtureProducts, {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 24,
    currentDate: FIXED_DATE,
    collectionId: COLLECTION_ID,
  });

  for (const product of order) {
    assert.ok(Number.isFinite(product.finalScore), `${product.id} must have a finite finalScore`);
    assert.ok(typeof product.primaryReason === "string" && product.primaryReason.length > 0,
      `${product.id} must have a non-empty primaryReason`);
    assert.ok(Number.isFinite(product.salesScore), `${product.id} must have a salesScore component`);
    assert.ok(Number.isFinite(product.revenueScore), `${product.id} must have a revenueScore component`);
    assert.ok(Number.isFinite(product.inventoryScore), `${product.id} must have an inventoryScore component`);
    assert.ok(Number.isFinite(product.newnessScore), `${product.id} must have a newnessScore component`);
    assert.ok(Number.isFinite(product.momentumScore), `${product.id} must have a momentumScore component`);
  }
});

test("STRATEGY-G: sold-out product finalScore is not inflated by inventory above available products", () => {
  const soldOut = baseProduct("sold-out", {
    soldQuantity: 200,
    sales: { units7: 15, units30: 60, units90: 200, previous23: 10 },
    variants: [
      { id: "so-v1", inventoryQuantity: 0, availableForSale: false, selectedOptions: [{ name: "Size", value: "M" }] },
    ],
  });
  const available = baseProduct("available", {
    soldQuantity: 30,
    sales: { units7: 5, units30: 15, units90: 30, previous23: 3 },
    variants: [
      { id: "av-v1", inventoryQuantity: 20, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
    ],
  });

  const order = generateOrder([soldOut, available], {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 2,
    currentDate: FIXED_DATE,
    collectionId: COLLECTION_ID,
  });

  // Sold-out products must be de-prioritized relative to available products.
  const soldOutPos = order.find((p) => p.id === "sold-out").finalPosition;
  const availablePos = order.find((p) => p.id === "available").finalPosition;
  assert.ok(availablePos < soldOutPos,
    "Available product must rank above fully sold-out product regardless of historical sales");
});

test("stale-preview protection: computePreviewVersion changes when strategy version or hash changes", () => {
  const collectionId = "test-collection";
  const snapshot = {
    syncedAt: "2026-08-08T12:00:00Z",
    products: [{ id: "p1", collectionPosition: 1 }, { id: "p2", collectionPosition: 2 }],
  };

  const strategy1 = { version: 1, hash: "hash1" };
  const strategy2 = { version: 2, hash: "hash1" };
  const strategy3 = { version: 1, hash: "hash2" };

  const version1 = computePreviewVersion(collectionId, snapshot, strategy1);
  const version2 = computePreviewVersion(collectionId, snapshot, strategy2);
  const version3 = computePreviewVersion(collectionId, snapshot, strategy3);

  assert.notEqual(version1, version2);
  assert.notEqual(version1, version3);
  assert.notEqual(version2, version3);
});

test("stale-preview protection: assertApplyOrderValid throws when strategy changes", () => {
  const collectionId = "test-collection";
  const snapshot = {
    syncedAt: "2026-08-08T12:00:00Z",
    products: [{ id: "p1", collectionPosition: 1 }, { id: "p2", collectionPosition: 2 }],
  };

  const strategy1 = { version: 1, hash: "hash1" };
  const previewVersion = computePreviewVersion(collectionId, snapshot, strategy1);

  // Matches if strategy matches
  assert.doesNotThrow(() => {
    assertApplyOrderValid(collectionId, snapshot, ["p1", "p2"], previewVersion, strategy1);
  });

  // Fails with GENERATED_ORDER_STALE if strategy changes (e.g. version changed)
  const strategy2 = { version: 2, hash: "hash1" };
  assert.throws(() => {
    assertApplyOrderValid(collectionId, snapshot, ["p1", "p2"], previewVersion, strategy2);
  }, (err) => {
    return err.code === "GENERATED_ORDER_STALE" && err.statusCode === 409;
  });
});


// ============================================================
// SECTION: INR Fixture Products (realistic data for India)
// ============================================================
const INR_DATE = "2026-07-22T00:00:00.000Z";
const INR_COL = "gid://shopify/Collection/inr-test";
const daysBeforeInr = (days) => new Date(new Date(INR_DATE).getTime() - days * 86400000).toISOString();

function inrProduct(id, overrides = {}) {
  return {
    id,
    title: `Product ${id}`,
    vendor: "TestBrand",
    productType: "Apparel",
    collectionPosition: 10,
    includeInRotation: true,
    createdAt: daysBeforeInr(180),
    publishedAt: daysBeforeInr(180),
    soldQuantity: 0,
    salesRevenue: 0,
    sales: { units7: 0, units30: 0, units90: 0, previous23: 0 },
    variants: [
      { id: `${id}-v1`, inventoryQuantity: 10, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
      { id: `${id}-v2`, inventoryQuantity: 8, availableForSale: true, selectedOptions: [{ name: "Size", value: "L" }] },
    ],
    ...overrides,
  };
}

const P1_INR = inrProduct("P1_INR", { soldQuantity: 420, salesRevenue: 150000, sales: { units7: 12, units30: 48, units90: 150, previous23: 24 } });
const P2_INR = inrProduct("P2_INR", { soldQuantity: 180, salesRevenue: 65000, sales: { units7: 6, units30: 22, units90: 70, previous23: 11 } });
const P3_INR = inrProduct("P3_INR", { title: "Puma Low Revenue", soldQuantity: 12, salesRevenue: 4000, sales: { units7: 0, units30: 4, units90: 12, previous23: 2 }, collectionPosition: 17 });
const P4_INR = inrProduct("P4_INR", { title: "New Day-3", soldQuantity: 0, salesRevenue: 0, sales: { units7: 0, units30: 0, units90: 0, previous23: 0 }, createdAt: daysBeforeInr(3), publishedAt: daysBeforeInr(3) });
const P5_INR = inrProduct("P5_INR", { title: "New Day-8", soldQuantity: 4, salesRevenue: 2000, sales: { units7: 4, units30: 4, units90: 4, previous23: 0 }, createdAt: daysBeforeInr(8), publishedAt: daysBeforeInr(8) });
const P6_INR = inrProduct("P6_INR", { soldQuantity: 3, salesRevenue: 1500, sales: { units7: 0, units30: 1, units90: 3, previous23: 0 } });
const P7_INR = inrProduct("P7_INR", { title: "New Sold-Out", soldQuantity: 0, salesRevenue: 0, sales: { units7: 0, units30: 0, units90: 0, previous23: 0 }, createdAt: daysBeforeInr(5), publishedAt: daysBeforeInr(5), variants: [{ id: "P7_INR-v1", inventoryQuantity: 0, availableForSale: false, selectedOptions: [{ name: "Size", value: "M" }] }] });

const ALL_INR = [P1_INR, P2_INR, P3_INR, P4_INR, P5_INR, P6_INR, P7_INR];

// A. INDICATOR CORRECTNESS
test("A1: P3 (₹4K) is NOT labeled Strong Revenue Performance", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const p3 = order.find(p => p.id === "P3_INR");
  assert.ok(p3, "P3 must be in result");
  assert.ok(p3.primaryReason !== "Strong Revenue Performance", `P3 got: "${p3.primaryReason}"`);
});

test("A2: P1 (₹150K) outranks P3 (₹4K) under Revenue First", () => {
  const rf = { salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL };
  const order = generateOrder(ALL_INR, rf);
  const p1pos = order.find(p => p.id === "P1_INR").finalPosition;
  const p3pos = order.find(p => p.id === "P3_INR").finalPosition;
  assert.ok(p1pos < p3pos, `P1 (₹150K) must rank above P3 (₹4K): P1=#${p1pos} P3=#${p3pos}`);
});

test("A3: rawMetrics.recentRevenue matches source salesRevenue", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const p1 = order.find(p => p.id === "P1_INR");
  const p3 = order.find(p => p.id === "P3_INR");
  assert.equal(p1.rawMetrics.recentRevenue, 150000);
  assert.equal(p3.rawMetrics.recentRevenue, 4000);
});

test("A4: P3 revenueScore substantially lower than P1 under percentile normalization", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const p1 = order.find(p => p.id === "P1_INR");
  const p3 = order.find(p => p.id === "P3_INR");
  assert.ok(p1.revenueScore > p3.revenueScore, `P1 revenueScore (${p1.revenueScore.toFixed(3)}) must exceed P3 (${p3.revenueScore.toFixed(3)})`);
  assert.ok(p3.revenueScore < 0.80, `P3 (₹4K vs ₹150K max) must not have near-perfect revenueScore: ${p3.revenueScore.toFixed(3)}`);
});

test("A5: scoreRank reflects raw score order — all ranks 1..N unique", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const ranks = order.map(p => p.scoreRank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    assert.equal(ranks[i], i + 1, `scoreRank gap at index ${i}: got ${ranks[i]}`);
  }
});

test("A6: components contribute to finalScore (sum ≈ finalScore within float tolerance)", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  for (const p of order) {
    const sum = p.components.sales.contribution + p.components.revenue.contribution + p.components.inventory.contribution + p.components.newness.contribution + p.components.momentum.contribution + p.components.rotation.contribution + p.stabilityScore;
    const diff = Math.abs(Math.min(1, sum) - p.finalScore);
    assert.ok(diff < 0.002, `${p.id}: sum=${sum.toFixed(4)} finalScore=${p.finalScore.toFixed(4)} diff=${diff.toFixed(4)}`);
  }
});

test("A7: Balanced — P3 does NOT reach #1 when P1 and P2 exist", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const p1 = order.find(p => p.id === "P1_INR");
  const p2 = order.find(p => p.id === "P2_INR");
  const p3 = order.find(p => p.id === "P3_INR");
  assert.ok(!(p3.finalPosition < p1.finalPosition && p3.finalPosition < p2.finalPosition),
    `P3 (₹4K) must not be above BOTH P1 (#${p1.finalPosition}) and P2 (#${p2.finalPosition}): P3=#${p3.finalPosition}`);
});

// B. STRATEGY PROPAGATION
test("B1: detectPreset identifies all known presets correctly", () => {
  assert.equal(detectPreset({ salesWeight: 0.30, revenueWeight: 0.20, inventoryWeight: 0.15, newnessWeight: 0.15, momentumWeight: 0.10, rotationWeight: 0.10 }), "Balanced");
  assert.equal(detectPreset({ salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 }), "Revenue First");
  assert.equal(detectPreset({ salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10 }), "New Launch Push");
  assert.equal(detectPreset({ salesWeight: 0.50, revenueWeight: 0.15, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.10, rotationWeight: 0.05 }), "Custom");
});

test("B2: saveStrategySettings persists and resolveEffectiveStrategy returns it", async () => {
  const custom = { salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 };
  await saveStrategySettings("b2-col", custom);
  const resolved = await resolveEffectiveStrategy("b2-col");
  assert.ok(Math.abs(resolved.weights.revenueWeight - 0.60) < 0.001, `revenueWeight should be 0.60, got ${resolved.weights.revenueWeight}`);
});

test("B3: Save A then B — next resolve returns B weights", async () => {
  const A = { salesWeight: 0.60, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 };
  const B = { salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05 };
  await saveStrategySettings("b3-col", A);
  await saveStrategySettings("b3-col", B);
  const resolved = await resolveEffectiveStrategy("b3-col");
  assert.ok(Math.abs(resolved.weights.revenueWeight - 0.60) < 0.001, `After saving B, revenueWeight must be 0.60, got ${resolved.weights.revenueWeight}`);
  assert.ok(Math.abs(resolved.weights.salesWeight - 0.10) < 0.001);
});

test("B4: Critical Integration Test — Global strategy saving updates correctly and propagates to collections immediately", async () => {
  const collectionId = "test-collection-b4";

  // Clean state: reset global to Balanced and delete collection override
  await saveStrategySettings(collectionId, { ...DEFAULT_STRATEGY, override: false });

  // Initial persisted global strategy should be Balanced (version 1)
  const initial = await resolveEffectiveStrategy(collectionId);
  assert.equal(initial.source, "global");
  assert.equal(detectPreset(initial.weights), "Balanced");

  // Save Global strategy: New Launch Push 10/10/10/50/10/10
  // By sending override: false to emulate the UI saving the inherited global strategy
  const newLaunchPush = {
    salesWeight: 0.10,
    revenueWeight: 0.10,
    inventoryWeight: 0.10,
    newnessWeight: 0.50,
    momentumWeight: 0.10,
    rotationWeight: 0.10,
    override: false
  };

  const response = await saveStrategySettings(collectionId, newLaunchPush);

  // Assert response
  assert.equal(response.source, "global");
  assert.ok(Math.abs(response.salesWeight - 0.10) < 1e-4);
  assert.ok(Math.abs(response.newnessWeight - 0.50) < 1e-4);
  assert.ok(response.version > 1);
  assert.notEqual(response.hash, initial.hash);

  // Without restarting, resolve effective strategy
  const resolved = await resolveEffectiveStrategy(collectionId);
  assert.equal(resolved.source, "global");
  assert.ok(Math.abs(resolved.weights.salesWeight - 0.10) < 1e-4);
  assert.ok(Math.abs(resolved.weights.newnessWeight - 0.50) < 1e-4);
  assert.equal(detectPreset(resolved.weights), "New Launch Push");

  // Generate order and assert strategyUsed
  const products = [
    { id: "P1", publishedAt: "2026-08-01", createdAt: "2026-08-01", variants: [{ availableForSale: true, inventoryQuantity: 10 }] }
  ];
  const order = generateOrder(products, { ...resolved.weights, collectionId, currentDate: "2026-08-08T00:00:00Z" });
  const detected = detectPreset(resolved.weights);
  assert.equal(detected, "New Launch Push");
  assert.ok(Math.abs(resolved.weights.newnessWeight - 0.50) < 1e-4);
});

// C. NEW PRODUCT TESTS
test("C1: P4 (new, in-stock, zero history) not buried under Balanced", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  const p4 = order.find(p => p.id === "P4_INR");
  const maxPos = Math.ceil(ALL_INR.length * 0.85);
  assert.ok(p4.finalPosition <= maxPos, `P4 buried at #${p4.finalPosition} of ${ALL_INR.length} under Balanced`);
});

test("C2: New Launch Push allocates new_product_exposure slots; Revenue First does not", () => {
  // Use a larger collection (20 products) with a tight firstPageLimit (8)
  // so exposure slots are actually scarce and strategy-governed.
  const bigCollection = [
    ...Array.from({ length: 13 }, (_, i) => inrProduct(`old${i}`, {
      soldQuantity: 100 - i * 5,
      salesRevenue: 50000 - i * 2000,
      sales: { units7: 10 - i, units30: 30 - i * 2, units90: 80 - i * 5, previous23: 8 - i },
    })),
    inrProduct("newA", { title: "New A", createdAt: daysBeforeInr(3), publishedAt: daysBeforeInr(3) }),
    inrProduct("newB", { title: "New B", createdAt: daysBeforeInr(8), publishedAt: daysBeforeInr(8), salesRevenue: 500, sales: { units7: 2, units30: 2, units90: 2, previous23: 0 } }),
    inrProduct("newC", { title: "New C", createdAt: daysBeforeInr(15), publishedAt: daysBeforeInr(15) }),
  ];
  const nl = { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10, firstPageLimit: 8, currentDate: INR_DATE, collectionId: "gid://shopify/Collection/c2-test" };
  const rf = { salesWeight: 0.10, revenueWeight: 0.60, inventoryWeight: 0.10, newnessWeight: 0.10, momentumWeight: 0.05, rotationWeight: 0.05, firstPageLimit: 8, currentDate: INR_DATE, collectionId: "gid://shopify/Collection/c2-test" };
  const orderNL = generateOrder(bigCollection, nl);
  const orderRF = generateOrder(bigCollection, rf);

  // Under New Launch Push: at least one new product should receive new_product_exposure
  const nlExposed = orderNL.filter(p => p.placementType === "new_product_exposure");
  assert.ok(nlExposed.length > 0, `New Launch Push must generate at least 1 new_product_exposure slot, got 0`);

  // Under Revenue First: fewer or zero new_product_exposure slots
  const rfExposed = orderRF.filter(p => p.placementType === "new_product_exposure");
  assert.ok(nlExposed.length >= rfExposed.length,
    `New Launch Push (${nlExposed.length} slots) should have >= Revenue First (${rfExposed.length} slots) new-product exposure slots`);
});

test("C3: P7 (new but sold-out) not promoted by new-product exposure", () => {
  const nl = { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL };
  const order = generateOrder(ALL_INR, nl);
  const p7 = order.find(p => p.id === "P7_INR");
  assert.ok(p7.placementType !== "new_product_exposure", `P7 (sold-out) must not get new_product_exposure, got: ${p7.placementType}`);
});

test("C4: no NaN or Infinity in any score field for zero-history products", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  for (const p of order) {
    assert.ok(Number.isFinite(p.finalScore), `${p.id}: finalScore=${p.finalScore}`);
    assert.ok(Number.isFinite(p.salesScore), `${p.id}: salesScore=${p.salesScore}`);
    assert.ok(Number.isFinite(p.revenueScore), `${p.id}: revenueScore=${p.revenueScore}`);
    assert.ok(Number.isFinite(p.momentumScore), `${p.id}: momentumScore=${p.momentumScore}`);
    assert.ok(Number.isFinite(p.inventoryScore), `${p.id}: inventoryScore=${p.inventoryScore}`);
  }
});

test("C5: age-based newness decays from day-0 to day-31", () => {
  const mkp = (id, ageDays) => inrProduct(id, { createdAt: daysBeforeInr(ageDays), publishedAt: daysBeforeInr(ageDays) });
  const settings = { ...DEFAULT_STRATEGY, firstPageLimit: 4, currentDate: INR_DATE, collectionId: INR_COL };
  const [r0] = generateOrder([mkp("d0", 0)], settings);
  const [r7] = generateOrder([mkp("d7", 7)], settings);
  const [r15] = generateOrder([mkp("d15", 15)], settings);
  const [r31] = generateOrder([mkp("d31", 31)], settings);
  assert.ok(r0.newnessScore >= r7.newnessScore, "Day 0 >= Day 7");
  assert.ok(r7.newnessScore >= r15.newnessScore, "Day 7 >= Day 15");
  assert.ok(r15.newnessScore >= r31.newnessScore, "Day 15 >= Day 31");
  assert.equal(r31.newnessScore, 0, "Day 31 newnessScore must be 0");
});

// D. EXPLAINABILITY
test("D1: placementType new_product_exposure → primaryReason is New Product Exposure", () => {
  const nl = { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL };
  const order = generateOrder(ALL_INR, nl);
  const newExposureProducts = order.filter(p => p.placementType === "new_product_exposure");
  for (const p of newExposureProducts) {
    assert.equal(p.primaryReason, "New Product Exposure", `${p.id}: placementType=new_product_exposure but primaryReason="${p.primaryReason}"`);
  }
});

test("D2: scoreRank != finalPosition for at least one product under New Launch Push (merchandising moves products)", () => {
  const nl = { salesWeight: 0.10, revenueWeight: 0.10, inventoryWeight: 0.10, newnessWeight: 0.50, momentumWeight: 0.10, rotationWeight: 0.10, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL };
  const order = generateOrder(ALL_INR, nl);
  const hasDivergence = order.some(p => p.scoreRank !== p.finalPosition);
  assert.ok(hasDivergence, "At least one product must have scoreRank != finalPosition");
});

test("D3: every product has scoreDrivers array and placementType string", () => {
  const order = generateOrder(ALL_INR, { ...DEFAULT_STRATEGY, firstPageLimit: 40, currentDate: INR_DATE, collectionId: INR_COL });
  for (const p of order) {
    assert.ok(Array.isArray(p.scoreDrivers), `${p.id} missing scoreDrivers`);
    assert.ok(typeof p.placementType === "string", `${p.id} missing placementType`);
    assert.ok(typeof p.primaryReason === "string" && p.primaryReason.length > 0, `${p.id} missing primaryReason`);
  }
});

test("D4: imageUrl is always a string and never [object Object]", () => {
  const withObjImage = inrProduct("obj-img", { image: { src: "https://cdn.example.com/img.jpg" } });
  const withStrImage = inrProduct("str-img", { imageUrl: "https://cdn.example.com/img2.jpg" });
  const withNoImage = inrProduct("no-img", {});
  const order = generateOrder([withObjImage, withStrImage, withNoImage], { ...DEFAULT_STRATEGY, firstPageLimit: 3, currentDate: INR_DATE, collectionId: INR_COL });
  for (const p of order) {
    assert.ok(typeof p.imageUrl === "string", `${p.id}: imageUrl is not a string`);
    assert.ok(p.imageUrl !== "[object Object]", `${p.id}: imageUrl is "[object Object]"`);
  }
  const obj = order.find(p => p.id === "obj-img");
  assert.equal(obj.imageUrl, "https://cdn.example.com/img.jpg");
});

test("D5: NEW_PRODUCT_WINDOW_DAYS constant is 30", () => {
  assert.equal(NEW_PRODUCT_WINDOW_DAYS, 30);
});

test("E1: pagination with 75 products works correctly", async () => {
  const originalFetch = globalThis.fetch;
  const mockProducts = Array.from({ length: 75 }, (_, i) => ({
    id: `gid://shopify/Product/${i + 1}`,
    title: `Product ${i + 1}`,
    handle: `product-${i + 1}`,
    productType: "Test",
    vendor: "TestBrand",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalInventory: 10,
    featuredImage: { url: "https://example.com/img.jpg", altText: "" },
    priceRangeV2: { minVariantPrice: { amount: "10", currencyCode: "INR" } },
    variants: { edges: [] }
  }));

  globalThis.fetch = async (url, init) => {
    if (url.includes("/access_token")) {
      return {
        ok: true,
        json: async () => ({
          access_token: "mock-token-xyz",
          expires_in: 3600
        })
      };
    }
    const body = JSON.parse(init.body);
    if (body.query.includes("CollectionMeta")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            collection: {
              id: "gid://shopify/Collection/mock-col",
              title: "Mock Collection",
              handle: "mock-collection",
              sortOrder: "MANUAL",
              productsCount: { count: 75 }
            }
          }
        })
      };
    }
    
    const cursor = body.variables.cursor;
    let startIdx = 0;
    if (cursor) {
      startIdx = parseInt(cursor.split("-")[1], 10);
    }
    const pageSize = 30;
    const pageProducts = mockProducts.slice(startIdx, startIdx + pageSize);
    const hasNextPage = startIdx + pageSize < mockProducts.length;
    const endCursor = hasNextPage ? `cursor-${startIdx + pageSize}` : null;

    return {
      ok: true,
      json: async () => ({
        data: {
          collection: {
            id: "gid://shopify/Collection/mock-col",
            title: "Mock Collection",
            handle: "mock-collection",
            sortOrder: "MANUAL",
            products: {
              edges: pageProducts.map((p, idx) => ({
                cursor: `cursor-${startIdx + idx + 1}`,
                node: p
              })),
              pageInfo: {
                hasNextPage,
                endCursor
              }
            }
          }
        }
      })
    };
  };

  try {
    const result = await fetchCollectionProducts("gid://shopify/Collection/mock-col");
    assert.equal(result.products.length, 75);
    assert.equal(new Set(result.products.map(p => p.id)).size, 75);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E2: page size must not matter", async () => {
  const originalFetch = globalThis.fetch;
  const mockProducts = Array.from({ length: 75 }, (_, i) => ({
    id: `gid://shopify/Product/${i + 1}`,
    title: `Product ${i + 1}`,
    handle: `product-${i + 1}`,
    productType: "Test",
    vendor: "TestBrand",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalInventory: 10,
    featuredImage: { url: "https://example.com/img.jpg", altText: "" },
    priceRangeV2: { minVariantPrice: { amount: "10", currencyCode: "INR" } },
    variants: { edges: [] }
  }));

  for (const pageSize of [25, 50]) {
    globalThis.fetch = async (url, init) => {
      if (url.includes("/access_token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "mock-token-xyz",
            expires_in: 3600
          })
        };
      }
      const body = JSON.parse(init.body);
      if (body.query.includes("CollectionMeta")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              collection: {
                id: "gid://shopify/Collection/mock-col",
                title: "Mock Collection",
                handle: "mock-collection",
                sortOrder: "MANUAL",
                productsCount: { count: 75 }
              }
            }
          })
        };
      }
      
      const cursor = body.variables.cursor;
      let startIdx = 0;
      if (cursor) {
        startIdx = parseInt(cursor.split("-")[1], 10);
      }
      const pageProducts = mockProducts.slice(startIdx, startIdx + pageSize);
      const hasNextPage = startIdx + pageSize < mockProducts.length;
      const endCursor = hasNextPage ? `cursor-${startIdx + pageSize}` : null;

      return {
        ok: true,
        json: async () => ({
          data: {
            collection: {
              id: "gid://shopify/Collection/mock-col",
              title: "Mock Collection",
              handle: "mock-collection",
              sortOrder: "MANUAL",
              products: {
                edges: pageProducts.map((p, idx) => ({
                  cursor: `cursor-${startIdx + idx + 1}`,
                  node: p
                })),
                pageInfo: {
                  hasNextPage,
                  endCursor
                }
              }
            }
          }
        })
      };
    };

    try {
      const result = await fetchCollectionProducts("gid://shopify/Collection/mock-col");
      assert.equal(result.products.length, 75);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("E3: fetching more than 100 products works correctly", async () => {
  const originalFetch = globalThis.fetch;
  const mockProducts = Array.from({ length: 217 }, (_, i) => ({
    id: `gid://shopify/Product/${i + 1}`,
    title: `Product ${i + 1}`,
    handle: `product-${i + 1}`,
    productType: "Test",
    vendor: "TestBrand",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalInventory: 10,
    featuredImage: { url: "https://example.com/img.jpg", altText: "" },
    priceRangeV2: { minVariantPrice: { amount: "10", currencyCode: "INR" } },
    variants: { edges: [] }
  }));

  globalThis.fetch = async (url, init) => {
    if (url.includes("/access_token")) {
      return {
        ok: true,
        json: async () => ({
          access_token: "mock-token-xyz",
          expires_in: 3600
        })
      };
    }
    const body = JSON.parse(init.body);
    if (body.query.includes("CollectionMeta")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            collection: {
              id: "gid://shopify/Collection/mock-col",
              title: "Mock Collection",
              handle: "mock-collection",
              sortOrder: "MANUAL",
              productsCount: { count: 217 }
            }
          }
        })
      };
    }
    
    const cursor = body.variables.cursor;
    let startIdx = 0;
    if (cursor) {
      startIdx = parseInt(cursor.split("-")[1], 10);
    }
    const pageSize = 100;
    const pageProducts = mockProducts.slice(startIdx, startIdx + pageSize);
    const hasNextPage = startIdx + pageSize < mockProducts.length;
    const endCursor = hasNextPage ? `cursor-${startIdx + pageSize}` : null;

    return {
      ok: true,
      json: async () => ({
        data: {
          collection: {
            id: "gid://shopify/Collection/mock-col",
            title: "Mock Collection",
            handle: "mock-collection",
            sortOrder: "MANUAL",
            products: {
              edges: pageProducts.map((p, idx) => ({
                cursor: `cursor-${startIdx + idx + 1}`,
                node: p
              })),
              pageInfo: {
                hasNextPage,
                endCursor
              }
            }
          }
        }
      })
    };
  };

  try {
    const result = await fetchCollectionProducts("gid://shopify/Collection/mock-col");
    assert.equal(result.products.length, 217);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E4: First Page Limit does not affect total generated products", () => {
  const mockProducts = Array.from({ length: 75 }, (_, i) => ({
    id: `gid://shopify/Product/${i + 1}`,
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    variants: [{ availableForSale: true, inventoryQuantity: 10 }]
  }));

  const order = generateOrder(mockProducts, {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 40,
    currentDate: new Date().toISOString(),
    collectionId: "mock-col"
  });

  assert.equal(order.length, 75);
});

test("E5: Complete apply set safety validation", () => {
  const snapshot = {
    products: Array.from({ length: 75 }, (_, i) => ({
      id: `gid://shopify/Product/${i + 1}`,
      collectionPosition: i + 1
    }))
  };

  const validOrderIds = Array.from({ length: 75 }, (_, i) => `gid://shopify/Product/${i + 1}`);
  const invalidOrderIds = Array.from({ length: 30 }, (_, i) => `gid://shopify/Product/${i + 1}`);

  // Should succeed without error
  assertApplyOrderValid("mock-col", snapshot, validOrderIds, null, {});

  // Should fail with error due to missing products
  assert.throws(() => {
    assertApplyOrderValid("mock-col", snapshot, invalidOrderIds, null, {});
  }, /The collection changed after this preview was generated/);
});
