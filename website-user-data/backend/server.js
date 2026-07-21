require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { processReports } = require('./utils/parser');
const apiSyncer = require('./utils/apiSyncer');
const googleAnalytics = require('./utils/googleAnalytics');
const clarity = require('./utils/clarity');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'db.json');

// Configure Multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Keep it static per slot to allow overwrite/replacement
    cb(null, `${file.fieldname}.csv`);
  }
});
const upload = multer({ storage });

// High-fidelity default/mock dataset for Entitled Club
const defaultData = {
  overview: {
    sessions: 15420,
    users: 12180,
    productViews: 28430,
    atc: 1845,
    checkout: 612,
    purchases: 254,
    revenue: 48670.00,
    atcRate: 11.96,
    checkoutRate: 3.97,
    purchaseRate: 1.65
  },
  products: [
    {
      id: 'velvet-obsidian-hoodie',
      name: 'Velvet Obsidian Hoodie',
      views: 7420,
      atc: 820,
      checkout: 290,
      purchase: 142,
      revenue: 28400.00,
      atcRate: 11.05,
      checkoutRate: 3.91,
      purchaseRate: 1.91,
      brand: 'Entitled Club',
      collection: 'Outerwear',
      classification: 'Winner',
      recommendation: 'Feature in collection / Push with ads'
    },
    {
      id: 'entitled-club-sig-tee',
      name: 'Entitled Club Sig Tee',
      views: 9840,
      atc: 490,
      checkout: 120,
      purchase: 48,
      revenue: 4320.00,
      atcRate: 4.98,
      checkoutRate: 1.22,
      purchaseRate: 0.49,
      brand: 'Entitled Club',
      collection: 'Tops',
      classification: 'Weak Product Page',
      recommendation: 'Improve product page description / images'
    },
    {
      id: 'crimson-leather-duffle',
      name: 'Crimson Leather Duffle',
      views: 890,
      atc: 125,
      checkout: 42,
      purchase: 4,
      revenue: 1400.00,
      atcRate: 14.04,
      checkoutRate: 4.72,
      purchaseRate: 0.45,
      brand: 'Entitled Club',
      collection: 'Accessories',
      classification: 'Checkout Leak',
      recommendation: 'Fix checkout / Check pricing or shipping cost'
    },
    {
      id: 'champagne-silk-trouser',
      name: 'Champagne Silk Trouser',
      views: 280,
      atc: 32,
      checkout: 18,
      purchase: 9,
      revenue: 1620.00,
      atcRate: 11.43,
      checkoutRate: 6.43,
      purchaseRate: 3.21,
      brand: 'Entitled Club',
      collection: 'Bottoms',
      classification: 'Winner',
      recommendation: 'Feature in collection / Push with ads'
    },
    {
      id: 'monogram-brass-cap',
      name: 'Monogram Brass Cap',
      views: 140,
      atc: 18,
      checkout: 4,
      purchase: 2,
      revenue: 190.00,
      atcRate: 12.86,
      checkoutRate: 2.86,
      purchaseRate: 1.43,
      brand: 'Entitled Club',
      collection: 'Accessories',
      classification: 'Hidden Winner',
      recommendation: 'Increase visibility / Drive traffic'
    },
    {
      id: 'essential-black-tee',
      name: 'Essential Black Tee',
      views: 3120,
      atc: 290,
      checkout: 115,
      purchase: 45,
      revenue: 3150.00,
      atcRate: 9.29,
      checkoutRate: 3.69,
      purchaseRate: 1.44,
      brand: 'Entitled Club',
      collection: 'Tops',
      classification: 'Normal',
      recommendation: 'Monitor performance'
    },
    {
      id: 'heritage-wool-trench',
      name: 'Heritage Wool Trench',
      views: 70,
      atc: 8,
      checkout: 3,
      purchase: 1,
      revenue: 450.00,
      atcRate: 11.43,
      checkoutRate: 4.29,
      purchaseRate: 1.43,
      brand: 'Entitled Club',
      collection: 'Outerwear',
      classification: 'Low Visibility',
      recommendation: 'Increase visibility / Feature on home page'
    },
    {
      id: 'obsidian-cargo-pant',
      name: 'Obsidian Cargo Pant',
      views: 120,
      atc: 1,
      checkout: 0,
      purchase: 0,
      revenue: 0.00,
      atcRate: 0.83,
      checkoutRate: 0.00,
      purchaseRate: 0.00,
      brand: 'Entitled Club',
      collection: 'Bottoms',
      classification: 'Weak Product Page',
      recommendation: 'Improve product page description / images'
    }
  ],
  funnel: {
    sessions: 15420,
    views: 28430,
    atc: 1845,
    checkout: 612,
    purchases: 254,
    biggestLeak: {
      step: 'Begin Checkout → Purchases',
      percentage: 58.5
    }
  },
  clarity: {
    sessions: 15420,
    users: 12180,
    botSessions: 624,
    scrollDepth: 56.8,
    quickBacks: 1120,
    deadClicks: 432,
    devices: {
      desktop: 5397,
      mobile: 9406,
      tablet: 617
    },
    trafficSources: [
      { source: 'Instagram Stories', sessions: 5400 },
      { source: 'Google Organic', sessions: 3900 },
      { source: 'Direct', sessions: 2800 },
      { source: 'Facebook Ads', sessions: 2200 },
      { source: 'Newsletter', sessions: 1120 }
    ]
  },
  trafficSources: [
    { source: 'Instagram', sessions: 5400, views: 9800, atc: 620, purchases: 78, revenue: 14820.00, conversionRate: 1.44 },
    { source: 'Facebook', sessions: 2200, views: 3960, atc: 240, purchases: 32, revenue: 6080.00, conversionRate: 1.45 },
    { source: 'Organic', sessions: 3900, views: 7820, atc: 540, purchases: 94, revenue: 18260.00, conversionRate: 2.41 },
    { source: 'Direct', sessions: 2800, views: 5200, atc: 380, purchases: 44, revenue: 8410.00, conversionRate: 1.57 },
    { source: 'Other', sessions: 1120, views: 1650, atc: 65, purchases: 6, revenue: 1100.00, conversionRate: 0.54 }
  ],
  opportunityEngine: {
    push: [
      { id: 'monogram-brass-cap', name: 'Monogram Brass Cap', reason: 'High ATC rate (12.86%) but extremely low views (140). Scale advertising views.' }
    ],
    fix: [
      { id: 'entitled-club-sig-tee', name: 'Entitled Club Sig Tee', reason: 'Highest page views (9,840) but weak ATC rate (4.98%). Improve visual elements or layout.' },
      { id: 'crimson-leather-duffle', name: 'Crimson Leather Duffle', reason: 'High cart adds (125) but low purchases (4). High dropoff in checkout. Review shipping costs.' },
      { id: 'obsidian-cargo-pant', name: 'Obsidian Cargo Pant', reason: 'Traffic is landing but conversion to ATC is under 1%. Review sizing specs and review items.' }
    ],
    feature: [
      { id: 'velvet-obsidian-hoodie', name: 'Velvet Obsidian Hoodie', reason: 'Massive revenue generator ($28,400) with stable purchase rate. Feature in collection headers.' },
      { id: 'champagne-silk-trouser', name: 'Champagne Silk Trouser', reason: 'Highest overall purchase rate (3.21%). Increase exposure on front page banner.' }
    ],
    remove: []
  },
  pathAnalysis: {
    homepage: { sessions: 11200, views: 11200, exits: 3200, effectiveness: 'Strong (High Engagement)' },
    collectionPage: { sessions: 8400, views: 9800, exits: 2100, effectiveness: 'Strong (High Engagement)' },
    productPage: { sessions: 6200, views: 28430, exits: 1900, effectiveness: 'Moderate (Average)' }
  }
};

