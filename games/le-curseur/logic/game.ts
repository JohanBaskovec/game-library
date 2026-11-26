import {
  isLocale,
  nextFloat,
  nextInt,
  seedRng,
  type GameLogic,
  type Locale,
  type Result,
  type SeatId,
} from '@game-library/game-kit';
import { conceptsFor, type ConceptPair } from '../content/index.ts';
import {
  MAX_CLUE_LENGTH,
  MAX_NAME_LENGTH,
  POSITION_MAX,
  POSITION_MIN,
  ROUNDS,
  RULES_VERSION,
  SAVE_FORMAT,
  SCORE_BANDS,
  SWAP_BELOW,
} from './constants.ts';
import type {
  ActionError,
  Config,
  ConfigError,
  CurseurView,
  Phase,
  Role,
  State,
  Team,
  TeamTotals,
  Totals,
  Turn,
  TurnSummary,
} from './types.ts';

export const DEFAULT_CONTENT_LOCALE: Locale = 'fr';

const UINT32_MAX = 4294967295;

// --- Small helpers -----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collapses runs of whitespace and trims. Anything that is not text becomes an empty string. */
export function cleanText(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function isTeam(value: unknown): value is Team {
  return value === 0 || value === 1;
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function clampPosition(value: number): number {
  return Math.min(POSITION_MAX, Math.max(POSITION_MIN, Math.round(value)));
}

/** The pair at an index. The index is always valid for the loaded concepts. */
function conceptAt(concepts: readonly ConceptPair[], index: number): ConceptPair {
  const pair = concepts[index];
  if (!pair) throw new RangeError(`No concept pair at index ${index}`);
  return pair;
}

function conceptsOf(config: Config): readonly ConceptPair[] {
  const concepts = conceptsFor(config.contentLocale);
  if (!concepts) throw new RangeError(`No concepts in ${config.contentLocale}`);
  return concepts;
}

function cloneTurn(turn: Turn): Turn {
  return { ...turn, pair: [turn.pair[0], turn.pair[1]] };
}

/** Deep copy of the state, which is plain data. `apply` works on a copy and never mutates its input. */
function cloneState(state: State): State {
  return {
    config: state.config,
    startingTeam: state.startingTeam,
    turns: state.turns.map(cloneTurn),
    phase: state.phase,
    usedPairIndexes: [...state.usedPairIndexes],
    rng: { ...state.rng },
  };
}

function currentTurn(state: State): Turn {
  const turn = state.turns[state.turns.length - 1];
  if (!turn) throw new Error('A game always has a turn');
  return turn;
}

// --- Score and totals --------------------------------------------------------------------------

export function scoreFor(distance: number): number {
  for (const band of SCORE_BANDS) {
    if (distance <= band.max) return band.points;
  }
  return 0;
}

/** Number of clues in a whole game: each team gives one per round. */
export function totalTurns(config: Config): number {
  return config.roundCount * 2;
}

/** Round shown to the players (a round is one clue from each team). */
export function roundNumber(turnCount: number): number {
  return Math.ceil(turnCount / 2);
}

/** Shared score, with what each team earned as giver and as guesser. */
export function totals(state: State): Totals {
  const earned = [
    { asGiver: 0, asGuesser: 0 },
    { asGiver: 0, asGuesser: 0 },
  ];
  let total = 0;
  for (const turn of state.turns) {
    if (turn.points === null) continue;
    total += turn.points;
    const giver = earned[turn.giverTeam];
    const guesser = earned[turn.guesserTeam];
    if (giver) giver.asGiver += turn.points;
    if (guesser) guesser.asGuesser += turn.points;
  }
  return { total, byTeam: [earned[0] as TeamTotals, earned[1] as TeamTotals] };
}

// --- Config ------------------------------------------------------------------------------------

function defaultConfig(): Config {
  // Team names are the players' own text; the menu fills in translated defaults.
  return { teamNames: ['', ''], roundCount: ROUNDS.default, contentLocale: DEFAULT_CONTENT_LOCALE };
}

function normalizeConfig(input: unknown): Config {
  const data = isRecord(input) ? input : {};
  const names = Array.isArray(data.teamNames) ? data.teamNames : [];
  const cleaned = [0, 1].map((i) => cleanText(names[i]).slice(0, MAX_NAME_LENGTH));
  const contentLocale =
    isLocale(data.contentLocale) && conceptsFor(data.contentLocale)
      ? data.contentLocale
      : DEFAULT_CONTENT_LOCALE;
  return {
    teamNames: [cleaned[0] ?? '', cleaned[1] ?? ''],
    roundCount: Number.isInteger(data.roundCount) ? (data.roundCount as number) : ROUNDS.default,
    contentLocale,
  };
}

function validateConfig(config: Config): ConfigError | null {
  const names = config.teamNames.map(cleanText);
  if (names.length !== 2 || names.some((name) => !name)) return 'empty-name';
  if ((names[0] as string).toLowerCase() === (names[1] as string).toLowerCase()) return 'same-name';
  if (!isIntegerIn(config.roundCount, ROUNDS.min, ROUNDS.max)) return 'bad-rounds';
  if (!conceptsFor(config.contentLocale)) return 'no-content';
  return null;
}

// --- Drawing (the order of draws is part of the rules: docs/spec.md, section 5) -----------------

/** Draws an unused pair (then whether to swap its sides) and marks it used. */
function drawPair(
  state: State,
  concepts: readonly ConceptPair[],
): { index: number; pair: [string, string] } {
  const used = new Set(state.usedPairIndexes);
  let available: number[] = [];
  for (let i = 0; i < concepts.length; i++) {
    if (!used.has(i)) available.push(i);
  }
  if (available.length === 0) {
    state.usedPairIndexes = [];
    available = concepts.map((_, i) => i);
  }

  const [position, afterIndex] = nextInt(state.rng, available.length);
  const index = available[position] as number;
  state.usedPairIndexes.push(index);

  const [swapDraw, afterSwap] = nextFloat(afterIndex);
  state.rng = afterSwap;
  const [left, right] = conceptAt(concepts, index);
  return { index, pair: swapDraw < SWAP_BELOW ? [right, left] : [left, right] };
}

/** Starts a turn: pair, then target. Works on a state the caller owns. */
function startTurn(state: State, giverTeam: Team): void {
  const { index, pair } = drawPair(state, conceptsOf(state.config));
  const [offset, afterTarget] = nextInt(state.rng, POSITION_MAX - POSITION_MIN + 1);
  state.rng = afterTarget;
  state.turns.push({
    giverTeam,
    guesserTeam: giverTeam === 0 ? 1 : 0,
    pair,
    pairIndex: index,
    target: POSITION_MIN + offset,
    rerollCount: 0,
    clue: null,
    guess: null,
    distance: null,
    points: null,
  });
  state.phase = 'give';
}

function setup(config: Config, seed: string): State {
  const error = validateConfig(config);
  if (error) throw new Error(`Invalid Le Curseur config: ${error}`);
  const [startingTeam, rng] = nextInt(seedRng(seed), 2);
  const state: State = {
    config: normalizeConfig(config),
    startingTeam: startingTeam === 0 ? 0 : 1,
    turns: [],
    phase: 'give',
    usedPairIndexes: [],
    rng,
  };
  startTurn(state, state.startingTeam);
  return state;
}

// --- Actions -----------------------------------------------------------------------------------

function fail(error: ActionError): Result<State> {
  return { ok: false, error };
}

function apply(state: State, seat: SeatId, action: unknown, _now: number): Result<State> {
  if (!isRecord(action) || typeof action.type !== 'string') return fail('invalid-action');
  if (!isTeam(seat)) return fail('wrong-seat');
  if (state.phase === 'recap') return fail('wrong-phase');

  const turn = currentTurn(state);
  // The phase is checked before the seat: during `give`, a guesser asking for a reroll is refused as
  // "wrong-seat", and a giver asking for a guess is refused as "wrong-phase".
  switch (action.type) {
    case 'reroll': {
      if (state.phase !== 'give') return fail('wrong-phase');
      if (seat !== turn.giverTeam) return fail('wrong-seat');
      const next = cloneState(state);
      const { index, pair } = drawPair(next, conceptsOf(next.config));
      const nextTurn = currentTurn(next);
      nextTurn.pair = pair;
      nextTurn.pairIndex = index;
      nextTurn.rerollCount += 1;
      return { ok: true, state: next };
    }
    case 'clue': {
      if (state.phase !== 'give') return fail('wrong-phase');
      if (seat !== turn.giverTeam) return fail('wrong-seat');
      if (typeof action.text !== 'string') return fail('invalid-action');
      const clue = cleanText(action.text).slice(0, MAX_CLUE_LENGTH);
      if (!clue) return fail('empty-clue');
      const next = cloneState(state);
      currentTurn(next).clue = clue;
      next.phase = 'guess';
      return { ok: true, state: next };
    }
    case 'guess': {
      if (state.phase !== 'guess') return fail('wrong-phase');
      if (seat !== turn.guesserTeam) return fail('wrong-seat');
      if (typeof action.position !== 'number' || !Number.isFinite(action.position)) {
        return fail('invalid-action');
      }
      const next = cloneState(state);
      const nextTurn = currentTurn(next);
      nextTurn.guess = clampPosition(action.position);
      nextTurn.distance = Math.abs(nextTurn.guess - nextTurn.target);
      nextTurn.points = scoreFor(nextTurn.distance);
      next.phase = 'reveal';
      return { ok: true, state: next };
    }
    case 'continue': {
      if (state.phase !== 'reveal') return fail('wrong-phase');
      if (seat !== turn.guesserTeam) return fail('wrong-seat');
      const next = cloneState(state);
      if (next.turns.length >= totalTurns(next.config)) {
        next.phase = 'recap';
      } else {
        // The team that just guessed gives the next clue.
        startTurn(next, turn.guesserTeam);
      }
      return { ok: true, state: next };
    }
    default:
      return fail('invalid-action');
  }
}

// --- Views -------------------------------------------------------------------------------------

function activeSeat(state: State): Team {
  const turn = currentTurn(state);
  return state.phase === 'give' ? turn.giverTeam : turn.guesserTeam;
}

function summarize(turn: Turn): TurnSummary | null {
  if (turn.clue === null || turn.guess === null || turn.distance === null || turn.points === null) {
    return null;
  }
  return {
    giverTeam: turn.giverTeam,
    guesserTeam: turn.guesserTeam,
    pair: [turn.pair[0], turn.pair[1]],
    target: turn.target,
    clue: turn.clue,
    guess: turn.guess,
    distance: turn.distance,
    points: turn.points,
  };
}

function view(state: State, seat: SeatId): CurseurView {
  if (!isTeam(seat)) throw new RangeError(`Le Curseur has two seats, got ${seat}`);
  const turn = currentTurn(state);
  const role: Role = seat === turn.giverTeam ? 'giver' : 'guesser';
  const base = {
    seat,
    actingSeat: activeSeat(state),
    phase: state.phase,
    role,
    teamNames: state.config.teamNames,
    round: roundNumber(state.turns.length),
    roundCount: state.config.roundCount,
    turnNumber: state.turns.length,
    turnCount: totalTurns(state.config),
    score: totals(state),
    rerollCount: turn.rerollCount,
  };
  const none = { pair: null, clue: null, target: null, guess: null, distance: null, points: null };

  switch (state.phase) {
    case 'give':
      // Only the giver sees the turn, and it contains the target: a secret view.
      return role === 'giver'
        ? { ...base, ...none, secret: true, pair: turn.pair, target: turn.target, turns: [] }
        : { ...base, ...none, secret: false, turns: [] };
    case 'guess':
      return role === 'giver'
        ? {
            ...base,
            ...none,
            secret: true,
            pair: turn.pair,
            clue: turn.clue,
            target: turn.target,
            turns: [],
          }
        : { ...base, ...none, secret: false, pair: turn.pair, clue: turn.clue, turns: [] };
    case 'reveal':
      return {
        ...base,
        secret: false,
        pair: turn.pair,
        clue: turn.clue,
        target: turn.target,
        guess: turn.guess,
        distance: turn.distance,
        points: turn.points,
        turns: [],
      };
    case 'recap':
      return {
        ...base,
        ...none,
        secret: false,
        turns: state.turns.flatMap((t) => summarize(t) ?? []),
      };
  }
}

// --- Saved games -------------------------------------------------------------------------------

/** A turn that was played to the end must be complete and consistent. */
function isFinishedTurn(turn: Turn): boolean {
  return (
    typeof turn.clue === 'string' &&
    turn.clue !== '' &&
    turn.guess !== null &&
    turn.distance === Math.abs(turn.guess - turn.target) &&
    turn.points === scoreFor(turn.distance)
  );
}

function restoreTurn(input: unknown, concepts: readonly ConceptPair[]): Turn | null {
  if (!isRecord(input)) return null;
  const {
    giverTeam,
    guesserTeam,
    pair,
    pairIndex,
    target,
    rerollCount,
    clue,
    guess,
    distance,
    points,
  } = input;
  if (!isTeam(giverTeam) || !isTeam(guesserTeam) || giverTeam === guesserTeam) return null;
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    typeof pair[0] !== 'string' ||
    typeof pair[1] !== 'string'
  ) {
    return null;
  }
  if (!isIntegerIn(pairIndex, 0, concepts.length - 1)) return null;
  const [left, right] = conceptAt(concepts, pairIndex);
  const sameOrder = pair[0] === left && pair[1] === right;
  const swapped = pair[0] === right && pair[1] === left;
  if (!sameOrder && !swapped) return null;
  if (!isIntegerIn(target, POSITION_MIN, POSITION_MAX)) return null;
  if (!isIntegerIn(rerollCount, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (clue !== null && typeof clue !== 'string') return null;
  if (guess !== null && !isIntegerIn(guess, POSITION_MIN, POSITION_MAX)) return null;
  if (distance !== null && !isIntegerIn(distance, 0, POSITION_MAX - POSITION_MIN)) return null;
  if (points !== null && !isIntegerIn(points, 0, SCORE_BANDS[0]?.points ?? 0)) return null;
  return {
    giverTeam,
    guesserTeam,
    pair: [pair[0], pair[1]],
    pairIndex,
    target,
    rerollCount,
    clue: clue as string | null,
    guess: guess as number | null,
    distance: distance as number | null,
    points: points as number | null,
  };
}

function restore(input: unknown): State | null {
  if (!isRecord(input)) return null;
  const config = normalizeConfig(input.config);
  if (validateConfig(config) !== null) return null;
  const concepts = conceptsOf(config);

  const { phase, startingTeam, turns, usedPairIndexes, rng } = input;
  // A game that reached the recap is not kept (docs/spec.md, section 6).
  if (phase !== 'give' && phase !== 'guess' && phase !== 'reveal') return null;
  if (!isTeam(startingTeam)) return null;
  if (!Array.isArray(turns) || turns.length < 1 || turns.length > totalTurns(config)) return null;
  if (
    !Array.isArray(usedPairIndexes) ||
    !usedPairIndexes.every((i) => isIntegerIn(i, 0, concepts.length - 1))
  ) {
    return null;
  }
  if (!isRecord(rng) || !isIntegerIn(rng.s, 0, UINT32_MAX)) return null;

  const restored: Turn[] = [];
  for (const raw of turns) {
    const turn = restoreTurn(raw, concepts);
    if (!turn) return null;
    restored.push(turn);
  }

  // Teams alternate: the first giver starts, then the last guesser gives the next clue.
  for (let i = 0; i < restored.length; i++) {
    const turn = restored[i] as Turn;
    const expectedGiver = i === 0 ? startingTeam : (restored[i - 1] as Turn).guesserTeam;
    if (turn.giverTeam !== expectedGiver) return null;
    if (i < restored.length - 1 && !isFinishedTurn(turn)) return null;
  }

  // The last turn must agree with the phase.
  const last = restored[restored.length - 1] as Turn;
  const consistent =
    phase === 'give'
      ? last.clue === null && last.guess === null && last.distance === null && last.points === null
      : phase === 'guess'
        ? typeof last.clue === 'string' &&
          last.clue !== '' &&
          last.guess === null &&
          last.distance === null &&
          last.points === null
        : isFinishedTurn(last);
  if (!consistent) return null;

  return {
    config,
    startingTeam,
    turns: restored,
    phase: phase as Phase,
    usedPairIndexes: [...usedPairIndexes] as number[],
    rng: { s: rng.s },
  };
}

// --- The game ----------------------------------------------------------------------------------

export const leCurseur: GameLogic<Config, State, CurseurView> = {
  id: 'le-curseur',
  rulesVersion: RULES_VERSION,
  saveFormat: SAVE_FORMAT,
  seatCount: 2,
  defaultConfig,
  normalizeConfig,
  validateConfig,
  setup,
  apply,
  view,
  activeSeat,
  isOver: (state) => state.phase === 'recap',
  restore,
};
