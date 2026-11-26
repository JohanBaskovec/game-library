/** Version of the rules, the order of random draws and the content lists (docs/spec.md, section 5). */
export const RULES_VERSION = 1;

/** Version of the shape of the saved state. */
export const SAVE_FORMAT = 1;

export interface ScoreBand {
  /** Largest distance (included, in percentage points of the ruler) that earns these points. */
  readonly max: number;
  readonly points: number;
}

/** Points by distance between the target and the cursor, closest first. */
export const SCORE_BANDS: readonly ScoreBand[] = Object.freeze([
  Object.freeze({ max: 3.5, points: 4 }),
  Object.freeze({ max: 7, points: 3 }),
  Object.freeze({ max: 10.5, points: 2 }),
  Object.freeze({ max: 14, points: 1 }),
]);

/** Positions on the ruler: 0 is the left idea, 100 the right one. */
export const POSITION_MIN = 0;
export const POSITION_MAX = 100;

/** Where the guessing cursor starts. */
export const DEFAULT_GUESS = 50;

/** Number of rounds a game can have. A round is one clue from each team. */
export const ROUNDS = Object.freeze({ min: 1, max: 20, default: 5 });

export const MAX_NAME_LENGTH = 20;
export const MAX_CLUE_LENGTH = 40;

/** Chance that a drawn pair is shown with its sides swapped: swapped when the draw is below this. */
export const SWAP_BELOW = 0.5;
