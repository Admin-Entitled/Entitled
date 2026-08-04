import { request } from "./api.js";

export const api = {
  searchSkuImages: (sku) =>
    request(`/sku-images/search?sku=${encodeURIComponent(sku)}`),
  loadAllSkuImages: () =>
    request("/sku-images/load-all", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  addSkuImageUpload: (formData) =>
    request("/sku-images/add-upload", {
      method: "POST",
      body: formData,
    }),
  addSkuImageUrl: (body) =>
    request("/sku-images/add-url", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addSkuImage: (body) =>
    request("/sku-images/add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteSkuImage: (body) =>
    request("/sku-images/delete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reorderSkuImages: (body) =>
    request("/sku-images/reorder", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkAddSkuImages: (body) =>
    request("/sku-images/bulk-add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkAddSkuImagesUpload: (formData) =>
    request("/sku-images/bulk-add-upload", {
      method: "POST",
      body: formData,
    }),
  bulkDeletePreview: (body) =>
    request("/sku-images/bulk-delete-preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkDeleteConfirm: (body) =>
    request("/sku-images/bulk-delete-confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
