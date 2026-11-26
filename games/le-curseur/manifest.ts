import type { GameManifest } from '@game-library/game-kit';

export const leCurseurManifest: GameManifest = {
  id: 'le-curseur',
  // The name is the same in both languages for now (open question O-7).
  title: { fr: 'Le Curseur', en: 'Le Curseur' },
  tagline: {
    fr: 'Faites deviner une position entre deux opposés avec un seul mot.',
    en: 'Get the other team to find a spot between two opposites with a single word.',
  },
  singleDevice: true,
  contentLocales: ['fr'],
};
