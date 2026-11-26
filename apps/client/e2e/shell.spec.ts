import { expect, test, type Page } from '@playwright/test';

const SCREENS = ['/', '/#/settings'];

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test.describe('English device', () => {
  test('opens on the game picker', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Le Curseur/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Game Library');
  });

  test('navigates with the tab bar and the browser history', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Games' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
  });

  test('shows the picker for an unknown address', async ({ page }) => {
    await page.goto('/#/does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
  });
});

test.describe('French device', () => {
  test.use({ locale: 'fr-FR' });

  test('follows the device language', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Jeux' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Le Curseur/ })).toContainText(
      'Faites deviner une position',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle('Bibliothèque de jeux');
  });
});

test.describe('settings', () => {
  test('the chosen language wins over the device language and survives a reload', async ({
    page,
  }) => {
    await page.goto('/#/settings');
    await expect(page.getByRole('radio', { name: 'Automatic (device language)' })).toBeChecked();

    await page.getByRole('radio', { name: 'Français' }).check();
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked();

    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });

  test('sound and vibration switches are saved', async ({ page }) => {
    await page.goto('/#/settings');
    const sound = page.getByRole('checkbox', { name: 'Sound' });
    const vibration = page.getByRole('checkbox', { name: 'Vibration' });
    await expect(sound).toBeChecked();
    await expect(vibration).toBeChecked();

    await sound.uncheck();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Vibration' })).toBeChecked();
  });

  test('recovers from corrupted saved settings', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem('gl.settings', '{"language":"klingon","sound":3'),
    );
    await page.goto('/#/settings');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Automatic (device language)' })).toBeChecked();
  });

  test('shows the app version', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  });
});

test.describe('phone layout', () => {
  for (const screen of SCREENS) {
    test(`${screen} does not scroll sideways`, async ({ page }) => {
      await page.goto(screen);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test(`${screen} fills the screen with the tab bar at the bottom`, async ({
      page,
      viewport,
    }) => {
      await page.goto(screen);
      const nav = await page.getByRole('navigation').boundingBox();
      expect(nav).not.toBeNull();
      expect(Math.round((nav?.y ?? 0) + (nav?.height ?? 0))).toBe(viewport?.height);
    });
  }

  test('every tab and setting row is at least 44 px high', async ({ page }) => {
    await page.goto('/#/settings');
    const targets = page.locator('nav a, label');
    const count = await targets.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      expect(box?.height ?? 0, `target ${i}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('follows the system dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await background()).toBe('rgb(255, 255, 255)');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await background()).toBe('rgb(20, 22, 26)');
  });
});

test.describe('offline and clean', () => {
  test('loads nothing from outside and logs no errors', async ({ page, baseURL }) => {
    const errors: string[] = [];
    const outside: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) outside.push(url);
    });

    for (const screen of SCREENS) await page.goto(screen);
    await page.waitForLoadState('networkidle');

    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
