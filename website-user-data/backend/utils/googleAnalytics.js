const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const fs = require('fs');
const path = require('path');

/**
 * Creates and returns an authenticated GA4 client.
 */
function getGAClient() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not defined.');
  }

  const keyPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Google Application Credentials key file not found at path: ${keyPath}`);
  }

  return new BetaAnalyticsDataClient();
}

/**
 * Normalizes values to numbers.
 */
function parseVal(val) {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * 1. Fetch GA4 Overview Report
 */
async function fetchGA4Overview(propertyId) {
  const client = getGAClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'totalUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'purchaseRevenue' },
      { name: 'ecommercePurchases' }
    ]
  });

  const row = response.rows && response.rows[0];
  const metricValues = row ? row.metricValues : [];
  const headers = response.metricHeaders.map(h => h.name);
  const data = {};

  headers.forEach((name, index) => {
    data[name] = parseVal(metricValues[index]?.value || 0);
  });

  return {
    sessions: data.sessions || 0,
    activeUsers: data.activeUsers || 0,
    totalUsers: data.totalUsers || 0,
    conversions: data.conversions || 0,
    totalRevenue: data.totalRevenue || data.purchaseRevenue || 0,
    ecommercePurchases: data.ecommercePurchases || 0
  };
}

/**
 * 2. Fetch GA4 Product Performance (Ecommerce)
 */
async function fetchGA4Products(propertyId) {
  const client = getGAClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [
      { name: 'itemId' },
      { name: 'itemName' }
    ],
    metrics: [
      { name: 'itemsViewed' },
      { name: 'itemsAddedToCart' },
      { name: 'itemsCheckedOut' },
      { name: 'itemsPurchased' },
      { name: 'itemRevenue' }
    ]
  });

  return (response.rows || []).map(row => {
    return {
      itemId: row.dimensionValues[0]?.value || '',
      itemName: row.dimensionValues[1]?.value || '',
      views: parseVal(row.metricValues[0]?.value),
      atc: parseVal(row.metricValues[1]?.value),
      checkout: parseVal(row.metricValues[2]?.value),
      purchase: parseVal(row.metricValues[3]?.value),
      revenue: parseVal(row.metricValues[4]?.value)
    };
  });
}

/**
 * 3. Fetch GA4 Events Report
 */
async function fetchGA4Events(propertyId) {
  const client = getGAClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [
      { name: 'eventCount' },
      { name: 'activeUsers' }
    ]
  });

  return (response.rows || []).map(row => {
    return {
      eventName: row.dimensionValues[0]?.value || '',
      eventCount: parseInt(row.metricValues[0]?.value || 0, 10),
      activeUsers: parseInt(row.metricValues[1]?.value || 0, 10)
    };
  });
}

/**
 * 4. Fetch GA4 Realtime Statistics
 */
async function fetchGA4Realtime(propertyId) {
  const client = getGAClient();
  const [response] = await client.runRealtimeReport({
    property: `properties/${propertyId}`,
    dimensions: [
      { name: 'eventName' },
      { name: 'pagePath' }
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'eventCount' }
    ]
  });

  return (response.rows || []).map(row => {
    return {
      eventName: row.dimensionValues[0]?.value || '',
      pagePath: row.dimensionValues[1]?.value || '',
      activeUsers: parseInt(row.metricValues[0]?.value || 0, 10),
      eventCount: parseInt(row.metricValues[1]?.value || 0, 10)
    };
  });
}

/**
 * 5. Fetch GA4 Session Traffic Sources
 */
async function fetchGA4Sources(propertyId) {
  const client = getGAClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [
      { name: 'sessionSource' },
      { name: 'sessionMedium' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' }
    ]
  });

  return (response.rows || []).map(row => {
    return {
      sessionSource: row.dimensionValues[0]?.value || '',
      sessionMedium: row.dimensionValues[1]?.value || '',
      sessions: parseInt(row.metricValues[0]?.value || 0, 10),
      activeUsers: parseInt(row.metricValues[1]?.value || 0, 10),
      conversions: parseInt(row.metricValues[2]?.value || 0, 10),
      totalRevenue: parseVal(row.metricValues[3]?.value)
    };
  });
}

/**
 * 6. Fetch GA4 Pages and Screens Report
 */
async function fetchGA4Pages(propertyId) {
  const client = getGAClient();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' }
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'exits' }
    ]
  });

  return (response.rows || []).map(row => {
    return {
      pagePath: row.dimensionValues[0]?.value || '',
      pageTitle: row.dimensionValues[1]?.value || '',
      views: parseInt(row.metricValues[0]?.value || 0, 10),
      sessions: parseInt(row.metricValues[1]?.value || 0, 10),
      exits: parseInt(row.metricValues[2]?.value || 0, 10)
    };
  });
}

module.exports = {
  fetchGA4Overview,
  fetchGA4Products,
  fetchGA4Events,
  fetchGA4Realtime,
  fetchGA4Sources,
  fetchGA4Pages
};
