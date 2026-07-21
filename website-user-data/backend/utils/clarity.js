const axios = require('axios');

const BASE_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

/**
 * Basic fetch helper for Clarity API.
 */
async function fetchFromClarity(token, projectId, params = {}) {
  if (!token) {
    throw new Error('Clarity API Token (CLARITY_API_TOKEN) is not configured.');
  }
  if (!projectId) {
    throw new Error('Clarity Project ID (CLARITY_PROJECT_ID) is not configured.');
  }

  const response = await axios.get(BASE_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    params: {
      projectId,
      numOfDays: 1, // default to 24 hours
      ...params
    }
  });

  return response.data;
}

/**
 * 1. Fetch Clarity Overview Statistics (No dimensions)
 */
async function fetchClarityOverview(token, projectId) {
  const data = await fetchFromClarity(token, projectId);
  
  // Parse metrics out of the response.
  // Response may be structured as array or direct object. Normalize:
  const insights = data.insights || data.data || data || {};
  
  // Microsoft Clarity metrics mapping:
  const sessions = insights.sessions || insights.sessionCount || 0;
  const users = insights.users || insights.userCount || insights.distinctUsers || 0;
  const botSessions = insights.botSessions || insights.botSessionCount || 0;
  const scrollDepth = insights.averageScrollDepth || insights.scrollDepth || 0;
  const quickBacks = insights.quickBacks || insights.quickBackCount || 0;
  const deadClicks = insights.deadClicks || insights.deadClickCount || 0;
  const rageClicks = insights.rageClicks || insights.rageClickCount || 0;

  return {
    sessions,
    users,
    botSessions,
    scrollDepth,
    quickBacks,
    deadClicks,
    rageClicks
  };
}

/**
 * 2. Fetch Clarity Devices breakdown (dimension1=Device)
 */
async function fetchClarityDevices(token, projectId) {
  const data = await fetchFromClarity(token, projectId, { dimension1: 'Device' });
  const rows = data.insights || data.data || [];
  
  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  
  if (Array.isArray(rows)) {
    rows.forEach(row => {
      const dev = String(row.dimension1 || row.device || '').toLowerCase();
      const sessions = row.sessions || (row.metrics && row.metrics.sessions) || 0;
      
      if (dev.includes('desktop') || dev.includes('pc')) {
        devices.desktop += sessions;
      } else if (dev.includes('mobile') || dev.includes('phone')) {
        devices.mobile += sessions;
      } else if (dev.includes('tablet') || dev.includes('pad')) {
        devices.tablet += sessions;
      }
    });
  }
  
  return devices;
}

/**
 * 3. Fetch Clarity Traffic Sources (dimension1=Source)
 */
async function fetchClaritySources(token, projectId) {
  const data = await fetchFromClarity(token, projectId, { dimension1: 'Source' });
  const rows = data.insights || data.data || [];
  
  const sources = [];
  
  if (Array.isArray(rows)) {
    rows.forEach(row => {
      const source = String(row.dimension1 || row.source || '').trim();
      const sessions = row.sessions || (row.metrics && row.metrics.sessions) || 0;
      if (source && !source.toLowerCase().includes('total')) {
        sources.push({ source, sessions });
      }
    });
  }
  
  return sources;
}

/**
 * 4. Fetch Clarity Pages / Popular URLs (dimension1=URL)
 */
async function fetchClarityPages(token, projectId) {
  const data = await fetchFromClarity(token, projectId, { dimension1: 'URL' });
  const rows = data.insights || data.data || [];
  
  const pages = [];
  
  if (Array.isArray(rows)) {
    rows.forEach(row => {
      const url = String(row.dimension1 || row.url || '').trim();
      const sessions = row.sessions || (row.metrics && row.metrics.sessions) || 0;
      const views = row.views || (row.metrics && row.metrics.views) || sessions; // Fallback to sessions if views missing
      if (url) {
        pages.push({ url, sessions, views });
      }
    });
  }
  
  return pages;
}

module.exports = {
  fetchClarityOverview,
  fetchClarityDevices,
  fetchClaritySources,
  fetchClarityPages
};
