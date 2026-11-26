// Test users and order builders. Credentials are demo values for the mock app only.

export const USERS = {
  trader1: { username: 'trader1', password: 'password123' },
  trader2: { username: 'trader2', password: 'password123' },
} as const;

export type Side = 'BUY' | 'SELL';
export type Instrument = 'GBPUSD' | 'EURUSD' | 'USDJPY' | 'UK10Y';

export interface NewOrder {
  instrument: Instrument;
  side: Side;
  quantity: number;
  price: number;
}

export interface Order extends NewOrder {
  id: number;
  owner: string;
  status: 'NEW' | 'AMENDED' | 'CANCELLED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A valid order with sensible defaults; override only what the test cares about. */
export function buildOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return { instrument: 'GBPUSD', side: 'BUY', quantity: 1_000_000, price: 1.265, ...overrides };
}

/** A unique key per call, used to test idempotent retries. */
export function idempotencyKey(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
