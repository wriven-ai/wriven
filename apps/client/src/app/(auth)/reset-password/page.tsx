'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiRequestError, authApi } from '@/lib/api';
import { resetPasswordSchema, type ResetPasswordValues } from '@/schemas/auth';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="absolute top-6 left-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-brand-accent" />
          Back to sign in
        </Link>
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4 relative z-10">
        <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase bg-brand-surface border border-brand-border px-3 py-1 rounded inline-block">
          Password Recovery
        </span>
        <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight">
          Set a new password
        </h2>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-brand-surface py-8 px-6 border border-brand-border-button rounded-xl shadow-2xl neo-shadow-lg sm:px-10 space-y-6">
          {children}
        </div>
      </div>
    </>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm font-mono text-status-error">
          This reset link is invalid or incomplete.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm text-brand-accent font-semibold hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="p-5 rounded-lg bg-emerald-500/5 border border-status-success text-sm font-mono text-text-primary text-center space-y-3">
        <CheckCircle className="w-8 h-8 mx-auto text-status-success" />
        <strong className="block font-bold">Password updated</strong>
        <p className="text-text-secondary font-light leading-relaxed">
          You&apos;ve been signed out everywhere. Sign in with your new password.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm uppercase tracking-wider font-bold text-white bg-brand-accent hover:bg-brand-accent-hover border border-brand-border-button px-4 py-3 rounded-lg neo-shadow"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const onSubmit = async (values: ResetPasswordValues) => {
    setServerError(null);
    try {
      await authApi.resetPassword(token, values.newPassword);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
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
      {serverError && (
        <div
          className="p-3 rounded-lg bg-status-error/5 border border-status-error text-sm font-mono text-status-error text-center"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 text-left"
        noValidate
      >
        <div>
          <label
            className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
            htmlFor="reset-password"
          >
            New Password (min 8 characters)
          </label>
          <input
            id="reset-password"
            type="password"
            placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
            {...register('newPassword')}
            className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
          />
          {errors.newPassword && (
            <p className="mt-1.5 text-sm font-mono text-status-error">
              {errors.newPassword.message}
            </p>
          )}
        </div>
        <div>
          <label
            className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2"
            htmlFor="reset-confirm"
          >
            Confirm Password
          </label>
          <input
            id="reset-confirm"
            type="password"
            placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
            {...register('confirmPassword')}
            className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-sm font-mono text-status-error">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-4 rounded-lg neo-shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Shell>
      <Suspense
        fallback={
          <p className="text-center text-sm font-mono text-text-muted">
            Loading…
          </p>
        }
      >
        <ResetForm />
      </Suspense>
    </Shell>
  );
}
