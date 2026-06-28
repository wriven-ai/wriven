'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiRequestError, authApi, googleAuthUrl } from '@/lib/api';
import { registerSchema, type RegisterValues } from '@/schemas/auth';
import { useAuthStore } from '@/stores/auth';

const RegisterPage = () => {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      workspaceName: '',
      password: '',
      agreeTerms: false,
    },
  });

  // Pre-fill the email when arriving from an invitation link (?email=).
  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get('email');
    if (email) setValue('email', email);
  }, [setValue]);

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    try {
      const result = await authApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName,
      });
      useAuthStore.getState().setAuthResult(result);
      router.push('/dashboard');
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <>
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
          {serverError && (
            <div
              className="p-3 rounded-lg bg-status-error/5 border border-status-error text-[11px] font-mono text-status-error text-center"
              role="alert"
            >
              {serverError}
            </div>
          )}

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
                htmlFor="register-workspace"
              >
                Workspace Name *
              </label>
              <input
                id="register-workspace"
                type="text"
                placeholder="Acme, Inc."
                {...register('workspaceName')}
                className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
              />
              {errors.workspaceName && (
                <p className="mt-1.5 text-[10px] font-mono text-status-error">
                  {errors.workspaceName.message}
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
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  {...register('password')}
                  className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 pr-10 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
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
                  I agree with representation and Wriven Terms of Service. Check
                  to grant workspace consent.
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
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all text-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                id="register-submit-btn"
              >
                {isSubmitting ? 'Creating workspace…' : 'Create workspace free'}
              </button>
            </div>
          </form>

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
            <a
              href={googleAuthUrl}
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
              <span>Continue with Google</span>
            </a>
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
    </>
  );
};

export default RegisterPage;
