'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import WrivenLogo from '../../components/WrivenLogo';
import { registerSchema, type RegisterValues } from '../../schemas/auth';

const RegisterPage = () => {
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      orgName: '',
      password: '',
      agreeTerms: false,
    },
  });

  const orgName = watch('orgName');

  const onSubmit = () => {
    setSuccess(true);
  };

  return (
    <div
      className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative editorial-grid paper-grain"
      id="wriven-register-page"
    >
      {/* Absolute top link to return to main site */}
      <div className="absolute top-6 left-6" id="register-back-to-site">
        <Link
          href="/"
          aria-label="Back to landing page"
          className="inline-flex items-center gap-2 text-xs font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-brand-accent" />
          Back to landing
        </Link>
      </div>

      <div className="absolute top-6 right-6" id="register-brand-logo">
        <Link href="/" className="inline-block" id="register-logo-link">
          <WrivenLogo className="justify-end scale-110" />
        </Link>
      </div>

      <div
        className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4 relative z-10"
        id="register-header"
      >
        <span className="text-xs font-semibold tracking-wider text-brand-secondary uppercase bg-brand-surface border border-brand-border px-3 py-1 rounded inline-block">
          Create Workspace
        </span>
        <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight">
          Create your free workspace
        </h2>
      </div>

      <div
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0"
        id="register-card-container"
      >
        <div className="bg-brand-surface py-8 px-6 border border-brand-border-button rounded-xl shadow-2xl neo-shadow-lg sm:px-10 space-y-6">
          {success ? (
            <div className="p-5 rounded-lg bg-emerald-500/5 border border-status-success text-xs font-mono text-text-primary text-center space-y-4">
              <CheckCircle className="w-8 h-8 mx-auto text-status-success" />
              <strong className="block font-bold">
                Workspace Created Successfully
              </strong>
              <p className="text-text-secondary font-light leading-relaxed">
                We have registered the tenant space for{' '}
                <strong>{orgName}</strong>. You are ready to configure content
                models and fetch secure JSON blocks.
              </p>
              <div className="pt-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-white bg-brand-accent hover:bg-brand-accent-hover border border-brand-border-button px-4 py-3 rounded-lg neo-shadow cursor-pointer"
                >
                  Go to Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4 text-left"
              id="register-credentials-form"
              noValidate
            >
              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="register-name"
                >
                  Full Name *
                </label>
                <input
                  id="register-name"
                  type="text"
                  placeholder="Sophia Wright"
                  {...register('name')}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
                {errors.name && (
                  <p className="mt-1.5 text-[10px] font-mono text-status-error">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="register-email"
                >
                  Work Email *
                </label>
                <input
                  id="register-email"
                  type="email"
                  placeholder="sophia@wriven.io"
                  {...register('email')}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
                {errors.email && (
                  <p className="mt-1.5 text-[10px] font-mono text-status-error">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="register-org"
                >
                  Organization Name *
                </label>
                <input
                  id="register-org"
                  type="text"
                  placeholder="Acme, Inc."
                  {...register('orgName')}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
                {errors.orgName && (
                  <p className="mt-1.5 text-[10px] font-mono text-status-error">
                    {errors.orgName.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                  htmlFor="register-password"
                >
                  Password (min 8 characters) *
                </label>
                <input
                  id="register-password"
                  type="password"
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  {...register('password')}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
                {errors.password && (
                  <p className="mt-1.5 text-[10px] font-mono text-status-error">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 text-[11px] font-mono text-text-secondary">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('agreeTerms')}
                    className="rounded border-brand-border bg-brand-surface-soft text-brand-accent focus:ring-brand-accent w-4 h-4 cursor-pointer mt-0.5"
                  />
                  <span>
                    I agree with representation and Wriven Terms of Service.
                    Check to grant workspace consent.
                  </span>
                </label>
                {errors.agreeTerms && (
                  <p className="text-[10px] font-mono text-status-error">
                    {errors.agreeTerms.message}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all text-center cursor-pointer"
                  id="register-submit-btn"
                >
                  Create workspace free
                </button>
              </div>
            </form>
          )}

          <div className="relative my-6" id="register-divider">
            <div
              className="absolute inset-0 flex items-center"
              aria-hidden="true"
            >
              <div className="w-full border-t border-brand-border" />
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="bg-brand-surface px-3.5 text-text-muted text-xs uppercase tracking-wider font-semibold">
                Or join through
              </span>
            </div>
          </div>

          <div id="register-sso-options">
            <button
              onClick={() => {
                setValue('orgName', 'My Team Workspace');
                setSuccess(true);
              }}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-surface-soft hover:bg-brand-border border border-brand-border-button text-text-primary text-xs font-mono font-bold uppercase tracking-wider py-3.5 px-4 rounded-lg transition-all cursor-pointer"
              id="register-google-sso"
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
              <span>Google Signup</span>
            </button>
          </div>

          <p
            className="text-center text-xs text-text-secondary pt-2 font-light"
            id="register-login-link"
          >
            Already have a workspace account?{' '}
            <Link
              href="/login"
              className="text-brand-accent font-semibold hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
