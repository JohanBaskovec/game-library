import type { Locale } from './locale.ts';

/** Index of a seat: a side of the game (a team or a player). Seat 0 is the first one. */
export type SeatId = number;

/** Outcome of an action: the new state, or an error code. Codes are never sentences (rule 7). */
export type Result<State> =
  { readonly ok: true; readonly state: State } | { readonly ok: false; readonly error: string };

/** What every view must say, whatever the game. */
export interface BaseView {
  /**
   * True when the view shows something the other seats must not see yet. On a shared phone the shell
   * uses it to decide when to show a hand-off screen (see `needsHandoff` in the client).
   */
  readonly secret: boolean;
}

/**
 * The rules of one game: plain, deterministic TypeScript (CLAUDE.md rule 1). The same contract is run
 * on the device for single-device play and on the server for rooms.
 *
 * `Config` is chosen before the game, `State` is plain JSON data and `View` is everything one seat may
 * see. A device only ever receives views, never the state. Actions arrive as untrusted `unknown`
 * data: each game defines its own action type and checks it inside `apply`.
 */
export interface GameLogic<Config, State, View extends BaseView> {
  readonly id: string;
  /** Bumped when rules, the order of random draws or content lists change. Old saves are discarded. */
  readonly rulesVersion: number;
  /** Bumped when the shape of `State` changes. Old saves are discarded. */
  readonly saveFormat: number;
  /** Number of seats, fixed for a game. */
  readonly seatCount: number;

  defaultConfig(): Config;
  /** Builds a well-formed config from untrusted data. Does not check the rules: see `validateConfig`. */
  normalizeConfig(input: unknown): Config;
  /** An error code when the config cannot start a game, otherwise null. */
  validateConfig(config: Config): string | null;

  /** Starts a game. Throws if the config is invalid. The same config and seed give the same game. */
  setup(config: Config, seed: string): State;
  /**
   * Applies an action from a seat. The action is untrusted: wrong seat, wrong moment and malformed
   * content are all refused with an error code. Never mutates `state`.
   */
  apply(state: State, seat: SeatId, action: unknown, now: number): Result<State>;
  /** Everything `seat` may see, nothing more. */
  view(state: State, seat: SeatId): View;
  /** The seat expected to act next. At the end of the game, the seat that acted last. */
  activeSeat(state: State): SeatId;
  isOver(state: State): boolean;
  /** Checks untrusted saved data and returns it as a state, or null when it is not usable. */
  restore(input: unknown): State | null;
}

/** Text per interface language. A missing language is a type error. */
export type Localized = Readonly<Record<Locale, string>>;
