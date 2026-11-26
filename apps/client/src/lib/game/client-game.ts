import type { Component } from 'svelte';
import type { BaseView, GameLogic, Locale } from '@game-library/game-kit';
import type { MessageParams } from '../i18n/core.ts';

/** A translate function bound to the language in use. */
export type Translate = (key: string, params?: MessageParams) => string;

/** What a game's interface gives the shell. Games never import shell code: the shell passes it all in. */
export interface HandoffInfo {
  /** Seat that receives the phone, for its colour. */
  readonly seat: number;
  /** Small line above, e.g. "Round 2 / 5". */
  readonly kicker: string;
  /** Short lead-in, e.g. "Next up". */
  readonly lead: string;
  /** Name of the team or player, shown very large. */
  readonly name: string;
  /** What they are about to do. */
  readonly role: string;
  /** Warning for the others, or an empty string. */
  readonly warning: string;
  /** Small line below, e.g. the score. */
  readonly footer: string;
}

export interface MenuProps<Config> {
  t: Translate;
  locale: Locale;
  /** Settings to start from: the ones used last time, or null. */
  savedConfig: Config | null;
  canResume: boolean;
  onStart: (config: Config) => void;
  onResume: () => void;
}

export interface ScreenProps<View> {
  t: Translate;
  locale: Locale;
  view: View;
  send: (action: unknown) => void;
  /** Code of the last refused action, or null. */
  error: string | null;
}

export interface ClientGame<Config, State, View extends BaseView> {
  readonly logic: GameLogic<Config, State, View>;
  /** Interface text of the game, per language. */
  readonly messages: Readonly<Record<Locale, Readonly<Record<string, string>>>>;
  readonly Menu: Component<MenuProps<Config>>;
  /** The playing screens (everything but the hand-off, the frame and the end-of-game buttons). */
  readonly Screen: Component<ScreenProps<View>>;
  handoff(view: View, t: Translate, locale: Locale): HandoffInfo;
}

/**
 * A game with its types erased, for the shell, which handles any game. The one place where the
 * generics are given up: each game is fully typed on its own side.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClientGame = ClientGame<any, any, any>;

/** Loaders of every game's interface, found by their position: `games/<id>/ui/index.ts`. */
const loaders = import.meta.glob<{ clientGame: AnyClientGame }>(
  '../../../../../games/*/ui/index.ts',
);

function idFromPath(path: string): string | undefined {
  return /\/games\/([^/]+)\/ui\/index\.ts$/.exec(path)?.[1];
}

/** Ids of the games whose interface is present. */
export function clientGameIds(): string[] {
  return Object.keys(loaders).flatMap((path) => idFromPath(path) ?? []);
}

/** Loads a game's interface on demand, so the picker stays light as the library grows. */
export async function loadClientGame(id: string): Promise<AnyClientGame | null> {
  const entry = Object.entries(loaders).find(([path]) => idFromPath(path) === id);
  if (!entry) return null;
  const module = await entry[1]();
  return module.clientGame;
}
