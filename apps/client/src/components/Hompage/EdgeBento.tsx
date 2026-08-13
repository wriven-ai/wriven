'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Wifi, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function EdgeBento() {
  const [pings, setPings] = useState({
    tokyo: 11,
    london: 14,
    paris: 16,
    newyork: 9,
    frankfurt: 15,
  });
  const [isRefreshingCDNs, setIsRefreshingCDNs] = useState(false);
  const [cacheEfficacy, setCacheEfficacy] = useState(99.45);

  // Simulated ping rate changes
  useEffect(() => {
    const timer = setInterval(() => {
      setPings(prev => ({
        tokyo: Math.max(7, prev.tokyo + (Math.random() > 0.5 ? 1 : -1)),
        london: Math.max(9, prev.london + (Math.random() > 0.5 ? 1 : -1)),
        paris: Math.max(11, prev.paris + (Math.random() > 0.5 ? 1 : -1)),
        newyork: Math.max(5, prev.newyork + (Math.random() > 0.5 ? 1 : -1)),
        frankfurt: Math.max(10, prev.frankfurt + (Math.random() > 0.5 ? 1 : -1)),
      }));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const triggerLiveCDNPurge = () => {
    setIsRefreshingCDNs(true);
    setTimeout(() => {
      setIsRefreshingCDNs(false);
      setCacheEfficacy(parseFloat((99.4 + Math.random() * 0.45).toFixed(2)));
    }, 1200);
  };

  return (
    <section className="py-20 lg:py-28 bg-brand-bg relative overflow-hidden border-b border-brand-border" id="edge-bento">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        
        <div className="max-w-3xl mx-auto space-y-3 mb-16 text-center">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            Performance Analytics
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
            Global delivery stats in real time
          </h2>
          <p className="text-text-secondary text-sm font-light leading-relaxed">
            Check responsive caching metrics across major global server points. Wriven delivers localized JSON static blocks near-instantly, bypassing database cold starts.
          </p>
        </div>

        {/* Bento Grid Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 text-left pt-6" id="telemetry-bento-grid">
          
          {/* Box 1: Core Cache Hit Rate Performance */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-6" id="bento-cache-rate">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-mono font-bold uppercase text-brand-accent tracking-widest">EDGE DYNAMICS</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-green-600 bg-green-500/5 border border-green-500/10 px-2.5 py-0.5 rounded">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-green-600" />
                  LIVE SIGNALING ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center pt-2">
                <div>
                  <span className="block text-4xl sm:text-5xl font-display font-bold text-text-primary tracking-tight" id="cache-rate-display">
                    {cacheEfficacy}%
                  </span>
                  <span className="block text-sm font-mono font-bold text-brand-accent uppercase mt-1.5 tracking-wider">Average Edge Cache Hit Frequency</span>
                  <p className="text-sm text-text-secondary font-light mt-2 leading-relaxed font-sans">
                    Almost every request bypasses standard database calls entirely, streaming static, compiled edge packages instantly.
                  </p>
                </div>

                {/* Mini graphic visual block */}
                <div className="h-28 flex items-end justify-between p-4 relative overflow-hidden border-b border-brand-border">
                  <div className="absolute top-0 left-0 text-sm font-mono font-bold text-text-muted">CACHE READ ACTIVITY TIMELINE</div>
                  
                  {/* Interactive bar graph timeline */}
                  {[65, 87, 92, 79, 84, 98, 92, 99].map((height, idx) => (
                    <div key={idx} className="w-3.5 bg-brand-accent/10 rounded-t relative group flex flex-col justify-end h-16">
                      <motion.div 
                        className="bg-brand-accent rounded-t w-full"
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                      />
                    </div>
                  ))}
                </div>

              </div>
            </div>

            <div className="pt-6 border-t border-brand-border/75 mt-6 flex flex-wrap gap-4 items-center justify-between">
              <span className="text-sm font-mono text-text-secondary leading-relaxed max-w-sm">
                Purging caches releases content locks instantly, pushing fresh metadata to all DNS registries in &lt;15ms.
              </span>
              <button
                onClick={triggerLiveCDNPurge}
                disabled={isRefreshingCDNs}
                className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white py-3 px-5 text-sm font-mono font-bold uppercase tracking-wider rounded-lg border border-brand-border-button neo-shadow cursor-pointer disabled:bg-gray-400 transition-all ml-auto sm:ml-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCDNs ? 'animate-spin' : ''}`} />
                {isRefreshingCDNs ? "PURGING GRAPH..." : "CONFIRM GLOBAL PURGE"}
              </button>
            </div>
          </div>

          {/* Box 2: Node Connection Clusters */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-6 lg:border-l lg:border-brand-border lg:pl-10" id="bento-node-pings">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-bold uppercase text-brand-accent tracking-widest">SERVER STATUS</span>
                <Wifi className="w-4 h-4 text-brand-accent animate-bounce" />
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: "tokyo", icon: "HND-3", city: "East Asia (Tokyo)", latency: pings.tokyo },
                  { key: "london", icon: "LON-1", city: "Western Europe (London)", latency: pings.london },
                  { key: "newyork", icon: "JFK-2", city: "North America (NY)", latency: pings.newyork },
                  { key: "frankfurt", icon: "FRA-5", city: "Central Europe (Frankfurt)", latency: pings.frankfurt },
                ].map((node) => (
                  <div key={node.key} className="flex justify-between items-center py-2.5 border-b border-brand-border last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm text-brand-accent font-bold">
                        {node.icon}
                      </span>
                      <span className="text-sm font-bold text-text-primary">{node.city}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-brand-accent font-bold">{node.latency}ms</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15D296] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 text-sm text-text-secondary leading-relaxed font-light border-t border-brand-border mt-4">
              Using global cached routes on Edge points streams static routes at light-speed parameters.
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
