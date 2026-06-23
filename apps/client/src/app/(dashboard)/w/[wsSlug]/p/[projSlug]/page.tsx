'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useNavContext } from '@/components/sidebar/use-nav-context';
import {
  Sparkles,
  Database,
  FileText,
  Image as ImageIcon,
  ArrowUpRight,
  Zap,
  Terminal,
  Activity,
  Clock,
  ArrowRight,
} from 'lucide-react';

export default function DashboardHome() {
  const { data } = useNavContext();
  const wsBase = data.workspace ? `/w/${data.workspace.slug}` : '';
  const pBase =
    data.workspace && data.project
      ? `/w/${data.workspace.slug}/p/${data.project.slug}`
      : '';

  const stats = [
    { name: 'Total Entries', value: '141', change: '+12% this week', icon: FileText, color: 'text-brand-accent bg-brand-accent/10' },
    { name: 'Content Types', value: '5 Schema', change: '2 drafted', icon: Database, color: 'text-brand-secondary bg-brand-secondary/10' },
    { name: 'API Hits', value: '12,420', change: '99.98% uptime', icon: Zap, color: 'text-brand-accent bg-brand-accent/10' },
    { name: 'Media Ass.', value: '28 Files', change: '8.4 MB total', icon: ImageIcon, color: 'text-text-primary bg-brand-surface-soft' },
  ];

  const meters = [
    { name: 'API Requests Balance', used: 12420, limit: 50000, unit: 'reqs', color: 'bg-brand-accent' },
    { name: 'CDN Bandwidth', used: 1.2, limit: 5.0, unit: 'GB', color: 'bg-brand-secondary' },
    { name: 'AI Generation Tokens', used: 42350, limit: 100000, unit: 'tokens', color: 'bg-text-primary' },
  ];

  const recentActivity = [
    { action: 'Drafted entry', target: 'future-of-smart-wearables', time: '10 mins ago', type: 'blog_post', user: 'Anowar Hosen (You)' },
    { action: 'Compiled schema', target: 'Product Specs', time: '2 hours ago', type: 'system', user: 'Architect Node_7' },
    { action: 'API Key created', target: 'NextJS SDK Client Key', time: 'Yesterday', type: 'security', user: 'Anowar Hosen (You)' },
    { action: 'AI Image generated', target: 'cybernetic_moss_forest.png', time: 'Yesterday', type: 'media', user: 'AI Engine' },
    { action: 'Webhook event sent', target: 'Vercel Deploy hook', time: '2 days ago', type: 'dispatch', user: 'Webhook Node' },
  ];

  return (
    <div className="space-y-8 text-left" id="dashboard-home">
      
      {/* Welcome Title Banner */}
      <div className="bg-brand-surface border border-brand-border-button rounded-xl p-6 sm:p-8 shadow-sm relative overflow-hidden" id="dashboard-welcome">
        <div className="absolute top-4 right-4 text-[9px] font-mono text-text-muted select-none pointer-events-none">[NODE_CONSOLE // STABLE]</div>
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold text-brand-accent">
            <Sparkles className="w-3.5 h-3.5" />
            Wriven AI Engine — Ready
          </div>
          <h1 className="font-display font-medium text-2xl sm:text-3xl text-text-primary tracking-tight leading-none">
            Welcome back, <span className="font-normal italic text-brand-secondary">Anowar.</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary font-light leading-relaxed">
            Your semantic headless platform is connected to edge CDNs. You have compiled <span className="font-mono font-semibold text-text-primary">141 items</span>, which are cached across 12 edge nodes worldwide with <span className="font-mono text-brand-accent font-semibold">12ms target speed</span>.
          </p>
        </div>
        
        {/* Subtle decorative circles floating */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-brand-secondary/5 to-transparent pointer-events-none select-none" />
      </div>

      {/* Grid of basic stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs relative text-left"
            id={`stat-box-${stat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">{stat.name}</span>
              <div className={`p-1.5 rounded-lg border border-brand-border/25 ${stat.color}`}>
                <stat.icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="font-display font-bold text-2xl text-text-primary tracking-tight">{stat.value}</span>
              <p className="text-[10px] font-mono text-text-muted mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-text-muted/60" />
                {stat.change}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Usage meters and recent activity layout block */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch" id="dashboard-details-grid">
        
        {/* Usage meters section */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border-button rounded-xl p-6 flex flex-col justify-between shadow-sm text-left" id="usage-meters-box">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h2 className="text-xs font-mono font-bold text-text-primary tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-accent animate-pulse" />
                Monthly Quota Meters
              </h2>
              <Link href={`${wsBase}/usage`} className="text-[10px] font-mono text-brand-secondary hover:underline flex items-center gap-1 font-bold">
                Detail Logs <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-6">
              {meters.map((meter) => {
                const percent = (meter.used / meter.limit) * 100;
                return (
                  <div key={meter.name} className="space-y-1.5" id={`meter-${meter.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                    <div className="flex justify-between text-2xs font-mono">
                      <span className="text-text-secondary font-bold">{meter.name}</span>
                      <span className="text-text-primary font-bold">
                        {meter.used.toLocaleString()} / {meter.limit.toLocaleString()} {meter.unit}
                      </span>
                    </div>
                    <div className="w-full bg-brand-surface-soft border border-brand-border h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${meter.color}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-text-muted">
                      <span>Usage Rate</span>
                      <span className="font-bold">{percent.toFixed(1)}% consumed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-brand-border text-center bg-brand-surface-soft/40 p-4 rounded-lg border border-dashed border-brand-border">
            <p className="text-[10px] font-mono text-text-secondary italic mb-3">
              💡 Edge CDN caching prevents <strong>89.2%</strong> of calls from hitting the origin server, preserving your token balance.
            </p>
            <Link 
              href={`${wsBase}/usage`} 
              className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white text-[10px] font-mono font-bold tracking-wider py-2 px-3.5 rounded-lg border border-brand-border-button neo-shadow"
            >
              Examine Consumption <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Recent activities stack */}
        <div className="lg:col-span-7 bg-brand-surface border border-brand-border-button rounded-xl p-6 shadow-sm text-left flex flex-col justify-between" id="recent-activity-box">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h2 className="text-xs font-mono font-bold text-text-primary tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-secondary" />
                System Activity Ledger
              </h2>
              <span className="text-[9px] font-mono bg-brand-surface-soft border border-brand-border text-text-muted px-2 py-0.5 rounded font-bold">Live</span>
            </div>

            <div className="divide-y divide-brand-border" id="activity-list">
              {recentActivity.map((act, i) => (
                <div key={i} className="py-3 first:pt-0 last:pb-0 flex justify-between items-start gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-mono font-bold text-text-primary">{act.action}</span>
                      <span className="text-[9px] font-mono bg-brand-surface-soft text-brand-accent px-1.5 py-0.2 rounded border border-brand-border">{act.type}</span>
                    </div>
                    <div className="text-2xs font-mono text-text-secondary">
                      Target: <span className="font-semibold text-text-primary">`{act.target}`</span>
                    </div>
                    <div className="text-[9px] font-mono text-text-muted">By: {act.user}</div>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted wrap-none shrink-0">{act.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-brand-border flex flex-wrap items-center justify-between gap-3 text-3xs font-mono text-text-muted">
            <span>Total Ledger Size: 1,489 records</span>
            <Link href={`${wsBase}/settings`} className="hover:text-brand-accent underline">Manage auditing logs</Link>
          </div>
        </div>

      </div>

      {/* Quick Launchpad Buttons (Cards) */}
      <div className="space-y-3 text-left">
        <h2 className="text-xs font-mono font-bold text-text-muted tracking-wider px-1">Quick Engine Shortcuts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="shortcuts-grid">
          {[
            { title: 'Create Schema Model', desc: 'Declare fields, types, relationships', link: `${pBase}/content-types`, label: 'Launch Modeler' },
            { title: 'Weave Creative Copy', desc: 'AI-assisted structured content writer', link: `${pBase}/content`, label: 'Open Editor' },
            { title: 'Compile Graphic Assets', desc: 'AI graphic generation & search', link: `${pBase}/media`, label: 'Open Library' },
          ].map((item, i) => (
            <Link 
              key={i} 
              href={item.link} 
              className="group bg-brand-surface hover:bg-brand-surface-soft/40 border border-brand-border hover:border-brand-accent rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between min-h-[140px] text-left"
            >
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-brand-secondary font-bold block">Shortcut 0{i+1}</span>
                <h3 className="font-display font-medium text-sm text-text-primary group-hover:text-brand-accent transition-colors tracking-tight">{item.title}</h3>
                <p className="text-2xs text-text-secondary leading-snug font-light">{item.desc}</p>
              </div>
              <span className="text-[10px] font-mono font-bold text-text-primary group-hover:text-brand-accent transition-colors flex items-center gap-1.5 mt-4">
                {item.label} <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
