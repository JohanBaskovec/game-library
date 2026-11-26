import type { Locale } from '@game-library/game-kit';
import type { T } from './types.ts';

/** "One" in the sense of the language: in French 0 and 1 are singular, in English only 1. */
function isOne(locale: Locale, count: number): boolean {
  return new Intl.PluralRules(locale).select(count) === 'one';
}

export function scoreLine(t: T, locale: Locale, points: number): string {
  return t(isOne(locale, points) ? 'score.one' : 'score.other', { n: points });
}

export function totalText(t: T, locale: Locale, points: number): string {
  return t(isOne(locale, points) ? 'recap.total.one' : 'recap.total.other', { n: points });
}

/** "+3 points", "+1 point", "0 points". */
export function pointsText(t: T, points: number): string {
  if (points === 0) return t('reveal.points.zero');
  return points === 1 ? t('reveal.points.one') : t('reveal.points.other', { n: points });
}

/** "Off by 4%", or a bullseye when the answer is exact. */
export function distanceText(t: T, distance: number): string {
  return distance === 0 ? t('reveal.bullseye') : t('reveal.distance', { d: distance });
}
