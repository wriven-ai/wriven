'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { Mail, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: 'Sales Inquiry',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setSubmitResult('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitResult('idle');

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitResult('success');
      setFormData({
        name: '',
        email: '',
        subject: 'Sales Inquiry',
        message: ''
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain" id="wriven-contact-page">
      <Header />

      <main className="flex-grow py-16 lg:py-24 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch" id="contact-layout-grid">
            {/* Left Column Information */}
            <div className="lg:col-span-5 flex flex-col justify-between" id="contact-info-pane">
              <div className="space-y-6 text-left">
                <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
                  Connect with Wriven
                </span>
                <h1 className="font-display font-medium text-text-primary text-4xl sm:text-5xl" id="contact-headline">
                  Let&apos;s connect
                </h1>
                <p className="text-text-secondary text-sm leading-relaxed font-light">
                  Have inquiries regarding enterprise high-volume API nodes, uptime SLAs, or want to explore migrating complex legacy databases into Wriven structures? Request our solutions engineers.
                </p>

                <div className="space-y-4 pt-6" id="contact-details-list">
                  <div className="flex items-center gap-4 p-4 bg-brand-surface border border-brand-border-button rounded-xl shadow-xl neo-shadow">
                    <div className="w-10 h-10 rounded-lg bg-brand-surface-soft border border-brand-border flex items-center justify-center text-brand-accent">
                      <Mail className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <span className="block text-sm font-mono text-text-muted uppercase tracking-wider">Email Dispatch</span>
                      <a href="mailto:support@wriven.io" className="text-sm font-mono font-bold text-text-primary hover:text-brand-accent transition-colors">
                        support@wriven.io
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-brand-surface border border-brand-border-button rounded-xl shadow-xl neo-shadow">
                    <div className="w-10 h-10 rounded-lg bg-brand-surface-soft border border-brand-border flex items-center justify-center text-brand-accent">
                      <Clock className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <span className="block text-sm font-mono text-text-muted uppercase tracking-wider">RESPONSE SLA TIME</span>
                      <span className="text-sm font-mono font-bold text-text-primary">
                        Under 2 hours for Pro & Enterprise
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 text-sm text-text-muted font-light text-left" id="contact-disclosure">
                Wriven is fully GDPR/CCPA compliant. All content queries are delivered over authenticated layers.
              </div>
            </div>

            {/* Right Column Form */}
            <div className="lg:col-span-7 bg-brand-surface border border-brand-border-button rounded-xl p-6 sm:p-10 shadow-2xl neo-shadow-lg" id="contact-form-pane">
              <form onSubmit={handleSubmit} className="space-y-6 text-left" id="wriven-contact-form">
                <h3 className="font-display font-medium text-lg text-text-primary">Send us a secure message</h3>
                
                {submitResult === 'success' && (
                  <div className="p-4 rounded-lg bg-emerald-500/5 border border-status-success flex items-start gap-3 text-text-primary text-sm font-mono" id="contact-success-banner">
                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-status-success" />
                    <div>
                      <strong className="block font-bold">{"// INQUIRY DISPATCHED SUCCESSFULLY //"}</strong>
                      <span className="text-sm text-text-secondary leading-relaxed">An operations engineer is reviewing your specs and will contact you shortly.</span>
                    </div>
                  </div>
                )}

                {submitResult === 'error' && (
                  <div className="p-4 rounded-lg bg-red-500/5 border border-status-error flex items-start gap-3 text-status-error text-sm font-mono" id="contact-error-banner">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-status-error" />
                    <div>
                      <strong className="block font-bold">{"// REQUIRED FIELDS DEVIATED //"}</strong>
                      <span className="text-sm text-text-secondary leading-relaxed leading-relaxed">Name, Email, and Message must be populated to deliver secure packets.</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="contact-name">Your Full Name *</label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      placeholder="Sophia Wright"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-4 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="contact-email">Email Address *</label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      placeholder="sophia@wriven.io"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-4 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="contact-subject">Inquiry Channel</label>
                  <select
                    id="contact-subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-4 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary font-bold [&>option]:bg-brand-surface [&>option]:text-text-primary"
                  >
                    <option value="Sales Inquiry">Sales / Custom Quota</option>
                    <option value="Technical Support">Technical Support Desk</option>
                    <option value="Community Sponsorship">Community Sponsorships</option>
                    <option value="Other">Other Issues</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="contact-message">How can Wriven help? *</label>
                  <textarea
                    id="contact-message"
                    required
                    rows={5}
                    placeholder="We are looking to migrate active articles..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border p-4 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary leading-relaxed"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover disabled:bg-gray-400 text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all text-center cursor-pointer"
                    id="contact-submit-btn"
                  >
                    {isSubmitting ? 'ESTABLISHING HANDSHAKE...' : 'SUBMIT SECURE DISPATCH'}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
