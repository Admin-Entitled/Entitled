import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionMoves } from "./shopifyService.js";
import { DEFAULT_STRATEGY, getStrategySettings, saveStrategySettings, validateStrategy } from "./strategySettings.js";
import { generateOrder } from "./sorter.js";

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

test("empty inputs and edge case product arrays return cleanly", () => {
  assert.deepEqual(generateOrder([], DEFAULT_STRATEGY), []);

  const single = [baseProduct("p1")];
  const orderedSingle = generateOrder(single, DEFAULT_STRATEGY);
  assert.equal(orderedSingle.length, 1);
  assert.equal(orderedSingle[0].id, "p1");
  assert.equal(orderedSingle[0].finalPosition, 1);
});

test("strategy weights dynamically shift ranking priorities", () => {
  const products = [
    baseProduct("high-sales", {
      soldQuantity: 100,
      sales: { units7: 50, units30: 100, units90: 200, previous23: 10 },
      createdAt: daysAgo(40),
      publishedAt: daysAgo(40),
    }),
    baseProduct("high-inventory", {
      soldQuantity: 0,
      sales: { units7: 0, units30: 0, units90: 0, previous23: 0 },
      createdAt: daysAgo(40),
      publishedAt: daysAgo(40),
      variants: [
        { id: "inv-1", inventoryQuantity: 50, availableForSale: true, selectedOptions: [{ name: "Size", value: "S" }] },
        { id: "inv-2", inventoryQuantity: 50, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
      ],
    }),
  ];

  const salesDominant = generateOrder(products, {
    salesWeight: 1.0,
    inventoryWeight: 0,
    newnessWeight: 0,
    momentumWeight: 0,
    rotationWeight: 0,
  });
  assert.equal(salesDominant[0].id, "high-sales");

  const inventoryDominant = generateOrder(products, {
    salesWeight: 0,
    inventoryWeight: 1.0,
    newnessWeight: 0,
    momentumWeight: 0,
    rotationWeight: 0,
  });
  assert.equal(inventoryDominant[0].id, "high-inventory");
});

test("pinned and hidden products respect explicit configuration", () => {
  const products = [
    baseProduct("unpinned-1", { soldQuantity: 90, sales: { units7: 30 } }),
    baseProduct("unpinned-2", { soldQuantity: 80, sales: { units7: 25 } }),
    baseProduct("pinned-to-1", { allottedPosition: 1, soldQuantity: 5 }),
    baseProduct("pinned-to-3", { allottedPosition: 3, soldQuantity: 2 }),
    baseProduct("hidden-product", { includeInRotation: false, soldQuantity: 100 }),
  ];

  const ordered = generateOrder(products, {
    ...DEFAULT_STRATEGY,
    firstPageLimit: 10,
  });

  assert.equal(ordered[0].id, "pinned-to-1");
  assert.equal(ordered[0].primaryReason, "Pinned");
  assert.equal(ordered[1].id, "pinned-to-3");
  assert.equal(ordered[1].primaryReason, "Pinned");

  // Products with includeInRotation: false are excluded from candidate rotation
  const hiddenItem = ordered.find((p) => p.id === "hidden-product");
  assert.equal(hiddenItem, undefined);
});

test("tie behavior falls back deterministically to previousRank and id sorting", () => {
  const p1 = baseProduct("item-a", { collectionPosition: 10 });
  const p2 = baseProduct("item-b", { collectionPosition: 2 });

  const products = [p1, p2];
  const ordered = generateOrder(products, {
    salesWeight: 1.0,
    inventoryWeight: 0,
    newnessWeight: 0,
    momentumWeight: 0,
    rotationWeight: 0,
    currentDate: "2026-07-22T00:00:00.000Z",
    collectionId: "test-tie",
  });

  assert.equal(ordered[0].id, "item-b");
  assert.equal(ordered[1].id, "item-a");
});

test("score explanations (primaryReason) are correctly assigned for all products", () => {
  const products = [
    baseProduct("pinned-p", { allottedPosition: 1 }),
    baseProduct("high-sales-p", { soldQuantity: 100, sales: { units7: 50, units30: 100, units90: 200 } }),
    baseProduct("new-p", { createdAt: daysAgo(3), publishedAt: daysAgo(3) }),
  ];

  const ordered = generateOrder(products, DEFAULT_STRATEGY);
  assert.ok(ordered.every((p) => typeof p.primaryReason === "string" && p.primaryReason.length > 0));
  assert.equal(ordered.find((p) => p.id === "pinned-p").primaryReason, "Pinned");
});
