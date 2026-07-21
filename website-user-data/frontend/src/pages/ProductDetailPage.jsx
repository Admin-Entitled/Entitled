import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { ArrowLeft, AlertTriangle, Lightbulb } from 'lucide-react';
import { defaultData } from '../utils/defaultData';

export default function ProductDetailPage({ productId, onBack }) {
  const [productData, setProductData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) throw new Error('Failed to load product details');
        const json = await res.json();
        setProductData(json);
      } catch (err) {
        console.warn('Backend connection failed. Pulling product profile from local memory.', err);
        const savedData = localStorage.getItem('local_dashboard_data');
        const activeData = savedData ? JSON.parse(savedData) : defaultData;
        const matchedProduct = activeData.products.find(p => p.id === productId);
        if (matchedProduct) {
          setProductData({ product: matchedProduct, overview: activeData.overview });
        } else {
          setError('Product details not found.');
        }
      } finally {
        setLoading(false);
      }
    };
    if (productId) fetchProduct();
  }, [productId]);

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center space-y-3 font-mono text-[10px] text-brand-muted uppercase">
        <div className="w-5 h-5 border-2 border-brand-metal border-t-transparent rounded-full animate-spin" />
        <span>Loading Catalog Profile...</span>
      </div>
    );
  }

  if (error || !productData) {
    return (
      <div className="border border-brand-accent/40 bg-brand-accent/5 p-6 text-center max-w-md mx-auto my-12 rounded-2xl">
        <AlertTriangle className="w-8 h-8 text-brand-metal mx-auto mb-3" />
        <h3 className="font-serif text-sm uppercase text-brand-metal tracking-widest font-bold">Query Failure</h3>
        <p className="text-xs text-brand-muted mt-2 font-mono">{error || 'Product details not resolved.'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 border border-brand-border text-brand-text text-xs font-mono uppercase bg-transparent hover:bg-white/[0.02] rounded-full"
        >
          Return to Funnel
        </button>
      </div>
    );
  }

  const { product, overview } = productData;

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val);
  const formatRate = (val) => `${Number(val).toFixed(2)}%`;

  // Comparisons
  const revenueShare = overview.revenue > 0 ? (product.revenue / overview.revenue) * 100 : 0;
  const viewsShare = overview.productViews > 0 ? (product.views / overview.productViews) * 100 : 0;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111215] border border-brand-border px-3 py-2.5 font-mono text-[10px] text-brand-text rounded-lg">
          <p className="font-bold border-b border-brand-border pb-1 mb-1 text-brand-metal">{String(label).toUpperCase()}</p>
          {payload.map((p, idx) => (
            <p key={idx} className="flex justify-between gap-4 mt-0.5">
              <span className="text-brand-muted">{String(p.name).toUpperCase()}:</span>
              <span className="font-bold text-brand-text">{formatNumber(p.value)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const funnelChartData = [
    { name: 'Views', count: product.views, fill: '#1E2024' },
    { name: 'ATC', count: product.atc, fill: '#3E1018' },
    { name: 'Checkout', count: product.checkout, fill: '#5B0A19' },
    { name: 'Purchase', count: product.purchase, fill: '#C8B58A' }
  ];

  let diagnosisColor = 'text-brand-muted border-brand-border bg-white/[0.01]';
  if (product.classification === 'Winner') diagnosisColor = 'text-brand-metal border-brand-metal/30 bg-brand-metal/5';
  else if (product.classification === 'Hidden Winner') diagnosisColor = 'text-brand-success border-brand-success/30 bg-brand-success/5';
  else if (product.classification === 'Weak Product Page') diagnosisColor = 'text-brand-danger border-brand-danger/30 bg-brand-danger/5';
  else if (product.classification === 'Checkout Leak') diagnosisColor = 'text-brand-accent border-brand-accent/30 bg-brand-accent/5';

  return (
    <div className="space-y-8 animate-luxury">
      
      {/* breadcrumb */}
      <div className="border-b border-brand-border/40 pb-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs font-mono text-brand-muted hover:text-brand-text transition-colors mb-4 uppercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Register</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-[9px] font-mono text-brand-metal bg-brand-metal/10 border border-brand-metal/20 px-2 py-0.5 uppercase rounded-full">
                {product.collection}
              </span>
              <span className="text-[10px] font-mono text-brand-muted uppercase">
                KEY ID: {product.id}
              </span>
            </div>
            <h2 className="text-2xl font-serif text-brand-text tracking-wide mt-3 uppercase">
              {product.name}
            </h2>
            <p className="text-[10px] font-mono text-brand-muted mt-1 uppercase">
              Brand: {product.brand}
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5">
            <span className={`inline-block text-[10px] font-mono font-bold tracking-wider px-3 py-1 border uppercase rounded-full ${diagnosisColor}`}>
              {product.classification}
            </span>
            <span className="text-[10px] font-mono text-brand-muted uppercase">
              Action: "{product.recommendation}"
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: 'Views', value: formatNumber(product.views), sub: `Share: ${viewsShare.toFixed(1)}%` },
          { label: 'Add-to-Carts', value: formatNumber(product.atc), sub: `ATC Rate: ${formatRate(product.atcRate)}` },
          { label: 'Checkouts', value: formatNumber(product.checkout), sub: `Conv: ${formatRate(product.checkoutRate)}` },
          { label: 'Purchases', value: formatNumber(product.purchase), sub: `Conv: ${formatRate(product.purchaseRate)}` },
          { label: 'Revenue', value: formatCurrency(product.revenue), sub: `Share: ${revenueShare.toFixed(1)}%`, highlight: true }
        ].map((item, idx) => (
          <div key={idx} className="border border-brand-border p-6 bg-brand-surface rounded-2xl flex flex-col justify-between min-h-[110px]">
            <span className="text-[10px] font-mono text-brand-muted uppercase tracking-widest">{item.label}</span>
            <span className={`text-xl font-serif mt-2 font-semibold tracking-wide ${item.highlight ? 'text-brand-metal' : 'text-brand-text'}`}>
              {item.value}
            </span>
            <span className="text-[9px] font-mono text-gray-600 uppercase mt-1">{item.sub}</span>
          </div>
        ))}
      </div>

      {/* Charts & Benchmarks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Product Conversion Funnel (Recharts) */}
        <div className="lg:col-span-2 border border-brand-border p-6 bg-brand-surface rounded-2xl space-y-4">
          <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Conversion Pipeline Distribution</h5>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2C31" vertical={false} />
                <XAxis dataKey="name" stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                <YAxis stroke="#606470" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Count">
                  {funnelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} stroke={index === 3 ? '#C8B58A' : '#5B0A19'} strokeWidth={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Global Performance Benchmarking */}
        <div className="border border-brand-border p-6 bg-brand-surface rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h5 className="text-[10px] font-mono uppercase tracking-widest text-brand-metal border-b border-brand-border/40 pb-2">// Store Benchmark Alignment</h5>
            
            <div className="space-y-5">
              
              {/* ATC Benchmark */}
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-brand-text">
                  <span>ITEM ATC RATE:</span>
                  <span className={product.atcRate >= overview.atcRate ? 'text-brand-success' : 'text-brand-danger'}>
                    {formatRate(product.atcRate)}
                  </span>
                </div>
                <div className="flex justify-between text-brand-muted text-[10px]">
                  <span>STORE AVERAGE:</span>
                  <span>{formatRate(overview.atcRate)}</span>
                </div>
                <div className="w-full bg-brand-surface-2 h-1.5 border border-brand-border rounded-none overflow-hidden relative">
                  <div className="bg-brand-metal h-full" style={{ width: `${Math.min(100, (product.atcRate / Math.max(0.1, overview.atcRate)) * 50)}%` }} />
                </div>
              </div>

              {/* Purchase Benchmark */}
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-brand-text">
                  <span>ITEM CONV RATE:</span>
                  <span className={product.purchaseRate >= overview.purchaseRate ? 'text-brand-success' : 'text-brand-danger'}>
                    {formatRate(product.purchaseRate)}
                  </span>
                </div>
                <div className="flex justify-between text-brand-muted text-[10px]">
                  <span>STORE AVERAGE:</span>
                  <span>{formatRate(overview.purchaseRate)}</span>
                </div>
                <div className="w-full bg-brand-surface-2 h-1.5 border border-brand-border rounded-none overflow-hidden relative">
                  <div className="bg-brand-accent h-full" style={{ width: `${Math.min(100, (product.purchaseRate / Math.max(0.1, overview.purchaseRate)) * 50)}%` }} />
                </div>
              </div>

            </div>
          </div>

          <div className="bg-brand-surface-2 border border-brand-border p-5 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-xs font-mono text-brand-metal uppercase">
              <Lightbulb className="w-4 h-4 text-brand-metal" />
              <span>Operational Guidance</span>
            </div>
            <p className="text-[10px] text-brand-muted font-mono leading-relaxed uppercase">
              {product.classification === 'Winner' && `Highest efficiency asset. Maximize organic placement and paid digital promotion.`}
              {product.classification === 'Hidden Winner' && `Excellent consumer demand. Direct additional traffic flows via newsletters or collections.`}
              {product.classification === 'Weak Product Page' && `High bounce behavior. Consider rewriting descriptions, updating hero photos, or introducing sizing calculators.`}
              {product.classification === 'Checkout Leak' && `High cart conversions but massive drops in pricing forms. Inspect standard checkout fields, shipping margins, and validation errors.`}
              {product.classification === 'Low Visibility' && `Insufficient traffic volume to form a conversion profile. Implement direct pathing links.`}
              {product.classification === 'Normal' && `Operating at standard store benchmark margins. Monitor performance curves.`}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
