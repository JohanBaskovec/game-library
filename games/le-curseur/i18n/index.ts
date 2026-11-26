import type { Locale } from '@game-library/game-kit';
import { en, type GameKey } from './en.ts';
import { fr } from './fr.ts';

export type { GameKey } from './en.ts';

export const messages: Readonly<Record<Locale, Readonly<Record<GameKey, string>>>> = { en, fr };
