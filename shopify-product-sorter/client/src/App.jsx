import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import OrderMapping from "./OrderMapping";
import SkuImageManager from "./SkuImageManager";

const sidebarModules = [
  { id: "sorter", label: "Shopify Collection Manager", enabled: true },
  { id: "order-mapping", label: "Order Mapping", enabled: true },
  { id: "sku-image-manager", label: "SKU Image Manager", enabled: true },
  { id: "meta-ads", label: "Meta Ads Dashboard", enabled: false },
  { id: "analytics", label: "Product Analytics", enabled: false },
  { id: "inventory", label: "Inventory", enabled: false },
  { id: "reports", label: "Reports", enabled: false },
  { id: "settings", label: "Settings", enabled: false },
];

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
  oldOrder: [],
  newOrder: [],
  affectedCount: 0,
};

const fallbackImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="72" viewBox="0 0 60 72">
      <rect width="60" height="72" rx="14" fill="#17181B"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#F2ECE2" font-family="sans-serif" font-size="14">EC</text>
    </svg>
  `);

const strategyFields = [
  { key: "salesWeight", label: "Sales performance", step: "0.01" },
  { key: "inventoryWeight", label: "Inventory health", step: "0.01" },
  { key: "newnessWeight", label: "Newness", step: "0.01" },
  { key: "momentumWeight", label: "Sales momentum", step: "0.01" },
  { key: "rotationWeight", label: "Controlled rotation", step: "0.01" },
];

const strategyTotal = (strategy) => strategyFields.reduce((sum, field) => sum + Number(strategy[field.key] || 0), 0);

function formatMoney(value, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function performanceBucket(product) {
  if (product.soldQuantity >= 20) {
    return "bestseller";
  }
  if (product.soldQuantity <= 2) {
    return "low";
  }
  return "mid";
}

function getAllocationState(product) {
  if (product.allottedPosition) {
    return "pinned";
  }
  return product.includeInRotation === false ? "hidden" : "eligible";
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

export default function App() {
  const [activeModule, setActiveModule] = useState("sorter");
  // 1. useState declarations
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
  const [activeTab, setActiveTab] = useState("table"); // "table" or "explainability"
  const [isStrategyEditing, setIsStrategyEditing] = useState(false);
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [reorderAllSummary, setReorderAllSummary] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [networkLogs, setNetworkLogs] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [logsError, setLogsError] = useState("");
  const initialCollectionsLoadedRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState({
    collectionsLoaded: 0,
    productsLoaded: 0,
    selectedCollection: "None",
    selectedCollectionId: "None",
    lastApiCall: "None",
    lastApiPayload: "None",
    lastApiStatus: "idle",
    lastApiTimestamp: null,
    logs: [],
  });
  const [skuSidebarState, setSkuSidebarState] = useState({
    diagnostics: {
      activeModule: "SKU Image Manager",
      loadedSkuRows: 0,
      uniqueParentProducts: 0,
      selectedProducts: 0,
      currentEditingProduct: "None",
      currentEditingSku: "None",
      currentImageCount: 0,
      lastSkuApiAction: "None",
      lastShopifyMediaAction: "None",
      lastActionStatus: "idle",
      lastError: "None",
      requiredScopesStatus: "Unknown",
      lastRefreshTime: null,
      bulkModeOpen: false,
      actionRunning: false,
    },
    logs: [],
  });
  const [actualSalesSidebarState, setActualSalesSidebarState] = useState({
    diagnostics: {
      activeModule: "Order Mapping",
      loadedOrders: "Not synced",
      ordersWithAwb: "Unknown",
      matchedOrders: "Unknown",
      unmatchedShiprocketOrders: "Unknown",
      historicalOrders: "Unknown",
      deliveredOrders: "Unknown",
      rtoOrders: "Unknown",
      activeOrders: "Unknown",
      pendingOrders: "Unknown",
      shiprocketStatus: "Not synced",
      lastRefreshTime: null,
      lastActionStatus: "idle",
      lastError: "None",
    },
    logs: [],
  });
  const [orderMappingLogTab, setOrderMappingLogTab] = useState("activity");

  // 2. Derived variables
  const products = snapshot?.products || [];

  // 3. useMemo declarations
  const pinnedProducts = useMemo(() => {
    return products
      .filter((p) => p.allottedPosition && p.allottedPosition > 0)
      .sort((a, b) => a.allottedPosition - b.allottedPosition);
  }, [products]);

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

  // 4. Helper functions
function logDiagnostic(message, type = "info", payload = null) {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(formatted);
  if (payload) {
    console.log("Payload:", payload);
  }
  setDiagnostics((prev) => ({
    ...prev,
    lastApiPayload: payload ? JSON.stringify(payload) : prev.lastApiPayload,
  }));
}

async function refreshSorterLogs() {
  try {
    const [actionResult, networkResult] = await Promise.all([
      api.getActionLogs({ limit: 30 }),
      api.getNetworkLogs({ limit: 30 }),
    ]);
    setActionLogs(actionResult.logs || []);
    setNetworkLogs(networkResult.logs || []);
    setLogsError("");
  } catch (loadLogsError) {
    setLogsError(loadLogsError.message);
  }
}

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData("text/plain", index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetIndex) => {
    const sourceIndex = Number(e.dataTransfer.getData("text/plain"));
    reorderPinned(sourceIndex, targetIndex);
  };

  async function reorderPinned(sourceIndex, targetIndex) {
    const pinned = products
      .filter((p) => p.allottedPosition && p.allottedPosition > 0)
      .sort((a, b) => a.allottedPosition - b.allottedPosition);
    
    if (sourceIndex < 0 || sourceIndex >= pinned.length || targetIndex < 0 || targetIndex >= pinned.length) {
      return;
    }
    
    const item = pinned[sourceIndex];
    const newPinned = [...pinned];
    newPinned.splice(sourceIndex, 1);
    newPinned.splice(targetIndex, 0, item);
    
    const updatedProducts = snapshot.products.map(p => {
      const pinIdx = newPinned.findIndex(np => np.id === p.id);
      if (pinIdx !== -1) {
        return { ...p, allottedPosition: pinIdx + 1 };
      }
      return p;
    });
    
    setSnapshot({ ...snapshot, products: updatedProducts });
    
    logDiagnostic("Reordering pinned products...", "info", { sourceIndex, targetIndex });
    try {
      await Promise.all(
        newPinned.map((p, idx) => 
          api.updateProduct(selectedCollectionId, p.id, {
            allottedPosition: idx + 1,
            includeInRotation: p.includeInRotation
          })
        )
      );
      logDiagnostic("Reordered pinned products successfully", "success");
    } catch (err) {
      setError(err.message);
      logDiagnostic(`Failed to save pinned reorder: ${err.message}`, "error");
    }
  }

  async function updateProductAllocation(productId, state, customPos = null) {
    if (!snapshot) {
      return;
    }

    let allottedPosition = null;
    let includeInRotation = 1;

    if (state === "pinned") {
      allottedPosition = customPos;
      includeInRotation = 1;
    } else if (state === "eligible") {
      allottedPosition = null;
      includeInRotation = 1;
    } else if (state === "hidden") {
      allottedPosition = null;
      includeInRotation = 0;
    }

    let updatedProducts = snapshot.products.map((product) =>
      product.id === productId ? { ...product, allottedPosition, includeInRotation: Boolean(includeInRotation) } : product,
    );

    if (state !== "pinned") {
      const remainingPinned = updatedProducts
        .filter((p) => p.allottedPosition && p.id !== productId)
        .sort((a, b) => a.allottedPosition - b.allottedPosition);
      
      updatedProducts = updatedProducts.map((p) => {
        const pinIdx = remainingPinned.findIndex(rp => rp.id === p.id);
        if (pinIdx !== -1) {
          return { ...p, allottedPosition: pinIdx + 1 };
        }
        if (p.id === productId) {
          return { ...p, allottedPosition: null };
        }
        return p;
      });

      try {
        await Promise.all(
          remainingPinned.map((p, idx) => 
            api.updateProduct(selectedCollectionId, p.id, {
              allottedPosition: idx + 1,
              includeInRotation: p.includeInRotation
            })
          )
        );
      } catch (err) {
        logDiagnostic(`Failed to re-index remaining pinned products: ${err.message}`, "warning");
      }
    }

    setSnapshot({ ...snapshot, products: updatedProducts });

    logDiagnostic(`Updating product allocation: ${state}`, "network", { collectionId: selectedCollectionId, productId, allottedPosition, includeInRotation });
    try {
      await api.updateProduct(selectedCollectionId, productId, {
        allottedPosition,
        includeInRotation: Boolean(includeInRotation),
      });
      logDiagnostic(`Product allocation updated successfully`, "success");
    } catch (saveError) {
      setError(saveError.message);
      logDiagnostic(`Failed to save allocation: ${saveError.message}`, "error");
    }
  }

  async function clearPinnedProducts() {
    if (!snapshot) {
      return;
    }

    const pinned = snapshot.products.filter((product) => product.allottedPosition && product.allottedPosition > 0);
    if (!pinned.length) {
      return;
    }

    const updatedProducts = snapshot.products.map((product) =>
      product.allottedPosition
        ? { ...product, allottedPosition: null, includeInRotation: true }
        : product,
    );

    setSnapshot({ ...snapshot, products: updatedProducts });
    logDiagnostic("Clearing all pinned products...", "network", { collectionId: selectedCollectionId, count: pinned.length });

    try {
      await Promise.all(
        pinned.map((product) =>
          api.updateProduct(selectedCollectionId, product.id, {
            allottedPosition: null,
            includeInRotation: true,
          }),
        ),
      );
      logDiagnostic(`Cleared ${pinned.length} pinned products`, "success");
    } catch (clearError) {
      setError(clearError.message);
      logDiagnostic(`Failed to clear pinned products: ${clearError.message}`, "error");
    }
  }

useEffect(() => {
  if (initialCollectionsLoadedRef.current) {
    return;
  }
  initialCollectionsLoadedRef.current = true;
  loadCollections();
  refreshSorterLogs();
}, []);

useEffect(() => {
  if (!selectedCollectionId) {
    return;
  }
  loadState(selectedCollectionId);
}, [selectedCollectionId]);

useEffect(() => {
  if (activeModule !== "sorter") {
    return;
  }

  const interval = window.setInterval(() => {
    refreshSorterLogs();
  }, 4000);

  return () => {
    window.clearInterval(interval);
  };
}, [activeModule]);

  async function handleCollectionSelect(collectionId) {
    setSelectedCollectionId(collectionId);
    const collection = collections.find((item) => item.id === collectionId);
    if (!collectionId || !collection) {
      return;
    }

    logDiagnostic(`Selecting collection: "${collection.title}"`, "info");
    try {
      await api.updateSettings(collectionId, {
        collectionTitle: collection.title,
        selected: true,
      });
    } catch (saveError) {
      setError(saveError.message);
      logDiagnostic(`Failed to save selected collection setting: ${saveError.message}`, "error");
    }
  }

  async function loadCollections() {
    logDiagnostic("Fetching collections: GET /api/collections", "network");
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "GET /api/collections",
      lastApiPayload: "None",
      lastApiStatus: "loading",
    }));
    try {
      setLoading(true);
      setError("");
      const result = await api.getCollections();
      setCollections(result.collections);
      
      logDiagnostic(`Collections fetched: ${result.collections.length}`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        collectionsLoaded: result.collections.length,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));

      const selected =
        result.collections.find((item) => item.settings?.selected)?.id || result.collections[0]?.id || "";
      setSelectedCollectionId(selected);
    } catch (loadError) {
      setError(loadError.message);
      logDiagnostic(`Failed to fetch collections: ${loadError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function loadState(collectionId) {
    const collection = collections.find((c) => c.id === collectionId);
    const collectionTitle = collection ? collection.title : collectionId;
    
    logDiagnostic(`Fetching products: GET /api/collection-products`, "network", { collectionId });
    setDiagnostics((prev) => ({
      ...prev,
      selectedCollection: collectionTitle,
      selectedCollectionId: collectionId,
      lastApiCall: `GET /api/collection-products`,
      lastApiStatus: "loading",
    }));

    try {
      setLoading(true);
      setError("");
      
      const [productsResult, stateResult] = await Promise.all([
        api.getProducts(collectionId),
        api.getState(collectionId).catch((err) => {
          logDiagnostic(`Failed to get collection state cache: ${err.message}`, "warning");
          return { settings: null, backup: null };
        }),
      ]);

      const stateProducts = stateResult.snapshot?.products;
      setSnapshot({
        collection: productsResult.collection,
        products: stateProducts || productsResult.products.map((product) => ({
          ...product,
          allottedPosition: null,
          includeInRotation: true,
        })),
        syncedAt: stateResult.snapshot?.syncedAt || new Date().toISOString(),
      });
      setBackup(stateResult.backup);
      
      if (stateResult.settings) {
        setSettings({
          firstPageLimit: stateResult.settings.firstPageLimit || 40,
          salesWeight: stateResult.settings.salesWeight ?? 0.4,
          inventoryWeight: stateResult.settings.inventoryWeight ?? 0.25,
          newnessWeight: stateResult.settings.newnessWeight ?? 0.2,
          momentumWeight: stateResult.settings.momentumWeight ?? 0.1,
          rotationWeight: stateResult.settings.rotationWeight ?? 0.05,
        });
      }
      setPreview(emptyPreview);
      
      logDiagnostic(`Fetched ${productsResult.products.length} products for collection "${collectionTitle}"`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        productsLoaded: productsResult.products.length,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } catch (loadError) {
      setError(loadError.message);
      logDiagnostic(`Failed to load collection products/state: ${loadError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    logDiagnostic("Sync live data initiated...", "info");
    try {
      setLoading(true);
      setError("");
      setMessage("");

      // 1. Fetch live collections automatically
      logDiagnostic("Fetching collections: GET /api/collections", "network");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiCall: "GET /api/collections",
        lastApiPayload: "None",
        lastApiStatus: "loading",
      }));
      const collectionsResult = await api.getCollections();
      setCollections(collectionsResult.collections);
      logDiagnostic(`Collections fetched: ${collectionsResult.collections.length}`, "success");
      setDiagnostics((prev) => ({ ...prev, collectionsLoaded: collectionsResult.collections.length }));

      // 2. Determine which collection to sync
      let collectionIdToSync = selectedCollectionId;
      if (!collectionIdToSync && collectionsResult.collections?.length > 0) {
        collectionIdToSync = collectionsResult.collections[0].id;
        setSelectedCollectionId(collectionIdToSync);
      }

      if (collectionIdToSync) {
        // 3. Sync the collection
        logDiagnostic(`Syncing collection: POST /api/collections/sync`, "network", { collectionId: collectionIdToSync });
        setDiagnostics((prev) => ({
          ...prev,
          lastApiCall: "POST /api/collections/sync",
          lastApiStatus: "loading",
        }));
        const syncResult = await api.syncCollection(collectionIdToSync);
        setSnapshot(syncResult.snapshot);
        setSettings({
          firstPageLimit: syncResult.settings.firstPageLimit,
          salesWeight: syncResult.settings.salesWeight ?? 0.4,
          inventoryWeight: syncResult.settings.inventoryWeight ?? 0.25,
          newnessWeight: syncResult.settings.newnessWeight ?? 0.2,
          momentumWeight: syncResult.settings.momentumWeight ?? 0.1,
          rotationWeight: syncResult.settings.rotationWeight ?? 0.05,
        });
        setPreview(emptyPreview);
        setMessage("Live collections loaded and selected collection synced.");
        logDiagnostic(`Collection synced successfully: ${syncResult.snapshot?.products?.length || 0} products`, "success");
        setDiagnostics((prev) => ({
          ...prev,
          productsLoaded: syncResult.snapshot?.products?.length || 0,
          lastApiStatus: "success",
          lastApiTimestamp: new Date().toLocaleTimeString(),
        }));
      } else {
        setMessage("Live collections loaded. No collections available to sync.");
        setDiagnostics((prev) => ({
          ...prev,
          lastApiStatus: "success",
          lastApiTimestamp: new Date().toLocaleTimeString(),
        }));
      }
    } catch (syncError) {
      setError(syncError.message);
      logDiagnostic(`Sync failed: ${syncError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(nextSettings) {
    setSettings(nextSettings);
    if (!selectedCollectionId) {
      return;
    }

    logDiagnostic(`Updating settings: PUT /api/collections/settings`, "network", { collectionId: selectedCollectionId, ...nextSettings });
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "PUT /api/collections/settings",
      lastApiStatus: "loading",
    }));
    try {
      await api.updateSettings(selectedCollectionId, nextSettings);
      logDiagnostic("Settings updated successfully", "success");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } catch (saveError) {
      setError(saveError.message);
      logDiagnostic(`Failed to update settings: ${saveError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    }
  }

  async function updateProduct(productId, changes) {
    if (!snapshot) {
      return;
    }

    const products = snapshot.products.map((product) =>
      product.id === productId ? { ...product, ...changes } : product,
    );
    setSnapshot({ ...snapshot, products });

    logDiagnostic(`Updating product: PUT /api/collections/products/preference`, "network", { collectionId: selectedCollectionId, productId, ...changes });
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "PUT /api/collections/products/preference",
      lastApiStatus: "loading",
    }));
    try {
      await api.updateProduct(selectedCollectionId, productId, changes);
      logDiagnostic(`Product ${productId.split("/").pop()} updated successfully`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } catch (saveError) {
      setError(saveError.message);
      logDiagnostic(`Failed to update product: ${saveError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    }
  }

  async function handleGenerate() {
    if (!selectedCollectionId) {
      return;
    }

    logDiagnostic(`Generating order: POST /api/collections/generate`, "network", { collectionId: selectedCollectionId, settings });
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "POST /api/collections/generate",
      lastApiStatus: "loading",
    }));
    try {
      setLoading(true);
      setError("");
      const result = await api.generateOrder(selectedCollectionId, settings);
      setPreview(result);
      setMessage(`Generated order with ${result.affectedCount} affected products.`);
      logDiagnostic(`Generated order successfully: ${result.affectedCount} affected products`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } catch (generateError) {
      setError(generateError.message);
      logDiagnostic(`Failed to generate order: ${generateError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview.newOrder.length) {
      return;
    }

    const confirmed = window.confirm(
      `Apply the new collection order to Shopify?\nAffected products: ${preview.affectedCount}`,
    );
    if (!confirmed) {
      return;
    }

    const orderIds = preview.newOrder.map((product) => product.id);
    logDiagnostic(`Applying order: POST /api/collections/apply`, "network", { collectionId: selectedCollectionId, orderIds });
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "POST /api/collections/apply",
      lastApiStatus: "loading",
    }));
    try {
      setLoading(true);
      setError("");
      setMessage("Updating Shopify — waiting for the reorder job and final verification…");
      const result = await api.applyOrder(selectedCollectionId, orderIds);
      setBackup(result.backup);
      setMessage(result.affectedCount ? `Synced after Shopify verification. ${result.affectedCount} products moved.` : "No Changes Required — Shopify order was verified.");
      logDiagnostic(`Order applied successfully: ${result.affectedCount} products moved`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
      await loadState(selectedCollectionId);
    } catch (applyError) {
      setError(applyError.message);
      logDiagnostic(`Failed to apply order: ${applyError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function handleReorderAll() {
    if (loading || !window.confirm("Apply the existing sorting strategy to every eligible collection?")) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      setReorderAllSummary(null);
      setMessage("Updating all eligible collections…");
      const result = await api.reorderAllCollections();
      setReorderAllSummary(result);
      setMessage(`Checked ${result.checked} collections: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed. ${result.productsRepositioned} products repositioned.`);
      await loadCollections();
    } catch (reorderError) {
      setError(reorderError.message);
    } finally {
      setLoading(false);
    }
  }

async function handleReorderAllLive() {
  if (
    isSyncingAll ||
    !window.confirm("Apply existing sorting strategy to every eligible collection?")
  ) {
    return;
  }

  try {
    setIsSyncingAll(true);
    setError("");
    setReorderAllSummary(null);
    setMessage("Updating all eligible collections…");
    const result = await api.reorderAllCollections();
    setReorderAllSummary(result);
    setMessage(
      `Processed ${result.totalCollections} collections: ${result.succeeded} verified, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.failed} failed.`,
    );
    await Promise.all([loadCollections(), refreshSorterLogs()]);
  } catch (reorderError) {
    setError(reorderError.message);
  } finally {
    setIsSyncingAll(false);
  }
}

async function handleRollback() {
    const confirmed = window.confirm("Rollback to the last saved backup?");
    if (!confirmed) {
      return;
    }

    logDiagnostic(`Rolling back order: POST /api/collections/rollback`, "network", { collectionId: selectedCollectionId });
    setDiagnostics((prev) => ({
      ...prev,
      lastApiCall: "POST /api/collections/rollback",
      lastApiStatus: "loading",
    }));
    try {
      setLoading(true);
      setError("");
      const result = await api.rollback(selectedCollectionId);
      setMessage(`Rollback ${result.rollback}. ${result.affectedCount} products restored.`);
      logDiagnostic(`Rollback completed: ${result.affectedCount} products restored`, "success");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "success",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
      await loadState(selectedCollectionId);
    } catch (rollbackError) {
      setError(rollbackError.message);
      logDiagnostic(`Rollback failed: ${rollbackError.message}`, "error");
      setDiagnostics((prev) => ({
        ...prev,
        lastApiStatus: "error",
        lastApiTimestamp: new Date().toLocaleTimeString(),
      }));
    } finally {
      setLoading(false);
    }
  }

function clearCurrentLogs() {
  if (activeModule === "sku-image-manager") {
    setSkuSidebarState((prev) => ({ ...prev, logs: [] }));
    return;
  }

  if (activeModule === "order-mapping") {
    setActualSalesSidebarState((prev) => ({ ...prev, logs: [] }));
    return;
  }

  setActionLogs([]);
  setNetworkLogs([]);
}

  function pushSkuLog(entry) {
    setSkuSidebarState((prev) => ({
      ...prev,
      logs: [entry, ...prev.logs].slice(0, 80),
    }));
  }

  function updateSkuDiagnostics(patch) {
    setSkuSidebarState((prev) => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        ...patch,
      },
    }));
  }

  const replaceActualSalesLogs = useCallback((entries) => {
    setActualSalesSidebarState((prev) => ({
      ...prev,
      logs: Array.isArray(entries) ? entries.slice(0, 40) : [],
    }));
  }, []);

  const updateActualSalesDiagnostics = useCallback((patch) => {
    setActualSalesSidebarState((prev) => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        ...patch,
      },
    }));
  }, []);

  const orderMappingSidebarBridge = useMemo(
    () => ({
      updateDiagnostics: updateActualSalesDiagnostics,
      replaceLogs: replaceActualSalesLogs,
    }),
    [replaceActualSalesLogs, updateActualSalesDiagnostics],
  );

  const currentLogs =
    activeModule === "sku-image-manager"
      ? skuSidebarState.logs
      : activeModule === "order-mapping"
        ? actualSalesSidebarState.logs
        : [...actionLogs, ...networkLogs]
            .sort((left, right) => {
              const leftTime = new Date(left.timestamp || left.startedAt || 0).getTime();
              const rightTime = new Date(right.timestamp || right.startedAt || 0).getTime();
              return rightTime - leftTime;
            })
            .map((log) =>
              log.actionType
                ? {
                    timestamp: log.timestamp,
                    status: log.status,
                    module: "activity",
                    actionType: log.actionType,
                    message: log.actionLabel,
                    endpoint: log.collectionTitle || "",
                    error: log.errorMessage || "",
                  }
                : {
                    timestamp: log.startedAt,
                    status: log.status,
                    module: "network",
                    actionType: log.operationName,
                    message: log.collectionTitle || log.endpoint || "",
                    endpoint: log.endpoint || "",
                    error: log.errorMessage || "",
                  },
            )
            .slice(0, 40);
  const visibleLogs =
    activeModule === "order-mapping"
      ? currentLogs.filter((log) =>
          orderMappingLogTab === "activity" ? log.module === "activity" : log.module !== "activity",
        )
      : currentLogs;



  return (
    <div className="app-shell">
      <aside className={`sidebar ${activeModule === "order-mapping" ? "sidebar--order-mapping" : ""}`}>
        <div>
          <p className="eyebrow">Entitled Club</p>
          <h1>Collection Placement Manager</h1>
        </div>

        <nav className="sidebar-nav">
          {sidebarModules.map((item) => (
            <button
              className={`nav-item ${activeModule === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              disabled={!item.enabled}
              onClick={() => item.enabled && setActiveModule(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="diagnostic-panel">
          <h4 className="diagnostic-title">System Diagnostics</h4>
          <div className="diagnostic-stats">
            {activeModule === "sku-image-manager" ? (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Module:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.activeModule}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Loaded SKUs:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.loadedSkuRows}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Unique Products:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.uniqueParentProducts}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Selected:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.selectedProducts}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Editing Product:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.currentEditingProduct}>
                    {skuSidebarState.diagnostics.currentEditingProduct}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Editing SKU:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.currentEditingSku}>
                    {skuSidebarState.diagnostics.currentEditingSku}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Images:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.currentImageCount}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Action:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastSkuApiAction}>
                    {skuSidebarState.diagnostics.lastSkuApiAction}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Media Action:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastShopifyMediaAction}>
                    {skuSidebarState.diagnostics.lastShopifyMediaAction}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Status:</span>
                  <span className={`diagnostic-value status-${skuSidebarState.diagnostics.lastActionStatus}`}>
                    {skuSidebarState.diagnostics.lastActionStatus.toUpperCase()}
                    {skuSidebarState.diagnostics.lastRefreshTime ? ` (${skuSidebarState.diagnostics.lastRefreshTime})` : ""}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Error:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastError}>
                    {skuSidebarState.diagnostics.lastError}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Scopes:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.requiredScopesStatus}>
                    {skuSidebarState.diagnostics.requiredScopesStatus}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Bulk Mode:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.bulkModeOpen ? "Open" : "Closed"}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Running:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.actionRunning ? "Yes" : "No"}</span>
                </div>
              </>
            ) : activeModule === "order-mapping" ? (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Module:</span>
                  <span className="diagnostic-value">{actualSalesSidebarState.diagnostics.activeModule}</span>
                </div>
<div className="diagnostic-item">
<span className="diagnostic-label">Total orders:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.loadedOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Orders with AWB:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.ordersWithAwb}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Shiprocket matched:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.matchedOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Delivered:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.deliveredOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">RTO delivered:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.rtoOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Pending tracking:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.pendingOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Historical courier:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.historicalOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Shiprocket unmatched:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.unmatchedShiprocketOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Active shipments:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.activeOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Current state:</span>
<span className="diagnostic-value text-truncate" title={actualSalesSidebarState.diagnostics.shiprocketStatus}>
{actualSalesSidebarState.diagnostics.shiprocketStatus}
</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Last sync:</span>
<span className={`diagnostic-value status-${actualSalesSidebarState.diagnostics.lastActionStatus}`}>
{actualSalesSidebarState.diagnostics.lastActionStatus.toUpperCase()}
{actualSalesSidebarState.diagnostics.lastRefreshTime ? ` (${actualSalesSidebarState.diagnostics.lastRefreshTime})` : ""}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Error:</span>
                  <span className="diagnostic-value text-truncate" title={actualSalesSidebarState.diagnostics.lastError}>
                    {actualSalesSidebarState.diagnostics.lastError}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Collections:</span>
                  <span className="diagnostic-value">{diagnostics.collectionsLoaded} loaded</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Products:</span>
                  <span className="diagnostic-value">{diagnostics.productsLoaded} loaded</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Selected:</span>
                  <span className="diagnostic-value text-truncate" title={diagnostics.selectedCollection}>
                    {diagnostics.selectedCollection}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last API:</span>
                  <span className="diagnostic-value text-truncate" title={diagnostics.lastApiCall}>
                    {diagnostics.lastApiCall}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Status:</span>
                  <span className={`diagnostic-value status-${diagnostics.lastApiStatus}`}>
                    {diagnostics.lastApiStatus.toUpperCase()}
                    {diagnostics.lastApiTimestamp ? ` (${diagnostics.lastApiTimestamp})` : ""}
                  </span>
                </div>
              </>
            )}
          </div>
<div className="diagnostic-logs-container">
<div className="diagnostic-logs-header">
<span className="diagnostic-label">{activeModule === "order-mapping" ? "System diagnostics logs:" : "Network & Action Logs:"}</span>
<div className="diagnostic-logs-actions">
{activeModule === "order-mapping" ? (
<div className="diagnostic-tab-group" role="tablist" aria-label="Order Mapping logs">
<button type="button" className={`diagnostic-tab ${orderMappingLogTab === "activity" ? "active" : ""}`} onClick={() => setOrderMappingLogTab("activity")}>
Activity
</button>
<button type="button" className={`diagnostic-tab ${orderMappingLogTab === "network" ? "active" : ""}`} onClick={() => setOrderMappingLogTab("network")}>
Network
</button>
</div>
) : null}
<button type="button" className="diagnostic-clear-button" onClick={clearCurrentLogs}>
Clear Logs
</button>
</div>
</div>
<div className="diagnostic-logs">
{activeModule === "sorter" && logsError ? (
<div className="error-text">{logsError}</div>
) : null}
{visibleLogs.length === 0 ? (
<div className="diagnostic-log-empty">{activeModule === "order-mapping" ? "No diagnostics logged." : "No activity logged."}</div>
) : (
 visibleLogs.map((log, index) => (
                  typeof log === "string" ? (
                    <div key={index} className="diagnostic-log-line">{log}</div>
                  ) : (
                    <div
                      key={`${log.timestamp}-${index}`}
                      className="diagnostic-log-entry"
                      title={`${log.endpoint || ""} ${log.message || ""} ${log.error || ""}`.trim()}
                    >
                      <div className="diagnostic-log-top">
                        <span className="diagnostic-log-time">{log.timestamp}</span>
                        <span className={`diagnostic-badge status-${String(log.status || "idle").toLowerCase().replace(/\s+/g, "-")}`}>
                          {log.status}
                        </span>
                      </div>
                      <div className="diagnostic-log-line">[{log.module}] {log.actionType}</div>
                      <div className="diagnostic-log-line">{log.message}</div>
                    </div>
                  )
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {activeModule === "sorter" ? (
      <main className="dashboard">
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

        <section className="metrics-grid">
          <article className="panel metric-card">
            <span className="metric-label">Active products</span>
            <strong>{products.length}</strong>
          </article>
          <article className="panel metric-card">
            <span className="metric-label">Total inventory</span>
            <strong>{metrics.totalInventory}</strong>
          </article>
          <article className="panel metric-card">
            <span className="metric-label">Sold quantity</span>
            <strong>{metrics.totalSold}</strong>
          </article>
          <article className="panel metric-card">
            <span className="metric-label">Sales revenue</span>
            <strong>{formatMoney(metrics.totalRevenue, products[0]?.currencyCode || "USD")}</strong>
          </article>
        </section>

        <section className="content-grid">
          <div className="panel controls-panel">
            <div className="section-heading">
              <h3>Smart sorter controls</h3>
              <p>Pinned products stay fixed. Remaining products use one deterministic daily strategy.</p>
            </div>

            <div className="ranking-weights-info">
              <div className="section-heading section-heading-inline">
                <h4>Active Merchandising Strategy</h4>
                <button
                  type="button"
                  className={`button ${isStrategyEditing ? "metal" : "ghost"} compact-button`}
                  onClick={() => {
                    setStrategyDraft({ ...settings });
                    setIsStrategyEditing(true);
                  }}
                >
                  Edit Strategy
                </button>
              </div>
              <div className="weights-badges" style={{ flexWrap: "wrap" }}>
                <span className="weight-badge">🔥 Sales Performance: {settings.salesWeight.toFixed(2)}</span>
                <span className="weight-badge">📦 Inventory Health: {settings.inventoryWeight.toFixed(2)}</span>
                <span className="weight-badge">🆕 Newness: {settings.newnessWeight.toFixed(2)}</span>
                <span className="weight-badge">📈 Sales Momentum: {settings.momentumWeight.toFixed(2)}</span>
                <span className="weight-badge">↻ Controlled Rotation: {settings.rotationWeight.toFixed(2)}</span>
                <span className="weight-badge">Total Weight: {strategyTotal(settings).toFixed(2)}</span>
              </div>
              <p className="muted">Products are ranked using SKU-level sales, sellable inventory, size availability, newness and recent momentum.</p>
              <p className="muted">Pinned products remain fixed · Diversity: Brand and Product Type · Sold-out social proof: up to 2 genuine products.</p>
              {isStrategyEditing ? (
                <div className="weights-grid">
                  {strategyFields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        type="number"
                        min="0"
                        step={field.step}
                        value={strategyDraft?.[field.key] ?? settings[field.key]}
                        onChange={(event) =>
                          setStrategyDraft({
                            ...strategyDraft,
                            [field.key]: Number(event.target.value || 0),
                          })
                        }
                      />
                    </label>
                  ))}
                  <p className={Math.abs(strategyTotal(strategyDraft || settings) - 1) < 0.00001 ? "success-text" : "error-text"}>Total: {strategyTotal(strategyDraft || settings).toFixed(2)} (must equal 1.00)</p>
                  <div className="action-row">
                    <button type="button" className="button accent" disabled={Math.abs(strategyTotal(strategyDraft || settings) - 1) >= 0.00001 || loading} onClick={async () => { await saveSettings(strategyDraft); setIsStrategyEditing(false); setStrategyDraft(null); }}>Save Strategy</button>
                    <button type="button" className="button ghost" onClick={() => { setIsStrategyEditing(false); setStrategyDraft(null); }}>Cancel</button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pinned-manager-section">
              <div className="section-heading section-heading-inline">
                <h4>Pinned Merchandising (Slots 1-{pinnedProducts.length})</h4>
                <button
                  type="button"
                  className="button ghost compact-button"
                  onClick={clearPinnedProducts}
                  disabled={loading || pinnedProducts.length === 0}
                >
                  Remove All Pinned
                </button>
              </div>
              <p className="muted">Drag items or use buttons to order pinned products (always appear first on page 1).</p>
              {pinnedProducts.length === 0 ? (
                <div className="pinned-empty-state">No pinned products. Select "Pinned" in the allocation dropdown below to pin products.</div>
              ) : (
                <div className="pinned-list">
                  {pinnedProducts.map((product, index) => (
                    <div 
                      key={product.id} 
                      className="pinned-item"
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      <span className="pinned-index">#{index + 1}</span>
                      <img src={product.image || fallbackImage} alt={product.title} />
                      <span className="pinned-title text-truncate">{product.title}</span>
                      <div className="pinned-actions">
                        <button 
                          className="pinned-btn" 
                          disabled={index === 0} 
                          onClick={() => reorderPinned(index, index - 1)}
                          type="button"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button 
                          className="pinned-btn" 
                          disabled={index === pinnedProducts.length - 1} 
                          onClick={() => reorderPinned(index, index + 1)}
                          type="button"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button 
                          className="pinned-btn unpin" 
                          onClick={() => updateProductAllocation(product.id, "eligible")}
                          type="button"
                          title="Unpin"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="filters-grid">
              <label>
                Stock
                <select
                  value={filters.stock}
                  onChange={(event) => setFilters({ ...filters, stock: event.target.value })}
                >
                  <option value="all">All stock</option>
                  <option value="in">In stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </label>

              <label>
                Sold quantity
                <select
                  value={filters.soldRange}
                  onChange={(event) => setFilters({ ...filters, soldRange: event.target.value })}
                >
                  <option value="all">All ranges</option>
                  <option value="0-2">0-2</option>
                  <option value="3-19">3-19</option>
                  <option value="20+">20+</option>
                </select>
              </label>

              <label>
                Rotation
                <select
                  value={filters.rotation}
                  onChange={(event) => setFilters({ ...filters, rotation: event.target.value })}
                >
                  <option value="all">All products</option>
                  <option value="yes">Included only</option>
                  <option value="no">Excluded only</option>
                </select>
              </label>

              <label>
                Performance
                <select
                  value={filters.performance}
                  onChange={(event) => setFilters({ ...filters, performance: event.target.value })}
                >
                  <option value="all">All tiers</option>
                  <option value="bestseller">Bestsellers</option>
                  <option value="mid">Average sellers</option>
                  <option value="low">Low sellers</option>
                </select>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.allottedOnly}
                  onChange={(event) =>
                    setFilters({ ...filters, allottedOnly: event.target.checked })
                  }
                />
                Allotted products only
              </label>
            </div>
          </div>

          <div className="panel preview-panel">
            <div className="section-heading">
              <h3>Preview order panel</h3>
              <p>Old vs new order before apply. Affected products: {preview.affectedCount}</p>
            </div>

            <div className="preview-list">
              {previewTop.length ? (
                previewTop.map((product) => (
                  <div className="preview-item" key={product.id}>
                    <span className="preview-rank">{product.finalPosition}</span>
                    <div>
                      <strong>{product.title}</strong>
                      <div className="preview-movement-row">
                        <span className="position-tag">Was #{product.collectionPosition}</span>
                        <span className="position-tag arrow">→</span>
                        <span className="position-tag new">Now #{product.finalPosition}</span>
                        {product.collectionPosition !== product.finalPosition && (
                          <span className={`movement-tag ${product.collectionPosition > product.finalPosition ? "up" : "down"}`}>
                            {product.collectionPosition > product.finalPosition 
                              ? `↑ +${product.collectionPosition - product.finalPosition}` 
                              : `↓ -${product.finalPosition - product.collectionPosition}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">Generate today&apos;s order to preview the first page.</div>
              )}
            </div>
          </div>
        </section>

        <section className="panel table-panel">
          <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3>Collection product table</h3>
              <p>Current Shopify placement, sales metrics, and manual overrides.</p>
            </div>
            <div className="tab-switcher" style={{ display: "flex", gap: "6px", background: "var(--surface-2)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <button 
                type="button"
                className={`button ${activeTab === "table" ? "accent" : "ghost"}`} 
                style={{ padding: "6px 12px", fontSize: "12px", height: "auto" }}
                onClick={() => setActiveTab("table")}
              >
                📋 Product Table
              </button>
              <button 
                type="button"
                className={`button ${activeTab === "explainability" ? "accent" : "ghost"}`} 
                style={{ padding: "6px 12px", fontSize: "12px", height: "auto" }}
                onClick={() => setActiveTab("explainability")}
              >
                📊 Explainability Panel
              </button>
            </div>
          </div>

          {activeTab === "table" ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>ID</th>
                    <th>Current</th>
                    <th>Allocation</th>
                    <th>Score</th>
                    <th>Stock</th>
                    <th>Sold</th>
                    <th>Revenue</th>
                    <th>Vendor</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Updated</th>
                  </tr>
                  <tr className="table-filter-row">
                    <th>
                      <input
                        type="text"
                        placeholder="Search product"
                        value={filters.search}
                        onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Search ID"
                        value={filters.idSearch}
                        onChange={(event) => setFilters({ ...filters, idSearch: event.target.value })}
                      />
                    </th>
                    <th>
                      <select
                        value={filters.currentRange}
                        onChange={(event) => setFilters({ ...filters, currentRange: event.target.value })}
                      >
                        <option value="all">Any pos</option>
                        <option value="page1">Page 1</option>
                        <option value="afterPage1">After page 1</option>
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.allocation}
                        onChange={(event) => setFilters({ ...filters, allocation: event.target.value })}
                      >
                        <option value="all">All</option>
                        <option value="pinned">Pinned</option>
                        <option value="eligible">Eligible</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.performance}
                        onChange={(event) => setFilters({ ...filters, performance: event.target.value })}
                      >
                        <option value="all">All scores</option>
                        <option value="bestseller">Bestsellers</option>
                        <option value="mid">Average</option>
                        <option value="low">Low</option>
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.stock}
                        onChange={(event) => setFilters({ ...filters, stock: event.target.value })}
                      >
                        <option value="all">All stock</option>
                        <option value="in">In stock</option>
                        <option value="out">Out</option>
                      </select>
                    </th>
                    <th>
                      <select
                        value={filters.soldRange}
                        onChange={(event) => setFilters({ ...filters, soldRange: event.target.value })}
                      >
                        <option value="all">All sold</option>
                        <option value="0-2">0-2</option>
                        <option value="3-19">3-19</option>
                        <option value="20+">20+</option>
                      </select>
                    </th>
                    <th />
                    <th>
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
                    </th>
                    <th>
                      <select
                        value={filters.status}
                        onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status === "all" ? "All status" : status}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th />
                    <th>
                      <select
                        value={filters.updatedRange}
                        onChange={(event) => setFilters({ ...filters, updatedRange: event.target.value })}
                      >
                        <option value="all">Any age</option>
                        <option value="7d">Updated 7d</option>
                        <option value="30d">Updated 30d</option>
                        <option value="older">Older</option>
                      </select>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="product-cell">
                          <img src={product.image || fallbackImage} alt={product.imageAlt} />
                          <div>
                            <strong>{product.title}</strong>
                            <p>{product.handle}</p>
                            <small>{product.tags?.slice(0, 3).join(", ") || "No tags"}</small>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{product.id.split("/").pop()}</td>
                      <td>#{product.collectionPosition}</td>
                      <td>
                        <select
                          className="inline-input"
                          style={{ width: "110px", padding: "6px 8px", fontSize: "12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text)" }}
                          value={getAllocationState(product)}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "pinned") {
                              const nextPos = pinnedProducts.length + 1;
                              updateProductAllocation(product.id, "pinned", nextPos);
                            } else if (val === "eligible") {
                              updateProductAllocation(product.id, "eligible");
                            } else {
                              updateProductAllocation(product.id, "hidden");
                            }
                          }}
                        >
                          <option value="pinned">📌 Pinned</option>
                          <option value="eligible">✨ Eligible</option>
                          <option value="hidden">👁️ Hidden</option>
                        </select>
                      </td>
                      <td className="mono">{preview.newOrder.find((item) => item.id === product.id)?.finalScore?.toFixed(2) || "-"}</td>
                      <td>{product.inventoryQuantity}</td>
                      <td>{product.soldQuantity}</td>
                      <td>{formatMoney(product.salesRevenue, product.currencyCode)}</td>
                      <td>{product.vendor || "-"}</td>
                      <td>{product.status}</td>
                      <td>{formatMoney(product.price, product.currencyCode)}</td>
                      <td>{formatDate(product.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sales</th>
                    <th>Inventory / size</th>
                    <th>Newness</th>
                    <th>Momentum</th>
                    <th>Rotation</th>
                    <th>Final Score</th>
                    <th>Reason</th>
                    <th>Flags</th>
                    <th>Old Pos</th>
                    <th>New Pos</th>
                    <th>Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {explainabilityData.map((item) => {
                    const diff = item.collectionPosition - item.finalPosition;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="product-cell">
                            <img src={item.image || fallbackImage} alt={item.imageAlt} />
                            <div>
                              <strong>{item.title}</strong>
                              <p>{item.vendor || "-"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{(item.salesScore || 0).toFixed(2)}</td>
                        <td className="mono">{(item.inventoryScore || 0).toFixed(2)} / {(item.sizeAvailability || 0).toFixed(2)}</td>
                        <td className="mono">{(item.newnessScore || 0).toFixed(2)}</td>
                        <td className="mono">{(item.momentumScore || 0).toFixed(2)}</td>
                        <td className="mono">{(item.rotationScore || 0).toFixed(2)}</td>
                        <td className="mono" style={{ fontWeight: "bold", color: "var(--accent)" }}>
                          {Number(item.finalScore || 0).toFixed(2)}
                        </td>
                        <td>{item.primaryReason}</td>
                        <td>{item.allottedPosition ? "Pinned" : item.soldOutSocialProof ? "Sold-out proof" : "-"}</td>
                        <td className="mono">#{item.collectionPosition}</td>
                        <td className="mono">
                          {preview.newOrder.length > 0 ? `#${item.finalPosition}` : <span className="muted">-</span>}
                        </td>
                        <td>
                          {preview.newOrder.length > 0 ? (
                            diff === 0 ? (
                              <span className="muted">-</span>
                            ) : diff > 0 ? (
                              <span className="success-text" style={{ fontWeight: "bold" }}>↑ +{diff}</span>
                            ) : (
                              <span className="error-text" style={{ fontWeight: "bold" }}>↓ {diff}</span>
                            )
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      ) : activeModule === "order-mapping" ? (
      <OrderMapping sidebarBridge={orderMappingSidebarBridge} />
      ) : (
      <main className="dashboard">
        <SkuImageManager
          sidebarBridge={{
            updateDiagnostics: updateSkuDiagnostics,
            pushLog: pushSkuLog,
          }}
        />
      </main>
      )}
    </div>
  );
}
