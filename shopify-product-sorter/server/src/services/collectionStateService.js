import db from "../db/database.js";

const defaultWeights = {
  brandPriorityWeight: 0.15,
  salesWeight: 0.25,
  inventoryWeight: 0.1,
  newProductBoost: 0.35,
  lowSellerPenalty: 0.2,
  randomnessWeight: 0.15,
  brandTrendWeight: 0.12,
  productTypeTrendWeight: 0.08,
  colorTrendWeight: 0.05,
};

const defaultBrandPriorities = {
  "AllSaints": 20,
  "Polo Ralph Lauren": 15,
  "Armani Exchange": 12,
  "Lacoste": 10,
  "GymShark": 5
};

export function getCollectionSettings(collectionId) {
  const row = db
    .prepare(
      `SELECT * FROM collection_settings WHERE collection_id = ?`,
    )
    .get(collectionId);

  if (!row) {
    return {
      collectionId,
      firstPageLimit: 40,
      ...defaultWeights,
      lastGeneratedOrder: [],
      lastAppliedOrder: [],
      brandPriorities: defaultBrandPriorities,
    };
  }

  let brandPriorities = defaultBrandPriorities;
  if (row.brand_priorities) {
    try {
      brandPriorities = JSON.parse(row.brand_priorities);
    } catch (e) {
      brandPriorities = defaultBrandPriorities;
    }
  }

  return {
    collectionId: row.collection_id,
    collectionTitle: row.collection_title,
    firstPageLimit: row.first_page_limit,
    brandPriorityWeight: row.brand_priority_weight,
    salesWeight: row.sales_weight,
    inventoryWeight: row.inventory_weight,
    newProductBoost: row.new_product_boost,
    lowSellerPenalty: row.low_seller_penalty,
    randomnessWeight: row.randomness_weight,
    brandTrendWeight: row.brand_trend_weight,
    productTypeTrendWeight: row.product_type_trend_weight,
    colorTrendWeight: row.color_trend_weight,
    selected: Boolean(row.selected),
    lastGeneratedOrder: row.last_generated_order ? JSON.parse(row.last_generated_order) : [],
    lastAppliedOrder: row.last_applied_order ? JSON.parse(row.last_applied_order) : [],
    brandPriorities,
  };
}

