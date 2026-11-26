import { nextFloat, nextInt, seedRng } from '@game-library/game-kit';
import { describe, expect, it } from 'vitest';
import { conceptsFor } from '../content/index.ts';
import { ROUNDS, SCORE_BANDS } from './constants.ts';
import { leCurseur, scoreFor, totalTurns, totals } from './game.ts';
import type { Action, Config, CurseurView, State, Team } from './types.ts';

const CONFIG: Config = { teamNames: ['Blue', 'Orange'], roundCount: 3, contentLocale: 'fr' };
const CONCEPTS = conceptsFor('fr') ?? [];

function start(seed = 'test-seed', config: Config = CONFIG): State {
  return leCurseur.setup(config, seed);
}

function turnOf(state: State) {
  const turn = state.turns[state.turns.length - 1];
  if (!turn) throw new Error('no turn');
  return turn;
}

/** Applies an action and fails the test if it is refused. */
function act(state: State, seat: number, action: Action): State {
  const result = leCurseur.apply(state, seat, action, 0);
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.state;
}

function refusal(state: State, seat: number, action: unknown): string {
  const result = leCurseur.apply(state, seat, action, 0);
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
}

/** Plays one whole turn: clue, guess at `position`, and the result is on screen. */
function playTurn(state: State, position: number): State {
  const turn = turnOf(state);
  let next = act(state, turn.giverTeam, { type: 'clue', text: 'word' });
  next = act(next, turn.guesserTeam, { type: 'guess', position });
  return next;
}

/** Plays a complete game, always guessing the middle. */
function playToTheEnd(state: State): State {
  let current = state;
  while (current.phase !== 'recap') {
    current = playTurn(current, 50);
    const guesser = turnOf(current).guesserTeam;
    current = act(current, guesser, { type: 'continue' });
  }
  return current;
}

