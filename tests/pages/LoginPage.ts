import { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly message: Locator;

  constructor(private readonly page: Page) {
    // User-facing locators (label and role) rather than CSS, so tests survive layout changes.
    this.username = page.getByLabel('Username');
    this.password = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.message = page.locator('#login-view').getByRole('alert');
  }

  async goto() {
    await this.page.goto('/');
  }

  async signIn(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.signInButton.click();
  }
}
