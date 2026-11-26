import type { BaseView, Locale, RngState } from '@game-library/game-kit';

/** A team, which is also its seat: 0 is team 1, 1 is team 2. */
export type Team = 0 | 1;

export type Phase = 'give' | 'guess' | 'reveal' | 'recap';

export type Role = 'giver' | 'guesser';

export interface Config {
  readonly teamNames: readonly [string, string];
  /** A round is one clue from each team, so a game has twice as many turns. */
  readonly roundCount: number;
  /** Language of the concept pairs. */
  readonly contentLocale: Locale;
}

/** Error codes of `validateConfig`. */
export type ConfigError = 'empty-name' | 'same-name' | 'bad-rounds' | 'no-content';

export interface Turn {
  giverTeam: Team;
  guesserTeam: Team;
  pair: [string, string];
  pairIndex: number;
  target: number;
  rerollCount: number;
  clue: string | null;
  guess: number | null;
  distance: number | null;
  points: number | null;
}

export interface State {
  config: Config;
  startingTeam: Team;
  turns: Turn[];
  phase: Phase;
  usedPairIndexes: number[];
  rng: RngState;
}

export type Action =
  | { readonly type: 'reroll' }
  | { readonly type: 'clue'; readonly text: string }
  | { readonly type: 'guess'; readonly position: number }
  | { readonly type: 'continue' };

/** Error codes of `apply`. */
export type ActionError = 'invalid-action' | 'wrong-seat' | 'wrong-phase' | 'empty-clue';

export interface TeamTotals {
  readonly asGiver: number;
  readonly asGuesser: number;
}

export interface Totals {
  readonly total: number;
  readonly byTeam: readonly [TeamTotals, TeamTotals];
}

/** A finished turn, as shown in the recap. */
export interface TurnSummary {
  readonly giverTeam: Team;
  readonly guesserTeam: Team;
  readonly pair: readonly [string, string];
  readonly target: number;
  readonly clue: string;
  readonly guess: number;
  readonly distance: number;
  readonly points: number;
}

/** Everything one seat may see (docs/spec.md, section 3). */
export interface CurseurView extends BaseView {
  readonly seat: Team;
  /** The team that must act now. */
  readonly actingSeat: Team;
  readonly phase: Phase;
  /** This seat's role in the current turn. */
  readonly role: Role;
  readonly teamNames: readonly [string, string];
  readonly round: number;
  readonly roundCount: number;
  readonly turnNumber: number;
  readonly turnCount: number;
  readonly score: Totals;
  /** The two ideas, or null while this seat must not see them yet. */
  readonly pair: readonly [string, string] | null;
  readonly clue: string | null;
  /** The secret target: only the giver before the result, everybody after. */
  readonly target: number | null;
  readonly guess: number | null;
  readonly distance: number | null;
  readonly points: number | null;
  readonly rerollCount: number;
  /** Every turn, in the recap only. */
  readonly turns: readonly TurnSummary[];
}
