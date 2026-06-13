'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiRequestError, authApi } from '@/lib/api';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/schemas/auth';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setServerError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSent(true);
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
      <div className="absolute top-6 left-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-brand-accent" />
          Back to sign in
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4 relative z-10">
        <span className="text-xs font-semibold tracking-wider text-brand-secondary uppercase bg-brand-surface border border-brand-border px-3 py-1 rounded inline-block">
          Password Recovery
        </span>
        <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight">
          Reset your password
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-brand-surface py-8 px-6 border border-brand-border-button rounded-xl shadow-2xl neo-shadow-lg sm:px-10 space-y-6">
          {sent ? (
            <div className="p-5 rounded-lg bg-emerald-500/5 border border-status-success text-xs font-mono text-text-primary text-center space-y-3">
              <MailCheck className="w-8 h-8 mx-auto text-status-success" />
              <strong className="block font-bold">Check your inbox</strong>
              <p className="text-text-secondary font-light leading-relaxed">
                If an account exists for{' '}
                <strong>{getValues('email')}</strong>, we&apos;ve sent a link to
                reset your password. The link expires in 1 hour.
              </p>
            </div>
          ) : (
            <>
              {serverError && (
                <div
                  className="p-3 rounded-lg bg-status-error/5 border border-status-error text-[11px] font-mono text-status-error text-center"
                  role="alert"
                >
                  {serverError}
                </div>
              )}
              <p className="text-xs text-text-secondary font-light leading-relaxed">
                Enter your account email and we&apos;ll send you a link to reset
                your password.
              </p>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4 text-left"
                noValidate
              >
                <div>
                  <label
                    className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
                    htmlFor="forgot-email"
                  >
                    Account Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="name@company.com"
                    {...register('email')}
                    className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
                  />
                  {errors.email && (
                    <p className="mt-1.5 text-[10px] font-mono text-status-error">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-xs text-text-secondary pt-2 font-light">
            Remembered it?{' '}
            <Link
              href="/login"
              className="text-brand-accent font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