// Helper: Read db.json or fallback to default data
function getDatabaseData() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(fileContent);
    } catch (err) {
      console.error('Error reading database file, resetting to default:', err);
      return defaultData;
    }
  }
  return defaultData;
}

// API Routes

// Get Dashboard Aggregated Stats (incorporating mode selector and sync status)
app.get('/api/dashboard-data', (req, res) => {
  const syncStatus = apiSyncer.getSyncStatus();
  let data;
  
  if (syncStatus.mode === 'api') {
    const apiData = apiSyncer.getCachedApiData();
    if (apiData) {
      data = { ...apiData };
    } else {
      // Fallback to CSV database data if API cache is empty
      data = { ...getDatabaseData() };
    }
  } else {
    data = { ...getDatabaseData() };
  }

  // Inject sync status into returned dashboard payload
  data.syncStatus = syncStatus;
  res.json(data);
});

// Reset Dashboard Data to default
app.post('/api/reset', (req, res) => {
  // Clear file database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  // Clear any uploaded CSVs
  const files = ['ecommerceCsv.csv', 'pagesCsv.csv', 'eventsCsv.csv', 'clarityCsv.csv'];
  files.forEach(f => {
    const p = path.join(UPLOADS_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  
  res.json({ success: true, message: 'Dashboard data has been reset to defaults.', data: defaultData });
});

// Upload CSV reports
app.post('/api/upload', upload.fields([
  { name: 'ecommerceCsv', maxCount: 1 },
  { name: 'pagesCsv', maxCount: 1 },
  { name: 'eventsCsv', maxCount: 1 },
  { name: 'clarityCsv', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files;
    
    // Check what files are uploaded or already present in uploads folder
    const filePaths = {
      ecommerceCsv: files.ecommerceCsv ? files.ecommerceCsv[0].path : path.join(UPLOADS_DIR, 'ecommerceCsv.csv'),
      pagesCsv: files.pagesCsv ? files.pagesCsv[0].path : path.join(UPLOADS_DIR, 'pagesCsv.csv'),
      eventsCsv: files.eventsCsv ? files.eventsCsv[0].path : path.join(UPLOADS_DIR, 'eventsCsv.csv'),
      clarityCsv: files.clarityCsv ? files.clarityCsv[0].path : path.join(UPLOADS_DIR, 'clarityCsv.csv')
    };

    // Load strings for whichever files are physically on disk
    const reports = {};
    if (fs.existsSync(filePaths.ecommerceCsv)) reports.ecommerceCsv = fs.readFileSync(filePaths.ecommerceCsv, 'utf-8');
    if (fs.existsSync(filePaths.pagesCsv)) reports.pagesCsv = fs.readFileSync(filePaths.pagesCsv, 'utf-8');
    if (fs.existsSync(filePaths.eventsCsv)) reports.eventsCsv = fs.readFileSync(filePaths.eventsCsv, 'utf-8');
    if (fs.existsSync(filePaths.clarityCsv)) reports.clarityCsv = fs.readFileSync(filePaths.clarityCsv, 'utf-8');

    if (Object.keys(reports).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded and no previous reports exist.' });
    }

    // Process and merge
    const aggregated = processReports(reports);

    // Save to database
    fs.writeFileSync(DB_PATH, JSON.stringify(aggregated, null, 2), 'utf-8');

    res.json({ success: true, message: 'Reports parsed and merged successfully.', data: aggregated });
  } catch (err) {
    console.error('Error processing upload:', err);
    res.status(500).json({ error: 'Failed to process CSV uploads: ' + err.message });
  }
});

// Load Specific Product Detail
app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const data = getDatabaseData();
  const product = data.products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ product, overview: data.overview });
});

