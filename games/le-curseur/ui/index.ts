import { messages } from '../i18n/index.ts';
import { leCurseur } from '../logic/index.ts';
import { defaultConfig } from './config.ts';
import ConfigEditor from './ConfigEditor.svelte';
import { handoff } from './handoff.ts';
import Menu from './Menu.svelte';
import Screen from './Screen.svelte';

/**
 * What the shell loads to run the game. It is found by its place, `games/<id>/ui/index.ts`, and loaded
 * only when the player opens the game.
 */
export const clientGame = {
  logic: leCurseur,
  messages,
  Menu,
  ConfigEditor,
  Screen,
  handoff,
  defaultConfig,
};
