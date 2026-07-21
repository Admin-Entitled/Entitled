import React, { useState, useEffect } from 'react';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ProductDetailPage from './pages/ProductDetailPage';
import { defaultData } from './utils/defaultData';
import { 
  BarChart2, Layers, TrendingUp, Cpu, ShieldAlert, Navigation, 
  UploadCloud, Settings, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'funnel', 'visibility', 'diagnostics', 'clarity', 'traffic', 'reports', 'settings'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [isDemo, setIsDemo] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard-data');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      setData(json);
      const hasUploaded = localStorage.getItem('hasUploadedCsv') === 'true';
      const isApiMode = json.syncStatus?.mode === 'api';
      const hasConnectedApi = json.syncStatus?.ga4?.status === 'Connected' || json.syncStatus?.clarity?.status === 'Connected';
      setIsDemo(!hasUploaded && !(isApiMode && hasConnectedApi));
    } catch (err) {
      console.warn('Backend offline. Running in standalone browser mode.', err);
      const savedData = localStorage.getItem('local_dashboard_data');
      if (savedData) {
        setData(JSON.parse(savedData));
        setIsDemo(false);
      } else {
        setData(defaultData);
        setIsDemo(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReset = async () => {
    setResetting(true);
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (err) {
      console.warn('Backend offline. Performing local cache reset.', err);
    }
    localStorage.removeItem('local_dashboard_data');
    localStorage.removeItem('hasUploadedCsv');
    setData(defaultData);
    setIsDemo(true);
    setActiveTab('overview');
    setSelectedProductId(null);
    setResetting(false);
  };

  const handleUploadSuccess = (newData) => {
    setData(newData);
    localStorage.setItem('hasUploadedCsv', 'true');
    setIsDemo(false);
    setActiveTab('overview');
  };

  const navigateToProduct = (id) => {
    setSelectedProductId(id);
    setActiveTab('product-detail');
  };

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'funnel', label: 'Product Funnel', icon: Layers },
    { id: 'visibility', label: 'Visibility', icon: TrendingUp },
    { id: 'diagnostics', label: 'Diagnostics', icon: Cpu },
    { id: 'clarity', label: 'Clarity Insights', icon: ShieldAlert },
    { id: 'traffic', label: 'Traffic Sources', icon: Navigation },
    { id: 'reports', label: 'Reports / Ingestion', icon: UploadCloud },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex font-sans selection:bg-brand-accent selection:text-brand-text">
      
      {/* Collapsible Sidebar */}
      <aside 
        className={`border-r border-brand-border bg-gradient-to-b from-[#131417] to-brand-bg sticky top-0 h-screen flex flex-col justify-between overflow-y-auto z-40 transition-luxury ${
          sidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div className="py-8 px-6 flex flex-col h-full justify-between">
          <div>
            {/* Sidebar Branding */}
            <div className="flex items-center justify-between border-b border-brand-border/40 pb-6 mb-6">
              {!sidebarCollapsed ? (
                <div>
                  <p className="text-[10px] font-mono tracking-[0.2em] text-brand-metal uppercase">Entitled Club</p>
                  <h1 className="text-xl font-serif text-brand-text tracking-wide mt-1 uppercase">
                    Analytics
                  </h1>
                </div>
              ) : (
                <div className="bg-brand-accent p-1 border border-brand-metal/20 mx-auto">
                  <span className="font-mono text-brand-metal font-bold text-xs">EC</span>
                </div>
              )}
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="text-gray-500 hover:text-brand-text p-1 transition-colors outline-none hidden md:block"
                title={sidebarCollapsed ? "Expand Navigation" : "Collapse Navigation"}
              >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>

            {/* Sidebar Navigation */}
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedProductId(null);
                      setActiveTab(item.id);
                    }}
                    className={`w-full flex items-center space-x-3.5 py-3.5 px-4 text-xs font-medium border uppercase tracking-wider transition-luxury rounded-xl ${
                      isActive
                        ? 'border-brand-border text-brand-text bg-white/[0.02]'
                        : 'border-transparent text-brand-muted hover:text-brand-text hover:bg-white/[0.01]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-metal' : 'text-gray-500'}`} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar System Diagnostic Panel */}
          <div className="border-t border-brand-border/40 pt-6 mt-6">
            {!sidebarCollapsed ? (
              <div className="space-y-3 font-mono text-[10px] text-brand-muted">
                <div className="flex items-center justify-between">
                  <span>SYSTEM PORT:</span>
                  <span className="text-brand-text font-bold">5174 // 3001</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>ENVIRONMENT:</span>
                  <span className={isDemo ? 'text-amber-500 font-bold' : 'text-brand-success font-bold'}>
                    {isDemo ? 'DEMO_STREAM' : 'SECURE_LIVE'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${isDemo ? 'bg-amber-500 animate-pulse' : 'bg-brand-success'}`} />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Panel Content Shell */}
      <main className="flex-grow flex flex-col min-w-0">
        
        {/* Unified Dashboard Header */}
        <header className="border-b border-brand-border/60 bg-[#131417]/80 backdrop-blur-md sticky top-0 z-30 px-8 py-5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] text-brand-metal uppercase">ENTITLED</p>
              <h2 className="text-sm font-serif text-brand-muted italic mt-0.5">Analytics Intelligence</h2>
              <h1 className="text-lg font-serif font-semibold text-brand-text tracking-wide uppercase mt-1">
                Product Visibility & Conversion System
              </h1>
            </div>
            
            {/* Section Quick indicators */}
            <div className="flex items-center space-x-3">
              <div className="text-[10px] font-mono text-gray-500 uppercase">
                ACTIVE SECTION // <span className="text-brand-metal font-bold">{activeTab.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body Container */}
        <div className="flex-grow px-8 py-8 overflow-y-auto max-w-6xl mx-auto w-full">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="w-6 h-6 text-brand-metal animate-spin" />
              <p className="font-mono text-[10px] text-brand-muted uppercase tracking-widest">Ingesting Database Cache...</p>
            </div>
          ) : error ? (
            <div className="border border-brand-accent/40 bg-brand-accent/5 p-6 max-w-md mx-auto my-12 text-center rounded-2xl">
              <AlertTriangle className="w-8 h-8 text-brand-metal mx-auto mb-3" />
              <h3 className="font-serif text-sm uppercase text-brand-metal tracking-widest font-bold">Terminal Connection Error</h3>
              <p className="text-xs text-brand-muted mt-2 font-mono">{error}</p>
              <button
                onClick={fetchData}
                className="mt-5 px-4 py-2 border border-brand-metal text-brand-metal text-xs font-mono uppercase bg-transparent hover:bg-brand-metal/10 rounded-full transition-luxury"
              >
                Retry Stream
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {activeTab === 'product-detail' && selectedProductId ? (
                <ProductDetailPage 
                  productId={selectedProductId} 
                  onBack={() => setActiveTab('funnel')}
                />
              ) : activeTab === 'reports' ? (
                <UploadPage 
                  syncStatus={data ? data.syncStatus : null}
                  onUploadSuccess={handleUploadSuccess} 
                  onRefreshData={fetchData}
                  onCancel={() => setActiveTab('overview')}
                />
              ) : activeTab === 'settings' ? (
                <div className="max-w-2xl mx-auto border border-brand-border bg-gradient-to-b from-brand-surface to-brand-bg p-8 rounded-2xl">
                  <h3 className="text-lg font-serif text-brand-text uppercase mb-4">System Settings</h3>
                  <p className="text-xs text-brand-muted font-mono uppercase mb-8">System memory cache controls</p>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-brand-border/40 pb-4">
                      <div>
                        <h4 className="text-xs font-mono font-bold text-brand-text uppercase">Restore Default Stream</h4>
                        <p className="text-[11px] text-brand-muted mt-1 leading-relaxed">Clears all uploaded analytics reports and resets back to the official default catalog stream.</p>
                      </div>
                      <button
                        onClick={handleReset}
                        disabled={resetting}
                        className="border border-brand-accent text-brand-text hover:bg-brand-accent/20 px-4 py-2 text-xs font-mono uppercase rounded-full disabled:opacity-50 transition-luxury"
                      >
                        {resetting ? 'Resetting...' : 'Reset System'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <DashboardPage 
                  data={data} 
                  activeTab={activeTab}
                  onViewProduct={navigateToProduct} 
                  onNavigateUpload={() => setActiveTab('reports')}
                  isDemo={isDemo}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
