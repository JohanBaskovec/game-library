import { expect as baseExpect } from '@playwright/test';
import {
  BLUES,
  ORANGES,
  Cuttable,
  createRoom,
  expect,
  joinRoom,
  mainText,
  noHorizontalScroll,
  playRoomTurn,
  recordFrames,
  roomWithTwoTeams,
  seatCard,
  setRoundsToOne,
  sit,
  startGame,
  test,
  whoGives,
} from './rooms-support.ts';

void baseExpect;

test.describe('the lobby', () => {
  test('shows the code, a QR code, the link and the seats, to the host and to a guest', async ({
    phone,
  }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);

    for (const page of [host]) {
      await expect(page.getByRole('img', { name: /Scan this code/ })).toBeVisible();
      await expect(page.getByLabel('Link to the room')).toHaveValue(new RegExp(`#/room/${code}$`));
      await expect(page.getByRole('button', { name: 'Copy the link' })).toBeVisible();
      await expect(seatCard(page, BLUES)).toContainText('Nobody yet');
      await expect(seatCard(page, ORANGES)).toContainText('Nobody yet');
    }

    await joinRoom(guest, code, 'Bob');
    await expect(host.getByText('Bob')).toBeVisible();
    await expect(guest.getByText('Ann')).toBeVisible();
    await expect(guest.getByText('host', { exact: true })).toBeVisible();
    await expect(guest.getByText('you', { exact: true })).toBeVisible();
  });

  test('lets the host, and only the host, change the settings and start', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await joinRoom(guest, code, 'Bob');

    await expect(host.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
    await expect(guest.getByText('Waiting for the host to start the game…')).toBeVisible();

    // The host renames a team; the guest sees it on its seat.
    await host.getByLabel('Team 1').fill('Reds');
    await expect(guest.getByRole('heading', { name: 'Reds', exact: true })).toBeVisible();
    await expect(guest.getByRole('heading', { name: BLUES, exact: true })).toHaveCount(0);
  });

  test('does not let the game start until each team has a connected player', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    const start = host.getByRole('button', { name: 'Start the game' });
    await expect(start).toBeDisabled();
    await expect(host.getByText('Every seat needs a connected player.')).toBeVisible();

    await joinRoom(guest, code, 'Bob');
    await sit(host, BLUES);
    await expect(start).toBeDisabled();
    await sit(guest, ORANGES);
    await expect(start).toBeEnabled();

    // Invalid settings block it too, and say so.
    await host.getByLabel('Team 2').fill('');
    await expect(start).toBeDisabled();
    await expect(host.getByText('Fix the settings first.')).toBeVisible();
    await host.getByLabel('Team 2').fill('Greens');
    await expect(start).toBeEnabled();
  });

  test('lets a player change seats or leave one, and shows it to everyone', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await joinRoom(guest, code, 'Bob');
    await sit(guest, BLUES);
    await expect(seatCard(host, BLUES)).toContainText('Bob');
    await sit(guest, ORANGES);
    await expect(seatCard(host, ORANGES)).toContainText('Bob');
    await expect(seatCard(host, BLUES)).not.toContainText('Bob');
    await seatCard(guest, ORANGES).getByRole('button', { name: 'Leave this seat' }).click();
    await expect(seatCard(host, ORANGES)).not.toContainText('Bob');
    await expect(host.getByRole('heading', { name: 'Watching' })).toBeVisible();
  });

  test('says whether the link could be copied', async ({ phone }) => {
    const host = await phone();
    await createRoom(host);
    await host.getByRole('button', { name: 'Copy the link' }).click();
    await expect(host.getByText(/Link copied|Could not copy/)).toBeVisible();
  });
});

