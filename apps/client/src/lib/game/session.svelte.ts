import type { BaseView } from '@game-library/game-kit';
import type { AnyClientGame } from './client-game.ts';
import { needsHandoff, type ScreenInfo } from './handoff.ts';

/**
 * A game played on this device (single-device play): runs the game's rules here and decides when the
 * phone must be handed over. Rooms (M3) will have another session with the same shape that talks to a
 * server instead.
 */
export class LocalSession {
  /** Replaced as a whole on every action (never edited), so no deep reactivity is needed. */
  state = $state.raw<unknown>(null);
  /** True while the hand-off screen must be shown before the game's own screen. */
  handoffPending = $state(true);
  /** Code of the last refused action. */
  lastError = $state<string | null>(null);

  /** The seat that must act now. Reads `state`, so the interface follows it. */
  get seat(): number {
    return this.game.logic.activeSeat(this.state);
  }

  /** What the acting seat sees. */
  get view(): BaseView {
    return this.game.logic.view(this.state, this.seat);
  }

  get over(): boolean {
    return this.game.logic.isOver(this.state);
  }

  readonly #onChange: (state: unknown, over: boolean) => void;

  /** `state` comes from `setup` or from a restored save. A new session always starts on a hand-off. */
  constructor(
    readonly game: AnyClientGame,
    state: unknown,
    onChange: (state: unknown, over: boolean) => void,
  ) {
    this.state = state;
    this.#onChange = onChange;
  }

  /** The seat, and whether the screen it sees is secret. */
  #screen(): ScreenInfo {
    return { seat: this.seat, secret: this.view.secret };
  }

  /** The player confirms they hold the phone. */
  ready(): void {
    this.handoffPending = false;
  }

  /** Sends an action for the seat that must act. Returns false when the game refuses it. */
  send(action: unknown): boolean {
    const before = this.#screen();
    const result = this.game.logic.apply(this.state, this.seat, action, Date.now());
    if (!result.ok) {
      this.lastError = result.error;
      return false;
    }
    this.lastError = null;
    this.state = result.state;
    if (needsHandoff(before, this.#screen())) this.handoffPending = true;
    this.#onChange(this.state, this.over);
    return true;
  }
}
