import type { Locale, ReadonlyLocales } from './locale.ts';
import type { Localized } from './contract.ts';

/**
 * What the shell knows about a game without loading it: enough to list it in the picker. Plain data, safe
 * for the server too.
 */
export interface GameManifest {
  /** Stable key used for folders, storage and room messages, e.g. "le-curseur". */
  readonly id: string;
  /** Name shown in the picker and in the game's frame. */
  readonly title: Localized;
  /** One short line shown under the title in the picker. */
  readonly tagline: Localized;
  /** Can the game be played on one shared phone (D-8)? */
  readonly singleDevice: boolean;
  /** Languages the game's content (word lists, concept pairs) exists in (D-6). */
  readonly contentLocales: ReadonlyLocales;
}

export type { Locale };

const GAME_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isValidGameId(id: string): boolean {
  return GAME_ID_PATTERN.test(id);
}