test.describe('a whole game on two phones', () => {
  test('is played to the recap, each team seeing only what is its own', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const hostFrames = recordFrames(host);
    const guestFrames = recordFrames(guest);
    await roomWithTwoTeams(host, guest);
    await setRoundsToOne(host);
    await startGame(host);

    // No passing of a phone: there is no hand-off in a room.
    const first = await whoGives(host, guest);
    for (const page of [host, guest])
      await expect(page.getByRole('button', { name: 'Ready' })).toHaveCount(0);
    const framesOf = (page: typeof host) => (page === host ? hostFrames : guestFrames);

    // The team that does not give the clue is told to wait, and is shown nothing.
    await expect(first.guesser.getByText(/Waiting for .* to give a clue/)).toBeVisible();
    await expect(first.guesser.locator('.marker')).toHaveCount(0);
    await expect(first.guesser.getByPlaceholder('One word (or close)')).toHaveCount(0);

    // Turn 1.
    const turn1 = await playRoomTurn(first.giver, first.guesser, 'zebra', 0, {
      frames: framesOf(first.guesser),
      since: 0,
    });
    await expect(first.giver.locator('.points')).toHaveText(
      turn1.points === 0 ? '0 points' : new RegExp(`\\+${turn1.points} points?`),
    );
    await expect(first.guesser.locator('.points')).toHaveText(
      await first.giver.locator('.points').innerText(),
    );
    // Only the guessing team can go on; the other sees that it is waiting.
    await expect(first.giver.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await expect(first.giver.getByText(/Waiting for .* to continue/)).toBeVisible();
    const mark = framesOf(first.giver).length;
    await first.guesser.getByRole('button', { name: 'Continue' }).click();

    // Turn 2: the roles are swapped.
    const second = await whoGives(host, guest);
    expect(second.giver).toBe(first.guesser);
    const turn2 = await playRoomTurn(second.giver, second.guesser, 'lemon', 40, {
      frames: framesOf(second.guesser),
      since: mark,
    });
    await second.guesser.getByRole('button', { name: 'See the recap' }).click();

    // The recap, on both phones.
    const total = turn1.points + turn2.points;
    for (const page of [host, guest]) {
      await expect(page.getByRole('heading', { name: 'Recap' })).toBeVisible();
      await expect(page.locator('.total')).toHaveText(`${total} pt${total === 1 ? '' : 's'}`);
      await expect(page.locator('.turn')).toHaveCount(2);
      await expect(page.locator('.turn').nth(0)).toContainText(
        `Target ${turn1.target} · Answer ${turn1.guess}`,
      );
      await expect(page.locator('.turn').nth(1)).toContainText(
        `Target ${turn2.target} · Answer ${turn2.guess}`,
      );
    }

    // The host takes everyone back to the lobby; the seats are kept, and another game can start.
    await expect(guest.getByText('Waiting for the host…')).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Back to the lobby' })).toHaveCount(0);
    await host.getByRole('button', { name: 'Back to the lobby' }).click();
    for (const page of [host, guest]) await expect(page.getByTestId('room-code')).toBeVisible();
    await expect(seatCard(host, BLUES)).toContainText('Ann');
    await expect(seatCard(host, ORANGES)).toContainText('Bob');
    await startGame(host);
    await whoGives(host, guest);

    // Nothing but views and descriptions of the room ever reached a phone.
    for (const frames of [hostFrames, guestFrames]) {
      const everything = frames.join('\n');
      expect(everything).not.toContain('"rng"');
      expect(everything).not.toContain('usedPairIndexes');
    }
  });

  test('keeps a game going when one phone reloads', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    await roomWithTwoTeams(host, guest);
    await startGame(host);
    const { giver, guesser } = await whoGives(host, guest);
    const before = await mainText(guesser);
    const code = (await giver.evaluate(() => location.hash)).slice('#/room/'.length);

    await guesser.reload();
    await expect.poll(() => mainText(guesser)).toBe(before);
    // Back in the same room, with the same seat, without being asked who it is.
    await expect(guesser).toHaveURL(new RegExp(`#/room/${code}$`));
    await expect(guesser.getByLabel('Your name')).toHaveCount(0);

    await giver.reload();
    await expect(giver.getByPlaceholder('One word (or close)')).toBeVisible();
  });

  test('has no hand-off, and gives each team the colour of its seat', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    await roomWithTwoTeams(host, guest);
    await startGame(host);
    await whoGives(host, guest);
    expect(await host.evaluate(() => document.body.dataset.seat)).toBe('0');
    expect(await guest.evaluate(() => document.body.dataset.seat)).toBe('1');
  });
});

