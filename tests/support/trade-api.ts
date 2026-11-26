import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { NewOrder, Order } from './test-data';

/**
 * Thin client over the Trade Blotter REST API.
 * Used by the API tests directly, and by UI tests to set up data fast
 * (creating an order through the API is quicker and more reliable than clicking).
 */
export class TradeApi {
  constructor(private readonly request: APIRequestContext) {}

  createOrderRaw(order: Partial<NewOrder> | Record<string, unknown>, opts: { idempotencyKey?: string } = {}): Promise<APIResponse> {
    return this.request.post('/api/orders', {
      data: order,
      headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {},
    });
  }

  async createOrder(order: NewOrder): Promise<Order> {
    const res = await this.createOrderRaw(order);
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
  }

  getOrderRaw(id: number): Promise<APIResponse> {
    return this.request.get(`/api/orders/${id}`);
  }

  async getOrder(id: number): Promise<Order> {
    const res = await this.getOrderRaw(id);
    expect(res.status()).toBe(200);
    return res.json();
  }

  async listOrders(): Promise<Order[]> {
    const res = await this.request.get('/api/orders');
    expect(res.status()).toBe(200);
    return res.json();
  }

  amendOrderRaw(id: number, body: { quantity?: number; price?: number; version: number }): Promise<APIResponse> {
    return this.request.patch(`/api/orders/${id}`, { data: body });
  }

  cancelOrderRaw(id: number): Promise<APIResponse> {
    return this.request.post(`/api/orders/${id}/cancel`);
  }
}
