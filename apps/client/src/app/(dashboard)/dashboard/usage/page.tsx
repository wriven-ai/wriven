'use client';

import React, { useState } from 'react';
import {
  Activity,
  Database,
  CloudLightning,
  RefreshCw,
  TrendingUp,
  Globe,
  Clock,
  Zap,
} from 'lucide-react';

export default function UsageStatsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyData, setLatencyData] = useState('11ms');
  const [apiHits, setApiHits] = useState(128450);

  const triggerMetricsRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setLatencyData((9 + Math.floor(Math.random() * 5)).toString() + 'ms');
      setApiHits(prev => prev + Math.floor(Math.random() * 20));
    }, 800);
  };

  // Sample static logs for API nodes
  const deploymentLogs = [
    { time: "10:14:12", status: 200, origin: "AS-EAST", method: "GET", route: "/api/v1/content?schema=blog" },
    { time: "10:14:28", status: 200, origin: "EU-WEST", method: "GET", route: "/api/v1/content?schema=product" },
    { time: "10:15:02", status: 304, origin: "US-EAST", method: "GET", route: "/api/v1/content/entry_98a3b" },
    { time: "10:15:22", status: 200, origin: "EU-WEST", method: "GET", route: "/api/v1/content?schema=blog" },
  ];

  return (
    <div className="space-y-8 text-left" id="usage-stats-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Traffic & <span className="font-normal italic text-brand-secondary">Consumption Analytics</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Measure global payload request spikes and compression metrics in real-time"}
          </p>
        </div>

        <div>
          <button
            onClick={triggerMetricsRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-primary px-3 py-1.5 rounded-lg text-2xs font-mono font-bold transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-accent' : ''}`} />
            Refresh Metrics
          </button>
        </div>
      </div>

      {/* Top 4 Quick Metric Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="usage-summary-grid">
        
        {/* Total API hits */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left shadow-xs space-y-2">
          <div className="flex justify-between items-center text-text-muted">
            <span className="text-[10px] font-mono font-bold tracking-wider">API Hits Monthly</span>
            <Globe className="w-4 h-4 text-brand-secondary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
              {apiHits.toLocaleString()}
            </h2>
            <span className="text-[10px] font-mono text-emerald-500 font-bold leading-none">+12.4%</span>
          </div>
          <p className="text-[9.5px] font-mono text-text-muted">Quota threshold: 500,000 requests</p>
        </div>

        {/* CDN bandwidth */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left shadow-xs space-y-2">
          <div className="flex justify-between items-center text-text-muted">
            <span className="text-[10px] font-mono font-bold tracking-wider">CDN Bandwidth</span>
            <CloudLightning className="w-4 h-4 text-brand-accent animate-pulse" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
              4.82 GB
            </h2>
            <span className="text-[10px] font-mono text-emerald-500 font-bold leading-none">-6.2%</span>
          </div>
          <p className="text-[9.5px] font-mono text-text-muted">Unmetered global edge compression</p>
        </div>

        {/* Global node latency */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left shadow-xs space-y-2">
          <div className="flex justify-between items-center text-text-muted">
            <span className="text-[10px] font-mono font-bold tracking-wider">Edge Latency</span>
            <Clock className="w-4 h-4 text-brand-secondary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
              {latencyData}
            </h2>
            <span className="text-[10px] font-mono text-emerald-500 font-bold leading-none">Optimal</span>
          </div>
          <p className="text-[9.5px] font-mono text-text-muted">Avg response time across 42 POPs</p>
        </div>

        {/* Database row records limits */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left shadow-xs space-y-2">
          <div className="flex justify-between items-center text-text-muted">
            <span className="text-[10px] font-mono font-bold tracking-wider">Content Records</span>
            <Database className="w-4 h-4 text-brand-accent" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
              1,240
            </h2>
            <span className="text-[10px] font-mono text-text-muted">Limit: 10k</span>
          </div>
          <p className="text-[9.5px] font-mono text-text-muted">12.4% Schema limits registered</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column: Micro requests visualizer */}
        <div className="lg:col-span-8 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex justify-between items-center border-b border-brand-border pb-3">
            <h3 className="text-xs font-mono font-bold text-text-primary tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-secondary" />
              API Activity Timeline Index
            </h3>
            <span className="text-[9px] font-mono text-text-muted font-bold">24-hour log scale</span>
          </div>

          {/* Clean modern SVG line graph showing hourly requests */}
          <div className="relative pt-4 overflow-hidden border border-brand-border rounded-xl bg-brand-surface-soft/40 p-5 p-r-2" id="request-chart-frame">
            
            {/* SVG graph container */}
            <svg 
              className="w-full h-48 select-none" 
              viewBox="0 0 500 150" 
              preserveAspectRatio="none"
            >
              {/* Grid guide bounds */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="var(--brand-border)" strokeWidth="0.5" strokeDasharray="5,5" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="var(--brand-border)" strokeWidth="0.5" strokeDasharray="5,5" />
              <line x1="0" y1="130" x2="500" y2="130" stroke="var(--brand-border)" strokeWidth="0.5" strokeDasharray="5,5" />

              {/* Area path colored subtle */}
              <path 
                d="M 0 150 Q 80 110 120 70 T 240 105 T 360 40 T 500 25 L 500 150 Z" 
                fill="rgba(11, 110, 79, 0.04)" 
              />

              {/* Grid Spline curve represent hits spikes */}
              <path 
                d="M 0 150 Q 80 110 120 70 T 240 105 T 360 40 T 500 25" 
                fill="none" 
                stroke="var(--brand-secondary)" 
                strokeWidth="1.8" 
              />

              {/* Custom dots for data items */}
              <circle cx="120" cy="70" r="3.5" fill="var(--brand-accent)" />
              <circle cx="240" cy="105" r="3.5" fill="var(--brand-secondary)" />
              <circle cx="360" cy="40" r="3.5" fill="var(--brand-secondary)" />
              <circle cx="480" cy="27" r="3.5" fill="var(--brand-accent)" />
            </svg>

            {/* Timestamps axis row */}
            <div className="flex justify-between text-[9px] font-mono text-text-muted mt-2 border-t border-brand-border pt-1.5 leading-none">
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>00:00 (UTC)</span>
            </div>
          </div>

          {/* Live Request Stream section */}
          <div className="space-y-3 pt-2">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block font-bold leading-none">
              Recent Access Gateway Transactions
            </span>
            <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border bg-brand-surface-soft/20 text-2xs font-mono">
              {deploymentLogs.map((log, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted">{log.time}</span>
                    <span className="bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/15 px-1 py-0.2 rounded text-[8px] uppercase">
                      {log.status}
                    </span>
                    <strong className="text-text-primary px-1 font-bold">{log.method}</strong>
                    <span className="text-text-secondary select-all">{log.route}</span>
                  </div>
                  <span className="text-text-muted font-bold text-[9px] text-[#424d45]">{log.origin}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right column: Storage specs and subscription limits details */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Section: Subscription bounds checklist */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4 text-left">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-brand-accent animate-pulse" />
              Core Service Allocations
            </span>

            <div className="space-y-4 font-mono text-2xs">
              
              {/* Quota 1: API requests monthly */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline font-bold leading-none text-2xs">
                  <span className="text-text-secondary">API Requests Threshold</span>
                  <span className="text-text-primary">128.4k / 500k calls</span>
                </div>
                <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
                  <div className="w-[25.6%] h-full bg-brand-secondary" />
                </div>
              </div>

              {/* Quota 2: CDNs Edge Bandwidths */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline font-bold leading-none">
                  <span className="text-text-secondary">Bandwidth Edge Limit</span>
                  <span className="text-text-primary">4.8 GB / 50 GB</span>
                </div>
                <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
                  <div className="w-[9.6%] h-full bg-brand-secondary" />
                </div>
              </div>

              {/* Quota 3: Total Assets storage */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline font-bold leading-none">
                  <span className="text-text-secondary">Assets Storage CDN Disk</span>
                  <span className="text-text-primary">6.3 MB / 1 GB</span>
                </div>
                <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
                  <div className="w-[0.6%] h-full bg-brand-secondary" />
                </div>
              </div>

              {/* Quota 4: Teams Seats count */}
              <div className="space-y-1.5 leading-none">
                <div className="flex justify-between font-bold">
                  <span className="text-text-secondary">Collaborator Passes</span>
                  <span className="text-text-primary">2 / 5 Teammates</span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