test.describe('several phones for one team', () => {
  test('both see the team’s view, and either can act for it', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const second = await phone();
    const code = await roomWithTwoTeams(host, guest);
    await joinRoom(second, code, 'Cy');
    await sit(second, BLUES);
    await expect(seatCard(host, BLUES)).toContainText('Cy');
    await startGame(host);

    const bluesGive = await host
      .getByPlaceholder('One word (or close)')
      .isVisible()
      .catch(() => false);
    await expect(
      host.getByPlaceholder('One word (or close)').or(host.getByText(/Waiting for/)),
    ).toBeVisible();
    // The two phones of a team show exactly the same.
    await expect.poll(() => mainText(second)).toBe(await mainText(host));

    if (bluesGive || (await host.getByPlaceholder('One word (or close)').isVisible())) {
      // The team's other phone gives the clue; both phones of the team move on together.
      await second.getByPlaceholder('One word (or close)').fill('shared');
      await second.getByRole('button', { name: 'Submit the clue' }).click();
      await expect(host.getByText(/Waiting for .* to guess/)).toBeVisible();
      await expect(second.getByText(/Waiting for .* to guess/)).toBeVisible();
    } else {
      // The other team gives: both Blues phones wait, and see nothing secret.
      for (const page of [host, second]) {
        await expect(page.getByText(/Waiting for .* to give a clue/)).toBeVisible();
        await expect(page.locator('.marker')).toHaveCount(0);
      }
    }
  });
});

test.describe('watching', () => {
  test('a phone without a seat sees no game, and can take a seat', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await roomWithTwoTeams(host, guest);
    await startGame(host);
    const { giver } = await whoGives(host, guest);

    const watcher = await phone();
    // A room that is already playing has no lobby to land in: the watcher goes straight to the game screen.
    await watcher.goto(`/#/room/${code}`);
    await watcher.getByLabel('Your name').fill('Cy');
    await watcher.getByRole('button', { name: 'Join' }).click();
    await expect(watcher.getByText('You are watching. Take a seat to play.')).toBeVisible();
    await expect(watcher.locator('.marker')).toHaveCount(0);
    await expect(watcher.locator('input')).toHaveCount(0);

    // Taking the seat of the team that gives the clue shows that team's screen.
    const giverSeat = giver === host ? BLUES : ORANGES;
    await watcher.getByRole('button', { name: new RegExp(`Sit here · ${giverSeat}`) }).click();
    await expect(watcher.getByPlaceholder('One word (or close)')).toBeVisible();
  });
});

