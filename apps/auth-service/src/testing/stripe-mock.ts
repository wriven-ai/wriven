import type Stripe from 'stripe';

/** jest.fn surface covering every Stripe SDK call auth-service makes. */
export interface StripeMock {
  webhooks: { constructEvent: jest.Mock };
  subscriptions: { retrieve: jest.Mock; update: jest.Mock };
  subscriptionSchedules: { release: jest.Mock; create: jest.Mock };
  checkout: { sessions: { create: jest.Mock } };
  billingPortal: { sessions: { create: jest.Mock } };
  invoices: { list: jest.Mock };
  customers: { create: jest.Mock };
  products: { create: jest.Mock; update: jest.Mock };
  prices: { create: jest.Mock; update: jest.Mock };
}

export function createStripeMock(): StripeMock {
  return {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { retrieve: jest.fn(), update: jest.fn() },
    subscriptionSchedules: { release: jest.fn(), create: jest.fn() },
    checkout: {
      sessions: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'cs_mock', url: 'https://checkout.example/url' }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest
          .fn()
          .mockResolvedValue({ url: 'https://billing.example/session' }),
      },
    },
    invoices: { list: jest.fn().mockResolvedValue({ data: [] }) },
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_mock' }) },
    products: {
      create: jest.fn().mockResolvedValue({ id: 'prod_mock' }),
      update: jest.fn().mockResolvedValue({ id: 'prod_mock' }),
    },
    prices: {
      create: jest.fn().mockResolvedValue({ id: 'price_mock' }),
      update: jest.fn().mockResolvedValue({ id: 'price_mock' }),
    },
  };
}

/** Cast for the service constructor — the mock is structurally a Stripe client. */
export function asStripe(mock: StripeMock): Stripe {
  return mock as unknown as Stripe;
}