// Serve sample files download
app.get('/api/sample-csv/:type', (req, res) => {
  const { type } = req.params;
  let csvContent = '';
  
  if (type === 'ecommerce') {
    csvContent = `# GA4 Ecommerce Purchases Report\nItem name,Item ID,Items viewed,Items added to cart,Items checked out,Items purchased,Item revenue,Item brand\nVelvet Obsidian Hoodie,velvet-obsidian-hoodie,500,60,25,12,2400.00,Entitled Club\nEntitled Club Sig Tee,entitled-club-sig-tee,900,45,15,5,450.00,Entitled Club\nCrimson Leather Duffle,crimson-leather-duffle,120,22,8,1,350.00,Entitled Club\nChampagne Silk Trouser,champagne-silk-trouser,80,12,6,3,540.00,Entitled Club\nMonogram Brass Cap,monogram-brass-cap,40,8,2,1,95.00,Entitled Club\n`;
  } else if (type === 'pages') {
    csvContent = `# GA4 Pages and Screens\nPage path and screen class,Views,Sessions,Exits\n/,12000,10500,2800\n/collections/all,8000,7500,1800\n/products/velvet-obsidian-hoodie,500,480,150\n/products/entitled-club-sig-tee,900,850,220\n/products/crimson-leather-duffle,120,110,40\n/products/champagne-silk-trouser,80,75,20\n/products/monogram-brass-cap,40,38,10\n`;
  } else if (type === 'events') {
    csvContent = `# GA4 Events\nEvent name,Event count,Total users\nsession_start,15420,12180\nview_item,28430,11900\nadd_to_cart,1845,1420\nbegin_checkout,612,580\npurchase,254,250\n`;
  } else if (type === 'clarity') {
    csvContent = `# Microsoft Clarity Export\nMetric,Value\nSessions,15420\nUsers,12180\nBot Sessions,624\nAverage Scroll Depth,56.8%\nDead Clicks,432\nQuick Backs,1120\nDevice,Sessions\nDesktop,5397\nMobile,9406\nTablet,617\n`;
  } else {
    return res.status(404).json({ error: 'Sample type not found' });
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${type}_sample.csv`);
  res.send(csvContent);
});

// Mode toggle endpoint
app.post('/api/settings/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (mode !== 'api' && mode !== 'csv') {
      return res.status(400).json({ error: 'Invalid mode. Supported: "api" or "csv"' });
    }
    
    apiSyncer.setMode(mode);
    
    // Trigger sync immediately if moving to API mode and we have no cache yet
    if (mode === 'api' && !apiSyncer.getCachedApiData()) {
      await apiSyncer.triggerSync();
    }
    
    res.json({ success: true, status: apiSyncer.getSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync refresh endpoint
app.post('/api/sync/refresh', async (req, res) => {
  try {
    await apiSyncer.triggerSync();
    res.json({ success: true, status: apiSyncer.getSyncStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GA4 Specific Routes
app.get('/api/ga4/overview', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: 'GA4_PROPERTY_ID is not configured.' });
    }
    const data = await googleAnalytics.fetchGA4Overview(propertyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ga4/products', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: 'GA4_PROPERTY_ID is not configured.' });
    }
    const data = await googleAnalytics.fetchGA4Products(propertyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ga4/events', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: 'GA4_PROPERTY_ID is not configured.' });
    }
    const data = await googleAnalytics.fetchGA4Events(propertyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ga4/realtime', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: 'GA4_PROPERTY_ID is not configured.' });
    }
    const data = await googleAnalytics.fetchGA4Realtime(propertyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ga4/sources', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: 'GA4_PROPERTY_ID is not configured.' });
    }
    const data = await googleAnalytics.fetchGA4Sources(propertyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clarity Specific Routes
app.get('/api/clarity/overview', async (req, res) => {
  try {
    const token = process.env.CLARITY_API_TOKEN;
    const projectId = process.env.CLARITY_PROJECT_ID;
    if (!token || !projectId) {
      return res.status(400).json({ error: 'Clarity environment variables are not configured.' });
    }
    const data = await clarity.fetchClarityOverview(token, projectId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clarity/pages', async (req, res) => {
  try {
    const token = process.env.CLARITY_API_TOKEN;
    const projectId = process.env.CLARITY_PROJECT_ID;
    if (!token || !projectId) {
      return res.status(400).json({ error: 'Clarity environment variables are not configured.' });
    }
    const data = await clarity.fetchClarityPages(token, projectId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clarity/sources', async (req, res) => {
  try {
    const token = process.env.CLARITY_API_TOKEN;
    const projectId = process.env.CLARITY_PROJECT_ID;
    if (!token || !projectId) {
      return res.status(400).json({ error: 'Clarity environment variables are not configured.' });
    }
    const data = await clarity.fetchClaritySources(token, projectId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clarity/devices', async (req, res) => {
  try {
    const token = process.env.CLARITY_API_TOKEN;
    const projectId = process.env.CLARITY_PROJECT_ID;
    if (!token || !projectId) {
      return res.status(400).json({ error: 'Clarity environment variables are not configured.' });
    }
    const data = await clarity.fetchClarityDevices(token, projectId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Sync Polling Scheduler
apiSyncer.startScheduler();

// Start Server
app.listen(PORT, () => {
  console.log(`Entitled Club Analytics Server running on port ${PORT}`);
});