test.describe('connection', () => {
  test('a phone that loses its connection reconnects by itself and keeps its seat', async ({
    phone,
  }) => {
    const host = await phone();
    const guest = await phone();
    const cuttable = await Cuttable.on(guest);
    const code = await createRoom(host);
    await joinRoom(guest, code, 'Bob');
    await sit(guest, ORANGES);

    // The network drops, and stays down for a moment.
    cuttable.blocked = true;
    await cuttable.cut();
    await expect(guest.getByText('Connection lost. Reconnecting…')).toBeVisible();
    await expect(seatCard(host, ORANGES)).toContainText('offline');

    // It comes back: no action from the player, the same seat, the banner gone.
    cuttable.blocked = false;
    await cuttable.cut();
    await expect(guest.getByText('Connection lost. Reconnecting…')).toBeHidden({ timeout: 15_000 });
    await expect(
      seatCard(guest, ORANGES).getByRole('button', { name: 'Leave this seat' }),
    ).toBeVisible();
    await expect(seatCard(host, ORANGES)).not.toContainText('offline');
    await expect(seatCard(host, ORANGES)).toContainText('Bob');
  });

  test('a phone that comes back during a game finds its view again', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const cuttable = await Cuttable.on(guest);
    await roomWithTwoTeams(host, guest);
    await startGame(host);
    const { giver, guesser } = await whoGives(host, guest);
    const watching = guesser === guest;
    const before = await mainText(guest);

    await cuttable.cut();
    await expect.poll(() => mainText(guest), { timeout: 15_000 }).toBe(before);

    // The game went on without it only if it is the other team's move: here the giver gives a clue.
    if (watching) {
      await giver.getByPlaceholder('One word (or close)').fill('later');
      await giver.getByRole('button', { name: 'Submit the clue' }).click();
      await expect(guesser.getByText('“later”')).toBeVisible();
    }
  });

  test('the host leaving passes the room to the other phone', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await joinRoom(guest, code, 'Bob');
    await expect(guest.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

    await host.getByRole('button', { name: 'Leave' }).click();
    await host.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
    await expect(host.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();

    await expect(guest.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(guest.getByText('Ann')).toHaveCount(0);
    await expect(guest.getByText('host', { exact: true })).toBeVisible();
  });

  test('"Stay" in the leave dialog keeps the phone in the room', async ({ phone }) => {
    const host = await phone();
    await createRoom(host);
    await host.getByRole('button', { name: 'Leave' }).click();
    await host.getByRole('dialog').getByRole('button', { name: 'Stay' }).click();
    await expect(host.getByTestId('room-code')).toBeVisible();
  });

  test('a phone that closed the room page can come back with the code', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await joinRoom(guest, code, 'Bob');
    await sit(guest, BLUES);

    await guest.goto('/#/');
    await expect(seatCard(host, BLUES)).toContainText('offline');
    await guest.goto(`/#/room/${code}`);
    await expect(
      seatCard(guest, BLUES).getByRole('button', { name: 'Leave this seat' }),
    ).toBeVisible();
    await expect(guest.getByLabel('Your name')).toHaveCount(0);
  });
});

test.describe('joining', () => {
  test('tells a player when the room does not exist', async ({ phone }) => {
    const page = await phone();
    await page.goto('/#/room/ZZZZZ');
    await page.getByLabel('Your name').fill('Bob');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('This room does not exist, or it has closed.')).toBeVisible();
    await page.getByRole('link', { name: /Back to games/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
  });

  test('needs a name', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await guest.goto(`/#/room/${code}`);
    const join = guest.getByRole('button', { name: 'Join' });
    await expect(join).toBeDisabled();
    await guest.getByLabel('Your name').fill('   ');
    await expect(join).toBeDisabled();
    await guest.getByLabel('Your name').fill('Bob');
    await expect(join).toBeEnabled();
  });

  test('can be done from the games page with the code, typed any way', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host);
    await guest.goto('/');
    const input = guest.getByLabel('Room code');
    await input.fill('not a code');
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(guest.getByText('This is not a room code.')).toBeVisible();
    await input.fill(` ${code.slice(0, 2).toLowerCase()}-${code.slice(2).toLowerCase()} `);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(guest).toHaveURL(new RegExp(`#/room/${code}$`));
    await expect(guest.getByRole('heading', { name: `Join room ${code}` })).toBeVisible();
  });

  test('remembers the player’s name for the next room', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    await createRoom(host, 'Annabelle');
    await host.goto('/#/play/le-curseur');
    await host.getByRole('link', { name: 'Play on several phones' }).click();
    await expect(host.getByLabel('Your name')).toHaveValue('Annabelle');
    await guest.goto('/');
  });

  test('refuses an unknown game from the address bar', async ({ phone }) => {
    const page = await phone();
    await page.goto('/#/room/new/does-not-exist');
    await expect(page.getByText('This game does not exist.')).toBeVisible();
  });
});

