import { Locator, Page } from '@playwright/test';
import { NewOrder } from '../support/test-data';

/** The order ticket plus the orders table. */
export class BlotterPage {
  readonly heading: Locator;
  readonly currentUser: Locator;
  readonly signOutButton: Locator;
  readonly message: Locator;
  readonly ordersTable: Locator;
  readonly amendDialog: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Blotter', exact: true }); // exact: the sign-in page says "Trade Blotter"
    this.currentUser = page.getByTestId('current-user');
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.message = page.locator('#order-message');
    this.ordersTable = page.getByRole('table', { name: 'Orders' });
    this.amendDialog = page.getByRole('dialog', { name: 'Amend order' });
  }

  async goto() {
    await this.page.goto('/');
  }

  async placeOrder(order: NewOrder) {
    await this.page.getByLabel('Instrument').selectOption(order.instrument);
    await this.page.getByLabel('Side').selectOption(order.side);
    await this.page.getByLabel('Quantity', { exact: true }).fill(String(order.quantity));
    await this.page.getByLabel('Price', { exact: true }).fill(String(order.price));
    await this.page.getByRole('button', { name: 'Place order' }).click();
  }

  /** One row of the orders table, found by order ID (stable even when other tests add orders). */
  row(orderId: number) {
    const row = this.page.getByTestId(`order-row-${orderId}`);
    return {
      root: row,
      status: row.getByTestId('order-status'),
      quantity: row.getByTestId('order-quantity'),
      price: row.getByTestId('order-price'),
      amendButton: row.getByRole('button', { name: 'Amend' }),
      cancelButton: row.getByRole('button', { name: 'Cancel' }),
    };
  }

  async amend(orderId: number, changes: { quantity?: number; price?: number }) {
    await this.row(orderId).amendButton.click();
    if (changes.quantity !== undefined) await this.amendDialog.getByLabel('New quantity').fill(String(changes.quantity));
    if (changes.price !== undefined) await this.amendDialog.getByLabel('New price').fill(String(changes.price));
    await this.amendDialog.getByRole('button', { name: 'Confirm amend' }).click();
  }

  async cancel(orderId: number) {
    await this.row(orderId).cancelButton.click();
  }
}
