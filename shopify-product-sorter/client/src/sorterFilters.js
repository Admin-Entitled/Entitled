/**
 * Sorter filter model and pure predicate helpers.
 *
 * Extracted from Sorter.jsx so the filtering contract can be unit-tested and
 * shared without coupling to React state.
 */

export const defaultFilters = {
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

export function performanceBucket(product) {
  const sold = product.soldQuantity || 0;
  if (sold >= 20) return "hot";
  if (sold >= 3) return "warm";
  return "cold";
}

export function getAllocationState(product) {
  if (product.allottedPosition) return "pinned";
  if (product.includeInRotation !== false) return "eligible";
  return "hidden";
}

export function matchesFilters(product, filters) {
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
