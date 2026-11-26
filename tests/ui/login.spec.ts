import { test, expect } from '../support/fixtures';
import { USERS } from '../support/test-data';

test.describe('Sign in', () => {
  // These tests need a signed-out browser, so they opt out of the saved session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('trader can sign in and sees the blotter @smoke', async ({ loginPage, blotter }) => {
    await loginPage.goto();
    await loginPage.signIn(USERS.trader1.username, USERS.trader1.password);

    await expect(blotter.heading).toBeVisible();
    await expect(blotter.currentUser).toHaveText('trader1');
  });

  test('wrong password is rejected with a clear message', async ({ loginPage, blotter }) => {
    await loginPage.goto();
    await loginPage.signIn(USERS.trader1.username, 'not-the-password');

    await expect(loginPage.message).toHaveText('Invalid username or password');
    await expect(blotter.heading).toBeHidden();
  });
});

test.describe('Session', () => {
  test('saved session survives a page reload', async ({ page, blotter }) => {
    await blotter.goto();
    await expect(blotter.heading).toBeVisible();
    await page.reload();
    await expect(blotter.currentUser).toHaveText('trader1');
  });

  test('signing out returns to the sign-in screen', async ({ blotter, loginPage }) => {
    await blotter.goto();
    await blotter.signOutButton.click();
    await expect(loginPage.signInButton).toBeVisible();
  });
});