export function upsertCollectionSettings(collectionId, collectionTitle, settings = {}) {
  const now = new Date().toISOString();
  const current = getCollectionSettings(collectionId);
  const merged = {
    firstPageLimit: settings.firstPageLimit ?? current.firstPageLimit,
    brandPriorityWeight: settings.brandPriorityWeight ?? current.brandPriorityWeight,
    salesWeight: settings.salesWeight ?? current.salesWeight,
    inventoryWeight: settings.inventoryWeight ?? current.inventoryWeight,
    newProductBoost: settings.newProductBoost ?? current.newProductBoost,
    lowSellerPenalty: settings.lowSellerPenalty ?? current.lowSellerPenalty,
    randomnessWeight: settings.randomnessWeight ?? current.randomnessWeight,
    brandTrendWeight: settings.brandTrendWeight ?? current.brandTrendWeight,
    productTypeTrendWeight: settings.productTypeTrendWeight ?? current.productTypeTrendWeight,
    colorTrendWeight: settings.colorTrendWeight ?? current.colorTrendWeight,
    selected: settings.selected ?? current.selected ?? false,
    lastGeneratedOrder: settings.lastGeneratedOrder ?? current.lastGeneratedOrder ?? [],
    lastAppliedOrder: settings.lastAppliedOrder ?? current.lastAppliedOrder ?? [],
    brandPriorities: settings.brandPriorities ?? current.brandPriorities ?? defaultBrandPriorities,
  };

  db.prepare(
    `INSERT INTO collection_settings (
      collection_id, collection_title, first_page_limit, brand_priority_weight, sales_weight, inventory_weight,
      new_product_boost, low_seller_penalty, randomness_weight, brand_trend_weight,
      product_type_trend_weight, color_trend_weight, selected,
      last_generated_order, last_applied_order, brand_priorities, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id) DO UPDATE SET
      collection_title = excluded.collection_title,
      first_page_limit = excluded.first_page_limit,
      brand_priority_weight = excluded.brand_priority_weight,
      sales_weight = excluded.sales_weight,
      inventory_weight = excluded.inventory_weight,
      new_product_boost = excluded.new_product_boost,
      low_seller_penalty = excluded.low_seller_penalty,
      randomness_weight = excluded.randomness_weight,
      brand_trend_weight = excluded.brand_trend_weight,
      product_type_trend_weight = excluded.product_type_trend_weight,
      color_trend_weight = excluded.color_trend_weight,
      selected = excluded.selected,
      last_generated_order = excluded.last_generated_order,
      last_applied_order = excluded.last_applied_order,
      brand_priorities = excluded.brand_priorities,
      updated_at = excluded.updated_at`,
  ).run(
    collectionId,
    collectionTitle,
    merged.firstPageLimit,
    merged.brandPriorityWeight,
    merged.salesWeight,
    merged.inventoryWeight,
    merged.newProductBoost,
    merged.lowSellerPenalty,
    merged.randomnessWeight,
    merged.brandTrendWeight,
    merged.productTypeTrendWeight,
    merged.colorTrendWeight,
    merged.selected ? 1 : 0,
    JSON.stringify(merged.lastGeneratedOrder),
    JSON.stringify(merged.lastAppliedOrder),
    JSON.stringify(merged.brandPriorities),
    now,
  );

  if (merged.selected) {
    db.prepare(
      `UPDATE collection_settings SET selected = 0 WHERE collection_id != ?`,
    ).run(collectionId);
  }

  return getCollectionSettings(collectionId);
}

export function getProductPreferences(collectionId) {
  const rows = db
    .prepare(
      `SELECT * FROM product_preferences WHERE collection_id = ?`,
    )
    .all(collectionId);

  return rows.reduce((acc, row) => {
    acc[row.product_id] = {
      allottedPosition: row.allotted_position,
      includeInRotation: Boolean(row.include_in_rotation),
      updatedAt: row.updated_at,
    };
    return acc;
  }, {});
}

export function upsertProductPreference(collectionId, productId, preference) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO product_preferences (
      collection_id, product_id, allotted_position, include_in_rotation, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, product_id) DO UPDATE SET
      allotted_position = excluded.allotted_position,
      include_in_rotation = excluded.include_in_rotation,
      updated_at = excluded.updated_at`,
  ).run(
    collectionId,
    productId,
    preference.allottedPosition ?? null,
    preference.includeInRotation ? 1 : 0,
    now,
  );
}

export function saveCollectionSnapshot(collectionId, payload) {
  db.prepare(
    `INSERT INTO collection_snapshots (collection_id, payload, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(collection_id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
  ).run(collectionId, JSON.stringify(payload), new Date().toISOString());
}

export function getCollectionSnapshot(collectionId) {
  const row = db
    .prepare(`SELECT payload FROM collection_snapshots WHERE collection_id = ?`)
    .get(collectionId);
  return row ? JSON.parse(row.payload) : null;
}

export function createBackup(collectionId, type, orderPayload) {
  db.prepare(
    `INSERT INTO order_backups (collection_id, type, order_payload, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(collectionId, type, JSON.stringify(orderPayload), new Date().toISOString());
}

export function getLatestBackup(collectionId, type = "apply") {
  const row = db
    .prepare(
      `SELECT * FROM order_backups
       WHERE collection_id = ? AND type = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(collectionId, type);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    collectionId: row.collection_id,
    type: row.type,
    order: JSON.parse(row.order_payload),
    createdAt: row.created_at,
  };
}
