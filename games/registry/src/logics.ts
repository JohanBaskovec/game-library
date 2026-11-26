import type { ErasedGameLogic } from '@game-library/game-kit';
import { leCurseur } from '@game-library/le-curseur/logic';
import { leCurseurManifest } from '@game-library/le-curseur/manifest';

/**
 * The rules of each game, with their types erased for code that runs any game (the room engine and the
 * hosts). This is the one place where the cast is made; the logic itself stays fully typed. Kept apart
 * from the manifests so that the app does not load every game's rules and content just to list the games.
 */
export const gameLogics: Readonly<Record<string, ErasedGameLogic>> = {
  [leCurseurManifest.id]: leCurseur as unknown as ErasedGameLogic,
};

export function findLogic(id: string): ErasedGameLogic | undefined {
  return Object.hasOwn(gameLogics, id) ? gameLogics[id] : undefined;
}
