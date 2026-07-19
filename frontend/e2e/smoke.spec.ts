import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('DokerFace Frontend E2E Flow', () => {
  test('authentication flow, visual snapshots, and accessibility compliance', async ({ page }) => {
    let loggedIn = false;

    // Intercept auth current-user session checks
    await page.route('**/api/v1/me', async (route) => {
      if (loggedIn) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            account_id: 1,
            login_name: 'alice',
            role: 'player',
            status: 'active',
            display_name: 'Alice Player',
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Not authenticated' }),
        });
      }
    });

    // Intercept login requests
    await page.route('**/api/v1/auth/login', async (route) => {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account_id: 1,
          login_name: 'alice',
          role: 'player',
          status: 'active',
          display_name: 'Alice Player',
        }),
      });
    });

    // Intercept room lobby query list
    await page.route('**/api/v1/rooms', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              room_id: 'room-1',
              host_account_id: 2,
              name: 'Public Table 1',
              visibility: 'public',
              has_password: false,
              status: 'waiting',
              player_count: 2,
              rules: {
                max_players: 8,
                end_mode: 'winner_takes_all',
                starting_chips: 1000,
                small_blind: 10,
                big_blind: 20,
              },
            },
          ],
        }),
      });
    });

    // 1. Visit login page
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Sign In to Play');

    // Accessibility check on Login Page
    const loginAccessibilityScan = await new AxeBuilder({ page })
      .exclude('[aria-hidden="true"]') // Exclude visual icons
      .analyze();
    expect(loginAccessibilityScan.violations).toEqual([]);

    // Visual screenshot of Login Page
    await expect(page).toHaveScreenshot('login-page.png', { maxDiffPixelRatio: 0.05 });

    // 2. Perform Login submit
    await page.fill('input[type="text"]', 'alice');
    await page.fill('input[type="password"]', 'secretpwd');
    await page.click('button[type="submit"]');

    // 3. Verify transition to Lobby dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Lobby');
    await expect(page.locator('text=Public Table 1')).toBeVisible();

    // Accessibility check on Lobby Page
    const lobbyAccessibilityScan = await new AxeBuilder({ page })
      .exclude('[aria-hidden="true"]')
      .analyze();
    expect(lobbyAccessibilityScan.violations).toEqual([]);

    // Visual screenshot of Lobby Page
    await expect(page).toHaveScreenshot('lobby-page.png', { maxDiffPixelRatio: 0.05 });
  });
});
