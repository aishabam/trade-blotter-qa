import { test, expect } from '../support/fixtures';
import { buildOrder, idempotencyKey } from '../support/test-data';

test.describe('POST /api/orders', () => {
  test('creates an order and returns it with status NEW @smoke', async ({ api }) => {
    const res = await api.createOrderRaw(buildOrder({ instrument: 'USDJPY', side: 'SELL', quantity: 5_000_000, price: 154.12 }));

    expect(res.status()).toBe(201);
    const order = await res.json();
    expect(order).toMatchObject({
      instrument: 'USDJPY',
      side: 'SELL',
      quantity: 5_000_000,
      price: 154.12,
      status: 'NEW',
      version: 1,
      owner: 'trader1',
    });
    expect(order.id).toEqual(expect.any(Number));
    expect(Date.parse(order.createdAt)).not.toBeNaN();
  });

  // Data-driven negative tests: one table of bad inputs, one test generated per row.
  const invalidOrders = [
    { name: 'unknown instrument', overrides: { instrument: 'BTCUSD' }, error: 'instrument must be one of' },
    { name: 'invalid side', overrides: { side: 'HOLD' }, error: 'side must be BUY or SELL' },
    { name: 'zero quantity', overrides: { quantity: 0 }, error: 'quantity must be a positive whole number' },
    { name: 'negative quantity', overrides: { quantity: -100 }, error: 'quantity must be a positive whole number' },
    { name: 'fractional quantity', overrides: { quantity: 10.5 }, error: 'quantity must be a positive whole number' },
    { name: 'quantity over the limit', overrides: { quantity: 100_000_001 }, error: 'quantity exceeds the 100,000,000 limit' },
    { name: 'zero price', overrides: { price: 0 }, error: 'price must be greater than 0' },
    { name: 'price as a string', overrides: { price: '1.25' }, error: 'price must be greater than 0' },
    { name: 'price with 5 decimal places', overrides: { price: 1.26501 }, error: 'price allows at most 4 decimal places' },
  ];

  for (const { name, overrides, error } of invalidOrders) {
    test(`rejects ${name} with 400`, async ({ api }) => {
      const res = await api.createOrderRaw({ ...buildOrder(), ...overrides });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.errors.join(' ')).toContain(error);
    });
  }

  test('accepts the boundary values: quantity 1, quantity at the limit, 4 decimal places', async ({ api }) => {
    for (const order of [
      buildOrder({ quantity: 1 }),
      buildOrder({ quantity: 100_000_000 }),
      buildOrder({ price: 1.2655 }),
    ]) {
      const res = await api.createOrderRaw(order);
      expect(res.status(), JSON.stringify(order)).toBe(201);
    }
  });

  test('rejects requests without a valid token with 401', async ({ anonymousApi }) => {
    const res = await anonymousApi.createOrderRaw(buildOrder());
    expect(res.status()).toBe(401);
  });
});

test.describe('Idempotency: retried requests must not create duplicate orders', () => {
  test('the same Idempotency-Key returns the original order', async ({ api }) => {
    const key = idempotencyKey();
    const order = buildOrder({ quantity: 777_001 });

    const first = await api.createOrderRaw(order, { idempotencyKey: key });
    const retry = await api.createOrderRaw(order, { idempotencyKey: key });

    expect(first.status()).toBe(201);
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe((await first.json()).id);
  });

  test('five simultaneous retries with one key create exactly one order', async ({ api }) => {
    const key = idempotencyKey();
    // A unique quantity lets us find "our" orders even with other tests running in parallel.
    const quantity = 700_000 + Math.floor(Math.random() * 99_999);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api.createOrderRaw(buildOrder({ quantity }), { idempotencyKey: key })),
    );

    const ids = new Set(await Promise.all(responses.map(async (r) => (await r.json()).id)));
    expect(ids.size).toBe(1);
    const saved = (await api.listOrders()).filter((o) => o.quantity === quantity);
    expect(saved).toHaveLength(1);
  });

  test('without a key, two identical requests are two separate orders', async ({ api }) => {
    const a = await api.createOrder(buildOrder());
    const b = await api.createOrder(buildOrder());
    expect(a.id).not.toBe(b.id);
  });
});

test.describe('Amend and cancel', () => {
  test('amending price and quantity bumps the version and sets AMENDED', async ({ api }) => {
    const order = await api.createOrder(buildOrder());

    const res = await api.amendOrderRaw(order.id, { price: 1.2701, quantity: 2_000_000, version: 1 });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ price: 1.2701, quantity: 2_000_000, status: 'AMENDED', version: 2 });
  });

  test('an amend with a stale version is rejected with 409 and changes nothing', async ({ api }) => {
    const order = await api.createOrder(buildOrder({ price: 1.265 }));
    await api.amendOrderRaw(order.id, { price: 1.27, version: 1 });

    const stale = await api.amendOrderRaw(order.id, { price: 1.3, version: 1 });

    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({ currentVersion: 2 });
    expect((await api.getOrder(order.id)).price).toBe(1.27);
  });

  test('two simultaneous amends on the same version: exactly one wins', async ({ api }) => {
    const order = await api.createOrder(buildOrder());

    const [a, b] = await Promise.all([
      api.amendOrderRaw(order.id, { price: 1.28, version: 1 }),
      api.amendOrderRaw(order.id, { price: 1.29, version: 1 }),
    ]);

    expect([a.status(), b.status()].sort()).toEqual([200, 409]);
    const final = await api.getOrder(order.id);
    expect(final.version).toBe(2);
    expect([1.28, 1.29]).toContain(final.price);
  });

  test('a cancelled order cannot be cancelled again or amended', async ({ api }) => {
    const order = await api.createOrder(buildOrder());
    const cancel = await api.cancelOrderRaw(order.id);
    expect(cancel.status()).toBe(200);
    expect((await cancel.json()).status).toBe('CANCELLED');

    expect((await api.cancelOrderRaw(order.id)).status()).toBe(409);
    expect((await api.amendOrderRaw(order.id, { price: 1.3, version: 2 })).status()).toBe(409);
  });
});

test.describe('Access control', () => {
  test("a trader cannot see another trader's order", async ({ api, apiAs }) => {
    const order = await api.createOrder(buildOrder());
    const trader2 = await apiAs('trader2');

    expect((await trader2.getOrderRaw(order.id)).status()).toBe(404);
    expect((await trader2.listOrders()).map((o) => o.id)).not.toContain(order.id);
  });
});
