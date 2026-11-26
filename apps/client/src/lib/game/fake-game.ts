import type { BaseView, GameLogic, Result } from '@game-library/game-kit';

/** One screen of the fake game: who acts, and whether it shows a secret. */
export interface FakeStep {
  readonly seat: number;
  readonly secret: boolean;
}

export interface FakeState {
  step: number;
}

export interface FakeView extends BaseView {
  step: number;
}

/**
 * A tiny two-seat game for testing the shell without any real game: the action "next" moves along a
 * fixed list of screens, and each screen says which seat acts and whether it is secret.
 */
export function createFakeLogic(
  steps: readonly FakeStep[],
  id = 'fake',
): GameLogic<null, FakeState, FakeView> {
  const at = (state: FakeState): FakeStep => steps[state.step] ?? { seat: 0, secret: false };
  return {
    id,
    rulesVersion: 3,
    saveFormat: 2,
    seatCount: 2,
    defaultConfig: () => null,
    normalizeConfig: (input) => (input === 'ok' ? null : null),
    validateConfig: () => null,
    setup: () => ({ step: 0 }),
    apply(state, seat, action): Result<FakeState> {
      if (
        typeof action !== 'object' ||
        action === null ||
        (action as { type?: unknown }).type !== 'next'
      ) {
        return { ok: false, error: 'invalid-action' };
      }
      if (seat !== at(state).seat) return { ok: false, error: 'wrong-seat' };
      if (state.step >= steps.length - 1) return { ok: false, error: 'wrong-phase' };
      return { ok: true, state: { step: state.step + 1 } };
    },
    view: (state) => ({ step: state.step, secret: at(state).secret }),
    activeSeat: (state) => at(state).seat,
    isOver: (state) => state.step >= steps.length - 1,
    restore: (input) => {
      const step = (input as { step?: unknown } | null)?.step;
      return typeof step === 'number' && Number.isInteger(step) && step >= 0 && step < steps.length
        ? { step }
        : null;
    },
  };
}
