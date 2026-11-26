import type { Locale } from '@game-library/game-kit';
import { conceptsFr, type ConceptPair } from './fr.ts';

export type { ConceptPair } from './fr.ts';

/** Concept pairs per content language. Only French exists so far (open question O-6). */
const CONCEPTS: Readonly<Partial<Record<Locale, readonly ConceptPair[]>>> = { fr: conceptsFr };

export function conceptsFor(locale: Locale): readonly ConceptPair[] | undefined {
  return CONCEPTS[locale];
}
