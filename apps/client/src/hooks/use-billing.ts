'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import type {
  CreateCheckoutInput,
  CreatePortalInput,
  CheckoutSessionView,
  PortalSessionView,
  SubscriptionView,
  SwapPlanInput,
} from '@/lib/types';

/** Cache keys for billing server state. */
export const BILLING_KEYS = {
  plans: ['billing', 'plans'] as const,
  subscription: ['billing', 'subscription'] as const,
  invoices: ['billing', 'invoices'] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: BILLING_KEYS.plans,
    queryFn: billingApi.listPlans,
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: BILLING_KEYS.subscription,
    queryFn: billingApi.getSubscription,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: BILLING_KEYS.invoices,
    queryFn: billingApi.listInvoices,
  });
}

/**
 * Start a hosted Stripe Checkout. On success the browser leaves for Stripe's
 * page (window.location). The mutation error is surfaced so callers can branch
 * on SUBSCRIPTION_EXISTS (→ show the Portal CTA instead).
 */
export function useCheckout() {
  return useMutation<CheckoutSessionView, Error, CreateCheckoutInput>({
    mutationFn: billingApi.createCheckout,
    onSuccess: (session) => {
      if (session.url) window.location.href = session.url;
    },
  });
}

/** Open the hosted Stripe Billing Portal — browser leaves for Stripe's page. */
export function usePortal() {
  return useMutation<PortalSessionView, Error, CreatePortalInput | undefined>({
    mutationFn: billingApi.createPortal,
    onSuccess: (session) => {
      if (session.url) window.location.href = session.url;
    },
  });
}

/** Swap an existing subscription's plan/cycle (or cancel to free) via the
 *  direct proration endpoint. Stays in-app (no redirect). The webhook is still
 *  the source of truth, so we invalidate the cache — the flip may land a moment
 *  later. */
export function useSwapPlan() {
  const qc = useQueryClient();
  return useMutation<SubscriptionView, Error, SwapPlanInput>({
    mutationFn: billingApi.swapPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BILLING_KEYS.subscription });
      qc.invalidateQueries({ queryKey: BILLING_KEYS.invoices });
    },
  });
}

/** Invalidate the subscription + invoices — call after the checkout success
 *  redirect (the webhook is the real source of truth; the flip may land a moment
 *  later, and a new invoice appears once payment is captured). */
export function useRefreshSubscription() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: BILLING_KEYS.subscription });
    qc.invalidateQueries({ queryKey: BILLING_KEYS.invoices });
  };
}
