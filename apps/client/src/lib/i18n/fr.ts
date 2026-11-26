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
  'picker.contentIn': 'Contenu en {language}',
  'lang.fr': 'français',
  'lang.en': 'anglais',
  'play.back': 'Retour aux jeux',
  'play.loading': 'Chargement…',
  'play.error': 'Ce jeu n’a pas pu être chargé.',
  'play.notFound': 'Ce jeu n’existe pas.',
  'play.quit': 'Quitter',
  'play.quit.confirm': 'Quitter la partie en cours\u00A0? Elle sera perdue.',
  'play.quit.keep': 'Continuer à jouer',
  'play.replay': 'Rejouer',
  'play.menu': 'Menu',
  'handoff.ready': 'Prêt',
  'settings.title': 'Réglages',
  'settings.language': 'Langue',
  'settings.language.auto': 'Automatique (langue de l’appareil)',
  'settings.language.fr': 'Français',
  'settings.language.en': 'English',
  'settings.sound': 'Son',
  'settings.vibration': 'Vibrations',
  'settings.version': 'Version {version}',
};
