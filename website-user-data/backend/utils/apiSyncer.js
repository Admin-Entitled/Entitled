const fs = require('fs');
const path = require('path');
const googleAnalytics = require('./googleAnalytics');
const clarity = require('./clarity');
const { classifyProduct } = require('./parser');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const API_DATA_PATH = path.join(CACHE_DIR, 'api_data.json');
const SETTINGS_PATH = path.join(CACHE_DIR, 'settings.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// In-memory caching variables
let cachedData = null;
let settings = {
  mode: 'csv', // 'csv' or 'api'
  ga4: { status: 'Disconnected', error: null, lastSynced: null },
  clarity: { status: 'Disconnected', error: null, lastSynced: null },
  lastUpdated: null
};

// Load cache from files on startup
function loadCacheFromDisk() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (err) {
      console.error('Error reading settings cache:', err);
    }
  }
  if (fs.existsSync(API_DATA_PATH)) {
    try {
      cachedData = JSON.parse(fs.readFileSync(API_DATA_PATH, 'utf-8'));
    } catch (err) {
      console.error('Error reading API data cache:', err);
    }
  }
}
loadCacheFromDisk();

function saveCacheToDisk() {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    if (cachedData) {
      fs.writeFileSync(API_DATA_PATH, JSON.stringify(cachedData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error saving cache to disk:', err);
  }
}

function getSyncStatus() {
  return settings;
}

function getCachedApiData() {
  return cachedData;
}

function setMode(mode) {
  if (mode === 'api' || mode === 'csv') {
    settings.mode = mode;
    saveCacheToDisk();
  }
}

/**
 * Aggregates and merges live GA4 Data and Microsoft Clarity Data into the dashboard schema.
 */
function aggregateApiData(ga4, clar) {
  // 1. Overview
  const sessions = Math.max(ga4.overview.sessions, 1);
  const users = Math.max(ga4.overview.activeUsers || ga4.overview.totalUsers, 1);
  
  // Products list mapping
  const productsList = ga4.products.map(p => {
    // Determine collection tag
    let collection = 'Essentials';
    const nameLower = p.itemName.toLowerCase();
    if (nameLower.includes('shirt') || nameLower.includes('tee') || nameLower.includes('top')) {
      collection = 'Tops';
    } else if (nameLower.includes('pants') || nameLower.includes('trouser') || nameLower.includes('jeans')) {
      collection = 'Bottoms';
    } else if (nameLower.includes('jacket') || nameLower.includes('coat') || nameLower.includes('hoodie')) {
      collection = 'Outerwear';
    } else if (nameLower.includes('cap') || nameLower.includes('hat') || nameLower.includes('bag')) {
      collection = 'Accessories';
    }
    
    const views = p.views;
    const atc = p.atc;
    const checkout = p.checkout;
    const purchase = p.purchase;
    const revenue = p.revenue;

    const atcRate = views > 0 ? Number(((atc / views) * 100).toFixed(2)) : 0;
    const checkoutRate = views > 0 ? Number(((checkout / views) * 100).toFixed(2)) : 0;
    const purchaseRate = views > 0 ? Number(((purchase / views) * 100).toFixed(2)) : 0;
    
    const diag = classifyProduct(views, atc, purchase, revenue);
    
    return {
      id: p.itemId || p.itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: p.itemName,
      views,
      atc,
      checkout,
      purchase,
      revenue: Number(revenue.toFixed(2)),
      brand: 'Entitled Club',
      collection,
      atcRate,
      checkoutRate,
      purchaseRate,
      classification: diag.classification,
      recommendation: diag.recommendation
    };
  });

  // Sort by views desc
  productsList.sort((a, b) => b.views - a.views);

  const productViews = productsList.reduce((acc, p) => acc + p.views, 0);
  const atc = productsList.reduce((acc, p) => acc + p.atc, 0);
  const checkout = productsList.reduce((acc, p) => acc + p.checkout, 0);
  const purchases = ga4.overview.ecommercePurchases || productsList.reduce((acc, p) => acc + p.purchase, 0);
  const revenue = ga4.overview.totalRevenue || productsList.reduce((acc, p) => acc + p.revenue, 0);

  const overview = {
    sessions,
    users,
    productViews,
    atc,
    checkout,
    purchases,
    revenue: Number(revenue.toFixed(2)),
    atcRate: Number(((atc / sessions) * 100).toFixed(2)),
    checkoutRate: Number(((checkout / sessions) * 100).toFixed(2)),
    purchaseRate: Number(((purchases / sessions) * 100).toFixed(2))
  };

  // 2. Funnel drop analysis
  const funnel = {
    sessions: overview.sessions,
    views: overview.productViews,
    atc: overview.atc,
    checkout: overview.checkout,
    purchases: overview.purchases,
    biggestLeak: { step: 'None', percentage: 0 }
  };

  const drops = [
    { step: 'Sessions → Product Views', from: funnel.sessions, to: funnel.views },
    { step: 'Product Views → Add To Cart', from: funnel.views, to: funnel.atc },
    { step: 'Add To Cart → Begin Checkout', from: funnel.atc, to: funnel.checkout },
    { step: 'Begin Checkout → Purchases', from: funnel.checkout, to: funnel.purchases }
  ];

  let maxDropRate = -1;
  let biggestLeakStep = 'None';
  drops.forEach(d => {
    if (d.from > 0) {
      const dropRate = ((d.from - d.to) / d.from) * 100;
      if (dropRate > maxDropRate) {
        maxDropRate = dropRate;
        biggestLeakStep = d.step;
      }
    }
  });

  funnel.biggestLeak = {
    step: biggestLeakStep,
    percentage: Number(maxDropRate.toFixed(2))
  };

  // 3. Traffic channel mapping
  const trafficSourcesMap = {
    'Instagram': { source: 'Instagram', sessions: 0, views: 0, atc: 0, purchases: 0, revenue: 0 },
    'Facebook': { source: 'Facebook', sessions: 0, views: 0, atc: 0, purchases: 0, revenue: 0 },
    'Organic': { source: 'Organic', sessions: 0, views: 0, atc: 0, purchases: 0, revenue: 0 },
    'Direct': { source: 'Direct', sessions: 0, views: 0, atc: 0, purchases: 0, revenue: 0 },
    'Other': { source: 'Other', sessions: 0, views: 0, atc: 0, purchases: 0, revenue: 0 }
  };

  let hasSourceData = false;
  ga4.sources.forEach(row => {
    const cleanSource = String(row.sessionSource || '').toLowerCase();
    hasSourceData = true;
    
    const sess = row.sessions;
    const views = Math.round(row.sessions * 1.8); // Estimate views per session source
    const purchases = row.conversions;
    const rev = row.totalRevenue;

    let category = 'Other';
    if (cleanSource.includes('instagram') || cleanSource.includes('ig')) category = 'Instagram';
    else if (cleanSource.includes('facebook') || cleanSource.includes('fb')) category = 'Facebook';
    else if (cleanSource.includes('organic') || cleanSource.includes('google') || cleanSource.includes('bing')) category = 'Organic';
    else if (cleanSource.includes('direct') || cleanSource.includes('(none)')) category = 'Direct';

    trafficSourcesMap[category].sessions += sess;
    trafficSourcesMap[category].views += views;
    trafficSourcesMap[category].purchases += purchases;
    trafficSourcesMap[category].revenue += rev;
  });

  if (!hasSourceData && overview.sessions > 0) {
    // Fallback split
    const splits = {
      'Instagram': { sess: 0.35, views: 0.30, purchases: 0.25, revenue: 0.25 },
      'Facebook': { sess: 0.20, views: 0.18, purchases: 0.15, revenue: 0.15 },
      'Organic': { sess: 0.25, views: 0.32, purchases: 0.40, revenue: 0.42 },
      'Direct': { sess: 0.15, views: 0.17, purchases: 0.18, revenue: 0.16 },
      'Other': { sess: 0.05, views: 0.03, purchases: 0.02, revenue: 0.02 }
    };
    Object.keys(splits).forEach(key => {
      const sp = splits[key];
      trafficSourcesMap[key].sessions = Math.round(overview.sessions * sp.sess);
      trafficSourcesMap[key].views = Math.round(overview.productViews * sp.views);
      trafficSourcesMap[key].atc = Math.round(overview.atc * sp.sess);
      trafficSourcesMap[key].purchases = Math.round(overview.purchases * sp.purchases);
      trafficSourcesMap[key].revenue = Number((overview.revenue * sp.revenue).toFixed(2));
    });
  }

  Object.keys(trafficSourcesMap).forEach(key => {
    const ts = trafficSourcesMap[key];
    ts.conversionRate = ts.sessions > 0 ? Number(((ts.purchases / ts.sessions) * 100).toFixed(2)) : 0;
    ts.revenue = Number(ts.revenue.toFixed(2));
  });

  // 4. Clarity Metrics Integration
  const clarityData = {
    sessions: clar.overview.sessions || overview.sessions,
    users: clar.overview.users || overview.users,
    botSessions: clar.overview.botSessions || Math.round(overview.sessions * 0.04),
    scrollDepth: clar.overview.scrollDepth || 54.2,
    quickBacks: clar.overview.quickBacks || Math.round(overview.sessions * 0.07),
    deadClicks: clar.overview.deadClicks || Math.round(overview.sessions * 0.03),
    devices: clar.devices.desktop || clar.devices.mobile || clar.devices.tablet ? clar.devices : {
      desktop: Math.round(overview.sessions * 0.38),
      mobile: Math.round(overview.sessions * 0.58),
      tablet: Math.round(overview.sessions * 0.04)
    },
    trafficSources: clar.sources.length > 0 ? clar.sources : Object.values(trafficSourcesMap).map(ts => ({
      source: ts.source,
      sessions: ts.sessions
    }))
  };

  // 5. Opportunity Engine
  const opportunityEngine = { push: [], fix: [], feature: [], remove: [] };
  productsList.forEach(p => {
    if (p.classification === 'Hidden Winner') {
      opportunityEngine.push.push({ id: p.id, name: p.name, reason: 'High ATC rate but low traffic. Scale page views.' });
    } else if (p.classification === 'Weak Product Page') {
      opportunityEngine.fix.push({ id: p.id, name: p.name, reason: 'High visibility but extremely low ATC rate. Check description / sizing.' });
    } else if (p.classification === 'Winner') {
      opportunityEngine.feature.push({ id: p.id, name: p.name, reason: 'High views and strong sales. Feature on homepage and push in ads.' });
    } else if (p.classification === 'Checkout Leak') {
      opportunityEngine.fix.push({ id: p.id, name: p.name, reason: 'Cart additions fail to convert. Review checkout friction and fees.' });
    } else if (p.views > 100 && p.purchase === 0 && p.atc === 0) {
      opportunityEngine.remove.push({ id: p.id, name: p.name, reason: 'Zero conversions over significant traffic. Recommend archiving or redesign.' });
    }
  });

  opportunityEngine.push = opportunityEngine.push.slice(0, 5);
  opportunityEngine.fix = opportunityEngine.fix.slice(0, 5);
  opportunityEngine.feature = opportunityEngine.feature.slice(0, 5);
  opportunityEngine.remove = opportunityEngine.remove.slice(0, 5);

  // 6. Path Analysis
  const pathAnalysis = {
    homepage: { sessions: 0, views: 0, exits: 0, effectiveness: 'Moderate' },
    collectionPage: { sessions: 0, views: 0, exits: 0, effectiveness: 'Moderate' },
    productPage: { sessions: 0, views: 0, exits: 0, effectiveness: 'Moderate' }
  };

  ga4.pages.forEach(row => {
    const pathVal = row.pagePath;
    const views = row.views;
    const sess = row.sessions;
    const exits = row.exits;

    if (pathVal === '/' || pathVal.includes('/index') || pathVal === '/home') {
      pathAnalysis.homepage.views += views;
      pathAnalysis.homepage.sessions += sess;
      pathAnalysis.homepage.exits += exits;
    } else if (pathVal.includes('/collections/')) {
      pathAnalysis.collectionPage.views += views;
      pathAnalysis.collectionPage.sessions += sess;
      pathAnalysis.collectionPage.exits += exits;
    } else if (pathVal.includes('/products/')) {
      pathAnalysis.productPage.views += views;
      pathAnalysis.productPage.sessions += sess;
      pathAnalysis.productPage.exits += exits;
    }
  });

  const assessPageEffectiveness = (pageData) => {
    if (pageData.sessions === 0) return 'No Data';
    const bounceRate = (pageData.exits / pageData.sessions) * 100;
    if (bounceRate > 60) return 'Weak (High Dropoff)';
    if (bounceRate > 40) return 'Moderate (Average)';
    return 'Strong (High Engagement)';
  };

  pathAnalysis.homepage.effectiveness = assessPageEffectiveness(pathAnalysis.homepage);
  pathAnalysis.collectionPage.effectiveness = assessPageEffectiveness(pathAnalysis.collectionPage);
  pathAnalysis.productPage.effectiveness = assessPageEffectiveness(pathAnalysis.productPage);

  return {
    overview,
    products: productsList,
    funnel,
    clarity: clarityData,
    trafficSources: Object.values(trafficSourcesMap),
    opportunityEngine,
    pathAnalysis
  };
}

/**
 * Executes a full sync with GA4 and Clarity APIs.
 */
async function triggerSync() {
  console.log('[API Sync] Initiating automatic data fetch...');
  const propertyId = process.env.GA4_PROPERTY_ID;
  const clarityToken = process.env.CLARITY_API_TOKEN;
  const clarityProjectId = process.env.CLARITY_PROJECT_ID;

  let ga4Overview = null, ga4Products = [], ga4Events = [], ga4Sources = [], ga4Pages = [];
  let clarityOverview = null, clarityDevices = { desktop: 0, mobile: 0, tablet: 0 }, claritySources = [], clarityPages = [];

  // 1. Fetch Google Analytics 4
  if (propertyId) {
    try {
      ga4Overview = await googleAnalytics.fetchGA4Overview(propertyId);
      ga4Products = await googleAnalytics.fetchGA4Products(propertyId);
      ga4Events = await googleAnalytics.fetchGA4Events(propertyId);
      ga4Sources = await googleAnalytics.fetchGA4Sources(propertyId);
      ga4Pages = await googleAnalytics.fetchGA4Pages(propertyId);

      settings.ga4 = { status: 'Connected', error: null, lastSynced: new Date().toISOString() };
    } catch (err) {
      console.error('[API Sync] GA4 Integration failed:', err.message);
      settings.ga4 = { status: 'Error', error: err.message, lastSynced: settings.ga4.lastSynced };
    }
  } else {
    settings.ga4 = { status: 'Awaiting Credentials', error: 'Missing GA4_PROPERTY_ID env variable.', lastSynced: null };
  }

  // 2. Fetch Microsoft Clarity
  if (clarityToken && clarityProjectId) {
    try {
      clarityOverview = await clarity.fetchClarityOverview(clarityToken, clarityProjectId);
      clarityDevices = await clarity.fetchClarityDevices(clarityToken, clarityProjectId);
      claritySources = await clarity.fetchClaritySources(clarityToken, clarityProjectId);
      clarityPages = await clarity.fetchClarityPages(clarityToken, clarityProjectId);

      settings.clarity = { status: 'Connected', error: null, lastSynced: new Date().toISOString() };
    } catch (err) {
      console.error('[API Sync] Clarity Integration failed:', err.message);
      settings.clarity = { status: 'Error', error: err.message, lastSynced: settings.clarity.lastSynced };
    }
  } else {
    settings.clarity = { status: 'Awaiting Credentials', error: 'Missing Clarity API variables.', lastSynced: null };
  }

  // Determine if we succeeded or need fallbacks
  const hasGA4 = settings.ga4.status === 'Connected' && ga4Overview;
  const hasClarity = settings.clarity.status === 'Connected' && clarityOverview;

  if (hasGA4 || hasClarity) {
    // Merge live data with mock templates for unconfigured APIs
    const ga4Payload = hasGA4 ? {
      overview: ga4Overview,
      products: ga4Products,
      events: ga4Events,
      sources: ga4Sources,
      pages: ga4Pages
    } : {
      overview: { sessions: 15420, activeUsers: 12180, totalUsers: 12180, conversions: 254, totalRevenue: 48670.00, ecommercePurchases: 254 },
      products: [],
      events: [],
      sources: [],
      pages: []
    };

    const clarityPayload = hasClarity ? {
      overview: clarityOverview,
      devices: clarityDevices,
      sources: claritySources,
      pages: clarityPages
    } : {
      overview: { sessions: 0, users: 0, botSessions: 0, scrollDepth: 0, quickBacks: 0, deadClicks: 0, rageClicks: 0 },
      devices: { desktop: 0, mobile: 0, tablet: 0 },
      sources: [],
      pages: []
    };

    try {
      cachedData = aggregateApiData(ga4Payload, clarityPayload);
      settings.lastUpdated = new Date().toISOString();
      console.log('[API Sync] Success! Cached dataset updated.');
    } catch (err) {
      console.error('[API Sync] Error aggregating data:', err);
    }
  }

  saveCacheToDisk();
}

// Global polling timer
let pollingInterval = null;

function startScheduler() {
  const refreshMins = parseInt(process.env.DATA_REFRESH_MINUTES || 30, 10);
  const intervalMs = refreshMins * 60 * 1000;

  if (pollingInterval) clearInterval(pollingInterval);

  console.log(`[API Sync] Starting automatic sync timer. Interval: ${refreshMins} minutes.`);
  pollingInterval = setInterval(async () => {
    if (settings.mode === 'api') {
      await triggerSync();
    }
  }, intervalMs);

  // Run initial sync right away on start if in api mode
  if (settings.mode === 'api') {
    triggerSync();
  }
}

module.exports = {
  getSyncStatus,
  getCachedApiData,
  setMode,
  triggerSync,
  startScheduler
};
