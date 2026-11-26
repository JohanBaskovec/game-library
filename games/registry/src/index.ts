import type { GameManifest } from '@game-library/game-kit';
import { leCurseurManifest } from '@game-library/le-curseur/manifest';

/**
 * The list of games, with what is needed to show them: titles, descriptions, languages. Light enough for
 * the app's first screen. The rules of each game are in `@game-library/registry/logics`, for servers.
 *
 * Adding a game means creating `games/<id>/` (with its manifest, logic and `ui/index.ts`) and adding its
 * lines here and in `logics.ts`; shell code never names a specific game.
 */
export const gameManifests: readonly GameManifest[] = [leCurseurManifest];

export function findGame(id: string): GameManifest | undefined {
  return gameManifests.find((game) => game.id === id);
}
