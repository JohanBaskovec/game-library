import type { MessageKey } from './en.ts';

/** French interface text. A missing or extra key is a type error. */
export const fr: Record<MessageKey, string> = {
  'app.title': 'Bibliothèque de jeux',
  'nav.label': 'Navigation principale',
  'nav.games': 'Jeux',
  'nav.settings': 'Réglages',
  'picker.title': 'Jeux',
  'picker.empty.title': 'Pas encore de jeux',
  'picker.empty.body':
    'Les jeux apparaîtront ici à mesure qu’ils seront ajoutés à la bibliothèque.',
  'settings.title': 'Réglages',
  'settings.language': 'Langue',
  'settings.language.auto': 'Automatique (langue de l’appareil)',
  'settings.language.fr': 'Français',
  'settings.language.en': 'English',
  'settings.sound': 'Son',
  'settings.vibration': 'Vibrations',
  'settings.version': 'Version {version}',
};
