import { request } from "./api.js";

/**
 * Meta Ads Dashboard domain API client (read-only).
 *
 * Delegates all HTTP to the shared transport in api.js. Every method maps to a
 * read-only backend endpoint — there are NO Meta mutation operations here.
 * The Meta access token never exists on the frontend; it stays on the server.
 */
function withRange(path, since, until, bypassCache = false) {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  if (until) params.set("until", until);
  if (bypassCache) params.set("bypassCache", "true");
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  getHealth: (bypassCache = false) =>
    request(withRange("/meta-ads/health", null, null, bypassCache)),
  getAccount: () => request("/meta-ads/account"),
  getSummary: (since, until, bypassCache = false) =>
    request(withRange("/meta-ads/summary", since, until, bypassCache)),
  getDaily: (since, until, bypassCache = false) =>
    request(withRange("/meta-ads/daily", since, until, bypassCache)),
  getCampaigns: (since, until, bypassCache = false) =>
    request(withRange("/meta-ads/campaigns", since, until, bypassCache)),
  getAdSets: (campaignId, since, until, bypassCache = false) => {
    const params = new URLSearchParams({ campaignId });
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    if (bypassCache) params.set("bypassCache", "true");
    return request(`/meta-ads/adsets?${params.toString()}`);
  },
  getAds: (adsetId, since, until, bypassCache = false) => {
    const params = new URLSearchParams({ adsetId });
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    if (bypassCache) params.set("bypassCache", "true");
    return request(`/meta-ads/ads?${params.toString()}`);
  },
  refresh: () =>
    request("/meta-ads/refresh", { method: "POST", body: JSON.stringify({}) }),
};
