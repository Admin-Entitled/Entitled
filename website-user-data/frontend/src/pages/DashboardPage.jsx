import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';
import { 
  TrendingUp, ArrowDownRight, AlertOctagon, HelpCircle, Download, Search, 
  ArrowUpDown, Filter, Sparkles, RefreshCw, Layers, ShieldAlert, Cpu, 
  Lightbulb, Compass, AlertTriangle, ArrowUpRight
} from 'lucide-react';

export default function DashboardPage({ data, activeTab, onViewProduct, onNavigateUpload, isDemo }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'views', direction: 'desc' });
  const [collectionFilter, setCollectionFilter] = useState('All');

  const {
    overview,
    products = [],
    funnel,
    clarity,
    trafficSources = [],
    pathAnalysis
  } = data;

  // Formatting utilities
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val);
  const formatRate = (val) => `${Number(val).toFixed(2)}%`;

  // Sort & Search Product Funnel Table
  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const collections = useMemo(() => {
    const set = new Set(products.map(p => p.collection));
    return ['All', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCollection = collectionFilter === 'All' || p.collection === collectionFilter;
        return matchesSearch && matchesCollection;
      })
      .sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (sortConfig.direction === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
  }, [products, searchTerm, collectionFilter, sortConfig]);

  // Export Product Funnel Table as CSV
  const handleExportCSV = () => {
    const headers = ['Product', 'Collection', 'Views', 'ATC', 'Checkout', 'Purchase', 'Revenue', 'ATC Rate', 'Checkout Rate', 'Purchase Rate', 'Diagnosis'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.collection,
      p.views,
      p.atc,
      p.checkout,
      p.purchase,
      p.revenue,
      formatRate(p.atcRate),
      formatRate(p.checkoutRate),
      formatRate(p.purchaseRate),
      p.classification
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `entitled_club_product_funnel_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic Executive Summary Panel Logic
  const insights = useMemo(() => {
    const winners = products.filter(p => p.classification === 'Winner');
    const hiddenWinners = products.filter(p => p.classification === 'Hidden Winner');
    const weakPages = products.filter(p => p.classification === 'Weak Product Page');
    const leaks = products.filter(p => p.classification === 'Checkout Leak');

    const keyFindings = `The digital boutique recorded a total of ${formatNumber(overview.sessions)} sessions, resulting in ${formatNumber(overview.purchases)} completions. Net conversion yields a store benchmark of ${formatRate(overview.purchaseRate)}. Product views spanned ${formatNumber(overview.productViews)} instances with a ${formatRate(overview.atcRate)} add-to-cart ratio.`;

    const opportunities = hiddenWinners.length > 0 
      ? `Prominent opportunities lie in "${hiddenWinners[0].name}" which demonstrates an elevated ATC rate of ${formatRate(hiddenWinners[0].atcRate)} but is constrained by visibility (${formatNumber(hiddenWinners[0].views)} pageviews). Scaling traffic exposure here is highly advised.`
      : `Exposure optimization is advised for lower-exposure catalog items to identify latent customer interest peaks.`;

    const problems = leaks.length > 0
      ? `Critical funnel drop-off identified for "${leaks[0].name}" which registers high cart interest (${formatNumber(leaks[0].atc)} additions) but suffers from checkout drop-offs (${formatNumber(leaks[0].purchase)} sales), pointing to transactional or checkout form friction.`
      : weakPages.length > 0
      ? `Friction noted on "${weakPages[0].name}" with low transition bounds from pageview to cart additions (${formatRate(weakPages[0].atcRate)} ATC rate).`
      : `Funnel performance displays baseline stability; no high-severity drop-off anomalies were registered in the transaction pipelines.`;

    const recommendations = [
      leaks.length > 0 ? `Audit payment gateway inputs and shipping margins for "${leaks[0].name}".` : null,
      hiddenWinners.length > 0 ? `Introduce banner pins or collection spotlight cards for "${hiddenWinners[0].name}".` : null,
      weakPages.length > 0 ? `Revise descriptive parameters and image layouts for "${weakPages[0].name}".` : null,
      `Ensure collections align with brand performance thresholds as shown in visibility details.`
    ].filter(Boolean);

    return { keyFindings, opportunities, problems, recommendations };
  }, [products, overview]);

  // Recharts Custom Tooltip (Restrained, Institutional styling)
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111215] border border-brand-border px-3 py-2.5 font-mono text-[10px] text-brand-text rounded-lg">
          <p className="font-bold border-b border-brand-border pb-1 mb-1 text-brand-metal">{String(label).toUpperCase()}</p>
          {payload.map((p, idx) => (
            <p key={idx} className="flex justify-between gap-4 mt-0.5">
              <span className="text-brand-muted">{String(p.name).toUpperCase()}:</span>
              <span className="font-bold" style={{ color: p.color || '#F2ECE2' }}>
                {p.name.toLowerCase().includes('revenue') ? formatCurrency(p.value) : formatNumber(p.value)}
              </span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Product exposure charts
  const topViewedProducts = useMemo(() => {
    return [...products].sort((a, b) => b.views - a.views).slice(0, 5);
  }, [products]);

  const collectionChartData = useMemo(() => {
    const colMap = {};
    products.forEach(p => {
      if (!colMap[p.collection]) {
        colMap[p.collection] = { name: p.collection, views: 0, revenue: 0 };
      }
      colMap[p.collection].views += p.views;
      colMap[p.collection].revenue += p.revenue;
    });
    return Object.values(colMap);
  }, [products]);

  const brandChartData = useMemo(() => {
    const brandMap = {};
    products.forEach(p => {
      if (!brandMap[p.brand]) {
        brandMap[p.brand] = { name: p.brand, views: 0, revenue: 0 };
      }
      brandMap[p.brand].views += p.views;
      brandMap[p.brand].revenue += p.revenue;
    });
    return Object.values(brandMap);
  }, [products]);

  return (
    <div className="space-y-10">
      
      {/* Demo Data Alert Banner (Restrained beige border) */}
      {isDemo && (
        <div className="border border-brand-metal/20 bg-brand-surface-2 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start space-x-3 text-xs font-mono">
            <AlertOctagon className="w-5 h-5 text-brand-metal flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-brand-metal uppercase tracking-wider">Demo Cache Active</p>
              <p className="text-brand-muted mt-1 leading-relaxed">Currently representing local demo database structures. Upload store exports in the Reports section to activate customized indicators.</p>
            </div>
          </div>
          <button
            onClick={onNavigateUpload}
            className="text-[10px] font-mono text-brand-metal hover:text-brand-bg hover:bg-brand-metal border border-brand-metal/30 hover:border-brand-metal px-4 py-2 rounded-full transition-luxury uppercase whitespace-nowrap"
          >
            Upload CSVs
          </button>
        </div>
      )}

      {/* SECTION 1 — Overview (Executive Briefings & KPI Cards) */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-luxury">
          
          {/* Unified Headings */}
          <div className="border-b border-brand-border/40 pb-4">
            <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 01 // Executive Overview</h3>
            <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Institutional Summary</h1>
          </div>

          {/* INSIGHTS PANEL (Executive Summary Section) */}
          <div className="border border-brand-border bg-gradient-to-b from-brand-surface to-brand-bg p-8 rounded-2xl space-y-6">
            <div className="flex items-center space-x-2.5 border-b border-brand-border/40 pb-4">
              <Lightbulb className="w-5 h-5 text-brand-metal" />
              <h4 className="text-sm font-serif font-bold uppercase tracking-wider text-brand-text">Executive Intelligence Findings</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs text-brand-muted leading-relaxed">
              <div className="space-y-2">
                <span className="text-[10px] text-brand-metal uppercase font-bold tracking-wider">// Key Findings</span>
                <p>{insights.keyFindings}</p>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-brand-metal uppercase font-bold tracking-wider">// Opportunities</span>
                <p>{insights.opportunities}</p>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-brand-metal uppercase font-bold tracking-wider">// Leak Diagnostics</span>
                <p>{insights.problems}</p>
              </div>
            </div>

            <div className="border-t border-brand-border/40 pt-5 space-y-2">
              <span className="text-[10px] font-mono text-brand-metal uppercase font-bold tracking-wider">// Operations Recommendations</span>
              <ul className="list-disc pl-4 space-y-1 font-mono text-xs text-brand-muted">
                {insights.recommendations.map((rec, idx) => (
                  <li key={idx} className="uppercase tracking-wide">{rec}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* KPI Cards (Subtle borders, large numbers, minimal labels) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            {[
              { label: 'Sessions', value: formatNumber(overview.sessions) },
              { label: 'Active Users', value: formatNumber(overview.users) },
              { label: 'Product Views', value: formatNumber(overview.productViews) },
              { label: 'Add-to-Carts', value: formatNumber(overview.atc) },
              { label: 'Revenue', value: formatCurrency(overview.revenue) }
            ].map((item, idx) => (
              <div key={idx} className="border border-brand-border p-6 bg-brand-surface rounded-2xl flex flex-col justify-between min-h-[120px]">
                <span className="text-[10px] font-mono text-brand-muted uppercase tracking-widest">{item.label}</span>
                <span className="text-2xl font-serif text-brand-metal mt-3 font-semibold tracking-wide">
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* conversion pipeline rates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { label: 'Add To Cart (ATC) Rate', value: formatRate(overview.atcRate), desc: 'Add To Carts divided by Total Sessions' },
              { label: 'Checkout Start Rate', value: formatRate(overview.checkoutRate), desc: 'Checkouts initiated divided by Total Sessions' },
              { label: 'Store Conversion Rate', value: formatRate(overview.purchaseRate), desc: 'Completed Purchases divided by Total Sessions' }
            ].map((item, idx) => (
              <div key={idx} className="border border-brand-border p-5 bg-brand-surface-2 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-brand-text uppercase tracking-widest">{item.label}</p>
                  <p className="text-[9px] font-mono text-brand-muted mt-1 uppercase">{item.desc}</p>
                </div>
                <span className="text-lg font-serif text-brand-metal font-bold">
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* Funnel pipeline dropoff diagram */}
          <div className="border border-brand-border p-8 bg-brand-surface rounded-2xl space-y-6">
            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-brand-metal">// Purchase Pipeline Performance</h4>
            
            <div className="space-y-4">
              {[
                { step: 'Sessions', val: funnel.sessions, pct: 100 },
                { step: 'Product Views', val: funnel.views, pct: funnel.sessions > 0 ? (funnel.views / funnel.sessions) * 100 : 0 },
                { step: 'Add To Cart', val: funnel.atc, pct: funnel.sessions > 0 ? (funnel.atc / funnel.sessions) * 100 : 0 },
                { step: 'Begin Checkout', val: funnel.checkout, pct: funnel.sessions > 0 ? (funnel.checkout / funnel.sessions) * 100 : 0 },
                { step: 'Purchases', val: funnel.purchases, pct: funnel.sessions > 0 ? (funnel.purchases / funnel.sessions) * 100 : 0 }
              ].map((stage, idx, arr) => {
                const drop = idx > 0 && arr[idx-1].val > 0 
                  ? ((arr[idx-1].val - stage.val) / arr[idx-1].val) * 100 
                  : 0;
                return (
                  <div key={idx} className="relative">
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1.5 text-brand-muted uppercase">
                      <span>{stage.step}</span>
                      <span className="text-brand-text font-bold">{formatNumber(stage.val)} ({stage.pct.toFixed(1)}%)</span>
                    </div>
                    {/* Funnel Bar */}
                    <div className="w-full bg-brand-surface-2 border border-brand-border h-8 relative overflow-hidden rounded-lg">
                      <div 
                        className="bg-brand-accent/30 h-full border-r border-brand-metal/30 transition-all duration-500" 
                        style={{ width: `${Math.min(100, stage.pct)}%` }}
                      />
                      {idx > 0 && (
                        <div className="absolute inset-y-0 right-4 flex items-center">
                          <span className="text-[9px] font-mono text-brand-metal bg-brand-bg px-2.5 py-0.5 border border-brand-border rounded-full font-bold">
                            DROP: {drop.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="bg-brand-bg border border-brand-border p-4 rounded-xl flex items-center justify-between text-xs font-mono">
              <span className="text-brand-muted uppercase">Primary Funnel Leak Segment:</span>
              <span className="text-brand-danger uppercase font-bold tracking-wide">
                {funnel.biggestLeak.step} // {funnel.biggestLeak.percentage}% dropoff
              </span>
            </div>
          </div>

          {/* Homepage vs Collection vs Product Page Analysis */}
          <div className="space-y-4">
            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-brand-metal">// Template Effectiveness Indices</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { template: 'Homepage Template', path: '/', views: pathAnalysis.homepage.views, sessions: pathAnalysis.homepage.sessions, exits: pathAnalysis.homepage.exits, status: pathAnalysis.homepage.effectiveness },
                { template: 'Collection Page Template', path: '/collections/*', views: pathAnalysis.collectionPage.views, sessions: pathAnalysis.collectionPage.sessions, exits: pathAnalysis.collectionPage.exits, status: pathAnalysis.collectionPage.effectiveness },
                { template: 'Product Page Template', path: '/products/*', views: pathAnalysis.productPage.views, sessions: pathAnalysis.productPage.sessions, exits: pathAnalysis.productPage.exits, status: pathAnalysis.productPage.effectiveness }
              ].map((card, idx) => {
                let statusStyle = 'text-brand-muted border-brand-border bg-white/[0.01]';
                if (card.status.includes('Strong')) statusStyle = 'text-brand-success border-brand-success/30 bg-brand-success/5';
                else if (card.status.includes('Weak')) statusStyle = 'text-brand-danger border-brand-danger/30 bg-brand-danger/5';
                else if (card.status.includes('Moderate')) statusStyle = 'text-brand-metal border-brand-metal/30 bg-brand-metal/5';

                const bounceRate = card.sessions > 0 ? (card.exits / card.sessions) * 100 : 0;

                return (
                  <div key={idx} className="border border-brand-border p-6 bg-brand-surface rounded-2xl flex flex-col justify-between min-h-[220px]">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-3">
                        <h5 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-text">{card.template}</h5>
                        <span className={`text-[9px] font-mono px-2 py-0.5 border font-semibold uppercase rounded-full whitespace-nowrap ${statusStyle}`}>{card.status}</span>
                      </div>
                      <span className="block text-[10px] font-mono text-brand-muted">{card.path}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-b border-brand-border/40 py-4 my-4 font-mono text-[11px]">
                      <div>
                        <span className="block text-[9px] text-brand-muted uppercase">Views</span>
                        <span className="font-bold text-brand-text">{formatNumber(card.views)}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-brand-muted uppercase">Sessions</span>
                        <span className="font-bold text-brand-text">{formatNumber(card.sessions)}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-brand-muted uppercase">Exits</span>
                        <span className="font-bold text-brand-text">{formatNumber(card.exits)}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-brand-muted uppercase">Bounce</span>
                        <span className="font-bold text-brand-metal">{bounceRate.toFixed(1)}%</span>
                      </div>
                    </div>

                    <p className="text-[9px] font-mono text-brand-muted uppercase leading-relaxed">
                      {bounceRate > 50 
                        ? `Warning: high exit dropoff at template level. Optimize UX hooks.`
                        : `Template conversion stability meets baseline requirements.`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* SECTION 2 — Product Funnel Grid (Table) */}
      {activeTab === 'funnel' && (
        <div className="space-y-6 animate-luxury">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-brand-border/40 pb-4 gap-4">
            <div>
              <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 02 // Product Funnel</h3>
              <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Itemized Performance Register</h1>
            </div>
            
            {/* Table Action Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="SEARCH PRODUCTS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-brand-surface-2 border border-brand-border pl-9 pr-4 py-2 text-xs font-mono text-brand-text placeholder-gray-600 focus:outline-none focus:border-brand-metal/40 w-48 rounded-xl"
                />
              </div>

              {/* Filter */}
              <div className="flex items-center border border-brand-border bg-brand-surface-2 px-3 py-2 rounded-xl">
                <Filter className="w-3.5 h-3.5 text-brand-muted mr-2" />
                <select
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  className="bg-transparent border-none text-xs font-mono text-brand-text focus:outline-none cursor-pointer uppercase"
                >
                  {collections.map(c => (
                    <option key={c} value={c} className="bg-brand-surface text-brand-text">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Export */}
              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-1.5 border border-brand-border hover:bg-white/[0.02] px-4 py-2 text-xs font-mono text-brand-text hover:border-brand-metal/40 transition-luxury rounded-full"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export register</span>
              </button>
            </div>
          </div>

          {/* Table (Institutional style, subtle hover, alternating row highlights) */}
          <div className="border border-brand-border bg-brand-surface overflow-x-auto rounded-2xl">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-brand-border bg-[#111215] text-brand-muted uppercase tracking-wider text-[10px]">
                  <th className="p-4 cursor-pointer hover:text-brand-metal" onClick={() => handleSort('name')}>
                    <div className="flex items-center space-x-1">
                      <span>Item</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('views')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Views</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('atc')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>ATC</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('checkout')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Checkout</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('purchase')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Purchases</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('revenue')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Revenue</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('atcRate')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>ATC Rate</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-brand-metal text-right" onClick={() => handleSort('purchaseRate')}>
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Conv Rate</span>
                      <ArrowUpDown className="w-3 h-3 text-gray-600" />
                    </div>
                  </th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-brand-muted uppercase">
                      No catalog assets matching active filters.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => {
                    let badgeColor = 'text-brand-muted border-brand-border bg-white/[0.01]';
                    if (p.classification === 'Winner') badgeColor = 'text-brand-metal border-brand-metal/30 bg-brand-metal/5';
                    else if (p.classification === 'Hidden Winner') badgeColor = 'text-brand-success border-brand-success/30 bg-brand-success/5';
                    else if (p.classification === 'Weak Product Page') badgeColor = 'text-brand-danger border-brand-danger/30 bg-brand-danger/5';
                    else if (p.classification === 'Checkout Leak') badgeColor = 'text-brand-accent border-brand-accent/30 bg-brand-accent/5';
                    else if (p.classification === 'Low Visibility') badgeColor = 'text-brand-muted border-brand-border bg-white/[0.01]';

                    return (
                      <tr key={idx} className="hover:bg-white/[0.01] even:bg-[#131417]/10 transition-luxury">
                        <td className="p-4">
                          <button 
                            onClick={() => onViewProduct(p.id)} 
                            className="font-bold text-brand-text hover:text-brand-metal text-left outline-none transition-colors border-b border-dotted border-brand-muted/40 hover:border-brand-metal"
                          >
                            {p.name}
                          </button>
                          <span className="block text-[9px] text-brand-muted uppercase mt-0.5">
                            {p.collection} // {p.brand}
                          </span>
                        </td>
                        <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(p.views)}</td>
                        <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(p.atc)}</td>
                        <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(p.checkout)}</td>
                        <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(p.purchase)}</td>
                        <td className="p-4 text-right font-bold text-brand-text font-mono">{formatCurrency(p.revenue)}</td>
                        <td className="p-4 text-right text-brand-muted font-mono">{formatRate(p.atcRate)}</td>
                        <td className="p-4 text-right text-brand-metal font-mono">{formatRate(p.purchaseRate)}</td>
                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className={`inline-block text-[9px] font-bold tracking-wider px-2.5 py-0.5 border uppercase rounded-full ${badgeColor}`}>
                              {p.classification}
                            </span>
                            <span className="text-[8px] text-brand-muted uppercase">
                              {p.recommendation}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4 — Visibility (Charts) */}
      {activeTab === 'visibility' && (
        <div className="space-y-8 animate-luxury">
          
          <div className="border-b border-brand-border/40 pb-4">
            <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 03 // Visibility</h3>
            <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Exposures & Sales Matrices</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Product Views (Bar Chart) */}
            <div className="border border-brand-border p-6 bg-brand-surface rounded-2xl space-y-4">
              <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Top Viewed Products</h5>
              
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topViewedProducts} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2C31" horizontal={false} />
                    <XAxis type="number" stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis dataKey="name" type="category" stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="views" fill="#5B0A19" stroke="#C8B58A" strokeWidth={1} name="Views">
                      {topViewedProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fillOpacity={1 - index * 0.15} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Collection Performance (Bar Chart) */}
            <div className="border border-brand-border p-6 bg-brand-surface rounded-2xl space-y-4">
              <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Collection Benchmark</h5>
              
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={collectionChartData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2C31" vertical={false} />
                    <XAxis dataKey="name" stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="views" fill="#C8B58A" stroke="#5B0A19" strokeWidth={0.5} name="Views" />
                    <Bar dataKey="revenue" fill="#5B0A19" stroke="#C8B58A" strokeWidth={0.5} name="Revenue ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3 — Diagnostics */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6 animate-luxury">
          
          <div className="border-b border-brand-border/40 pb-4">
            <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 04 // Diagnostics</h3>
            <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Merchandising Diagnosis Engine</h1>
          </div>

          <div className="border border-brand-border bg-brand-surface rounded-2xl divide-y divide-brand-border/40">
            {products.map((p, idx) => {
              let diagnosisStyle = 'text-brand-muted border-brand-border bg-white/[0.01]';
              if (p.classification === 'Winner') diagnosisStyle = 'text-brand-metal border-brand-metal/30 bg-brand-metal/5';
              else if (p.classification === 'Hidden Winner') diagnosisStyle = 'text-brand-success border-brand-success/30 bg-brand-success/5';
              else if (p.classification === 'Weak Product Page') diagnosisStyle = 'text-brand-danger border-brand-danger/30 bg-brand-danger/5';
              else if (p.classification === 'Checkout Leak') diagnosisStyle = 'text-brand-accent border-brand-accent/30 bg-brand-accent/5';

              return (
                <div key={idx} className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-white/[0.01] transition-luxury">
                  <div>
                    <div className="flex items-center space-x-3">
                      <button 
                        onClick={() => onViewProduct(p.id)}
                        className="text-sm font-serif font-bold text-brand-text hover:text-brand-metal uppercase underline decoration-dotted"
                      >
                        {p.name}
                      </button>
                      <span className="text-[10px] font-mono text-brand-muted">({p.collection})</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 mt-2 font-mono text-[10px] text-brand-muted">
                      <span>VIEWS: {formatNumber(p.views)}</span>
                      <span>ATC: {formatNumber(p.atc)}</span>
                      <span>SALES: {formatNumber(p.purchase)}</span>
                      <span>REV: {formatCurrency(p.revenue)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5">
                    <span className={`text-[10px] font-mono font-bold tracking-wider px-3 py-1 border uppercase rounded-full ${diagnosisStyle}`}>
                      {p.classification}
                    </span>
                    <span className="text-[10px] font-mono text-brand-muted uppercase">
                      Action: "{p.recommendation}"
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 6 — Clarity Insights */}
      {activeTab === 'clarity' && (
        <div className="space-y-8 animate-luxury">
          
          <div className="border-b border-brand-border/40 pb-4">
            <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 05 // Clarity</h3>
            <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Clarity UX Insights</h1>
          </div>

          {/* Clarity KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { label: 'Bot Sessions', value: formatNumber(clarity.botSessions), sub: 'Auto-filtered bots' },
              { label: 'Avg Scroll Depth', value: `${clarity.scrollDepth}%`, sub: 'Average read length' },
              { label: 'Quick Backs', value: formatNumber(clarity.quickBacks), sub: 'Immediate exits <5s' },
              { label: 'Dead Clicks', value: formatNumber(clarity.deadClicks), sub: 'Non-responsive elements' }
            ].map((item, idx) => (
              <div key={idx} className="border border-brand-border p-6 bg-brand-surface rounded-2xl flex flex-col justify-between min-h-[120px]">
                <span className="text-[10px] font-mono text-brand-muted uppercase tracking-widest">{item.label}</span>
                <span className="text-2xl font-serif text-brand-metal mt-3 font-semibold">
                  {item.value}
                </span>
                <span className="text-[9px] font-mono text-gray-600 uppercase mt-1">{item.sub}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device breakdown */}
            <div className="border border-brand-border p-6 bg-brand-surface rounded-2xl space-y-4">
              <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Device Breakdown</h5>
              
              <div className="h-60 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Desktop', value: clarity.devices.desktop },
                        { name: 'Mobile', value: clarity.devices.mobile },
                        { name: 'Tablet', value: clarity.devices.tablet }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#5B0A19" stroke="#17181B" strokeWidth={2} />
                      <Cell fill="#C8B58A" stroke="#17181B" strokeWidth={2} />
                      <Cell fill="#BDB6AC" stroke="#17181B" strokeWidth={2} />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center space-x-6 text-[10px] font-mono uppercase text-brand-muted">
                <span className="flex items-center space-x-2"><span className="w-2.5 h-2.5 bg-[#5B0A19] block rounded-sm" /> <span>DESKTOP: {formatRate((clarity.devices.desktop / overview.sessions) * 100)}</span></span>
                <span className="flex items-center space-x-2"><span className="w-2.5 h-2.5 bg-[#C8B58A] block rounded-sm" /> <span>MOBILE: {formatRate((clarity.devices.mobile / overview.sessions) * 100)}</span></span>
                <span className="flex items-center space-x-2"><span className="w-2.5 h-2.5 bg-[#BDB6AC] block rounded-sm" /> <span>TABLET: {formatRate((clarity.devices.tablet / overview.sessions) * 100)}</span></span>
              </div>
            </div>

            {/* Top Pages or sources from clarity */}
            <div className="border border-brand-border p-6 bg-brand-surface rounded-2xl space-y-4">
              <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Top Clarity Referrers</h5>
              <div className="space-y-4 font-mono text-xs text-brand-muted">
                {clarity.trafficSources.slice(0, 5).map((ts, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-brand-border/30 pb-2">
                    <span className="font-bold text-brand-text uppercase">{ts.source}</span>
                    <span>{formatNumber(ts.sessions)} SESS</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* SECTION 8 — Traffic Sources */}
      {activeTab === 'traffic' && (
        <div className="space-y-6 animate-luxury">
          
          <div className="border-b border-brand-border/40 pb-4">
            <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 06 // Traffic Sources</h3>
            <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Source Channel Valuation</h1>
          </div>

          <div className="border border-brand-border bg-brand-surface overflow-x-auto rounded-2xl">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-brand-border bg-[#111215] text-brand-muted uppercase tracking-wider text-[10px]">
                  <th className="p-4">Source</th>
                  <th className="p-4 text-right">Sessions</th>
                  <th className="p-4 text-right">Pageviews</th>
                  <th className="p-4 text-right">ATC</th>
                  <th className="p-4 text-right">Purchases</th>
                  <th className="p-4 text-right">Revenue</th>
                  <th className="p-4 text-right">Conv Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {trafficSources.map((source, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01] even:bg-[#131417]/10 transition-luxury">
                    <td className="p-4 font-bold text-brand-text uppercase">{source.source}</td>
                    <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(source.sessions)}</td>
                    <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(source.views)}</td>
                    <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(source.atc)}</td>
                    <td className="p-4 text-right text-gray-300 font-mono">{formatNumber(source.purchases)}</td>
                    <td className="p-4 text-right font-bold text-brand-text font-mono">{formatCurrency(source.revenue)}</td>
                    <td className="p-4 text-right text-brand-metal font-bold font-mono">{formatRate(source.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