/** Same state with the current turn's target replaced, to test the score at exact distances. */
function withTarget(state: State, target: number): State {
  const copy = JSON.parse(JSON.stringify(state)) as State;
  turnOf(copy).target = target;
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('contract', () => {
  it('describes the game', () => {
    expect(leCurseur.id).toBe('le-curseur');
    expect(leCurseur.seatCount).toBe(2);
    expect(leCurseur.rulesVersion).toBe(1);
    expect(leCurseur.saveFormat).toBe(1);
  });
});

describe('content', () => {
  it('has the 248 pairs of the original game', () => {
    expect(CONCEPTS).toHaveLength(248);
  });

  it('has no empty idea and never the same idea on both sides', () => {
    for (const [left, right] of CONCEPTS) {
      expect(left.trim()).not.toBe('');
      expect(right.trim()).not.toBe('');
      expect(left.toLowerCase()).not.toBe(right.toLowerCase());
    }
  });

  it('has no pair twice, whatever the order', () => {
    const keys = CONCEPTS.map(([a, b]) =>
      [a, b]
        .map((x) => x.toLowerCase())
        .sort()
        .join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('config', () => {
  it('has a default that needs team names before a game can start', () => {
    const config = leCurseur.defaultConfig();
    expect(config.roundCount).toBe(ROUNDS.default);
    expect(leCurseur.validateConfig(config)).toBe('empty-name');
  });

  it('builds a well-formed config from anything', () => {
    for (const input of [undefined, null, 42, 'x', [], {}, { teamNames: 'ab' }]) {
      const config = leCurseur.normalizeConfig(input);
      expect(config.teamNames).toHaveLength(2);
      expect(Number.isInteger(config.roundCount)).toBe(true);
      expect(config.contentLocale).toBe('fr');
    }
  });

  it('cleans names: whitespace collapsed, trimmed, at most 20 characters', () => {
    const config = leCurseur.normalizeConfig({
      teamNames: ['  The   Big \n Reds ', 'x'.repeat(50)],
      roundCount: 4,
    });
    expect(config.teamNames[0]).toBe('The Big Reds');
    expect(config.teamNames[1]).toBe('x'.repeat(20));
    expect(config.roundCount).toBe(4);
  });

  it('ignores a round count that is not an integer, and an unknown content language', () => {
    const config = leCurseur.normalizeConfig({
      teamNames: ['a', 'b'],
      roundCount: 2.5,
      contentLocale: 'de',
    });
    expect(config.roundCount).toBe(ROUNDS.default);
    expect(config.contentLocale).toBe('fr');
  });

  it('refuses empty or identical names, ignoring case and spacing', () => {
    expect(leCurseur.validateConfig({ ...CONFIG, teamNames: ['', 'B'] })).toBe('empty-name');
    expect(leCurseur.validateConfig({ ...CONFIG, teamNames: ['A', '   '] })).toBe('empty-name');
    expect(leCurseur.validateConfig({ ...CONFIG, teamNames: ['Reds', ' reds '] })).toBe(
      'same-name',
    );
    expect(leCurseur.validateConfig({ ...CONFIG, teamNames: ['A', 'B'] })).toBeNull();
  });

  it('accepts 1 to 20 rounds only', () => {
    for (const roundCount of [ROUNDS.min, 5, ROUNDS.max]) {
      expect(leCurseur.validateConfig({ ...CONFIG, roundCount })).toBeNull();
    }
    for (const roundCount of [0, -1, ROUNDS.max + 1, 1.5, Number.NaN]) {
      expect(leCurseur.validateConfig({ ...CONFIG, roundCount })).toBe('bad-rounds');
    }
  });

  it('refuses a content language without pairs', () => {
    expect(leCurseur.validateConfig({ ...CONFIG, contentLocale: 'en' })).toBe('no-content');
  });
});

describe('seat names', () => {
  it('are the team names, in seat order', () => {
    expect(leCurseur.seatNames(CONFIG)).toEqual(['Blue', 'Orange']);
    expect(leCurseur.seatNames(leCurseur.defaultConfig())).toEqual(['', '']);
  });
});

describe('setup', () => {
  it('starts on the first clue of the starting team', () => {
    const state = start();
    expect(state.phase).toBe('give');
    expect(state.turns).toHaveLength(1);
    expect(turnOf(state).giverTeam).toBe(state.startingTeam);
    expect(turnOf(state).guesserTeam).toBe(state.startingTeam === 0 ? 1 : 0);
    expect(state.usedPairIndexes).toEqual([turnOf(state).pairIndex]);
    expect(turnOf(state).target).toBeGreaterThanOrEqual(0);
    expect(turnOf(state).target).toBeLessThanOrEqual(100);
    expect(turnOf(state).clue).toBeNull();
  });

  it('gives the same game for the same seed and config, and another for another seed', () => {
    expect(start('same')).toEqual(start('same'));
    const targets = new Set(
      Array.from({ length: 30 }, (_, i) => turnOf(start(`seed-${i}`)).target),
    );
    expect(targets.size).toBeGreaterThan(10);
  });

  it('refuses an invalid config', () => {
    expect(() => start('x', { ...CONFIG, teamNames: ['A', 'A'] })).toThrow(/same-name/);
    expect(() => start('x', { ...CONFIG, roundCount: 0 })).toThrow(/bad-rounds/);
  });

  it('keeps a cleaned copy of the config', () => {
    const state = start('x', { ...CONFIG, teamNames: ['  Reds ', 'Greens'] });
    expect(state.config.teamNames).toEqual(['Reds', 'Greens']);
  });

  it('is plain data that survives JSON', () => {
    const state = playTurn(start(), 20);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('lets each team start, depending on the seed', () => {
    const starters = new Set(Array.from({ length: 40 }, (_, i) => start(`s${i}`).startingTeam));
    expect(starters).toEqual(new Set([0, 1]));
  });
});

describe('random draws', () => {
  // The order of draws is part of the rules (docs/spec.md, section 5): starting team, pair index,
  // swap, target. These values were computed by hand in that order.
  it.each([
    {
      seed: 'golden-1',
      starting: 1,
      index: 152,
      swapped: false,
      target: 87,
      pair: ['Joie', 'Tristesse'],
      rng: 4202191842,
    },
    {
      seed: 'golden-2',
      starting: 0,
      index: 121,
      swapped: true,
      target: 30,
      pair: ['Inconnu', 'Célèbre'],
      rng: 4185414223,
    },
  ])('keeps the documented order for $seed', (golden) => {
    const state = start(golden.seed);
    const turn = turnOf(state);
    expect(state.startingTeam).toBe(golden.starting);
    expect(turn.pairIndex).toBe(golden.index);
    expect(turn.pair).toEqual(golden.pair);
    expect(turn.target).toBe(golden.target);
    expect(state.rng.s).toBe(golden.rng);
  });

  it('draws the pair the way the spec says, whatever the seed', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `order-${i}`;
      const [starting, afterStart] = nextInt(seedRng(seed), 2);
      const [index, afterIndex] = nextInt(afterStart, CONCEPTS.length);
      const [draw, afterDraw] = nextFloat(afterIndex);
      const [target] = nextInt(afterDraw, 101);

      const state = start(seed);
      expect(state.startingTeam).toBe(starting);
      expect(turnOf(state).pairIndex).toBe(index);
      expect(turnOf(state).target).toBe(target);
      const [left, right] = CONCEPTS[index] ?? ['', ''];
      expect(turnOf(state).pair).toEqual(draw < 0.5 ? [right, left] : [left, right]);
    }
  });

  it('shows the sides both ways round', () => {
    const orders = new Set<boolean>();
    for (let i = 0; i < 40; i++) {
      const turn = turnOf(start(`swap-${i}`));
      const [left] = CONCEPTS[turn.pairIndex] ?? [''];
      orders.add(turn.pair[0] === left);
    }
    expect(orders).toEqual(new Set([true, false]));
  });
});

describe('other concepts', () => {
  it('changes the pair and keeps the target', () => {
    const state = start();
    const before = turnOf(state);
    const after = turnOf(act(state, before.giverTeam, { type: 'reroll' }));
    expect(after.pairIndex).not.toBe(before.pairIndex);
    expect(after.target).toBe(before.target);
    expect(after.rerollCount).toBe(1);
  });

  it('remembers every pair shown, including the rejected ones', () => {
    let state = start();
    const giver = turnOf(state).giverTeam;
    const first = turnOf(state).pairIndex;
    state = act(state, giver, { type: 'reroll' });
    state = act(state, giver, { type: 'reroll' });
    expect(state.usedPairIndexes).toHaveLength(3);
    expect(state.usedPairIndexes[0]).toBe(first);
  });

  it('never shows a pair twice in a game until all have been used', () => {
    let state = start();
    const giver = turnOf(state).giverTeam;
    const seen = new Set([turnOf(state).pairIndex]);
    for (let i = 1; i < CONCEPTS.length; i++) {
      state = act(state, giver, { type: 'reroll' });
      const index = turnOf(state).pairIndex;
      expect(seen.has(index), `pair ${index} came back`).toBe(false);
      seen.add(index);
    }
    expect(seen.size).toBe(CONCEPTS.length);
  });

  it('starts over once every pair has been used', () => {
    let state = start();
    const giver = turnOf(state).giverTeam;
    for (let i = 1; i < CONCEPTS.length; i++) state = act(state, giver, { type: 'reroll' });
    expect(state.usedPairIndexes).toHaveLength(CONCEPTS.length);
    state = act(state, giver, { type: 'reroll' });
    expect(state.usedPairIndexes).toHaveLength(1);
  });

  it('is only for the giver, while giving', () => {
    const state = start();
    const turn = turnOf(state);
    expect(refusal(state, turn.guesserTeam, { type: 'reroll' })).toBe('wrong-seat');
    const guessing = act(state, turn.giverTeam, { type: 'clue', text: 'x' });
    expect(refusal(guessing, turn.giverTeam, { type: 'reroll' })).toBe('wrong-phase');
  });
});

describe('clue', () => {
  it('refuses an empty clue or one made of spaces: nobody can pass', () => {
    const state = start();
    const giver = turnOf(state).giverTeam;
    for (const text of ['', ' ', '   \n\t ']) {
      expect(refusal(state, giver, { type: 'clue', text })).toBe('empty-clue');
    }
  });

  it('keeps the clue with whitespace collapsed and at most 40 characters', () => {
    const state = start();
    const giver = turnOf(state).giverTeam;
    expect(turnOf(act(state, giver, { type: 'clue', text: '  potato   salad ' })).clue).toBe(
      'potato salad',
    );
    expect(turnOf(act(state, giver, { type: 'clue', text: 'y'.repeat(100) })).clue).toBe(
      'y'.repeat(40),
    );
  });

  it('moves on to the guess', () => {
    const state = start();
    expect(act(state, turnOf(state).giverTeam, { type: 'clue', text: 'ok' }).phase).toBe('guess');
  });

  it('refuses a clue that is not text', () => {
    const state = start();
    expect(refusal(state, turnOf(state).giverTeam, { type: 'clue', text: 42 })).toBe(
      'invalid-action',
    );
    expect(refusal(state, turnOf(state).giverTeam, { type: 'clue' })).toBe('invalid-action');
  });

  it('is refused for the guessing team', () => {
    const state = start();
    expect(refusal(state, turnOf(state).guesserTeam, { type: 'clue', text: 'x' })).toBe(
      'wrong-seat',
    );
  });
});

describe('score', () => {
  it('has the original bands as named constants', () => {
    expect(SCORE_BANDS.map((band) => [band.max, band.points])).toEqual([
      [3.5, 4],
      [7, 3],
      [10.5, 2],
      [14, 1],
    ]);
  });

  it.each([
    [0, 4],
    [3, 4],
    [3.5, 4],
    [4, 3],
    [7, 3],
    [8, 2],
    [10, 2],
    [10.5, 2],
    [11, 1],
    [14, 1],
    [15, 0],
    [100, 0],
  ])('gives points for distance %s: %s', (distance, points) => {
    expect(scoreFor(distance)).toBe(points);
  });

  it.each([
    [3, 4],
    [4, 3],
    [7, 3],
    [8, 2],
    [10, 2],
    [11, 1],
    [14, 1],
    [15, 0],
  ])('scores a real guess at distance %s: %s points', (distance, points) => {
    const state = withTarget(start(), 40);
    const turn = turnOf(state);
    let next = act(state, turn.giverTeam, { type: 'clue', text: 'w' });
    next = act(next, turn.guesserTeam, { type: 'guess', position: 40 + distance });
    expect(turnOf(next).distance).toBe(distance);
    expect(turnOf(next).points).toBe(points);
    expect(next.phase).toBe('reveal');
  });

  it('measures the distance on both sides of the target', () => {
    const state = withTarget(start(), 40);
    const turn = turnOf(state);
    const guessing = act(state, turn.giverTeam, { type: 'clue', text: 'w' });
    expect(turnOf(act(guessing, turn.guesserTeam, { type: 'guess', position: 37 })).points).toBe(4);
    expect(turnOf(act(guessing, turn.guesserTeam, { type: 'guess', position: 43 })).points).toBe(4);
  });
});

describe('guess', () => {
  function guessing(): { state: State; seat: Team } {
    const state = start();
    const turn = turnOf(state);
    return {
      state: act(state, turn.giverTeam, { type: 'clue', text: 'w' }),
      seat: turn.guesserTeam,
    };
  }

  it('rounds to the nearest step and keeps the result between 0 and 100', () => {
    const { state, seat } = guessing();
    const position = (value: number) =>
      turnOf(act(state, seat, { type: 'guess', position: value })).guess;
    expect(position(49.6)).toBe(50);
    expect(position(49.4)).toBe(49);
    expect(position(-5)).toBe(0);
    expect(position(150)).toBe(100);
    expect(position(0)).toBe(0);
    expect(position(100)).toBe(100);
  });

  it('refuses anything that is not a finite number', () => {
    const { state, seat } = guessing();
    for (const position of ['50', null, undefined, Number.NaN, Infinity, -Infinity, {}]) {
      expect(refusal(state, seat, { type: 'guess', position })).toBe('invalid-action');
    }
  });

  it('is only for the guessing team, while guessing', () => {
    const { state, seat } = guessing();
    expect(refusal(state, seat === 0 ? 1 : 0, { type: 'guess', position: 50 })).toBe('wrong-seat');
    const fresh = start();
    expect(refusal(fresh, turnOf(fresh).guesserTeam, { type: 'guess', position: 50 })).toBe(
      'wrong-phase',
    );
  });
});

describe('refusals', () => {
  it('refuses actions that are not well formed', () => {
    const state = start();
    for (const action of [null, undefined, 'clue', 42, [], {}, { type: 7 }, { type: 'dance' }]) {
      expect(refusal(state, turnOf(state).giverTeam, action)).toBe('invalid-action');
    }
  });

  it('refuses a seat that does not exist', () => {
    const state = start();
    for (const seat of [2, -1, 0.5, Number.NaN]) {
      expect(refusal(state, seat, { type: 'reroll' })).toBe('wrong-seat');
    }
    expect(refusal(state, '0' as unknown as number, { type: 'reroll' })).toBe('wrong-seat');
  });

  it('refuses everything once the game is over', () => {
    const over = playToTheEnd(start());
    expect(refusal(over, 0, { type: 'continue' })).toBe('wrong-phase');
    expect(refusal(over, 1, { type: 'reroll' })).toBe('wrong-phase');
  });

  it('never changes the state it is given, nor lets a refusal change it', () => {
    const state = deepFreeze(start());
    const snapshot = JSON.stringify(state);
    const giver = turnOf(state).giverTeam;
    act(state, giver, { type: 'reroll' });
    act(state, giver, { type: 'clue', text: 'ok' });
    refusal(state, giver, { type: 'clue', text: '' });
    refusal(state, giver, { type: 'guess', position: 1 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('a whole game', () => {
  it('plays 2 clues per round and ends on the recap', () => {
    const over = playToTheEnd(start());
    expect(over.turns).toHaveLength(totalTurns(CONFIG));
    expect(over.turns).toHaveLength(6);
    expect(over.phase).toBe('recap');
    expect(leCurseur.isOver(over)).toBe(true);
    expect(over.turns.every((turn) => turn.points !== null)).toBe(true);
  });

  it('plays the minimum and the maximum number of rounds', () => {
    expect(playToTheEnd(start('min', { ...CONFIG, roundCount: 1 })).turns).toHaveLength(2);
    expect(playToTheEnd(start('max', { ...CONFIG, roundCount: 20 })).turns).toHaveLength(40);
  });

  it('alternates the teams: the one that just guessed gives the next clue', () => {
    const over = playToTheEnd(start());
    expect(over.turns[0]?.giverTeam).toBe(over.startingTeam);
    over.turns.forEach((turn, i) => {
      expect(turn.guesserTeam).not.toBe(turn.giverTeam);
      const next = over.turns[i + 1];
      if (next) expect(next.giverTeam).toBe(turn.guesserTeam);
    });
  });

  it('gives each team exactly the same number of clues', () => {
    const over = playToTheEnd(start('fair', { ...CONFIG, roundCount: 7 }));
    const clues = [0, 0];
    for (const turn of over.turns) clues[turn.giverTeam] = (clues[turn.giverTeam] ?? 0) + 1;
    expect(clues).toEqual([7, 7]);
  });

  it('never shows a pair twice', () => {
    const over = playToTheEnd(start('pairs', { ...CONFIG, roundCount: 20 }));
    const indexes = over.turns.map((turn) => turn.pairIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it('is the same game when replayed from the same seed', () => {
    expect(playToTheEnd(start('replay'))).toEqual(playToTheEnd(start('replay')));
  });

  it('keeps the last turn on screen until the result is confirmed', () => {
    const state = playTurn(start(), 50);
    expect(state.phase).toBe('reveal');
    expect(state.turns).toHaveLength(1);
    const next = act(state, turnOf(state).guesserTeam, { type: 'continue' });
    expect(next.phase).toBe('give');
    expect(next.turns).toHaveLength(2);
    expect(turnOf(next).giverTeam).toBe(turnOf(state).guesserTeam);
  });

  it('only lets the guessing team continue', () => {
    const state = playTurn(start(), 50);
    expect(refusal(state, turnOf(state).giverTeam, { type: 'continue' })).toBe('wrong-seat');
  });
});

describe('totals', () => {
  it('adds the points of every turn and splits them by role', () => {
    const over = playToTheEnd(start('totals'));
    const sum = over.turns.reduce((acc, turn) => acc + (turn.points ?? 0), 0);
    const result = totals(over);
    expect(result.total).toBe(sum);
    const [first, second] = result.byTeam;
    expect((first?.asGiver ?? 0) + (second?.asGiver ?? 0)).toBe(sum);
    expect((first?.asGuesser ?? 0) + (second?.asGuesser ?? 0)).toBe(sum);
    // What one team earns as giver, the other earns as guesser.
    expect(first?.asGiver).toBe(second?.asGuesser);
    expect(first?.asGuesser).toBe(second?.asGiver);
  });

  it('counts only the turns that have a result', () => {
    expect(totals(start()).total).toBe(0);
  });
});

describe('what each seat may see', () => {
  const state = start('views');
  const turn = turnOf(state);
  const giver = turn.giverTeam;
  const guesser = turn.guesserTeam;

  it('gives the giver the pair and the target, as a secret view, while giving', () => {
    const view = leCurseur.view(state, giver);
    expect(view.phase).toBe('give');
    expect(view.role).toBe('giver');
    expect(view.pair).toEqual(turn.pair);
    expect(view.target).toBe(turn.target);
    expect(view.secret).toBe(true);
  });

  it('shows the other team nothing about the turn while the clue is written', () => {
    const view = leCurseur.view(state, guesser);
    expect(view.role).toBe('guesser');
    expect(view.pair).toBeNull();
    expect(view.target).toBeNull();
    expect(view.clue).toBeNull();
    expect(view.secret).toBe(false);
  });

  it('never shows the guessing team the target before the result', () => {
    const guessing = act(state, giver, { type: 'clue', text: 'hint' });
    const view = leCurseur.view(guessing, guesser);
    expect(view.phase).toBe('guess');
    expect(view.pair).toEqual(turn.pair);
    expect(view.clue).toBe('hint');
    expect(view.target).toBeNull();
    expect(view.guess).toBeNull();
    expect(view.secret).toBe(false);
    expect(JSON.stringify(view)).not.toContain('"target":' + turn.target);
  });

  it('keeps the target secret for the giver while the other team guesses', () => {
    const guessing = act(state, giver, { type: 'clue', text: 'hint' });
    const view = leCurseur.view(guessing, giver);
    expect(view.target).toBe(turn.target);
    expect(view.clue).toBe('hint');
    expect(view.secret).toBe(true);
  });

  it('shows everyone the whole turn at the result', () => {
    const revealed = playTurn(state, 50);
    for (const seat of [0, 1]) {
      const view = leCurseur.view(revealed, seat);
      expect(view.phase).toBe('reveal');
      expect(view.target).toBe(turn.target);
      expect(view.guess).toBe(50);
      expect(view.distance).toBe(Math.abs(50 - turn.target));
      expect(view.points).toBe(scoreFor(Math.abs(50 - turn.target)));
      expect(view.secret).toBe(false);
    }
  });

  it('lists every turn in the recap, for everyone', () => {
    const over = playToTheEnd(state);
    const view: CurseurView = leCurseur.view(over, 0);
    expect(view.phase).toBe('recap');
    expect(view.turns).toHaveLength(6);
    expect(view.secret).toBe(false);
    expect(view.score.total).toBe(totals(over).total);
    expect(leCurseur.view(over, 1).turns).toEqual(view.turns);
  });

  it('numbers rounds and turns', () => {
    let current = start('numbers');
    const seen: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const view = leCurseur.view(current, leCurseur.activeSeat(current));
      seen.push([view.round, view.turnNumber]);
      current = act(playTurn(current, 50), turnOf(current).guesserTeam, { type: 'continue' });
    }
    expect(seen).toEqual([
      [1, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ]);
    expect(leCurseur.view(current, 0).turnCount).toBe(6);
  });

  it('refuses a seat that does not exist', () => {
    expect(() => leCurseur.view(state, 2)).toThrow(RangeError);
  });
});

describe('who acts', () => {
  it('is the giver while giving, then the guesser until the game is over', () => {
    const state = start();
    const turn = turnOf(state);
    expect(leCurseur.activeSeat(state)).toBe(turn.giverTeam);
    const guessing = act(state, turn.giverTeam, { type: 'clue', text: 'x' });
    expect(leCurseur.activeSeat(guessing)).toBe(turn.guesserTeam);
    const revealed = act(guessing, turn.guesserTeam, { type: 'guess', position: 50 });
    expect(leCurseur.activeSeat(revealed)).toBe(turn.guesserTeam);
    expect(leCurseur.isOver(revealed)).toBe(false);
  });

  it('is always the seat the game accepts an action from', () => {
    let state = start('acts');
    while (state.phase !== 'recap') {
      const seat = leCurseur.activeSeat(state);
      const other = seat === 0 ? 1 : 0;
      const action: Action =
        state.phase === 'give'
          ? { type: 'clue', text: 'w' }
          : state.phase === 'guess'
            ? { type: 'guess', position: 12 }
            : { type: 'continue' };
      expect(leCurseur.apply(state, other, action, 0).ok).toBe(false);
      state = act(state, seat, action);
    }
  });
});

describe('saved games', () => {
  function roundTrip(state: State): State | null {
    return leCurseur.restore(JSON.parse(JSON.stringify(state)));
  }

  it('restores a game in each phase, exactly', () => {
    const giving = start('save');
    const guessing = act(giving, turnOf(giving).giverTeam, { type: 'clue', text: 'w' });
    const revealed = act(guessing, turnOf(guessing).guesserTeam, { type: 'guess', position: 33 });
    const later = act(revealed, turnOf(revealed).guesserTeam, { type: 'continue' });
    for (const state of [giving, guessing, revealed, later]) {
      expect(roundTrip(state)).toEqual(state);
    }
  });

  it('continues a restored game with the same draws as the original', () => {
    const revealed = playTurn(start('continue'), 40);
    const restored = roundTrip(revealed);
    expect(restored).not.toBeNull();
    const seat = turnOf(revealed).guesserTeam;
    expect(act(restored as State, seat, { type: 'continue' })).toEqual(
      act(revealed, seat, { type: 'continue' }),
    );
  });

  it('returns a copy, not the object it was given', () => {
    const raw = JSON.parse(JSON.stringify(start('copy'))) as State;
    const restored = leCurseur.restore(raw) as State;
    expect(restored).toEqual(raw);
    expect(restored).not.toBe(raw);
    expect(restored.turns[0]).not.toBe(raw.turns[0]);
  });

  it('does not keep a finished game', () => {
    expect(roundTrip(playToTheEnd(start()))).toBeNull();
  });

  it('refuses anything that is not a saved game', () => {
    for (const input of [undefined, null, 'game', 42, [], {}, { phase: 'give' }]) {
      expect(leCurseur.restore(input)).toBeNull();
    }
  });

  describe('refuses a damaged save', () => {
    const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(start('damage')));
    const turn0 = (raw: Record<string, unknown>) =>
      (raw.turns as Record<string, unknown>[])[0] as Record<string, unknown>;

    const damages: [string, (raw: Record<string, unknown>) => void][] = [
      ['an unknown phase', (raw) => (raw.phase = 'dance')],
      ['the recap phase', (raw) => (raw.phase = 'recap')],
      ['no turn', (raw) => (raw.turns = [])],
      [
        'more turns than the game has',
        (raw) => (raw.turns = Array.from({ length: 7 }, () => turn0(raw))),
      ],
      [
        'an invalid config',
        (raw) => (raw.config = { ...(raw.config as object), teamNames: ['A', 'A'] }),
      ],
      [
        'a bad number of rounds',
        (raw) => (raw.config = { ...(raw.config as object), roundCount: 99 }),
      ],
      ['a starting team that is not 0 or 1', (raw) => (raw.startingTeam = 2)],
      ['a generator position out of range', (raw) => (raw.rng = { s: -1 })],
      ['a generator position that is not an integer', (raw) => (raw.rng = { s: 1.5 })],
      ['a missing generator', (raw) => delete raw.rng],
      ['a used pair that does not exist', (raw) => (raw.usedPairIndexes = [9999])],
      ['used pairs that are not a list', (raw) => (raw.usedPairIndexes = 'x')],
      ['a turn with the same team twice', (raw) => (turn0(raw).guesserTeam = turn0(raw).giverTeam)],
      [
        'a first giver that did not start',
        (raw) => {
          raw.startingTeam = raw.startingTeam === 0 ? 1 : 0;
        },
      ],
      ['a pair index that does not exist', (raw) => (turn0(raw).pairIndex = 9999)],
      ['a pair that does not match its index', (raw) => (turn0(raw).pair = ['Foo', 'Bar'])],
      ['a pair that is not two texts', (raw) => (turn0(raw).pair = ['Foo'])],
      ['a target out of range', (raw) => (turn0(raw).target = 101)],
      ['a target that is not an integer', (raw) => (turn0(raw).target = 12.5)],
      ['a negative reroll count', (raw) => (turn0(raw).rerollCount = -1)],
      ['a clue before the clue phase', (raw) => (turn0(raw).clue = 'early')],
      [
        'a result before the guess phase',
        (raw) => {
          turn0(raw).guess = 10;
        },
      ],
      ['a turn that is not an object', (raw) => (raw.turns = ['x'])],
    ];

    it.each(damages)('%s', (_name, damage) => {
      const raw = base();
      damage(raw);
      expect(leCurseur.restore(raw)).toBeNull();
    });

    it('a guess phase without a clue', () => {
      const raw = JSON.parse(
        JSON.stringify(act(start('x'), turnOf(start('x')).giverTeam, { type: 'clue', text: 'w' })),
      ) as Record<string, unknown>;
      turn0(raw).clue = null;
      expect(leCurseur.restore(raw)).toBeNull();
    });

    it('a result that does not add up', () => {
      const raw = JSON.parse(JSON.stringify(playTurn(start('y'), 40))) as Record<string, unknown>;
      turn0(raw).points = 0;
      turn0(raw).distance = 99;
      expect(leCurseur.restore(raw)).toBeNull();
    });

    it('an earlier turn that was never finished', () => {
      const played = act(playTurn(start('z'), 50), turnOf(playTurn(start('z'), 50)).guesserTeam, {
        type: 'continue',
      });
      const raw = JSON.parse(JSON.stringify(played)) as Record<string, unknown>;
      turn0(raw).clue = null;
      turn0(raw).guess = null;
      turn0(raw).distance = null;
      turn0(raw).points = null;
      expect(leCurseur.restore(raw)).toBeNull();
    });

    it('teams that do not alternate', () => {
      const played = act(
        playTurn(start('alt'), 50),
        turnOf(playTurn(start('alt'), 50)).guesserTeam,
        { type: 'continue' },
      );
      const raw = JSON.parse(JSON.stringify(played)) as Record<string, unknown>;
      const second = (raw.turns as Record<string, unknown>[])[1] as Record<string, unknown>;
      const giver = second.giverTeam;
      second.giverTeam = second.guesserTeam;
      second.guesserTeam = giver;
      expect(leCurseur.restore(raw)).toBeNull();
    });
  });
});
