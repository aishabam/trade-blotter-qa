import { test as base, expect, request as playwrightRequest } from '@playwright/test';
import { BlotterPage } from '../pages/BlotterPage';
import { LoginPage } from '../pages/LoginPage';
import { TradeApi } from './trade-api';
import { USERS } from './test-data';

type User = keyof typeof USERS;

type Fixtures = {
  /** API client signed in as trader1. */
  api: TradeApi;
  /** Builds an API client signed in as any test user. */
  apiAs: (user: User) => Promise<TradeApi>;
  /** API client with no token, for auth tests. */
  anonymousApi: TradeApi;
  loginPage: LoginPage;
  blotter: BlotterPage;
};

/**
 * Custom fixtures: each test asks for what it needs (`api`, `blotter`...) and
 * Playwright builds and tears it down. Keeps setup out of the tests themselves.
 */
export const test = base.extend<Fixtures>({
  apiAs: async ({ baseURL }, use) => {
    const contexts: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = [];
    await use(async (user) => {
      const anon = await playwrightRequest.newContext({ baseURL });
      const res = await anon.post('/api/login', { data: USERS[user] });
      expect(res.ok(), `login as ${user}`).toBeTruthy();
      const { token } = await res.json();
      await anon.dispose();

      const ctx = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      });
      contexts.push(ctx);
      return new TradeApi(ctx);
    });
    for (const ctx of contexts) await ctx.dispose();
  },

  api: async ({ apiAs }, use) => {
    await use(await apiAs('trader1'));
  },

  anonymousApi: async ({ baseURL }, use) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    await use(new TradeApi(ctx));
    await ctx.dispose();
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  blotter: async ({ page }, use) => {
    await use(new BlotterPage(page));
  },
});

export { expect };
