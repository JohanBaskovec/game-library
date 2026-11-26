/** English interface text. The keys of this object define the keys every language must provide. */
export const en = {
  'app.title': 'Game Library',
  'nav.label': 'Main navigation',
  'nav.games': 'Games',
  'nav.settings': 'Settings',
  'picker.title': 'Games',
  'picker.empty.title': 'No games yet',
  'picker.empty.body': 'Games will appear here as they are added to the library.',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.language.auto': 'Automatic (device language)',
  'settings.language.fr': 'Français',
  'settings.language.en': 'English',
  'settings.sound': 'Sound',
  'settings.vibration': 'Vibration',
  'settings.version': 'Version {version}',
} as const;

export type MessageKey = keyof typeof en;
