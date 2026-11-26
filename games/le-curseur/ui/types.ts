import type { GameKey } from '../i18n/index.ts';

/** Translates one of this game's messages. The shell binds it to the language in use. */
export type T = (key: GameKey, params?: Readonly<Record<string, string | number>>) => string;
