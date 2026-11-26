import { expect, test, type Page } from '@playwright/test';
import {
  expectNothingSecret,
  expectedPoints,
  handoffTeam,
  openMenu,
  playTurn,
  readLabels,
  readTarget,
  ready,
  setSlider,
  startGame,
} from './support.ts';

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test.describe('the game picker', () => {
  test('lists the game with its description, and says the content is French', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('link', { name: /Le Curseur/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Get the other team to find a spot between two opposites');
    await expect(card).toContainText('Content in French');
    await card.click();
    await expect(page).toHaveURL(/#\/play\/le-curseur$/);
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test.describe('on a French device', () => {
    test.use({ locale: 'fr-FR' });

    test('shows the French description and no language warning', async ({ page }) => {
      await page.goto('/');
      const card = page.getByRole('link', { name: /Le Curseur/ });
      await expect(card).toContainText('Faites deviner une position entre deux opposés');
      await expect(card).not.toContainText('Contenu en');
    });
  });

  test('says when a game does not exist', async ({ page }) => {
    await page.goto('/#/play/does-not-exist');
    await expect(page.getByText('This game does not exist.')).toBeVisible();
    await page.getByRole('link', { name: /Back to games/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
  });
});

test.describe('the menu', () => {
  test('starts with default teams and 5 rounds', async ({ page }) => {
    await openMenu(page);
    await expect(page.getByLabel('Team 1')).toHaveValue('The Blues');
    await expect(page.getByLabel('Team 2')).toHaveValue('The Oranges');
    await expect(page.locator('output')).toHaveText('5');
    await expect(page.getByText('10 clues in total: each team gives 5 of them.')).toBeVisible();
    await expect(page.getByText('The concept pairs are in French for now.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
  });

  test('refuses empty or identical team names, and says why', async ({ page }) => {
    await openMenu(page);
    const play = page.getByRole('button', { name: 'Play' });
    await page.getByLabel('Team 1').fill('');
    await expect(play).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveText('Give each team a name.');

    await page.getByLabel('Team 1').fill('   ');
    await expect(play).toBeDisabled();

    await page.getByLabel('Team 1').fill('Reds');
    await page.getByLabel('Team 2').fill(' reds ');
    await expect(play).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveText('The two teams must have different names.');

    await page.getByLabel('Team 2').fill('Greens');
    await expect(play).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveText('');
  });

  test('keeps the number of rounds between 1 and 20', async ({ page }) => {
    await openMenu(page);
    const less = page.getByRole('button', { name: 'One round fewer' });
    const more = page.getByRole('button', { name: 'One round more' });
    while (await less.isEnabled()) await less.click();
    await expect(page.locator('output')).toHaveText('1');
    await expect(less).toBeDisabled();
    await expect(page.getByText('2 clues in total: each team gives 1 of them.')).toBeVisible();
    while (await more.isEnabled()) await more.click();
    await expect(page.locator('output')).toHaveText('20');
    await expect(more).toBeDisabled();
  });

  test('shows the rules with the points bands', async ({ page }) => {
    await openMenu(page);
    await page.getByText('How to play').click();
    await expect(page.getByText('Passing is not allowed!')).toBeVisible();
    await expect(
      page.getByText('4 pts within 3.5%, 3 pts within 7%, 2 pts within 10.5%, 1 pts within 14%'),
    ).toBeVisible();
  });

  test.describe('on a French device', () => {
    test.use({ locale: 'fr-FR' });

    test('is in French, with French team names and no warning about the language', async ({
      page,
    }) => {
      await page.goto('/#/play/le-curseur');
      await expect(page.getByRole('button', { name: 'Jouer' })).toBeVisible();
      await expect(page.getByLabel('Équipe 1')).toHaveValue('Les Bleus');
      await expect(page.getByLabel('Équipe 2')).toHaveValue('Les Oranges');
      await expect(page.getByText('Les paires de concepts sont en français.')).toHaveCount(0);
      await page.getByText('Règles du jeu').click();
      await expect(page.getByText(/4\u00A0pts à 3,5\u00A0%/)).toBeVisible();
    });
  });

  test('remembers the last team names and number of rounds', async ({ page }) => {
    await openMenu(page);
    await page.getByLabel('Team 1').fill('Reds');
    await page.getByLabel('Team 2').fill('Greens');
    await page.getByRole('button', { name: 'One round fewer' }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Quit' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quit' }).click();

    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByLabel('Team 1')).toHaveValue('Reds');
    await expect(page.getByLabel('Team 2')).toHaveValue('Greens');
    await expect(page.locator('output')).toHaveText('4');
  });
});

test.describe('a whole game', () => {
  test('is played from the first hand-off to the recap, with the secrets kept', async ({
    page,
  }) => {
    await startGame(page, 1);

    // First hand-off: names a team, shows nothing secret.
    const first = await handoffTeam(page);
    expect(['The Blues', 'The Oranges']).toContain(first);
    await expect(page.getByText('Round 1 / 1')).toBeVisible();
    await expect(page.getByText('Your turn to give the clue')).toBeVisible();
    await expect(page.getByText('The other team must not see the next screen.')).toBeVisible();
    await expect(page.getByText('Shared score: 0 points')).toBeVisible();
    await expectNothingSecret(page);

    // Turn 1.
    const one = await playTurn(page, 'zebra', 0);
    await expect(page.getByText(`+${one.points} points`)).toBeVisible();
    await expect(page.getByText('Bullseye!')).toBeVisible();
    await expect(page.getByText(`Shared score: ${one.points} points`)).toBeVisible();
    await expect(page.getByText('“zebra”').first()).toBeVisible();
    await expect(page.locator('.marker')).toHaveCount(1);

    // After the result there is a hand-off, even though the same team keeps the phone.
    await page.getByRole('button', { name: 'Continue' }).click();
    const second = await handoffTeam(page);
    expect(second).not.toBe(first);
    await expectNothingSecret(page);
    await expect(page.getByText('Your turn to give the clue')).toBeVisible();

    // Turn 2, a long way from the target.
    const two = await playTurn(page, 'lemon', 40);
    await page.getByRole('button', { name: 'See the recap' }).click();

    // Recap.
    const total = one.points + two.points;
    await expect(page.getByRole('heading', { name: 'Recap' })).toBeVisible();
    await expect(page.getByText('Shared score').first()).toBeVisible();
    await expect(page.locator('.total')).toHaveText(`${total} pt${total === 1 ? '' : 's'}`);
    await expect(page.locator('.turn')).toHaveCount(2);
    await expect(page.locator('.turn').nth(0)).toContainText('“zebra”');
    await expect(page.locator('.turn').nth(1)).toContainText('“lemon”');
    await expect(page.locator('.turn').nth(0)).toContainText(
      `Target ${one.target} · Answer ${one.guess}`,
    );
    await expect(page.locator('.turn').nth(1)).toContainText(
      `Target ${two.target} · Answer ${two.guess}`,
    );
    await expect(page.locator('.turn').nth(1)).toContainText(
      two.points === 0 ? '0 points' : `+${two.points} point`,
    );
    await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ready' })).toHaveCount(0);

    // Each team earned the same as guesser and as giver of the other: the table adds up.
    const numbers = await page.locator('.team-table .num').allInnerTexts();
    expect(numbers.map(Number).reduce((sum, n) => sum + n, 0)).toBe(total * 2);
  });

  test('alternates the teams over several rounds and plays twice as many clues', async ({
    page,
  }) => {
    await startGame(page, 2);
    const teams: string[] = [];
    for (let turn = 0; turn < 4; turn++) {
      teams.push(await handoffTeam(page));
      await playTurn(page, `word${turn}`, 3);
      await page.getByRole('button', { name: turn < 3 ? 'Continue' : 'See the recap' }).click();
    }
    // The team that just guessed gives the next clue, so the teams alternate: A, B, A, B.
    expect(teams[1]).not.toBe(teams[0]);
    expect(teams[2]).toBe(teams[0]);
    expect(teams[3]).toBe(teams[1]);
    await expect(page.locator('.turn')).toHaveCount(4);
  });

  test('scores the bands exactly, at both sides of the target', async ({ page }) => {
    await startGame(page, 3);
    const offsets = [3, -4, 7, -8, 10, 11];
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i] ?? 0;
      await handoffTeam(page);
      await ready(page);
      const target = await readTarget(page);
      // Keep the guess on the ruler: aim to the other side near the ends.
      const wanted = target + offset;
      const signed = wanted < 0 || wanted > 100 ? -offset : offset;
      await page.getByPlaceholder('One word (or close)').fill('x');
      await page.getByRole('button', { name: 'Submit the clue' }).click();
      await ready(page);
      await setSlider(page, target + signed);
      await page.getByRole('button', { name: 'Confirm' }).click();
      const points = expectedPoints(Math.abs(signed));
      await expect(
        page.getByText(points === 0 ? '0 points' : new RegExp(`\\+${points} points?`)).first(),
      ).toBeVisible();
      await expect(page.getByText(`Off by ${Math.abs(signed)}%`)).toBeVisible();
      if (i < offsets.length - 1) await page.getByRole('button', { name: 'Continue' }).click();
    }
  });

  test('does not let an empty or blank clue through', async ({ page }) => {
    await startGame(page, 1);
    await ready(page);
    const submit = page.getByRole('button', { name: 'Submit the clue' });
    const field = page.getByPlaceholder('One word (or close)');
    await expect(submit).toBeDisabled();
    await field.fill('   ');
    await expect(submit).toBeDisabled();
    await field.fill(' potato   salad ');
    await expect(submit).toBeEnabled();
    await field.press('Enter');
    await handoffTeam(page);
    await ready(page);
    await expect(page.getByText('“potato salad”')).toBeVisible();
  });

  test('keeps the target and changes the concepts with "Other concepts"', async ({ page }) => {
    await startGame(page, 1);
    await ready(page);
    const target = await readTarget(page);
    await page.getByPlaceholder('One word (or close)').fill('kept');
    const seen = new Set([await readLabels(page)]);
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Other concepts' }).click();
      const labels = await readLabels(page);
      expect(seen.has(labels), `"${labels}" came back`).toBe(false);
      seen.add(labels);
      expect(await readTarget(page)).toBe(target);
    }
    // The clue being typed is not lost.
    await expect(page.getByPlaceholder('One word (or close)')).toHaveValue('kept');
  });

  test('"Play again" starts a new game with the same teams', async ({ page }) => {
    await openMenu(page);
    await page.getByLabel('Team 1').fill('Reds');
    await page.getByLabel('Team 2').fill('Greens');
    await page.getByRole('button', { name: 'One round fewer' }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'One round fewer' }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await handoffTeam(page);
    await playTurn(page, 'alpha-clue', 0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await handoffTeam(page);
    await playTurn(page, 'bravo-clue', 0);
    await page.getByRole('button', { name: 'See the recap' }).click();

    await page.getByRole('button', { name: 'Play again' }).click();
    const team = await handoffTeam(page);
    expect(['Reds', 'Greens']).toContain(team);
    await expect(page.getByText('Round 1 / 1')).toBeVisible();
    await expect(page.getByText('Shared score: 0 points')).toBeVisible();
  });

  test('"Menu" at the end goes back to the menu without a game to resume', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await playTurn(page, 'alpha-clue', 0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await handoffTeam(page);
    await playTurn(page, 'bravo-clue', 0);
    await page.getByRole('button', { name: 'See the recap' }).click();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
  });
});

test.describe('French game', () => {
  test.use({ locale: 'fr-FR' });

  test('hand-off and screens are in French', async ({ page }) => {
    await page.goto('/#/play/le-curseur');
    await page.getByRole('button', { name: 'Jouer' }).click();
    await expect(page.getByText('Tour 1 / 5')).toBeVisible();
    await expect(page.getByText('Tour de l’équipe')).toBeVisible();
    await expect(page.getByText('À vous de faire deviner')).toBeVisible();
    await expect(page.getByText('Score commun\u00A0: 0 point', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Prêt' }).click();
    await expect(page.getByRole('button', { name: 'Autres concepts' })).toBeVisible();
    await page.getByPlaceholder('Un mot (ou presque)').fill('zèbre');
    await page.getByRole('button', { name: 'Valider l’indice' }).click();
    await page.getByRole('button', { name: 'Prêt' }).click();
    await expect(page.getByText('«\u00A0zèbre\u00A0»')).toBeVisible();
    await expect(page.getByText('À vous de deviner').first()).toBeVisible();
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText(/^(\+\d|0) points?$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible();
  });
});

test.describe('leaving, quitting and resuming', () => {
  test('quitting asks first, and "Keep playing" stays in the game', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await page.getByRole('button', { name: 'Quit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Quit the current game? It will be lost.');
    await dialog.getByRole('button', { name: 'Keep playing' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Ready' })).toBeVisible();

    await page.getByRole('button', { name: 'Quit' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Ready' })).toBeVisible();
  });

  test('quitting for good discards the game', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await page.getByRole('button', { name: 'Quit' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quit' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
  });

  test('a reload while giving the clue offers to resume, on a hand-off, with the same game', async ({
    page,
  }) => {
    await startGame(page, 2);
    const team = await handoffTeam(page);
    await ready(page);
    const target = await readTarget(page);
    await page.getByRole('button', { name: 'Other concepts' }).click();
    const labels = await readLabels(page);

    await page.reload();
    await page.getByRole('button', { name: 'Resume game' }).click();

    // Never straight onto the secret.
    expect(await handoffTeam(page)).toBe(team);
    await expectNothingSecret(page);
    await ready(page);
    expect(await readTarget(page)).toBe(target);
    expect(await readLabels(page)).toBe(labels);
  });

  test('a reload while guessing resumes on a hand-off, then on the same clue', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('mango');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    const guesser = await handoffTeam(page);
    await ready(page);
    await expect(page.getByRole('slider')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Resume game' }).click();
    expect(await handoffTeam(page)).toBe(guesser);
    await expectNothingSecret(page);
    await ready(page);
    await expect(page.getByText('“mango”')).toBeVisible();
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
  });

  test('a reload on the result resumes on a hand-off, and the score is kept', async ({ page }) => {
    await startGame(page, 2);
    await handoffTeam(page);
    const turn = await playTurn(page, 'kiwi', 0);
    await expect(page.getByText(`+${turn.points} points`)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Resume game' }).click();
    await handoffTeam(page);
    await expectNothingSecret(page);
    await expect(page.getByText(`Shared score: ${turn.points} points`)).toBeVisible();
  });

  test('the browser back button leaves the game but keeps it for later', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Le Curseur/ }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await handoffTeam(page);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible();
    await page.getByRole('link', { name: /Le Curseur/ }).click();
    await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible();
  });

  test('a saved game from other rules is ignored', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await page.evaluate(() => {
      const key = 'gl.game.le-curseur.save';
      const save = JSON.parse(localStorage.getItem(key) ?? 'null');
      save.rulesVersion = 999;
      localStorage.setItem(key, JSON.stringify(save));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
  });

  test('a corrupted saved game is ignored', async ({ page }) => {
    await startGame(page, 1);
    await handoffTeam(page);
    await page.evaluate(() => localStorage.setItem('gl.game.le-curseur.save', '{"broken'));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0);
  });
});

test.describe('the cursor', () => {
  async function toGuess(page: Page) {
    await startGame(page, 1);
    await handoffTeam(page);
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('w');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    await handoffTeam(page);
    await ready(page);
    return page.getByRole('slider');
  }

  test('starts in the middle and describes its position', async ({ page }) => {
    const slider = await toGuess(page);
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
    await expect(slider).toHaveAttribute('aria-valuemin', '0');
    await expect(slider).toHaveAttribute('aria-valuemax', '100');
    await expect(slider).toHaveAccessibleName('Position between the two concepts');
    await expect(slider).toHaveAttribute('aria-valuetext', /50%, .* 50%$/);
  });

  test('moves with the keyboard: arrows, shift, page keys, home and end', async ({ page }) => {
    const slider = await toGuess(page);
    await slider.focus();
    const value = () => slider.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    expect(await value()).toBe('51');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await value()).toBe('49');
    await page.keyboard.press('ArrowUp');
    expect(await value()).toBe('50');
    await page.keyboard.press('ArrowDown');
    expect(await value()).toBe('49');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await value()).toBe('59');
    await page.keyboard.press('PageUp');
    expect(await value()).toBe('69');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    expect(await value()).toBe('49');
    await page.keyboard.press('Home');
    expect(await value()).toBe('0');
    await page.keyboard.press('ArrowLeft');
    expect(await value()).toBe('0');
    await page.keyboard.press('End');
    expect(await value()).toBe('100');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('PageUp');
    expect(await value()).toBe('100');
  });

  test('moves where it is tapped, and follows a drag', async ({ page }) => {
    const slider = await toGuess(page);
    const box = await slider.boundingBox();
    if (!box) throw new Error('no ruler');
    const at = (percent: number) => box.x + (box.width * percent) / 100;
    const y = box.y + box.height / 2;

    await page.mouse.click(at(25), y);
    const tapped = Number(await slider.getAttribute('aria-valuenow'));
    expect(tapped).toBeGreaterThanOrEqual(24);
    expect(tapped).toBeLessThanOrEqual(26);

    await page.mouse.move(at(25), y);
    await page.mouse.down();
    await page.mouse.move(at(60), y, { steps: 5 });
    await page.mouse.move(at(80), y, { steps: 5 });
    await page.mouse.up();
    const dragged = Number(await slider.getAttribute('aria-valuenow'));
    expect(dragged).toBeGreaterThanOrEqual(79);
    expect(dragged).toBeLessThanOrEqual(81);

    // Dragging past the ends keeps the cursor on the ruler.
    await page.mouse.move(at(80), y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 200, y, { steps: 5 });
    await page.mouse.up();
    expect(await slider.getAttribute('aria-valuenow')).toBe('100');
  });

  test('scores what was chosen', async ({ page }) => {
    const slider = await toGuess(page);
    await slider.focus();
    await page.keyboard.press('Home');
    await page.getByRole('button', { name: 'Confirm' }).click();
    const detail = await page.getByText(/^(Off by \d+%|Bullseye!) · /).innerText();
    const distance = detail.startsWith('Bullseye') ? 0 : Number(/Off by (\d+)%/.exec(detail)?.[1]);
    const points = expectedPoints(distance);
    await expect(page.locator('.points')).toHaveText(
      points === 0 ? '0 points' : new RegExp(`^\\+${points} points?$`),
    );
  });
});

test.describe('on a phone', () => {
  test('no screen of a game scrolls sideways, and every control is big enough to tap', async ({
    page,
  }) => {
    const screens: string[] = [];
    const check = async (name: string) => {
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
      screens.push(name);
    };

    await openMenu(page);
    await page.getByText('How to play').click();
    await check('menu');
    const fewer = page.getByRole('button', { name: 'One round fewer' });
    while (await fewer.isEnabled()) await fewer.click();
    await page.getByRole('button', { name: 'Play' }).click();
    await check('hand-off');
    await ready(page);
    await check('give');
    await page.getByPlaceholder('One word (or close)').fill('a very long clue indeed, quite long');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    await check('hand-off 2');
    await ready(page);
    await check('guess');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await check('result');
    await page.getByRole('button', { name: 'Continue' }).click();
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('b');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByRole('button', { name: 'See the recap' }).click();
    await check('recap');
    expect(screens).toHaveLength(7);
  });

  test('keeps the longest team names inside the screen', async ({ page }) => {
    await openMenu(page);
    await page.getByLabel('Team 1').fill('WWWWWWWWWWWWWWWWWWWW');
    await page.getByLabel('Team 2').fill('MMMMMMMMMMMMMMMMMMMM');
    await page.getByRole('button', { name: 'Play' }).click();
    expect(await noHorizontalScroll(page)).toBe(true);
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('W'.repeat(40));
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    expect(await noHorizontalScroll(page)).toBe(true);
    await ready(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(page.getByText(`“${'W'.repeat(40)}”`)).toBeVisible();
  });

  test('plays a whole game offline-clean: nothing leaves the app, nothing is logged as an error', async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    const outside: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:')) outside.push(url);
    });

    await startGame(page, 1);
    await handoffTeam(page);
    await playTurn(page, 'one', 0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await handoffTeam(page);
    await playTurn(page, 'two', 5);
    await page.getByRole('button', { name: 'See the recap' }).click();
    await expect(page.getByRole('heading', { name: 'Recap' })).toBeVisible();

    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('the colours of the teams', () => {
  test('the page takes the colour of the team holding the phone', async ({ page }) => {
    await startGame(page, 1);
    const first = await handoffTeam(page);
    const seat = await page.evaluate(() => document.body.dataset.seat);
    expect(seat).toBe(first === 'The Blues' ? '0' : '1');
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('c');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    await handoffTeam(page);
    const other = await page.evaluate(() => document.body.dataset.seat);
    expect(other).toBe(seat === '0' ? '1' : '0');
    await ready(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await handoffTeam(page);
    await ready(page);
    await page.getByPlaceholder('One word (or close)').fill('d');
    await page.getByRole('button', { name: 'Submit the clue' }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByRole('button', { name: 'See the recap' }).click();
    // At the recap the page goes back to neutral.
    expect(await page.evaluate(() => document.body.dataset.seat)).toBeUndefined();
  });
});
