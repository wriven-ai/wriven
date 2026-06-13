'use client';

import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';
import WrivenLogo from '../../components/WrivenLogo';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please provide both your email and password.');
      return;
    }

    setErrorMessage('');
    setSuccess(true);
  };

  return (
    <div
      className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative editorial-grid paper-grain"
      id="wriven-login-page"
    >
      {/* Absolute top link to return to main site */}
      <div className="absolute top-6 left-6" id="login-back-to-site">
        <Link
          href="/"
          aria-label="Back to landing page"
          className="inline-flex items-center gap-2 text-xs font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-brand-accent" />
          Back to landing
        </Link>
      </div>

      <div
        className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4 relative z-10 animate-fade-in"
        id="login-header"
      >
        <Link href="/" className="inline-block" id="login-logo-link">
          <WrivenLogo className="justify-center scale-110" />
        </Link>
        <span className="text-xs font-semibold tracking-wider text-brand-secondary uppercase bg-brand-surface border border-brand-border px-3 py-1 id-tag rounded inline-block">
          Secure Login
        </span>
        <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight">
          Sign in to your account
        </h2>
        <p className="text-xs text-text-secondary font-light max-w-xs mx-auto">
          Enter active credentials to configure, map, and synchronize content
          schemas.
        </p>
      </div>

      <div
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0"
        id="login-card-container"
      >
        <div className="bg-brand-surface py-8 px-6 border border-brand-border-button rounded-xl shadow-2xl neo-shadow-lg sm:px-10 space-y-6">
          {success ? (
            <div className="p-5 rounded-lg bg-emerald-500/5 border border-status-success text-xs font-mono text-text-primary text-center space-y-4">
              <strong className="block font-bold">Login Successful</strong>
              <p className="text-text-secondary font-light leading-relaxed">
                Piping content models & pipeline matrices to active client
                viewport dashboard...
              </p>
              <div className="pt-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-white bg-brand-accent border border-brand-border-button hover:bg-brand-accent-hover px-4 py-3 rounded-lg neo-shadow cursor-pointer"
                >
                  Go to Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleLogin}
              className="space-y-4 text-left"
              id="login-credentials-form"
            >
              {errorMessage && (
                <div className="p-3.5 rounded-lg bg-red-500/5 border border-status-error flex items-start gap-2.5 text-xs font-mono text-status-error">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-status-error" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="login-email"
                >
                  Workspace Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
              </div>

              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="login-password"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono">
                <label className="flex items-center gap-2 text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-brand-border bg-brand-surface-soft text-brand-accent focus:ring-brand-accent w-4 h-4 cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>

                <a
                  href="#"
                  className="text-brand-accent hover:underline font-semibold"
                >
                  Forgot password?
                </a>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all text-center cursor-pointer"
                  id="login-submit-btn"
                >
                  Authenticate
                </button>
              </div>
            </form>
          )}

          <div className="relative my-6" id="login-divider">
            <div
              className="absolute inset-0 flex items-center"
              aria-hidden="true"
            >
              <div className="w-full border-t border-brand-border" />
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="bg-brand-surface px-3.5 text-text-muted text-xs uppercase tracking-wider font-semibold">
                Or continue with
              </span>
            </div>
          </div>

          <div id="login-sso-options">
            <button
              onClick={() => setSuccess(true)}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-surface-soft hover:bg-brand-border border border-brand-border-button text-text-primary text-xs font-mono font-bold uppercase tracking-wider py-3.5 px-4 rounded-lg transition-all cursor-pointer"
              id="login-google-sso"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-2.86-4.54-5.84-4.54z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              <span>Google Verification</span>
            </button>
          </div>

          <p
            className="text-center text-xs text-text-secondary pt-2 font-light"
            id="login-signup-link"
          >
            Don&apos;t have a workspace account?{' '}
            <Link
              href="/register"
              className="text-brand-accent font-semibold hover:underline"
            >
              Create your workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};


export default LoginPage;