import type { GameManifest } from '@game-library/game-kit';
import { leCurseurManifest } from '@game-library/le-curseur/manifest';

/**
 * The list of games. Adding a game means creating `games/<id>/` (with its manifest, logic and
 * `ui/index.ts`) and adding one entry here; shell code never names a specific game.
 */
export const gameManifests: readonly GameManifest[] = [leCurseurManifest];

export function findGame(id: string): GameManifest | undefined {
  return gameManifests.find((game) => game.id === id);
}
