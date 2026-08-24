import type Stripe from 'stripe';

/** jest.fn object covering every Stripe SDK surface auth-service touches. */
export function createStripeMock() {
  return {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { retrieve: jest.fn(), update: jest.fn() },
    subscriptionSchedules: { release: jest.fn(), create: jest.fn() },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_mock', url: 'https://checkout.example/url' }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: 'https://billing.example/session' }),
      },
    },
    invoices: { list: jest.fn().mockResolvedValue({ data: [] }) },
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_mock' }) },
    products: { create: jest.fn().mockResolvedValue({ id: 'prod_mock' }) },
    prices: { create: jest.fn().mockResolvedValue({ id: 'price_mock' }) },
  } as unknown as Stripe;
}
