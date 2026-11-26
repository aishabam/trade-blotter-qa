import { test, expect } from '../support/fixtures';
import { buildOrder } from '../support/test-data';

test.describe('Order lifecycle in the blotter', () => {
  test('placing an order shows it in the blotter as NEW @smoke', async ({ blotter, api }) => {
    await blotter.goto();
    await blotter.placeOrder(buildOrder({ instrument: 'EURUSD', side: 'SELL', quantity: 250_000, price: 1.0842 }));

    // Read the new ID from the confirmation, then check the UI and the back end agree.
    await expect(blotter.message).toHaveText(/^Order \d+ placed$/);
    const id = Number((await blotter.message.textContent())!.match(/\d+/)![0]);

    const row = blotter.row(id);
    await expect(row.status).toHaveText('NEW');
    await expect(row.quantity).toHaveText('250,000');
    await expect(row.price).toHaveText('1.0842');

    const saved = await api.getOrder(id);
    expect(saved).toMatchObject({ instrument: 'EURUSD', side: 'SELL', quantity: 250_000, price: 1.0842 });
  });

  test('an order with zero quantity is rejected and not added', async ({ blotter, api }) => {
    await blotter.goto();
    await blotter.placeOrder(buildOrder({ quantity: 0 }));

    await expect(blotter.message).toHaveText('quantity must be a positive whole number');
    // Other tests add orders in parallel, so don't compare total counts:
    // just check nothing with quantity 0 was saved.
    const zeroQty = (await api.listOrders()).filter((o) => o.quantity === 0);
    expect(zeroQty).toHaveLength(0);
  });

  test('amending the price updates the row and marks it AMENDED', async ({ blotter, api }) => {
    // Set up through the API: faster and more reliable than clicking through the ticket.
    const order = await api.createOrder(buildOrder({ price: 1.265 }));

    await blotter.goto();
    await blotter.amend(order.id, { price: 1.2655 });

    const row = blotter.row(order.id);
    await expect(row.status).toHaveText('AMENDED');
    await expect(row.price).toHaveText('1.2655');
    expect((await api.getOrder(order.id)).version).toBe(2);
  });

  test('cancelling an order removes its actions', async ({ blotter, api }) => {
    const order = await api.createOrder(buildOrder());

    await blotter.goto();
    await blotter.cancel(order.id);

    const row = blotter.row(order.id);
    await expect(row.status).toHaveText('CANCELLED');
    await expect(row.amendButton).toHaveCount(0);
    await expect(row.cancelButton).toHaveCount(0);
  });

  test('a stale amend is blocked if the order changed in the meantime', async ({ blotter, api }) => {
    const order = await api.createOrder(buildOrder({ price: 1.265 }));
    await blotter.goto();

    // The trader opens the amend dialog...
    await blotter.row(order.id).amendButton.click();
    await expect(blotter.amendDialog).toBeVisible();

    // ...but someone else amends the same order first.
    const res = await api.amendOrderRaw(order.id, { price: 1.27, version: 1 });
    expect(res.status()).toBe(200);

    // The trader's change must not silently overwrite theirs.
    await blotter.amendDialog.getByLabel('New price').fill('1.2655');
    await blotter.amendDialog.getByRole('button', { name: 'Confirm amend' }).click();
    await expect(blotter.amendDialog.getByRole('alert')).toHaveText('Order has changed since you loaded it');
    expect((await api.getOrder(order.id)).price).toBe(1.27);
  });
});
