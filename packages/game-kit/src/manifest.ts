import type { Locale } from './locale.ts';

/**
 * What the shell knows about a game without loading it. Deliberately minimal: it grows with the
 * game contract in milestone M2 (see docs/ARCHITECTURE.md, section 4.1).
 */
export interface GameManifest {
  /** Stable key used for folders, storage and room messages, e.g. "le-curseur". */
  readonly id: string;
  /** Can the game be played on one shared phone (D-8)? */
  readonly singleDevice: boolean;
  /** Languages the game's content (word lists, concept pairs) exists in (D-6). */
  readonly contentLocales: readonly Locale[];
}

const GAME_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isValidGameId(id: string): boolean {
  return GAME_ID_PATTERN.test(id);
}