test.describe('in French', () => {
  test.use({ locale: 'fr-FR' });

  test('the room screens are in French', async ({ phone }) => {
    const host = await phone();
    const guest = await phone();
    await host.goto('/#/play/le-curseur');
    await host.getByRole('link', { name: 'Jouer à plusieurs téléphones' }).click();
    await host.getByLabel('Votre nom').fill('Anne');
    await host.getByRole('button', { name: 'Créer la salle' }).click();
    const code = await host.getByTestId('room-code').innerText();
    await expect(host.getByText('Code de la salle')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Copier le lien' })).toBeVisible();
    await expect(seatCard(host, 'Les Bleus')).toBeVisible();

    await guest.goto(`/#/room/${code}`);
    await expect(guest.getByRole('heading', { name: `Rejoindre la salle ${code}` })).toBeVisible();
    await guest.getByLabel('Votre nom').fill('Bob');
    await guest.getByRole('button', { name: 'Rejoindre' }).click();
    await expect(guest.getByText('En attente du lancement de la partie par l’hôte…')).toBeVisible();
    await seatCard(guest, 'Les Oranges').getByRole('button', { name: 'S’asseoir ici' }).click();
    await seatCard(host, 'Les Bleus').getByRole('button', { name: 'S’asseoir ici' }).click();
    await host.getByRole('button', { name: 'Lancer la partie' }).click();
    await expect(
      host.getByPlaceholder('Un mot (ou presque)').or(host.getByText(/En attente de l’indice de/)),
    ).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test('no room screen scrolls sideways, and every control is big enough to tap', async ({
    phone,
  }) => {
    const host = await phone();
    const guest = await phone();
    const code = await createRoom(host, 'W'.repeat(20));
    await joinRoom(guest, code, 'M'.repeat(20));
    await host.getByLabel('Team 1').fill('W'.repeat(20));
    await host.getByLabel('Team 2').fill('M'.repeat(20));
    await expect(guest.getByRole('heading', { name: 'W'.repeat(20), exact: true })).toBeVisible();
    await sit(host, 'W'.repeat(20));
    await sit(guest, 'M'.repeat(20));

    const check = async (page: typeof host, name: string) => {
      await page.waitForTimeout(200);
      expect(await noHorizontalScroll(page), `${name} scrolls sideways`).toBe(true);
      const controls = page.locator(
        'button:visible, input:visible, summary:visible, [role="slider"]',
      );
      const count = await controls.count();
      for (let i = 0; i < count; i++) {
        const box = await controls.nth(i).boundingBox();
        const label = await controls
          .nth(i)
          .evaluate((el) => el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName);
        if (box) {
          expect(box.height, `${name}: "${label}" is ${box.height}px high`).toBeGreaterThanOrEqual(
            44,
          );
          expect(box.width, `${name}: "${label}" is ${box.width}px wide`).toBeGreaterThanOrEqual(
            44,
          );
        }
      }
    };
    await check(host, 'host lobby');
    await check(guest, 'guest lobby');

    await startGame(host);
    const { giver, guesser } = await whoGives(host, guest);
    await check(giver, 'giver');
    await check(guesser, 'waiting');
    await giver.getByPlaceholder('One word (or close)').fill('W'.repeat(40));
    await giver.getByRole('button', { name: 'Submit the clue' }).click();
    await expect(guesser.getByRole('slider')).toBeVisible();
    await check(guesser, 'guessing');
    await check(giver, 'watching the guess');
  });

  test('a whole room flow loads nothing from outside and logs no errors', async ({
    phone,
    baseURL,
  }) => {
    const host = await phone();
    const guest = await phone();
    const errors: string[] = [];
    const outside: string[] = [];
    for (const page of [host, guest]) {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
      });
      page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) outside.push(url);
      });
    }
    await roomWithTwoTeams(host, guest);
    await setRoundsToOne(host);
    await startGame(host);
    const { giver, guesser } = await whoGives(host, guest);
    await playRoomTurn(giver, guesser, 'clean', 5);
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
