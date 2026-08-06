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

export default function Sorter({ sidebarBridge, capability = null, readinessLoading = false, orderMapping = null, onRetryConnection }) {
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
  const [filters, setFilters] = useState(defaultFilters);
  const [preview, setPreview] = useState(emptyPreview);
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [reorderAllSummary, setReorderAllSummary] = useState(null);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyMessage, setStrategyMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // One-shot guards: fetch readiness/collections exactly once per availability
  // state and ignore stale results after unmount (StrictMode-safe).
  const collectionsFetchedRef = useRef(false);
  const mountedRef = useRef(true);

  const products = snapshot?.products || [];

  const weightFields = [
    { key: "salesWeight", label: "Sales" },
    { key: "inventoryWeight", label: "Inventory" },
    { key: "newnessWeight", label: "Newness" },
    { key: "momentumWeight", label: "Momentum" },
    { key: "rotationWeight", label: "Rotation" },
  ];

  const strategyTotal = () =>
    weightFields.reduce((sum, field) => sum + Number(settings[field.key] || 0), 0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setError("");
    try {
      const response = await api.getCollections();
      if (mountedRef.current) {
        setCollections(response.collections || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setCollectionsLoading(false);
      }
    }
  }, []);

  // Request collections exactly once when Shopify becomes available. No
  // automatic retries; retries are explicit and operator-initiated.
  useEffect(() => {
    if (!capability?.available) {
      return;
    }
    if (collectionsFetchedRef.current) {
      return;
    }
    collectionsFetchedRef.current = true;
    loadCollections();
  }, [capability, loadCollections]);

  // While unavailable, keep the one-shot guard open so a single Retry
  // connection (after configuration is added) fetches collections once.
  useEffect(() => {
    if (!capability?.available) {
      collectionsFetchedRef.current = false;
    }
  }, [capability]);

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

  const filteredProducts = useMemo(
    () =>
      products
        .filter((product) => matchesFilters(product, filters))
        .sort((left, right) => left.collectionPosition - right.collectionPosition),
    [products, filters],
  );

  const previewTop = preview.newOrder.slice(0, settings.firstPageLimit || 40);

  function mergeSettingsFromResponse(responseSettings) {
    if (!responseSettings) {
      return;
    }
    setSettings((prev) => {
      const next = { ...prev };
      for (const field of weightFields) {
        const value = Number(responseSettings[field.key]);
        if (Number.isFinite(value) && value >= 0) {
          next[field.key] = value;
        }
      }
      const limit = Number(responseSettings.firstPageLimit);
      if (Number.isFinite(limit) && limit >= 1) {
        next.firstPageLimit = limit;
      }
      return next;
    });
  }

  const handleCollectionSelect = useCallback(async (collectionId) => {
    if (!collectionId) {
      setSelectedCollectionId("");
      setSnapshot(null);
      setPreview(emptyPreview);
      return;
    }

    setSelectedCollectionId(collectionId);
    setLoading(true);
    setError("");
    setPreview(emptyPreview);

    try {
      const response = await api.getCollectionSnapshot(collectionId);
      if (mountedRef.current) {
        setSnapshot(response.snapshot || null);
        mergeSettingsFromResponse(response.settings);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
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
      if (mountedRef.current) {
        setSnapshot(response.snapshot || null);
        mergeSettingsFromResponse(response.settings);
        setMessage("Synced successfully");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedCollectionId]);

  const handleSaveStrategy = useCallback(async () => {
    if (!selectedCollectionId) return;
    const total = strategyTotal();
    if (Math.round(total * 100) !== 100) {
      setStrategyMessage(`Strategy weights must total 1.00 (currently ${total.toFixed(2)}).`);
      return;
    }
    setLoading(true);
    setError("");
    setStrategyMessage("");

    try {
      await api.updateSettings(selectedCollectionId, {
        salesWeight: Number(settings.salesWeight),
        inventoryWeight: Number(settings.inventoryWeight),
        newnessWeight: Number(settings.newnessWeight),
        momentumWeight: Number(settings.momentumWeight),
        rotationWeight: Number(settings.rotationWeight),
      });
      if (mountedRef.current) {
        setMessage("Strategy saved");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedCollectionId, settings, strategyTotal]);

  const handleGenerate = useCallback(async () => {
    if (!snapshot) return;
    const total = strategyTotal();
    if (Math.round(total * 100) !== 100) {
      setError("Strategy weights must total 1.00 before generating an order.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.generateOrder(selectedCollectionId, settings);
      if (mountedRef.current) {
        setPreview({
          newOrder: response.newOrder || [],
          previewUrl: response.previewUrl || null,
        });
        setMessage("Generated order — preview only, nothing written to Shopify");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [snapshot, selectedCollectionId, settings, strategyTotal]);

  const handleApply = useCallback(async () => {
    if (!preview.newOrder.length) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.applyOrder(selectedCollectionId, preview.newOrder);
      const updated = await api.getCollectionSnapshot(selectedCollectionId);
      if (mountedRef.current) {
        setSnapshot(updated.snapshot || null);
        setBackup({ createdAt: new Date().toISOString(), products: snapshot.products });
        setPreview(emptyPreview);
        setMessage("Applied order to Shopify");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
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
      if (mountedRef.current) {
        setSnapshot(updated.snapshot || null);
        setBackup(null);
        setMessage("Rolled back to backup");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [backup, selectedCollectionId]);

  const handleReorderAllLive = useCallback(async () => {
    setIsSyncingAll(true);
    setError("");
    setMessage("");
    setReorderAllSummary(null);

    try {
      const response = await api.reorderAllCollections();
      if (mountedRef.current) {
        setReorderAllSummary(response);
        if (response.failures && response.failures.length > 0) {
          setError(`Some collections failed: ${response.failures.join(", ")}`);
        } else {
          setMessage("All collections updated successfully");
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncingAll(false);
      }
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

  const copyVariableTemplate = useCallback(async () => {
    const names = [
      ...new Set([
        ...(capability?.missingVariables || []),
        "SHOPIFY_STORE_DOMAIN",
        "SHOPIFY_ADMIN_ACCESS_TOKEN",
        "SHOPIFY_CLIENT_ID",
        "SHOPIFY_CLIENT_SECRET",
      ]),
    ];
    try {
      await navigator.clipboard.writeText(names.map((name) => `${name}=`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard unavailable — copy the variable names manually.");
    }
  }, [capability]);

  if (readinessLoading || capability === null) {
    return (
      <main className="dashboard" aria-busy="true">
        <div className="setup-card panel">
          <p className="eyebrow">Initializing</p>
          <h2>Checking Shopify capability…</h2>
          <p className="setup-subtitle">Contacting the backend once to determine the Shopify connection state.</p>
        </div>
      </main>
    );
  }

  if (capability && !capability.available) {
    const missingVars = capability.missingVariables || ["SHOPIFY_STORE_DOMAIN"];
    const omReady = orderMapping?.status === "ready";
    return (
      <main className="dashboard">
        <section className="setup-card panel" aria-labelledby="setup-title">
          <div className="setup-header">
            <span className="status-badge status-unavailable">Shopify Not Configured</span>
          </div>
          <h2 id="setup-title">Connect Shopify to use Product Sorter</h2>
          <p className="setup-subtitle">
            Product Sorter is running. Shopify access is required to load collections.
          </p>

          <div className="setup-status-grid">
            <div className="setup-status-item">
              <span className="setup-status-label">Backend</span>
              <span className="state-chip state-ok">Running</span>
            </div>
            <div className="setup-status-item">
              <span className="setup-status-label">Shopify</span>
              <span className="state-chip state-warn">Not configured</span>
            </div>
            <div className="setup-status-item">
              <span className="setup-status-label">Order Mapping</span>
              <span className={`state-chip ${omReady ? "state-ok" : "state-muted"}`}>
                {omReady ? "Ready" : "Unavailable (optional)"}
              </span>
            </div>
          </div>

          <div className="setup-details">
            <div className="setup-section">
              <h4>Missing Environment Variables</h4>
              <ul className="missing-vars-list">
                {missingVars.map((v) => (
                  <li key={v} className="missing-var-item">
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
              <p className="setup-note">Variable names only — no credential values are ever sent to the browser.</p>
            </div>

            <div className="setup-section">
              <h4>Supported Authentication Methods</h4>
              <div className="auth-methods-grid">
                <div className="auth-method-card">
                  <h5>Option 1: Admin Access Token (Recommended)</h5>
                  <pre><code>{"SHOPIFY_STORE_DOMAIN=your-store.myshopify.com\nSHOPIFY_ADMIN_ACCESS_TOKEN="}</code></pre>
                </div>
                <div className="auth-method-card">
                  <h5>Option 2: Client Credentials</h5>
                  <pre><code>{"SHOPIFY_STORE_DOMAIN=your-store.myshopify.com\nSHOPIFY_CLIENT_ID=\nSHOPIFY_CLIENT_SECRET="}</code></pre>
                </div>
              </div>
              <p className="setup-note">Optional: SHOPIFY_API_VERSION (defaults to 2026-04).</p>
            </div>

            <details className="setup-instructions">
              <summary>View setup instructions</summary>
              <ol className="setup-steps">
                <li>Copy <code>.env.example</code> to <code>.env</code> at the repository root (or <code>server/.env</code>).</li>
                <li>Set <code>SHOPIFY_STORE_DOMAIN</code> to your store, e.g. <code>your-store.myshopify.com</code>.</li>
                <li>Choose one authentication method and fill in its variables.</li>
                <li>Restart the backend, then press <strong>Retry connection</strong>.</li>
                <li>No secrets are stored in this browser or sent through frontend requests.</li>
              </ol>
            </details>
          </div>

          <div className="setup-actions">
            <button type="button" className="button accent" onClick={onRetryConnection} disabled={readinessLoading}>
              {readinessLoading ? "Checking…" : "Retry connection"}
            </button>
            <button type="button" className="button ghost" onClick={copyVariableTemplate}>
              {copied ? "Copied ✓" : "Copy variable-name template"}
            </button>
          </div>
        </section>
      </main>
    );
  }

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
            <button type="button" className="button metal" onClick={handleReorderAllLive} disabled={isSyncingAll || !collections.length}>
              Update All Collections
            </button>
            <button
              className="button danger"
              onClick={handleApply}
              disabled={loading || !preview.newOrder.length}
              title="Requires a generated preview"
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
          <span className="status-chip state-ok">Shopify Connected</span>
          <span className="status-chip">{snapshot?.collection?.sortOrder || "Not synced"}</span>
          {snapshot?.syncedAt ? <span className="muted">Last sync: {formatDate(snapshot.syncedAt)}</span> : null}
          {backup?.createdAt ? <span className="muted">Backup: {formatDate(backup.createdAt)}</span> : null}
          {collectionsLoading ? <span className="muted">Loading collections…</span> : null}
          {message ? <span className="success-text" role="status">{message}</span> : null}
          {error ? <span className="error-text" role="alert">{error}</span> : null}
        </div>
      </section>

      <section className="panel sorter-section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setStrategyOpen((prev) => !prev)}
          aria-expanded={strategyOpen}
        >
          <span>Strategy Configuration</span>
          <span className="toggle-icon">{strategyOpen ? "▲" : "▼"}</span>
        </button>
        {strategyOpen ? (
          <div className="strategy-body">
            <div className="weights-grid">
              {weightFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings[field.key] ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value || 0);
                      setSettings((prev) => ({ ...prev, [field.key]: value }));
                      setStrategyMessage("");
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="strategy-footer">
              <span className={Math.round(strategyTotal() * 100) === 100 ? "muted" : "error-text"}>
                Total: {strategyTotal().toFixed(2)} (must equal 1.00)
              </span>
              {strategyMessage ? <span className="error-text" role="alert">{strategyMessage}</span> : null}
              <button type="button" className="button compact" onClick={handleSaveStrategy} disabled={loading}>
                Save Strategy
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {preview.newOrder.length > 0 ? (
        <section className="panel preview-panel" aria-label="Generated order preview">
          <div className="preview-heading">
            <div>
              <h3>Generated Order Preview</h3>
              <p className="preview-note">Preview only — no changes are written to Shopify until you Apply.</p>
            </div>
            <button type="button" className="button ghost compact" onClick={() => setPreview(emptyPreview)}>
              Clear Preview
            </button>
          </div>
          <div className="preview-list">
            {previewTop.map((product, index) => {
              const newPosition = product.finalPosition ?? index + 1;
              const moved = product.collectionPosition !== newPosition;
              return (
                <div className="preview-item" key={product.id}>
                  <span className="preview-rank">{index + 1}</span>
                  <div className="preview-item-main">
                    <strong>{product.title}</strong>
                    <div className="preview-movement-row">
                      <span className="position-tag">Current: {product.collectionPosition}</span>
                      <span className="position-tag arrow">→</span>
                      <span className="position-tag new">New: {newPosition}</span>
                      {moved ? (
                        <span className={`movement-tag ${product.collectionPosition > newPosition ? "up" : "down"}`}>
                          {product.collectionPosition > newPosition ? "↑" : "↓"} {Math.abs(product.collectionPosition - newPosition)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="table-wrapper panel">
        {!snapshot ? (
          <div className="empty-state">
            Select a collection and sync live data to load its products.
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">No products match the current filters.</div>
        ) : (
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
        )}
      </section>
    </main>
  );
}
