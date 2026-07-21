export const defaultData = {
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
