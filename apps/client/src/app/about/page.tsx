'use client';

import React from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { Sparkles, Layers, Target, Compass, User } from 'lucide-react';

export default function About() {
  const values = [
    {
      title: "Architectural Honesty",
      desc: "No fluff, no technical clutter. Every API endpoint is designed to return clean, lightning-fast JSON directly to developers.",
      icon: Target
    },
    {
      title: "Content-First AI Integration",
      desc: "AI is built directly into Wriven's editor core, working seamlessly alongside human copywriters rather than replacing them.",
      icon: Sparkles
    },
    {
      title: "Modern Simplicity",
      desc: "Inspired by modern frameworks, we build information-dense but highly readable tools designed for elite content workflows.",
      icon: Compass
    }
  ];

  const team = [
    {
      name: "Marcus Weave",
      role: "Co-Founder & CEO",
      bio: "Former Head of Platform at Contentful. Loves structured datasets, high-contrast typographies, and editorial design.",
      avatar: "https://picsum.photos/seed/marcus/300/300"
    },
    {
      name: "Sophia Wright",
      role: "Co-Founder & CTO",
      bio: "Author of popular open-source GraphQL engines. Spearheads Wriven's serverless edge and Gemini micro-services.",
      avatar: "https://picsum.photos/seed/sophia/300/300"
    },
    {
      name: "Elena Rostova",
      role: "Head of Product Design",
      bio: "Previously Senior Designer at Stripe. Passionate about micro-interactions, responsive grids, and calm interfaces.",
      avatar: "https://picsum.photos/seed/elena/300/300"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain" id="wriven-about-page">
      <Header />

      <main className="flex-grow">
        {/* About Hero */}
        <section className="relative overflow-hidden pt-20 pb-16 lg:pt-28 lg:pb-28 border-b border-brand-border" id="about-hero">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="max-w-3xl mx-auto space-y-6">
              <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase animate-fade-in">
                Our Origin Story
              </span>
              <h1 className="font-display font-medium leading-[1.1] tracking-tight text-text-primary text-4xl sm:text-5xl" id="about-title">
                Weaving written ideas <br />
                <span className="font-serif italic text-brand-accent font-normal">everywhere.</span>
              </h1>
              <p className="text-text-secondary text-sm sm:text-base leading-relaxed max-w-xl mx-auto font-light" id="about-subtitle">
                Wriven was founded in 2026 to dismantle the artificial boundaries separating content authors, backend structures, and intelligent assistant models.
              </p>
            </div>
          </div>
        </section>

        {/* Brand Meaning section */}
        <section className="py-20 relative overflow-hidden border-b border-brand-border" id="name-meaning">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center" id="story-grid">
              
              <div className="lg:col-span-6 space-y-6 text-left animate-fade-in" id="story-text-pane">
                <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase block">Form & Metaphor</span>
                <h2 className="font-display font-medium text-text-primary text-2xl sm:text-3xl">
                  Written + Woven = Wriven
                </h2>
                <p className="text-sm sm:text-sm text-text-secondary leading-relaxed font-light">
                  The name <strong className="text-text-primary font-bold">Wriven</strong> represents a convergence of two core digital creative disciplines: being <strong>Written</strong> (the core semantic content draft) and being <strong>Woven</strong> (the delivery format, distributed through global client engines).
                </p>
                <p className="text-sm sm:text-sm text-text-secondary leading-relaxed font-light">
                  For years, legacy headless platforms did exactly one thing: store strings in SQL arrays. If authors needed help with copy, they copy-pasted back and forth into loose translation widgets or separate ChatGPT tabs.
                </p>
                <p className="text-sm sm:text-sm text-text-secondary leading-relaxed font-light font-serif italic text-brand-accent">
                  We built Wriven to secure a single, highly integrated context. By deploying AI assistants right inside structured layouts, authors draft, translate, and verify delivery in milliseconds, all from a beautiful unified experience.
                </p>
              </div>

              <div className="lg:col-span-6 relative" id="story-visual-pane">
                {/* Decorative Canvas representation of weaving */}
                <div className="aspect-[4/3] bg-brand-surface border border-brand-border-button rounded-xl relative overflow-hidden flex items-center justify-center p-8 neo-shadow-lg">
                  <div className="absolute inset-0 bg-[radial-gradient(#1a1a18_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
                  
                  <div className="z-10 bg-brand-surface-soft rounded-xl p-6 border border-brand-border max-w-sm shadow-2xl space-y-4">
                    <div className="flex items-center gap-2 text-brand-accent font-mono text-sm font-bold">
                      <Layers className="w-4 h-4 text-brand-accent animate-pulse" />
                      <span>THE WEAVING ALGORITHM v1.0</span>
                    </div>
                    <blockquote className="text-sm sm:text-sm italic text-text-primary font-light leading-relaxed font-serif">
                      &ldquo;A clean content pipeline isn&apos;t just about delivering raw fields; it&apos;s about making sure your AI assistant feels native, quiet, and beautifully structured.&rdquo;
                    </blockquote>
                    <div className="flex items-center gap-2 pt-2 border-t border-brand-border">
                      <div className="w-1.5 h-1.5 rounded-full bg-status-success" />
                      <span className="text-sm font-mono font-bold uppercase tracking-wider text-status-success">SECURE INSTANCE RUNNING</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Corporate Core Values */}
        <section className="py-20 bg-brand-surface border-b border-brand-border relative" id="values">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h3 className="font-display font-medium text-text-primary text-3xl mb-16">
              Our Core Guiding Principles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8" id="values-grid">
              {values.map((val) => {
                const Icon = val.icon;
                return (
                  <div key={val.title} className="bg-brand-surface border border-brand-border-button p-8 rounded-xl shadow-xl neo-shadow hover:-translate-y-0.5 transition-all text-left" id={`value-card-${val.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="w-10 h-10 rounded-lg bg-brand-surface-soft border border-brand-border flex items-center justify-center text-brand-accent mb-6">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-mono font-bold uppercase tracking-wide text-text-primary mb-3">{val.title}</h4>
                    <p className="text-sm text-text-secondary leading-relaxed font-light">{val.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Team section */}
        <section className="py-20 relative" id="team">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto space-y-4 mb-20">
              <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">Mission Specialists</span>
              <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
                Led by content veterans
              </h2>
              <p className="text-text-secondary text-sm font-light">
                We are a small, focused cohort of builders, developers, and product minds committed to making APIs lightweight and layouts elegant.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto" id="team-grid">
              {team.map((member) => (
                <div key={member.name} className="flex flex-col bg-brand-surface border border-brand-border-button rounded-xl overflow-hidden shadow-2xl neo-shadow-lg transition-all" id={`team-card-${member.name.toLowerCase().split(' ')[0]}`}>
                  <div className="aspect-square relative w-full overflow-hidden bg-brand-surface-soft border-b border-brand-border-button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={member.avatar}
                      alt={member.name}
                      referrerPolicy="no-referrer"
                      className="object-cover w-full h-full grayscale hover:grayscale-0 transition-all duration-350"
                    />
                  </div>
                  <div className="p-6 space-y-3 flex-1 flex flex-col justify-between text-left">
                    <div>
                      <h3 className="font-display font-bold text-sm text-text-primary">{member.name}</h3>
                      <span className="text-sm font-mono font-bold text-brand-accent block uppercase mt-0.5">{member.role}</span>
                      <p className="text-sm text-text-secondary mt-3 leading-relaxed font-light">{member.bio}</p>
                    </div>

                    <div className="pt-4 border-t border-brand-border mt-4 flex items-center gap-1.5 text-sm font-mono font-bold text-brand-accent uppercase">
                      <User className="w-3.5 h-3.5 text-brand-accent" />
                      <span>Verified Core Team Member</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
