import { expect, type Page } from '@playwright/test';

/** Points for a distance, written out from the rules independently of the game's code. */
export function expectedPoints(distance: number): number {
  if (distance <= 3.5) return 4;
  if (distance <= 7) return 3;
  if (distance <= 10.5) return 2;
  if (distance <= 14) return 1;
  return 0;
}

export async function openMenu(page: Page): Promise<void> {
  await page.goto('/#/play/le-curseur');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
}

/** Opens the game and starts it, with a number of rounds if given (the menu starts at 5). */
export async function startGame(page: Page, rounds = 1): Promise<void> {
  await openMenu(page);
  const less = page.getByRole('button', { name: 'One round fewer' });
  while ((await page.locator('output').innerText()) !== String(rounds)) {
    if (Number(await page.locator('output').innerText()) > rounds) await less.click();
    else await page.getByRole('button', { name: 'One round more' }).click();
  }
  await page.getByRole('button', { name: 'Play' }).click();
}

/** The name of the team the hand-off screen is for. */
export async function handoffTeam(page: Page): Promise<string> {
  await expect(page.getByRole('button', { name: 'Ready' })).toBeVisible();
  return page.locator('h2.name').innerText();
}

/** Nothing secret may be on a hand-off screen: no ruler, no field, no slider, no target. */
export async function expectNothingSecret(page: Page): Promise<void> {
  await expect(page.locator('.scale, .marker, [role="slider"], input')).toHaveCount(0);
}

export async function ready(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ready' }).click();
}

/** The target, read from the marker on the ruler (the giver sees it). */
export async function readTarget(page: Page): Promise<number> {
  const left = await page.locator('.marker').evaluate((el) => (el as HTMLElement).style.left);
  return Math.round(Number.parseFloat(left));
}

export async function readLabels(page: Page): Promise<string> {
  return (await page.locator('.labels').first().innerText()).replace(/\s+/g, ' ').trim();
}

/** Puts the slider exactly on `value` with the keyboard. */
export async function setSlider(page: Page, value: number): Promise<void> {
  const slider = page.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.floor(value / 10); i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < value % 10; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', String(value));
}

export interface TurnResult {
  target: number;
  guess: number;
  clue: string;
  points: number;
}

/**
 * Plays one whole turn from the giver's hand-off to the result on screen: ready, clue, hand-off,
 * ready, guess at `target + offset` (clamped), confirm.
 */
export async function playTurn(page: Page, clue: string, offset: number): Promise<TurnResult> {
  await ready(page);
  const target = await readTarget(page);
  await page.getByPlaceholder('One word (or close)').fill(clue);
  await page.getByRole('button', { name: 'Submit the clue' }).click();

  await handoffTeam(page);
  await expectNothingSecret(page);
  await expect(page.locator('body')).not.toContainText(clue);
  await ready(page);

  const guess = Math.min(100, Math.max(0, target + offset));
  await setSlider(page, guess);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: /Continue|See the recap/ })).toBeVisible();
  return { target, guess, clue, points: expectedPoints(Math.abs(guess - target)) };
}
