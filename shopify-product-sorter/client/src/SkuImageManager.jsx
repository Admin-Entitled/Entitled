import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const fallbackImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="20" fill="#17181B"/>
      <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="#F2ECE2" font-family="sans-serif" font-size="16">IMG</text>
    </svg>
  `);

const ACTION_LABELS = {
  search: { idle: "Search", running: "Searching..." },
  loadAll: { idle: "Load All SKUs", running: "Loading..." },
  addImage: { idle: "Add Image", running: "Uploading..." },
  previewDelete: { idle: "Preview Delete", running: "Preparing Preview..." },
  confirmDelete: { idle: "Confirm Delete", running: "Deleting..." },
  saveOrder: { idle: "Save Order", running: "Saving..." },
  bulkAdd: { idle: "Run Bulk Add", running: "Running Bulk Add..." },
  bulkDeletePreview: { idle: "Preview Delete", running: "Preparing Preview..." },
  bulkDeleteConfirm: { idle: "Confirm Delete", running: "Deleting..." },
};

function getInitialAddForm() {
  return {
    mode: "upload",
    file: null,
    fileName: "",
    filePreviewUrl: "",
    imageUrl: "",
    altText: "",
    positionMode: "last",
    imageNumber: 1,
  };
}

function getInitialBulkAddForm() {
  return {
    mode: "upload",
    file: null,
    fileName: "",
    imageUrl: "",
    altText: "",
    positionMode: "last",
    imageNumber: 1,
    applyMode: "selected",
  };
}

function getInitialBulkDeleteForm() {
  return {
    positionMode: "first",
    imageNumber: 1,
    applyMode: "selected",
  };
}

function getScopedWarnings(scopeDiagnostics) {
  return scopeDiagnostics?.missingScopes || [];
}

function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function buildTargetItems(groups, selectedProductIds, applyMode) {
  const activeGroups = applyMode === "all"
    ? groups
    : groups.filter((group) => selectedProductIds.includes(group.productId));

  return activeGroups.map((group) => ({
    sku: group.primarySku,
    productTitle: group.productTitle,
    productId: group.productId,
    variantId: group.primaryVariantId,
  }));
}

function resolvePositionMode(formMode) {
  return formMode === "number" ? "number" : formMode;
}

function getActionButtonLabel(actionState, key) {
  return actionState[key] ? ACTION_LABELS[key].running : ACTION_LABELS[key].idle;
}

export default function SkuImageManager({ sidebarBridge }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [scopeDiagnostics, setScopeDiagnostics] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [actionState, setActionState] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkAddForm, setBulkAddForm] = useState(getInitialBulkAddForm());
  const [bulkDeleteForm, setBulkDeleteForm] = useState(getInitialBulkDeleteForm());
  const [bulkDeletePreview, setBulkDeletePreview] = useState(null);
  const [editingProductId, setEditingProductId] = useState("");
  const [editorTab, setEditorTab] = useState("add");
  const [addForm, setAddForm] = useState(getInitialAddForm());
  const [selectedDeleteMediaId, setSelectedDeleteMediaId] = useState("");
  const [deletePreviewOpen, setDeletePreviewOpen] = useState(false);
  const [draftOrders, setDraftOrders] = useState({});
  const [collapsedProductIds, setCollapsedProductIds] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isProductsSectionCollapsed, setIsProductsSectionCollapsed] = useState(false);
  const [actionMeta, setActionMeta] = useState({
    currentAction: "Idle",
    currentActionStatus: "idle",
    currentActionMessage: "Ready",
    lastSuccessfulAction: "None",
    lastFailedAction: "None",
    lastSkuApiAction: "None",
    lastShopifyMediaAction: "None",
    lastError: "None",
    lastRefreshTime: null,
  });

  const isAnyActionRunning = Object.values(actionState).some(Boolean);

  const productGroups = useMemo(() => {
    const map = new Map();

    for (const item of items) {
      if (!map.has(item.productId)) {
        map.set(item.productId, {
          productId: item.productId,
          productTitle: item.productTitle,
          productHandle: item.productHandle,
          media: item.media || [],
          imageCount: item.imageCount || 0,
          variants: [],
          primarySku: item.sku,
          primaryVariantId: item.variantId,
        });
      }

      const group = map.get(item.productId);
      group.variants.push({
        sku: item.sku,
        variantId: item.variantId,
        variantTitle: item.variantTitle,
      });
    }

    return [...map.values()];
  }, [items]);

  const editingGroup = useMemo(
    () => productGroups.find((group) => group.productId === editingProductId) || null,
    [productGroups, editingProductId],
  );

  const editingMedia = editingGroup
    ? draftOrders[editingGroup.productId] || editingGroup.media
    : [];

  const deleteTarget = editingMedia.find((media) => media.id === selectedDeleteMediaId) || null;
  const scopeWarnings = getScopedWarnings(scopeDiagnostics);
  const allSelected = productGroups.length > 0 && selectedProductIds.length === productGroups.length;

  useEffect(() => {
    setCollapsedProductIds((current) => {
      const productIds = productGroups.map((group) => group.productId);
      const preserved = current.filter((id) => productIds.includes(id));
      if (preserved.length === productIds.length) {
        return preserved;
      }
      return productIds;
    });
  }, [productGroups]);

  useEffect(() => {
    sidebarBridge?.updateDiagnostics?.({
      activeModule: "SKU Image Manager",
      loadedSkuRows: items.length,
      uniqueParentProducts: productGroups.length,
      selectedProducts: selectedProductIds.length,
      currentEditingProduct: editingGroup?.productTitle || "None",
      currentEditingSku: editingGroup?.primarySku || "None",
      currentImageCount: editingGroup?.media?.length || 0,
      lastSkuApiAction: actionMeta.lastSkuApiAction,
      lastShopifyMediaAction: actionMeta.lastShopifyMediaAction,
      lastActionStatus: actionMeta.currentActionStatus,
      lastError: error || actionMeta.lastError,
      requiredScopesStatus: scopeWarnings.length ? `Missing: ${scopeWarnings.join(", ")}` : "All required scopes present",
      lastRefreshTime: actionMeta.lastRefreshTime,
      bulkModeOpen: isBulkOpen,
      actionRunning: isAnyActionRunning,
      productsSectionCollapsed: isProductsSectionCollapsed,
    });
  }, [
    actionMeta,
    editingGroup,
    error,
    isAnyActionRunning,
    isBulkOpen,
    isProductsSectionCollapsed,
    items.length,
    productGroups.length,
    scopeWarnings,
    selectedProductIds.length,
    sidebarBridge,
  ]);

  function updateActionState(key, isRunning) {
    setActionState((current) => ({
      ...current,
      [key]: isRunning,
    }));
  }

  function addNotification({ status, message: nextMessage, persistent = false }) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((current) => [...current, { id, status, message: nextMessage, persistent }].slice(-4));
    if (!persistent && status !== "error" && status !== "failed" && status !== "warning") {
      window.setTimeout(() => {
        setNotifications((current) => current.filter((item) => item.id !== id));
      }, 3500);
    }
    return id;
  }

  function updateNotification(id, patch) {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function dismissNotification(id) {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }

  function pushSkuLog({ actionType, endpoint, status, message: nextMessage, error: nextError = "", subject = "" }) {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      module: "SKU",
      actionType,
      endpoint,
      status,
      message: `${nextMessage}${subject ? ` • ${subject}` : ""}`,
      error: nextError,
    };
    sidebarBridge?.pushLog?.(entry);
  }

  function setActionFeedback({
    currentAction,
    currentActionStatus,
    currentActionMessage,
    lastSkuApiAction,
    lastShopifyMediaAction,
    lastError = actionMeta.lastError,
    lastSuccessfulAction = actionMeta.lastSuccessfulAction,
    lastFailedAction = actionMeta.lastFailedAction,
  }) {
    setActionMeta((current) => ({
      ...current,
      currentAction,
      currentActionStatus,
      currentActionMessage,
      lastSkuApiAction: lastSkuApiAction ?? current.lastSkuApiAction,
      lastShopifyMediaAction: lastShopifyMediaAction ?? current.lastShopifyMediaAction,
      lastError,
      lastSuccessfulAction,
      lastFailedAction,
      lastRefreshTime: new Date().toLocaleTimeString(),
    }));
  }

  function syncStateFromResult(result) {
    setItems(result.items || []);
    setScopeDiagnostics(result.scopeDiagnostics || null);
    setSelectedProductIds([]);
    setBulkDeletePreview(null);
  }

  function updateItemsForProduct(productId, media) {
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, media, imageCount: media.length }
          : item,
      ),
    );
    setDraftOrders((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    pushSkuLog({
      actionType: "REFRESH_MEDIA",
      endpoint: "local-state",
      status: "SUCCESS",
      message: "Product media refreshed",
      subject: productId,
    });
    setActionFeedback({
      currentAction: "REFRESH_MEDIA",
      currentActionStatus: "success",
      currentActionMessage: "Product media refreshed",
      lastShopifyMediaAction: "REFRESH_MEDIA",
    });
  }

  async function runTrackedAction({
    actionKey,
    actionType,
    endpoint,
    runningMessage,
    successMessage,
    successStatus = "SUCCESS",
    failurePrefix,
    subject = "",
    work,
  }) {
    updateActionState(actionKey, true);
    setError("");
    setMessage("");
    const notificationId = addNotification({ status: "running", message: runningMessage, persistent: true });
    pushSkuLog({
      actionType,
      endpoint,
      status: "RUNNING",
      message: runningMessage,
      subject,
    });
    setActionFeedback({
      currentAction: actionType,
      currentActionStatus: "running",
      currentActionMessage: runningMessage,
      lastSkuApiAction: endpoint,
      lastShopifyMediaAction: actionType,
    });

    try {
      const result = await work();
      const finalMessage = typeof successMessage === "function" ? successMessage(result) : successMessage;
      setMessage(finalMessage);
      updateNotification(notificationId, { status: successStatus.toLowerCase(), message: finalMessage, persistent: false });
      pushSkuLog({
        actionType,
        endpoint,
        status: successStatus,
        message: finalMessage,
        subject,
      });
      setActionFeedback({
        currentAction: actionType,
        currentActionStatus: successStatus.toLowerCase().replace(/\s+/g, "-"),
        currentActionMessage: finalMessage,
        lastSkuApiAction: endpoint,
        lastShopifyMediaAction: actionType,
        lastSuccessfulAction: actionType,
      });
      return result;
    } catch (requestError) {
      const finalError = `${failurePrefix}: ${requestError.message}`;
      setError(finalError);
      updateNotification(notificationId, { status: "error", message: finalError, persistent: true });
      pushSkuLog({
        actionType,
        endpoint,
        status: "ERROR",
        message: failurePrefix,
        error: requestError.message,
        subject,
      });
      setActionFeedback({
        currentAction: actionType,
        currentActionStatus: "error",
        currentActionMessage: finalError,
        lastSkuApiAction: endpoint,
        lastShopifyMediaAction: actionType,
        lastError: requestError.message,
        lastFailedAction: actionType,
      });
      throw requestError;
    } finally {
      updateActionState(actionKey, false);
    }
  }

  async function handleSearch() {
    if (!query.trim()) {
      const validationMessage = "Enter at least one SKU before searching.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      pushSkuLog({
        actionType: "SEARCH",
        endpoint: "GET /api/sku-images/search",
        status: "WARNING",
        message: validationMessage,
      });
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "search",
        actionType: "SEARCH",
        endpoint: "GET /api/sku-images/search",
        runningMessage: "Searching SKU...",
        successMessage: (payload) => `Loaded ${payload.totalItems} SKU rows successfully.`,
        failurePrefix: "Search failed",
        subject: query.trim(),
        work: () => api.searchSkuImages(query),
      });
      syncStateFromResult(result);
    } catch {
      // handled in runTrackedAction
    }
  }

  async function handleLoadAll() {
    try {
      const result = await runTrackedAction({
        actionKey: "loadAll",
        actionType: "LOAD_ALL",
        endpoint: "POST /api/sku-images/load-all",
        runningMessage: "Loading all SKUs from Shopify...",
        successMessage: (payload) => `Loaded ${payload.totalItems} SKU rows from Shopify.`,
        failurePrefix: "Load all failed",
        work: () => api.loadAllSkuImages(),
      });
      syncStateFromResult(result);
    } catch {
      // handled in runTrackedAction
    }
  }

  function toggleSelectAll() {
    setSelectedProductIds((current) =>
      current.length === productGroups.length
        ? []
        : productGroups.map((group) => group.productId),
    );
  }

  function toggleSelectedProduct(productId) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleProductCollapsed(productId) {
    setCollapsedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function expandAllProducts() {
    setCollapsedProductIds([]);
  }

  function collapseAllProducts() {
    setCollapsedProductIds(productGroups.map((group) => group.productId));
  }

  function openEditor(group) {
    setEditingProductId(group.productId);
    setEditorTab("add");
    setAddForm(getInitialAddForm());
    setSelectedDeleteMediaId("");
    setDeletePreviewOpen(false);
    setBulkDeletePreview(null);
    addNotification({ status: "success", message: "Edit Images opened.", persistent: false });
    pushSkuLog({
      actionType: "OPEN_EDITOR",
      endpoint: "local-ui",
      status: "SUCCESS",
      message: "Opened Edit Images modal",
      subject: group.primarySku,
    });
    setActionFeedback({
      currentAction: "OPEN_EDITOR",
      currentActionStatus: "success",
      currentActionMessage: "Edit Images opened.",
      lastShopifyMediaAction: "OPEN_EDITOR",
    });
  }

  function closeEditor() {
    setEditingProductId("");
    setEditorTab("add");
    setAddForm(getInitialAddForm());
    setSelectedDeleteMediaId("");
    setDeletePreviewOpen(false);
  }

  function handleAddFileChange(file) {
    if (!file) {
      setAddForm((current) => ({
        ...current,
        file: null,
        fileName: "",
        filePreviewUrl: "",
      }));
      return;
    }

    setAddForm((current) => ({
      ...current,
      mode: "upload",
      file,
      fileName: file.name,
      filePreviewUrl: URL.createObjectURL(file),
    }));
  }

  function handleBulkFileChange(file) {
    setBulkAddForm((current) => ({
      ...current,
      mode: "upload",
      file: file || null,
      fileName: file?.name || "",
    }));
  }

  async function handleAddImage() {
    if (!editingGroup) {
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "addImage",
        actionType: "ADD_IMAGE",
        endpoint: addForm.mode === "upload" ? "POST /api/sku-images/add-upload" : "POST /api/sku-images/add-url",
        runningMessage: addForm.mode === "upload" ? "Uploading image to Shopify..." : "Adding image to Shopify...",
        successMessage: "Image added successfully.",
        failurePrefix: "Add image failed",
        subject: editingGroup.primarySku,
        work: async () => {
          if (addForm.mode === "upload") {
            if (!addForm.file) {
              throw new Error("Choose an image from your computer first.");
            }
            const formData = new FormData();
            formData.append("sku", editingGroup.primarySku);
            formData.append("variantId", editingGroup.primaryVariantId);
            formData.append("productId", editingGroup.productId);
            formData.append("altText", addForm.altText);
            formData.append("positionMode", addForm.positionMode);
            formData.append("imageNumber", String(addForm.imageNumber || 1));
            formData.append("image", addForm.file);
            return api.addSkuImageUpload(formData);
          }

          if (!addForm.imageUrl.trim()) {
            throw new Error("Enter an image URL.");
          }

          return api.addSkuImageUrl({
            sku: editingGroup.primarySku,
            variantId: editingGroup.primaryVariantId,
            productId: editingGroup.productId,
            imageUrl: addForm.imageUrl.trim(),
            altText: addForm.altText,
            positionMode: addForm.positionMode,
            imageNumber: Number(addForm.imageNumber) || 1,
          });
        },
      });

      updateItemsForProduct(editingGroup.productId, result.media || []);
      setAddForm(getInitialAddForm());
    } catch {
      // handled in runTrackedAction
    }
  }

  function handlePreviewDelete() {
    if (!deleteTarget) {
      const validationMessage = "Select an image before previewing delete.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      pushSkuLog({
        actionType: "DELETE_PREVIEW",
        endpoint: "local-ui",
        status: "WARNING",
        message: validationMessage,
      });
      return;
    }

    setDeletePreviewOpen(true);
    const previewMessage = "Delete preview ready. Please confirm before deleting.";
    addNotification({ status: "success", message: previewMessage, persistent: false });
    pushSkuLog({
      actionType: "DELETE_PREVIEW",
      endpoint: "local-ui",
      status: "SUCCESS",
      message: previewMessage,
      subject: deleteTarget.id,
    });
    setActionFeedback({
      currentAction: "DELETE_PREVIEW",
      currentActionStatus: "success",
      currentActionMessage: previewMessage,
      lastShopifyMediaAction: "DELETE_PREVIEW",
    });
  }

  async function handleConfirmDelete() {
    if (!editingGroup || !deleteTarget) {
      const validationMessage = "Select an image to delete first.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "confirmDelete",
        actionType: "DELETE_IMAGE",
        endpoint: "POST /api/sku-images/delete",
        runningMessage: "Deleting image...",
        successMessage: "Image deleted successfully.",
        failurePrefix: "Delete failed",
        subject: deleteTarget.id,
        work: () => api.deleteSkuImage({
          sku: editingGroup.primarySku,
          variantId: editingGroup.primaryVariantId,
          productId: editingGroup.productId,
          mediaId: deleteTarget.id,
        }),
      });

      updateItemsForProduct(editingGroup.productId, result.media || []);
      setSelectedDeleteMediaId("");
      setDeletePreviewOpen(false);
    } catch {
      // handled in runTrackedAction
    }
  }

  function moveDraftMedia(fromIndex, toIndex) {
    if (!editingGroup) {
      return;
    }
    const currentMedia = draftOrders[editingGroup.productId] || editingGroup.media;
    const nextMedia = moveItem(currentMedia, fromIndex, toIndex).map((media, index, array) => ({
      ...media,
      position: index + 1,
      isFirst: index === 0,
      isLast: index === array.length - 1,
    }));
    setDraftOrders((current) => ({
      ...current,
      [editingGroup.productId]: nextMedia,
    }));
  }

  async function handleSaveReorder() {
    if (!editingGroup) {
      return;
    }
    const draft = draftOrders[editingGroup.productId];
    if (!draft?.length) {
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "saveOrder",
        actionType: "SAVE_REORDER",
        endpoint: "POST /api/sku-images/reorder",
        runningMessage: "Saving new image order...",
        successMessage: "Image order saved successfully.",
        failurePrefix: "Save order failed",
        subject: editingGroup.primarySku,
        work: () => api.reorderSkuImages({
          sku: editingGroup.primarySku,
          variantId: editingGroup.primaryVariantId,
          productId: editingGroup.productId,
          orderedMediaIds: draft.map((media) => media.id),
        }),
      });

      updateItemsForProduct(editingGroup.productId, result.media || []);
    } catch {
      // handled in runTrackedAction
    }
  }

  async function handleBulkAdd() {
    const targetItems = buildTargetItems(productGroups, selectedProductIds, bulkAddForm.applyMode);
    if (!targetItems.length) {
      const validationMessage = "Select at least one product before bulk add.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "bulkAdd",
        actionType: "BULK_ADD",
        endpoint: bulkAddForm.mode === "upload" ? "POST /api/sku-images/bulk-add-upload" : "POST /api/sku-images/bulk-add",
        runningMessage: "Running bulk add...",
        successMessage: (payload) => {
          const partial = payload.counts.failed > 0 || payload.counts.skipped > 0;
          return partial
            ? `Bulk add partially completed: ${payload.counts.success} success, ${payload.counts.skipped} skipped, ${payload.counts.failed} failed.`
            : `Bulk add completed: ${payload.counts.success} success.`;
        },
        successStatus: "PARTIALLY COMPLETED",
        failurePrefix: "Bulk add failed",
        work: async () => {
          if (bulkAddForm.mode === "upload") {
            if (!bulkAddForm.file) {
              throw new Error("Choose a desktop image before bulk add.");
            }
            const formData = new FormData();
            formData.append("items", JSON.stringify(targetItems));
            formData.append("altText", bulkAddForm.altText);
            formData.append("positionMode", bulkAddForm.positionMode);
            formData.append("imageNumber", String(bulkAddForm.imageNumber || 1));
            formData.append("image", bulkAddForm.file);
            return api.bulkAddSkuImagesUpload(formData);
          }

          if (!bulkAddForm.imageUrl.trim()) {
            throw new Error("Enter an image URL before bulk add.");
          }

          return api.bulkAddSkuImages({
            items: targetItems,
            imageUrl: bulkAddForm.imageUrl.trim(),
            altText: bulkAddForm.altText,
            positionMode: bulkAddForm.positionMode,
            imageNumber: Number(bulkAddForm.imageNumber) || 1,
          });
        },
      });

      if (result.counts.failed === 0 && result.counts.skipped === 0) {
        setActionMeta((current) => ({ ...current, currentActionStatus: "success" }));
      }

      if (query.trim()) {
        await handleSearch();
      } else {
        await handleLoadAll();
      }
    } catch {
      // handled in runTrackedAction
    }
  }

  async function handleBulkDeletePreview() {
    const targetItems = buildTargetItems(productGroups, selectedProductIds, bulkDeleteForm.applyMode);
    if (!targetItems.length) {
      const validationMessage = "Select at least one product before bulk delete preview.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "bulkDeletePreview",
        actionType: "BULK_DELETE_PREVIEW",
        endpoint: "POST /api/sku-images/bulk-delete-preview",
        runningMessage: "Previewing bulk delete...",
        successMessage: "Delete preview ready. Please confirm before deleting.",
        failurePrefix: "Bulk delete preview failed",
        work: () => api.bulkDeletePreview({
          items: targetItems,
          positionMode: resolvePositionMode(bulkDeleteForm.positionMode),
          imageNumber: Number(bulkDeleteForm.imageNumber) || 1,
        }),
      });
      setBulkDeletePreview(result);
    } catch {
      // handled in runTrackedAction
    }
  }

  async function handleBulkDeleteConfirm() {
    if (!bulkDeletePreview?.previewRows?.length) {
      const validationMessage = "Run bulk delete preview first.";
      setError(validationMessage);
      addNotification({ status: "warning", message: validationMessage, persistent: true });
      return;
    }

    const confirmed = window.confirm(`Delete ${bulkDeletePreview.counts.ready} previewed images?`);
    if (!confirmed) {
      return;
    }

    try {
      const result = await runTrackedAction({
        actionKey: "bulkDeleteConfirm",
        actionType: "BULK_DELETE_CONFIRM",
        endpoint: "POST /api/sku-images/bulk-delete-confirm",
        runningMessage: "Confirming bulk delete...",
        successMessage: (payload) => `Bulk delete completed: ${payload.counts.success} success, ${payload.counts.skipped} skipped, ${payload.counts.failed} failed.`,
        successStatus: "PARTIALLY COMPLETED",
        failurePrefix: "Bulk delete failed",
        work: () => api.bulkDeleteConfirm({
          previewRows: bulkDeletePreview.previewRows,
        }),
      });

      if (result.counts.failed === 0 && result.counts.skipped === 0) {
        setActionMeta((current) => ({ ...current, currentActionStatus: "success" }));
      }

      setBulkDeletePreview(null);
      if (query.trim()) {
        await handleSearch();
      } else {
        await handleLoadAll();
      }
    } catch {
      // handled in runTrackedAction
    }
  }

  const reorderDirty = editingGroup
    ? !arraysEqual(
      (editingGroup.media || []).map((media) => media.id),
      editingMedia.map((media) => media.id),
    )
    : false;

  return (
    <div className="dashboard sku-dashboard sku-image-page">
      <div className="sku-notifier" aria-live="polite">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`sku-toast status-${String(notification.status).toLowerCase().replace(/\s+/g, "-")}`}
            aria-live={notification.status === "error" ? "assertive" : "polite"}
          >
            <div className="sku-toast-main">
              {notification.status === "running" ? <span className="sku-spinner" aria-hidden="true" /> : null}
              <span>{notification.message}</span>
            </div>
            {notification.persistent ? (
              <button type="button" className="sku-toast-dismiss" onClick={() => dismissNotification(notification.id)}>
                Dismiss
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <section className="topbar panel">
        <div className="topbar-header">
          <div>
            <p className="eyebrow">Shopify</p>
            <h2>SKU Image Manager</h2>
          </div>
          <div className="action-row">
            <button className="button ghost" type="button" onClick={handleSearch} disabled={actionState.search}>
              {getActionButtonLabel(actionState, "search")}
            </button>
            <button className="button accent" type="button" onClick={handleLoadAll} disabled={actionState.loadAll}>
              {getActionButtonLabel(actionState, "loadAll")}
            </button>
          </div>
        </div>

        <div className="sku-top-grid">
          <label className="sku-search-field">
            SKU Search
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="One SKU per line or comma separated"
              rows={4}
            />
          </label>
          <div className="sku-summary-grid">
            <div className="sku-summary-card">
              <span className="metric-label">Loaded products</span>
              <strong>{productGroups.length}</strong>
            </div>
            <div className="sku-summary-card">
              <span className="metric-label">Selected products</span>
              <strong>{selectedProductIds.length}</strong>
            </div>
            <div className="sku-summary-card">
              <span className="metric-label">Scopes</span>
              <strong>{scopeWarnings.length ? "Warning" : "Ready"}</strong>
              <small className={scopeWarnings.length ? "error-text" : "success-text"}>
                {scopeWarnings.length ? `Missing: ${scopeWarnings.join(", ")}` : "Required scopes present"}
              </small>
            </div>
          </div>
        </div>

        <div className="status-row">
          {message ? <span className="success-text">{message}</span> : null}
          {error ? <span className="error-text">Could not complete the last action. Please check logs.</span> : null}
        </div>
      </section>

      <section className="sku-results main-content">
        <div className="section-heading">
          <div>
            <h3>Products</h3>
            <p>{isProductsSectionCollapsed ? "Expand the section to view product cards." : "Collapsed by default to reduce scrolling."}</p>
          </div>
          <div className="action-row">
            <button
              className="button ghost compact-button"
              type="button"
              onClick={() => setIsProductsSectionCollapsed((current) => !current)}
            >
              {isProductsSectionCollapsed ? "Expand Products" : "Collapse Products"}
            </button>
            <button className="button ghost compact-button" type="button" onClick={expandAllProducts}>
              Expand All
            </button>
            <button className="button ghost compact-button" type="button" onClick={collapseAllProducts}>
              Collapse All
            </button>
          </div>
        </div>

        {isProductsSectionCollapsed ? (
          <div className="panel empty-state">Product list collapsed. Use “Expand Products” to view all loaded products.</div>
        ) : productGroups.length === 0 ? (
          <div className="panel empty-state">Search a SKU or load all SKUs to start editing product images.</div>
        ) : (
          productGroups.map((group) => {
            const isCollapsed = collapsedProductIds.includes(group.productId);
            return (
              <article className="panel product-card sku-simple-card" key={group.productId}>
                <div className="sku-simple-header">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(group.productId)}
                      onChange={() => toggleSelectedProduct(group.productId)}
                    />
                    Select
                  </label>
                  <div className="sku-simple-text">
                    <h3>{group.productTitle}</h3>
                    <p className="muted">SKU: <span className="mono media-id">{group.primarySku}</span></p>
                    <p className="muted">Images: {group.imageCount}</p>
                    {group.variants.length > 1 ? (
                      <p className="muted">Product media shared across variants.</p>
                    ) : null}
                  </div>
                  <div className="action-row">
                    <button className="button accent" type="button" onClick={() => openEditor(group)}>
                      Edit Images
                    </button>
                    <button className="button ghost compact-button" type="button" onClick={() => toggleProductCollapsed(group.productId)}>
                      {isCollapsed ? "Expand" : "Collapse"}
                    </button>
                  </div>
                </div>

                <div className="sku-preview-strip">
                  {group.media.slice(0, 4).map((media) => (
                    <div className="sku-preview-thumb" key={media.id}>
                      <img src={media.imageUrl || fallbackImage} alt={media.alt || group.productTitle} />
                      <span>Image {media.position}</span>
                    </div>
                  ))}
                </div>

                {!isCollapsed ? (
                  <div className="sku-expanded-details">
                    <div className="sku-expanded-grid">
                      {group.media.map((media) => (
                        <div key={media.id} className="sku-expanded-card">
                          <img src={media.imageUrl || fallbackImage} alt={media.alt || group.productTitle} />
                          <div>
                            <strong>Image {media.position}</strong>
                            <div className="sku-badges">
                              {media.isFirst ? <span className="diagnostic-badge status-success">FIRST</span> : null}
                              {media.isLast ? <span className="diagnostic-badge status-warning">LAST</span> : null}
                            </div>
                          </div>
                          <span className="mono media-id" title={media.id}>{media.id}</span>
                          <span className="muted">Status: {media.status || "READY"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section className="panel sku-bulk-shell">
        <button
          className="sku-collapse-button"
          type="button"
          onClick={() => setIsBulkOpen((current) => !current)}
        >
          Advanced Bulk Actions
        </button>

        {isBulkOpen ? (
          <div className="sku-bulk-content">
            <p className="error-text">Bulk delete is risky. Use only after testing on one SKU.</p>
            <label className="checkbox-label">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              Select all loaded products
            </label>

            <div className="sku-bulk-grid">
              <div className="sku-action-card">
                <h4>Bulk Add</h4>
                <label>
                  Apply to
                  <select
                    value={bulkAddForm.applyMode}
                    onChange={(event) => setBulkAddForm((current) => ({ ...current, applyMode: event.target.value }))}
                  >
                    <option value="selected">Selected products</option>
                    <option value="all">All loaded products</option>
                  </select>
                </label>
                <label>
                  Add from
                  <select
                    value={bulkAddForm.mode}
                    onChange={(event) => setBulkAddForm((current) => ({ ...current, mode: event.target.value }))}
                  >
                    <option value="upload">Computer upload</option>
                    <option value="url">Image URL</option>
                  </select>
                </label>
                {bulkAddForm.mode === "upload" ? (
                  <label>
                    Choose image from computer
                    <input type="file" accept="image/*" onChange={(event) => handleBulkFileChange(event.target.files?.[0])} />
                  </label>
                ) : (
                  <label>
                    Image URL
                    <input
                      type="text"
                      value={bulkAddForm.imageUrl}
                      onChange={(event) => setBulkAddForm((current) => ({ ...current, imageUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                )}
                <label>
                  Position
                  <select
                    value={bulkAddForm.positionMode}
                    onChange={(event) => setBulkAddForm((current) => ({ ...current, positionMode: event.target.value }))}
                  >
                    <option value="last">Last image</option>
                    <option value="first">First image</option>
                    <option value="after">After image number</option>
                    <option value="before">Before image number</option>
                  </select>
                </label>
                {(bulkAddForm.positionMode === "after" || bulkAddForm.positionMode === "before") ? (
                  <label>
                    Image number
                    <input
                      type="number"
                      min="1"
                      value={bulkAddForm.imageNumber}
                      onChange={(event) => setBulkAddForm((current) => ({ ...current, imageNumber: event.target.value }))}
                    />
                  </label>
                ) : null}
                <button className="button accent" type="button" onClick={handleBulkAdd} disabled={actionState.bulkAdd}>
                  {getActionButtonLabel(actionState, "bulkAdd")}
                </button>
              </div>

              <div className="sku-action-card">
                <h4>Bulk Delete</h4>
                <label>
                  Apply to
                  <select
                    value={bulkDeleteForm.applyMode}
                    onChange={(event) => setBulkDeleteForm((current) => ({ ...current, applyMode: event.target.value }))}
                  >
                    <option value="selected">Selected products</option>
                    <option value="all">All loaded products</option>
                  </select>
                </label>
                <label>
                  Delete
                  <select
                    value={bulkDeleteForm.positionMode}
                    onChange={(event) => setBulkDeleteForm((current) => ({ ...current, positionMode: event.target.value }))}
                  >
                    <option value="first">First image</option>
                    <option value="last">Last image</option>
                    <option value="number">Specific image number</option>
                  </select>
                </label>
                {bulkDeleteForm.positionMode === "number" ? (
                  <label>
                    Image number
                    <input
                      type="number"
                      min="1"
                      value={bulkDeleteForm.imageNumber}
                      onChange={(event) => setBulkDeleteForm((current) => ({ ...current, imageNumber: event.target.value }))}
                    />
                  </label>
                ) : null}
                <div className="action-row">
                  <button className="button ghost" type="button" onClick={handleBulkDeletePreview} disabled={actionState.bulkDeletePreview}>
                    {getActionButtonLabel(actionState, "bulkDeletePreview")}
                  </button>
                  <button className="button metal" type="button" onClick={handleBulkDeleteConfirm} disabled={actionState.bulkDeleteConfirm || !bulkDeletePreview?.previewRows?.length}>
                    {getActionButtonLabel(actionState, "bulkDeleteConfirm")}
                  </button>
                </div>
              </div>
            </div>

            {bulkDeletePreview?.previewRows?.length ? (
              <div className="table-wrap sku-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Image</th>
                      <th>Thumbnail</th>
                      <th>Media ID</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkDeletePreview.previewRows.map((row) => (
                      <tr key={`${row.productId}-${row.mediaId || row.reason}`}>
                        <td>{row.sku}</td>
                        <td>{row.productTitle}</td>
                        <td>{row.imagePosition ? `Image ${row.imagePosition}` : "-"}</td>
                        <td><img className="sku-mini-thumb" src={row.thumbnail || fallbackImage} alt={row.sku} /></td>
                        <td className="mono media-id">{row.mediaId || "-"}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {editingGroup ? (
        <div className="sku-modal-backdrop" role="presentation" onClick={closeEditor}>
          <section className="sku-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <h3>Edit Images</h3>
                <p>{editingGroup.productTitle}</p>
                <p className="muted">Primary SKU: <span className="mono media-id">{editingGroup.primarySku}</span></p>
              </div>
              <button className="button ghost compact-button" type="button" onClick={closeEditor}>
                Close
              </button>
            </div>

            <div className="sku-modal-tabs">
              {["add", "delete", "reorder"].map((tab) => (
                <button
                  key={tab}
                  className={`button ${editorTab === tab ? "accent" : "ghost"}`}
                  type="button"
                  onClick={() => setEditorTab(tab)}
                >
                  {tab === "add" ? "Add Image" : tab === "delete" ? "Delete Image" : "Reorder Images"}
                </button>
              ))}
            </div>

            {editorTab === "add" ? (
              <div className="sku-modal-body">
                <div className="sku-action-card">
                  <h4>Add Image</h4>
                  <label>
                    Add from
                    <select
                      value={addForm.mode}
                      onChange={(event) => setAddForm((current) => ({ ...current, mode: event.target.value }))}
                    >
                      <option value="upload">Choose image from computer</option>
                      <option value="url">Image URL</option>
                    </select>
                  </label>
                  {addForm.mode === "upload" ? (
                    <>
                      <label>
                        Choose image from computer
                        <input type="file" accept="image/*" onChange={(event) => handleAddFileChange(event.target.files?.[0])} />
                      </label>
                      {addForm.fileName ? <p className="muted">Selected file: {addForm.fileName}</p> : null}
                      {addForm.filePreviewUrl ? (
                        <div className="sku-upload-preview">
                          <span className="muted">Preview</span>
                          <img src={addForm.filePreviewUrl} alt={addForm.fileName} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <label>
                      Image URL
                      <input
                        type="text"
                        value={addForm.imageUrl}
                        onChange={(event) => setAddForm((current) => ({ ...current, imageUrl: event.target.value }))}
                        placeholder="https://..."
                      />
                    </label>
                  )}
                  <label>
                    Alt text
                    <input
                      type="text"
                      value={addForm.altText}
                      onChange={(event) => setAddForm((current) => ({ ...current, altText: event.target.value }))}
                      placeholder="Optional alt text"
                    />
                  </label>
                  <label>
                    Position
                    <select
                      value={addForm.positionMode}
                      onChange={(event) => setAddForm((current) => ({ ...current, positionMode: event.target.value }))}
                    >
                      <option value="last">Last image</option>
                      <option value="first">First image</option>
                      <option value="after">After image number</option>
                      <option value="before">Before image number</option>
                    </select>
                  </label>
                  {(addForm.positionMode === "after" || addForm.positionMode === "before") ? (
                    <label>
                      Image number
                      <select
                        value={addForm.imageNumber}
                        onChange={(event) => setAddForm((current) => ({ ...current, imageNumber: Number(event.target.value) }))}
                      >
                        {editingMedia.map((media) => (
                          <option key={media.id} value={media.position}>
                            Image {media.position}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button className="button accent" type="button" onClick={handleAddImage} disabled={actionState.addImage}>
                    {getActionButtonLabel(actionState, "addImage")}
                  </button>
                </div>
              </div>
            ) : null}

            {editorTab === "delete" ? (
              <div className="sku-modal-body">
                <div className="sku-delete-grid image-grid">
                  {editingMedia.map((media) => (
                    <button
                      className={`sku-delete-card image-card ${selectedDeleteMediaId === media.id ? "selected" : ""}`}
                      type="button"
                      key={media.id}
                      onClick={() => {
                        setSelectedDeleteMediaId(media.id);
                        setDeletePreviewOpen(false);
                      }}
                    >
                      <img src={media.imageUrl || fallbackImage} alt={media.alt || editingGroup.productTitle} />
                      <strong>Image {media.position}</strong>
                      <span className="muted">{media.isFirst ? "First" : media.isLast ? "Last" : "Middle"}</span>
                    </button>
                  ))}
                </div>
                {deleteTarget ? (
                  <div className="sku-delete-preview">
                    <p>Selected: Image {deleteTarget.position}</p>
                    <button className="button ghost" type="button" onClick={handlePreviewDelete} disabled={actionState.previewDelete}>
                      {getActionButtonLabel(actionState, "previewDelete")}
                    </button>
                  </div>
                ) : null}
                {deletePreviewOpen && deleteTarget ? (
                  <div className="sku-preview-box">
                    <span className="muted">You are about to delete</span>
                    <strong>{editingGroup.productTitle}</strong>
                    <span>Image {deleteTarget.position}</span>
                    <span className="mono media-id">{deleteTarget.id}</span>
                    <div className="action-row">
                      <button className="button ghost" type="button" onClick={() => setDeletePreviewOpen(false)}>
                        Cancel
                      </button>
                      <button className="button metal" type="button" onClick={handleConfirmDelete} disabled={actionState.confirmDelete}>
                        {getActionButtonLabel(actionState, "confirmDelete")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {editorTab === "reorder" ? (
              <div className="sku-modal-body">
                <div className="sku-reorder-list">
                  {editingMedia.map((media, index) => (
                    <div className="sku-reorder-row" key={media.id}>
                      <div className="sku-reorder-meta">
                        <img src={media.imageUrl || fallbackImage} alt={media.alt || editingGroup.productTitle} />
                        <div>
                          <strong>Image {index + 1}</strong>
                          <p className="mono media-id">{media.id}</p>
                        </div>
                      </div>
                      <div className="action-row">
                        <button className="button ghost compact-button" type="button" onClick={() => moveDraftMedia(index, index - 1)} disabled={index === 0 || actionState.saveOrder}>
                          Move Left
                        </button>
                        <button className="button ghost compact-button" type="button" onClick={() => moveDraftMedia(index, index + 1)} disabled={index === editingMedia.length - 1 || actionState.saveOrder}>
                          Move Right
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="button accent" type="button" onClick={handleSaveReorder} disabled={!reorderDirty || actionState.saveOrder}>
                  {getActionButtonLabel(actionState, "saveOrder")}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
