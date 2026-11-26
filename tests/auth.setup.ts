import { test as setup, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { USERS } from './support/test-data';

const authFile = 'playwright/.auth/trader1.json';

// Signs in once through the real UI and saves the session (localStorage token) to disk.
// Every UI test then starts already signed in, instead of logging in again each time.
setup('sign in as trader1', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(USERS.trader1.username, USERS.trader1.password);
  await expect(page.getByRole('heading', { name: 'Blotter', exact: true })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
