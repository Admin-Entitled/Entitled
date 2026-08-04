import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./sorterApi";

const defaultFilters = {
  search: "",
  idSearch: "",
  vendor: "all",
  stock: "all",
  soldRange: "all",
  rotation: "all",
  allottedOnly: false,
  performance: "all",
  allocation: "all",
  currentRange: "all",
  status: "all",
  updatedRange: "all",
};

const emptyPreview = {
  newOrder: [],
  previewUrl: null,
};

const fallbackImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23f5f5f5' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='16' fill='%23999' text-anchor='middle' dy='.3em'%3ENo image%3C/text%3E%3C/svg%3E";

const strategyFields = [
  { key: "brandPriorityWeight", label: "Brand Priority" },
  { key: "newProductBoost", label: "New Product Boost" },
  { key: "salesWeight", label: "Sales" },
  { key: "inventoryWeight", label: "Inventory" },
  { key: "lowSellerPenalty", label: "Low Seller Penalty" },
  { key: "randomnessWeight", label: "Randomness" },
];

const strategyTotal = (strategy) => strategyFields.reduce((sum, field) => sum + Number(strategy[field.key] || 0), 0);

function formatMoney(value, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function performanceBucket(product) {
  const sold = product.soldQuantity || 0;
  if (sold >= 20) return "hot";
  if (sold >= 3) return "warm";
  return "cold";
}

function getAllocationState(product) {
  if (product.allottedPosition) return "pinned";
  if (product.includeInRotation !== false) return "eligible";
  return "hidden";
}

function matchesFilters(product, filters) {
  const matchesSearch =
    !filters.search ||
    product.title.toLowerCase().includes(filters.search.toLowerCase()) ||
    product.handle.toLowerCase().includes(filters.search.toLowerCase());
  const matchesId =
    !filters.idSearch ||
    product.id.split("/").pop().toLowerCase().includes(filters.idSearch.toLowerCase());
  const matchesVendor = filters.vendor === "all" || product.vendor === filters.vendor;
  const matchesCurrentRange =
    filters.currentRange === "all" ||
    (filters.currentRange === "page1" && product.collectionPosition <= 40) ||
    (filters.currentRange === "afterPage1" && product.collectionPosition > 40);
  const matchesStock =
    filters.stock === "all" ||
    (filters.stock === "in" && product.inventoryQuantity > 0) ||
    (filters.stock === "out" && product.inventoryQuantity <= 0);
  const matchesSold =
    filters.soldRange === "all" ||
    (filters.soldRange === "0-2" && product.soldQuantity <= 2) ||
    (filters.soldRange === "3-19" && product.soldQuantity > 2 && product.soldQuantity < 20) ||
    (filters.soldRange === "20+" && product.soldQuantity >= 20);
  const matchesRotation =
    filters.rotation === "all" ||
    (filters.rotation === "yes" && product.includeInRotation !== false) ||
    (filters.rotation === "no" && product.includeInRotation === false);
  const matchesAllotted = !filters.allottedOnly || Boolean(product.allottedPosition);
  const bucket = performanceBucket(product);
  const matchesPerformance = filters.performance === "all" || filters.performance === bucket;
  const matchesAllocation =
    filters.allocation === "all" || filters.allocation === getAllocationState(product);
  const matchesStatus = filters.status === "all" || product.status === filters.status;
  const updatedAgeDays = product.updatedAt
    ? (Date.now() - new Date(product.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;
  const matchesUpdatedRange =
    filters.updatedRange === "all" ||
    (filters.updatedRange === "7d" && updatedAgeDays <= 7) ||
    (filters.updatedRange === "30d" && updatedAgeDays <= 30) ||
    (filters.updatedRange === "older" && updatedAgeDays > 30);

  return (
    matchesSearch &&
    matchesId &&
    matchesVendor &&
    matchesCurrentRange &&
    matchesStock &&
    matchesSold &&
    matchesRotation &&
    matchesAllotted &&
    matchesPerformance &&
    matchesAllocation &&
    matchesStatus &&
    matchesUpdatedRange
  );
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

function normalize(value, max) {
  return !max || max <= 0 ? 0 : value / max;
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
    const productType = normalized.slice(prefix.length).trim();
    return {
      color: color || "Unknown",
      productType: productType || normalized || "Unknown",
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

function buildScoringContext(allProducts, settings) {
  const brandPriorities = settings.brandPriorities || {};
  return {
    maxima: {
      maxSoldQuantity: Math.max(...allProducts.map((product) => product.soldQuantity || 0), 0),
      maxInventory: Math.max(...allProducts.map((product) => product.inventoryQuantity || 0), 0),
    },
    brandPriorities,
    maxBrandPriority: Math.max(...allProducts.map((product) => brandPriorities[product.vendor] || 0), 1),
    trendScores: {
      brand: buildDimensionScores(allProducts, (product) => product.vendor || "Unknown"),
      productType: buildDimensionScores(allProducts, (product) => inferProductType(product)),
      color: buildDimensionScores(allProducts, (product) => inferColor(product)),
    },
    strategy: resolveStrategy(settings),
  };
}

function scoreProduct(product, context) {
  const salesScore = normalize(product.soldQuantity || 0, context.maxima.maxSoldQuantity);
  const inventoryScore = normalize(product.inventoryQuantity || 0, context.maxima.maxInventory);
  const newnessScore = recencyScore(product.createdAt);
  const brandVal = context.brandPriorities[product.vendor] || 0;
  const brandScore = context.maxBrandPriority > 0 ? brandVal / context.maxBrandPriority : 0;
  const brandPriorityContribution = brandVal * context.strategy.brandPriorityWeight;
  const productType = inferProductType(product);
  const color = inferColor(product);
  const brandTrendScore = context.trendScores.brand[product.vendor || "Unknown"] || 0;
  const productTypeTrendScore = context.trendScores.productType[productType] || 0;
  const colorTrendScore = context.trendScores.color[color] || 0;

  const baseBeforePenalty =
    brandPriorityContribution +
    newnessScore * context.strategy.newProductBoost +
    salesScore * context.strategy.salesWeight +
    inventoryScore * context.strategy.inventoryWeight +
    brandTrendScore * context.strategy.brandTrendWeight +
    productTypeTrendScore * context.strategy.productTypeTrendWeight +
    colorTrendScore * context.strategy.colorTrendWeight;

  const outOfStockPenalty = (product.inventoryQuantity || 0) <= 0 ? 0.1 : 1.0;
  const lowSellerFactor = (product.soldQuantity || 0) <= 2
    ? Math.max(0.25, 1 - context.strategy.lowSellerPenalty)
    : 1.0;
  const baseScore = baseBeforePenalty * outOfStockPenalty * lowSellerFactor;

  return {
    ...product,
    brandScore,
    brandPriorityContribution,
    newnessScore,
    salesScore,
    inventoryScore,
    brandTrendScore,
    productTypeTrendScore,
    colorTrendScore,
    productType,
    inferredColor: color,
    randomnessScore: product.randomnessScore || 0,
    baseScore,
    weightedScore: baseScore + (product.randomnessScore || 0),
  };
}

function calculateScore(product, allProducts, settings) {
  if (!allProducts || allProducts.length === 0) return "0.0000";
  return scoreProduct(product, buildScoringContext(allProducts, settings)).baseScore.toFixed(4);
}

export default function Sorter({ sidebarBridge }) {
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [settings, setSettings] = useState({
    firstPageLimit: 40,
    salesWeight: 0.4,
    inventoryWeight: 0.25,
    newnessWeight: 0.2,
    momentumWeight: 0.1,
    rotationWeight: 0.05,
  });
  const [strategyDraft, setStrategyDraft] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [preview, setPreview] = useState(emptyPreview);
  const [activeTab, setActiveTab] = useState("table");
  const [isStrategyEditing, setIsStrategyEditing] = useState(false);
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [reorderAllSummary, setReorderAllSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const initialCollectionsLoadedRef = useRef(false);

  const products = snapshot?.products || [];

  useEffect(() => {
    async function loadCollections() {
      try {
        const response = await api.getCollections();
        setCollections(response.collections || []);
      } catch (err) {
        setError(err.message);
      }
    }

    if (!initialCollectionsLoadedRef.current) {
      loadCollections();
      initialCollectionsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (sidebarBridge) {
      sidebarBridge.current = {
        diagnostics: {
          collectionsLoaded: collections.length,
          productsLoaded: products.length,
          selectedCollection: snapshot?.collection?.title || "None",
          selectedCollectionId: selectedCollectionId || "None",
        },
      };
    }
  }, [sidebarBridge, collections.length, products.length, snapshot, selectedCollectionId]);

  const vendorOptions = useMemo(
    () => ["all", ...new Set(products.map((product) => product.vendor).filter(Boolean))],
    [products],
  );

  const statusOptions = useMemo(
    () => ["all", ...new Set(products.map((product) => product.status).filter(Boolean))],
    [products],
  );

  const explainabilityData = preview.newOrder;

  const filteredProducts = useMemo(
    () =>
      products
        .filter((product) => matchesFilters(product, filters))
        .sort((left, right) => left.collectionPosition - right.collectionPosition),
    [products, filters],
  );

  const previewTop = preview.newOrder.slice(0, settings.firstPageLimit || 40);
  const metrics = useMemo(() => {
    const totalInventory = products.reduce((sum, product) => sum + product.inventoryQuantity, 0);
    const totalSold = products.reduce((sum, product) => sum + product.soldQuantity, 0);
    const totalRevenue = products.reduce((sum, product) => sum + product.salesRevenue, 0);
    return { totalInventory, totalSold, totalRevenue };
  }, [products]);

  const handleCollectionSelect = useCallback(async (collectionId) => {
    if (!collectionId) {
      setSelectedCollectionId("");
      setSnapshot(null);
      return;
    }

    setSelectedCollectionId(collectionId);
    setLoading(true);
    setError("");

    try {
      const response = await api.getCollectionSnapshot(collectionId);
      setSnapshot(response.snapshot || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
  }, []);

  const handleSync = useCallback(async () => {
    if (!selectedCollectionId) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.syncCollection(selectedCollectionId);
      setSnapshot(response.snapshot || null);
      setMessage("Synced successfully");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCollectionId]);

  const handleGenerate = useCallback(async () => {
    if (!snapshot) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.generateOrder(selectedCollectionId, settings);
      setPreview({
        newOrder: response.newOrder || [],
        previewUrl: response.previewUrl || null,
      });
      setMessage("Generated order");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [snapshot, selectedCollectionId, settings]);

  const handleApply = useCallback(async () => {
    if (!preview.newOrder.length) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.applyOrder(selectedCollectionId, preview.newOrder);
      const updated = await api.getCollectionSnapshot(selectedCollectionId);
      setSnapshot(updated.snapshot || null);
      setBackup({ createdAt: new Date().toISOString(), products: snapshot.products });
      setPreview(emptyPreview);
      setMessage("Applied order to Shopify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [preview.newOrder, selectedCollectionId, snapshot]);

  const handleRollback = useCallback(async () => {
    if (!backup) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.applyOrder(
        selectedCollectionId,
        backup.products.map((p) => p.id),
      );
      const updated = await api.getCollectionSnapshot(selectedCollectionId);
      setSnapshot(updated.snapshot || null);
      setBackup(null);
      setMessage("Rolled back to backup");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [backup, selectedCollectionId]);

  const handleReorderAllLive = useCallback(async () => {
    setIsSyncingAll(true);
    setError("");
    setMessage("");
    setReorderAllSummary(null);

    try {
      const response = await api.reorderAllCollections();
      setReorderAllSummary(response);
      if (response.failures && response.failures.length > 0) {
        setError(`Some collections failed: ${response.failures.join(", ")}`);
      } else {
        setMessage("All collections updated successfully");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncingAll(false);
    }
  }, []);

  const updateProductAllocation = useCallback(
    async (productId, state) => {
      if (!snapshot) return;

      let allottedPosition = null;
      let includeInRotation = 1;

      if (state === "pinned") {
        const existing = products.filter((p) => p.allottedPosition && p.allottedPosition > 0);
        allottedPosition = existing.length + 1;
        includeInRotation = 1;
      } else if (state === "eligible") {
        allottedPosition = null;
        includeInRotation = 1;
      } else if (state === "hidden") {
        allottedPosition = null;
        includeInRotation = 0;
      }

      const updatedProducts = snapshot.products.map((product) =>
        product.id === productId
          ? { ...product, allottedPosition, includeInRotation: Boolean(includeInRotation) }
          : product,
      );

      setSnapshot({ ...snapshot, products: updatedProducts });

      try {
        await api.updateProduct(selectedCollectionId, productId, {
          allottedPosition,
          includeInRotation: Boolean(includeInRotation),
        });
      } catch (err) {
        setError(err.message);
      }
    },
    [snapshot, selectedCollectionId, products],
  );

  return (
    <main className="dashboard" aria-busy={loading || undefined}>
      <section className="topbar panel">
        <div className="topbar-header">
          <div>
            <p className="eyebrow">Shopify</p>
            <h2>Manual collection control with daily smart rotation</h2>
          </div>
          <div className="action-row">
            <button className="button ghost" onClick={handleSync} disabled={loading}>
              Sync Live Data
            </button>
            <button className="button accent" onClick={handleGenerate} disabled={loading || !snapshot}>
              Generate Today&apos;s Order
            </button>
            <button type="button" className="button metal" onClick={handleReorderAllLive} disabled={isSyncingAll}>
              Update All Collections
            </button>
            <button
              className="button metal"
              onClick={handleApply}
              disabled={loading || !preview.newOrder.length}
            >
              Apply Order to Shopify
            </button>
            <button className="button ghost" onClick={handleRollback} disabled={loading || !backup}>
              Rollback Last Backup
            </button>
          </div>
        </div>

        {reorderAllSummary?.failures?.length > 0 && (
          <p className="error-text">
            Failed: {reorderAllSummary.results
              .filter((result) => result.status === "failed")
              .map((result) => `${result.collectionTitle} — ${result.error}`)
              .join("; ")}
          </p>
        )}

        <div className="toolbar-grid">
          <label>
            Collection
            <select
              value={selectedCollectionId}
              onChange={(event) => handleCollectionSelect(event.target.value)}
            >
              <option value="">Select collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title} ({collection.type})
                </option>
              ))}
            </select>
          </label>

          <label>
            First Page Limit
            <input
              type="number"
              min="1"
              value={settings.firstPageLimit}
              onChange={(event) =>
                saveSettings({
                  ...settings,
                  firstPageLimit: Number(event.target.value || 40),
                })
              }
            />
          </label>

          <label>
            Search
            <input
              type="text"
              placeholder="Product or handle"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </label>

          <label>
            Vendor
            <select
              value={filters.vendor}
              onChange={(event) => setFilters({ ...filters, vendor: event.target.value })}
            >
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor === "all" ? "All vendors" : vendor}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="status-row">
          <span className="status-chip">{snapshot?.collection?.sortOrder || "Not synced"}</span>
          {snapshot?.syncedAt ? <span className="muted">Last sync: {formatDate(snapshot.syncedAt)}</span> : null}
          {backup?.createdAt ? <span className="muted">Backup: {formatDate(backup.createdAt)}</span> : null}
          {message ? <span className="success-text" role="status">{message}</span> : null}
          {error ? <span className="error-text" role="alert">{error}</span> : null}
        </div>
      </section>

      <section className="table-wrapper panel">
        <table className="product-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Product</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Stock</th>
              <th>Sold</th>
              <th>Revenue</th>
              <th>Allocation</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id}>
                <td>{product.collectionPosition}</td>
                <td>
                  <img
                    src={product.image || fallbackImage}
                    alt=""
                    style={{ width: 40, height: 40, objectFit: "cover" }}
                  />
                  {product.title}
                </td>
                <td>{product.vendor}</td>
                <td>{product.status}</td>
                <td>{product.inventoryQuantity}</td>
                <td>{product.soldQuantity}</td>
                <td>{formatMoney(product.salesRevenue || 0)}</td>
                <td>
                  <select
                    value={getAllocationState(product)}
                    onChange={(event) => updateProductAllocation(product.id, event.target.value)}
                  >
                    <option value="pinned">Pinned</option>
                    <option value="eligible">Eligible</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
