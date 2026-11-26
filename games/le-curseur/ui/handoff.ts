import type { Locale } from '@game-library/game-kit';
import type { CurseurView } from '../logic/index.ts';
import { scoreLine } from './format.ts';
import type { T } from './types.ts';

/** What the shell shows when the phone is passed. Nothing secret: no target, concepts or clue. */
export interface HandoffText {
  readonly seat: number;
  readonly kicker: string;
  readonly lead: string;
  readonly name: string;
  readonly role: string;
  readonly warning: string;
  readonly footer: string;
}

export function handoff(view: CurseurView, t: T, locale: Locale): HandoffText {
  const giving = view.role === 'giver';
  return {
    seat: view.seat,
    kicker: t('handoff.round', { n: view.round, total: view.roundCount }),
    lead: t('handoff.lead'),
    name: view.teamNames[view.seat],
    role: giving ? t('handoff.role.giver') : t('handoff.role.guesser'),
    warning: giving ? t('handoff.warning.giver') : '',
    footer: scoreLine(t, locale, view.score.total),
  };
}
