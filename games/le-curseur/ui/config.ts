import { DEFAULT_CONTENT_LOCALE, ROUNDS, type Config } from '../logic/index.ts';
import type { T } from './types.ts';

/** The settings a new game starts from, with the team names in the language of the interface. */
export function defaultConfig(t: T): Config {
  return {
    teamNames: [t('menu.team1.default'), t('menu.team2.default')],
    roundCount: ROUNDS.default,
    contentLocale: DEFAULT_CONTENT_LOCALE,
  };
}

/** The settings used last time, with any empty team name replaced by the default one. */
export function startingConfig(saved: Config | null, t: T): Config {
  const defaults = defaultConfig(t);
  if (!saved) return defaults;
  return {
    teamNames: [
      saved.teamNames[0] || defaults.teamNames[0],
      saved.teamNames[1] || defaults.teamNames[1],
    ],
    roundCount: saved.roundCount,
    contentLocale: saved.contentLocale,
  };
}
