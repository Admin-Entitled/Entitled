import React, { useState } from 'react';
import { 
  UploadCloud, FileText, ArrowRight, X, Info, 
  Database, RefreshCw, AlertCircle, CheckCircle, HelpCircle
} from 'lucide-react';

export default function UploadPage({ syncStatus, onUploadSuccess, onRefreshData, onCancel }) {
  const [files, setFiles] = useState({
    ecommerceCsv: null,
    pagesCsv: null,
    eventsCsv: null,
    clarityCsv: null
  });
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const activeMode = syncStatus?.mode || 'csv';

  const fileSlots = [
    {
      key: 'ecommerceCsv',
      title: 'GA4 Ecommerce Purchases',
      desc: 'Contains item revenue, items viewed, item add-to-carts, and conversions.',
      sampleType: 'ecommerce'
    },
    {
      key: 'pagesCsv',
      title: 'GA4 Pages and Screens',
      desc: 'Contains page paths, pageviews, and bounce rates for path analysis.',
      sampleType: 'pages'
    },
    {
      key: 'eventsCsv',
      title: 'GA4 Events Report',
      desc: 'Contains overall event counts (view_item, add_to_cart, begin_checkout).',
      sampleType: 'events'
    },
    {
      key: 'clarityCsv',
      title: 'Microsoft Clarity Dashboard',
      desc: 'Contains scroll depth, bot sessions, dead clicks, quick backs, and devices.',
      sampleType: 'clarity'
    }
  ];

  const handleFileChange = (key, file) => {
    if (file && file.name.endsWith('.csv')) {
      setFiles(prev => ({ ...prev, [key]: file }));
      setError(null);
    } else {
      setError('Please select a valid .csv file.');
    }
  };

  const removeFile = (key) => {
    setFiles(prev => ({ ...prev, [key]: null }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, key) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    handleFileChange(key, droppedFile);
  };

  const handleModeChange = async (mode) => {
    setError(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/settings/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (!res.ok) throw new Error('Failed to update data mode');
      onRefreshData();
    } catch (err) {
      setError('Mode toggle failure: ' + err.message);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sync/refresh', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Sync refresh failed');
      onRefreshData();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleRecalculate = async () => {
    const fileKeys = Object.keys(files);
    const uploadedCount = fileKeys.filter(k => files[k] !== null).length;
    if (uploadedCount === 0) {
      setError('Upload at least one GA4 or Clarity CSV file to merge and recalculate metrics.');
      return;
    }

    setUploading(true);
    setError(null);

    // Try backend upload first
    try {
      const formData = new FormData();
      fileKeys.forEach(k => {
        if (files[k]) {
          formData.append(k, files[k]);
        }
      });

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to parse and merge CSV reports');
      }

      const json = await res.json();
      onUploadSuccess(json.data);
      return;
    } catch (err) {
      console.warn('Backend server offline. Performing browser-side CSV compilation fallback.', err);
    }

    // Standalone browser parsing fallback
    try {
      const readAsText = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
      };

      const fileContents = {};
      await Promise.all(
        fileKeys.map(async key => {
          if (files[key]) {
            fileContents[key] = await readAsText(files[key]);
          } else {
            fileContents[key] = '';
          }
        })
      );

      const { processReports } = await import('../utils/localParser');
      const aggregated = processReports(fileContents);

      localStorage.setItem('local_dashboard_data', JSON.stringify(aggregated));
      localStorage.setItem('hasUploadedCsv', 'true');

      onUploadSuccess(aggregated);
    } catch (err) {
      console.error(err);
      setError('Client-side parsing failure: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Helper to format ISO date strings
  const formatDate = (isoStr) => {
    if (!isoStr) return 'Never';
    return new Date(isoStr).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Connected': return 'text-brand-success border-brand-success/20 bg-brand-success/5';
      case 'Error': return 'text-brand-danger border-brand-danger/20 bg-brand-danger/5';
      case 'Awaiting Credentials': return 'text-amber-500 border-amber-500/20 bg-amber-500/5';
      default: return 'text-brand-muted border-brand-border bg-white/[0.01]';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Connected': return <CheckCircle className="w-4 h-4 text-brand-success" />;
      case 'Error': return <AlertCircle className="w-4 h-4 text-brand-danger" />;
      case 'Awaiting Credentials': return <HelpCircle className="w-4 h-4 text-amber-500" />;
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-luxury space-y-8">
      
      {/* Page Header */}
      <div className="border-b border-brand-border/40 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-xs font-mono tracking-[0.2em] text-brand-metal uppercase">Register 07 // Data Control Panel</h3>
          <h1 className="text-2xl font-serif text-brand-text tracking-wide mt-1 uppercase">Ingestion Console</h1>
        </div>
        <button
          onClick={onCancel}
          className="text-xs font-mono text-brand-muted hover:text-brand-text border border-brand-border px-4 py-2 rounded-full hover:bg-white/[0.01] transition-luxury uppercase"
        >
          Return to Overview
        </button>
      </div>

      {/* Mode Selector Segmented Control */}
      <div className="border border-brand-border bg-brand-surface p-2 rounded-2xl flex max-w-md">
        <button
          onClick={() => handleModeChange('csv')}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 text-xs font-mono uppercase tracking-wider rounded-xl transition-luxury ${
            activeMode === 'csv'
              ? 'bg-brand-accent/20 border border-brand-metal/30 text-brand-text font-bold'
              : 'border border-transparent text-brand-muted hover:text-brand-text'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Manual CSV Mode</span>
        </button>
        <button
          onClick={() => handleModeChange('api')}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 text-xs font-mono uppercase tracking-wider rounded-xl transition-luxury ${
            activeMode === 'api'
              ? 'bg-brand-accent/20 border border-brand-metal/30 text-brand-text font-bold'
              : 'border border-transparent text-brand-muted hover:text-brand-text'
          }`}
        >
          <div className="relative">
            <RefreshCw className={`w-3.5 h-3.5 ${activeMode === 'api' && 'animate-spin'}`} style={{ animationDuration: '6s' }} />
            {activeMode === 'api' && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-success animate-ping" />
            )}
          </div>
          <span>Auto API Mode</span>
        </button>
      </div>

      {/* API Configuration Panel */}
      {activeMode === 'api' && (
        <div className="border border-brand-border bg-gradient-to-b from-brand-surface to-brand-bg rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border/40 pb-4">
            <div>
              <h3 className="text-sm font-mono font-bold uppercase text-brand-text">Active API Sync Overview</h3>
              <p className="text-[10px] font-mono text-brand-muted uppercase mt-0.5">
                Last System updated: {formatDate(syncStatus?.lastUpdated)}
              </p>
            </div>
            
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center justify-center space-x-2 bg-brand-accent border border-brand-metal/20 hover:border-brand-metal/50 text-brand-text px-5 py-2.5 text-xs font-mono uppercase tracking-wider disabled:opacity-50 transition-luxury rounded-full font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing && 'animate-spin'}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {syncError && (
            <div className="border border-brand-danger/40 bg-brand-danger/5 p-4 text-xs text-brand-text font-mono rounded-xl flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-brand-danger flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-brand-metal uppercase">Sync Trigger Error: </span>
                {syncError}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* GA4 Connection Card */}
            <div className={`border p-5 rounded-2xl flex flex-col justify-between space-y-4 ${getStatusColor(syncStatus?.ga4?.status)}`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-brand-text">Google Analytics 4</span>
                  <div className="flex items-center space-x-1.5 font-mono text-[10px] uppercase font-bold">
                    {getStatusIcon(syncStatus?.ga4?.status)}
                    <span>{syncStatus?.ga4?.status || 'Unknown'}</span>
                  </div>
                </div>
                <p className="text-[11px] text-brand-muted leading-relaxed font-mono uppercase">
                  Fetches live overview counts, product monetization funnels, pageviews, and source referrers directly via the GA Data Client.
                </p>
              </div>
              <div className="pt-2 border-t border-brand-border/20 text-[10px] font-mono text-brand-muted uppercase flex justify-between">
                <span>Last Synced:</span>
                <span className="text-brand-text">{formatDate(syncStatus?.ga4?.lastSynced)}</span>
              </div>
              {syncStatus?.ga4?.error && (
                <p className="text-[10px] font-mono text-brand-danger bg-brand-danger/5 p-2.5 rounded-lg border border-brand-danger/20 break-all">
                  ERROR: {syncStatus.ga4.error}
                </p>
              )}
            </div>

            {/* Microsoft Clarity Connection Card */}
            <div className={`border p-5 rounded-2xl flex flex-col justify-between space-y-4 ${getStatusColor(syncStatus?.clarity?.status)}`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-brand-text">Microsoft Clarity</span>
                  <div className="flex items-center space-x-1.5 font-mono text-[10px] uppercase font-bold">
                    {getStatusIcon(syncStatus?.clarity?.status)}
                    <span>{syncStatus?.clarity?.status || 'Unknown'}</span>
                  </div>
                </div>
                <p className="text-[11px] text-brand-muted leading-relaxed font-mono uppercase">
                  Pulls live session analytics, user counts, scroll depth, and frustration friction points (dead clicks, rage clicks, quick backs).
                </p>
              </div>
              <div className="pt-2 border-t border-brand-border/20 text-[10px] font-mono text-brand-muted uppercase flex justify-between">
                <span>Last Synced:</span>
                <span className="text-brand-text">{formatDate(syncStatus?.clarity?.lastSynced)}</span>
              </div>
              {syncStatus?.clarity?.error && (
                <p className="text-[10px] font-mono text-brand-danger bg-brand-danger/5 p-2.5 rounded-lg border border-brand-danger/20 break-all">
                  ERROR: {syncStatus.clarity.error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV Uploader Panel */}
      {activeMode === 'csv' && (
        <div className="space-y-6">
          {/* Info Notice (restrained outline) */}
          <div className="border border-brand-border bg-brand-surface p-5 rounded-2xl flex items-start space-x-4">
            <Info className="w-5 h-5 text-brand-metal flex-shrink-0 mt-0.5" />
            <div className="text-xs text-brand-muted space-y-1">
              <p className="font-semibold text-brand-text uppercase font-mono tracking-wide">Automatic Alignment Protocol</p>
              <p className="leading-relaxed font-mono text-[11px]">
                The parser strips GA4 commentary headers, maps synonymous column schemas, and integrates Clarity behavioral sessions automatically. Missing reports are supplemented using baseline metrics to avoid interface breakage.
              </p>
            </div>
          </div>

          {/* Upload Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fileSlots.map(slot => {
              const file = files[slot.key];
              return (
                <div
                  key={slot.key}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, slot.key)}
                  className={`border border-dashed p-6 bg-brand-surface rounded-2xl flex flex-col justify-between min-h-[200px] transition-luxury relative ${
                    file 
                      ? 'border-brand-metal/50 bg-brand-metal/[0.01]' 
                      : 'border-brand-border hover:border-brand-metal/20'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-brand-text">
                        {slot.title}
                      </h3>
                      {file ? (
                        <span className="text-[9px] font-mono text-brand-metal bg-brand-metal/5 border border-brand-metal/20 px-2.5 py-0.5 uppercase rounded-full font-bold">
                          Staged
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-brand-muted border border-brand-border px-2.5 py-0.5 uppercase rounded-full">
                          Awaiting
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-brand-muted mt-3 font-mono leading-relaxed uppercase">
                      {slot.desc}
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-brand-border/40 flex items-center justify-between">
                    {file ? (
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center space-x-2.5 text-xs font-mono text-brand-metal truncate max-w-[80%]">
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeFile(slot.key)}
                          title="Clear file"
                          className="text-brand-muted hover:text-brand-danger p-1 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <label className="cursor-pointer group flex items-center space-x-2 text-[11px] font-mono text-brand-muted hover:text-brand-text">
                          <UploadCloud className="w-4 h-4 text-brand-muted group-hover:text-brand-text transition-colors" />
                          <span className="underline decoration-dotted">Browse local drive</span>
                          <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => handleFileChange(slot.key, e.target.files[0])}
                          />
                        </label>
                        <a
                          href={`/api/sample-csv/${slot.sampleType}`}
                          className="text-[9px] font-mono text-brand-metal/80 hover:text-brand-metal underline decoration-dotted uppercase"
                        >
                          Template
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ingestion Failure Banner */}
          {error && (
            <div className="border border-brand-danger/40 bg-brand-danger/5 p-5 text-xs text-brand-text font-mono rounded-xl flex items-start space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-danger mt-1.5 animate-ping flex-shrink-0" />
              <div>
                <span className="font-bold text-brand-metal uppercase">Ingestion Failure: </span>
                {error}
              </div>
            </div>
          )}

          {/* Recalculate Trigger Panel */}
          <div className="border border-brand-border bg-brand-surface p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-text">
                Merge & Sync Analytics
              </h4>
              <p className="text-[10px] font-mono text-brand-muted uppercase mt-1">
                Recalculate conversion channels, opportunity engines, and UX anomalies.
              </p>
            </div>

            <button
              onClick={handleRecalculate}
              disabled={uploading}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-brand-accent border border-brand-metal/20 hover:border-brand-metal/50 text-brand-text px-6 py-3 text-xs font-mono uppercase tracking-wider disabled:opacity-50 transition-luxury rounded-full font-semibold"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
                  <span>Processing Ingestion...</span>
                </>
              ) : (
                <>
                  <span>Recalculate Catalog Metrics</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
