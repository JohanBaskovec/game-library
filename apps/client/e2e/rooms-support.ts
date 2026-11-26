import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import { readTarget, setSlider } from './support.ts';

/** Several phones at once: each one is a browser of its own, with its own storage, like a real phone. */
export const test = base.extend<{ phone: () => Promise<Page> }>({
  phone: async ({ browser, baseURL, viewport, isMobile, hasTouch, locale }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        ...(baseURL === undefined ? {} : { baseURL }),
        ...(viewport ? { viewport } : {}),
        isMobile,
        hasTouch,
        ...(locale ? { locale } : {}),
      });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };

export const BLUES = 'The Blues';
export const ORANGES = 'The Oranges';

/** The host opens the game, asks for a room and lands in its lobby. Returns the room code. */
export async function createRoom(page: Page, name = 'Ann'): Promise<string> {
  await page.goto('/#/play/le-curseur');
  await page.getByRole('link', { name: 'Play on several phones' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create the room' }).click();
  const code = page.getByTestId('room-code');
  await expect(code).toBeVisible();
  return code.innerText();
}

/** Opens the room's link on another phone, says who it is, and lands in the lobby. */
export async function joinRoom(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/#/room/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

export function seatCard(page: Page, team: string) {
  return page.locator('li.seat', { has: page.getByRole('heading', { name: team, exact: true }) });
}

export async function sit(page: Page, team: string): Promise<void> {
  await seatCard(page, team).getByRole('button', { name: 'Sit here' }).click();
  await expect(seatCard(page, team).getByRole('button', { name: 'Leave this seat' })).toBeVisible();
}

/** A room with the host in the Blues and a guest in the Oranges, still in the lobby. */
export async function roomWithTwoTeams(host: Page, guest: Page): Promise<string> {
  const code = await createRoom(host);
  await joinRoom(guest, code, 'Bob');
  await sit(host, BLUES);
  await sit(guest, ORANGES);
  return code;
}

export async function startGame(host: Page): Promise<void> {
  await host.getByRole('button', { name: 'Start the game' }).click();
}

/** Which of two phones is giving the clue now? */
export async function whoGives(a: Page, b: Page): Promise<{ giver: Page; guesser: Page }> {
  const field = (page: Page) => page.getByPlaceholder('One word (or close)');
  // Locators cannot be combined across pages, so ask both phones until one of them is giving.
  await expect
    .poll(async () => (await field(a).isVisible()) || (await field(b).isVisible()), {
      message: 'neither phone is giving a clue',
    })
    .toBe(true);
  // The other phone may not have moved on yet: both must have left the lobby before the game is "on".
  for (const page of [a, b]) await expect(page.getByTestId('room-code')).toHaveCount(0);
  return (await field(a).isVisible()) ? { giver: a, guesser: b } : { giver: b, guesser: a };
}

/** The text of a phone's main area, with whitespace normalised so two phones can be compared. */
export async function mainText(page: Page): Promise<string> {
  return ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/** Every text frame a page receives on its WebSockets, from now on. Call before opening the page. */
export function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      frames.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString());
    });
  });
  return frames;
}

/** Controls a page's room WebSocket so that a test can cut it, and refuse its next connections. */
export class Cuttable {
  private current: { page: WebSocketRoute; server: WebSocketRoute | null } | null = null;
  blocked = false;

  static async on(page: Page): Promise<Cuttable> {
    const cuttable = new Cuttable();
    await page.routeWebSocket(/\/api\/rooms\/[A-Z0-9]+\/ws$/, (route) => {
      if (cuttable.blocked) {
        // Open for the page, but never reach the server: the page believes it is connected and never hears back.
        cuttable.current = { page: route, server: null };
        return;
      }
      const server = route.connectToServer();
      cuttable.current = { page: route, server };
    });
    return cuttable;
  }

  /** Closes the current connection on both sides, as a lost network would. */
  async cut(): Promise<void> {
    const current = this.current;
    this.current = null;
    await current?.server?.close();
    await current?.page.close();
  }
}

export interface TurnResult {
  target: number;
  guess: number;
  points: number;
}

function pointsFor(distance: number): number {
  return distance <= 3.5 ? 4 : distance <= 7 ? 3 : distance <= 10.5 ? 2 : distance <= 14 ? 1 : 0;
}

/**
 * Plays one turn on two phones: the giver gives a clue, the guesser answers at `target + offset`.
 * Ends with both phones on the result. With `watch`, also checks that the guessing phone never received
 * the target before the result: `frames` are what it received, `since` is where this turn's frames begin.
 */
export async function playRoomTurn(
  giver: Page,
  guesser: Page,
  clue: string,
  offset: number,
  watch?: { frames: string[]; since: number },
): Promise<TurnResult> {
  const target = await readTarget(giver);
  await giver.getByPlaceholder('One word (or close)').fill(clue);
  await giver.getByRole('button', { name: 'Submit the clue' }).click();

  // The guessing team gets the clue, and nothing of the target.
  await expect(guesser.getByText(`“${clue}”`)).toBeVisible();
  await expect(guesser.locator('.marker')).toHaveCount(0);

  const guess = Math.min(100, Math.max(0, target + offset));
  await setSlider(guesser, guess);
  if (watch) {
    // Everything the guessing phone has received so far, not just what it shows.
    const leaked = watch.frames
      .slice(watch.since)
      .filter((frame) => new RegExp(`"target":${target}[,}]`).test(frame));
    expect(leaked, 'the guessing phone received the target before the result').toEqual([]);
  }
  await guesser.getByRole('button', { name: 'Confirm' }).click();
  await expect(giver.locator('.points')).toBeVisible();
  await expect(guesser.locator('.points')).toBeVisible();
  return { target, guess, points: pointsFor(Math.abs(guess - target)) };
}

/** The host sets the game to one round (two clues), so that a whole game is short. */
export async function setRoundsToOne(host: Page): Promise<void> {
  const fewer = host.getByRole('button', { name: 'One round fewer' });
  while (await fewer.isEnabled()) await fewer.click();
  await expect(host.locator('output')).toHaveText('1');
}

export async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}
