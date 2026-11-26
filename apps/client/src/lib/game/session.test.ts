import { describe, expect, it, vi } from 'vitest';
import type { AnyClientGame } from './client-game.ts';
import { createFakeLogic, type FakeStep } from './fake-game.ts';
import { LocalSession } from './session.svelte.ts';

function sessionFor(steps: readonly FakeStep[]) {
  const logic = createFakeLogic(steps);
  const game = { logic } as unknown as AnyClientGame;
  const onChange = vi.fn();
  const session = new LocalSession(game, logic.setup(null, 'seed'), onChange);
  return { session, onChange };
}

const next = { type: 'next' };

describe('local session', () => {
  it('starts with a hand-off, and the player confirms they hold the phone', () => {
    const { session } = sessionFor([
      { seat: 0, secret: true },
      { seat: 1, secret: false },
    ]);
    expect(session.handoffPending).toBe(true);
    session.ready();
    expect(session.handoffPending).toBe(false);
  });

  it('shows the view of the seat that must act', () => {
    const { session } = sessionFor([
      { seat: 1, secret: true },
      { seat: 0, secret: false },
    ]);
    expect(session.seat).toBe(1);
    expect(session.view.secret).toBe(true);
    session.ready();
    session.send(next);
    expect(session.seat).toBe(0);
    expect(session.view.secret).toBe(false);
  });

  it('applies an action, tells the caller, and clears the last error', () => {
    const { session, onChange } = sessionFor([
      { seat: 0, secret: true },
      { seat: 0, secret: true },
      { seat: 0, secret: true },
    ]);
    session.ready();
    expect(session.send(next)).toBe(true);
    expect(session.state).toEqual({ step: 1 });
    expect(onChange).toHaveBeenCalledWith({ step: 1 }, false);
    expect(session.lastError).toBeNull();
  });

  it('refuses an action the game refuses, keeping the state and saving nothing', () => {
    const { session, onChange } = sessionFor([
      { seat: 0, secret: true },
      { seat: 1, secret: false },
    ]);
    session.ready();
    expect(session.send({ type: 'dance' })).toBe(false);
    expect(session.lastError).toBe('invalid-action');
    expect(session.state).toEqual({ step: 0 });
    expect(onChange).not.toHaveBeenCalled();
    expect(session.handoffPending).toBe(false);
    expect(session.send(next)).toBe(true);
    expect(session.lastError).toBeNull();
  });

  it('asks for a hand-off when the phone changes hands', () => {
    const { session } = sessionFor([
      { seat: 0, secret: true },
      { seat: 1, secret: false },
    ]);
    session.ready();
    session.send(next);
    expect(session.handoffPending).toBe(true);
  });

  it('asks for a hand-off before a secret that follows an open screen, for the same seat', () => {
    const { session } = sessionFor([
      { seat: 0, secret: true },
      { seat: 1, secret: false },
      { seat: 1, secret: false },
      { seat: 1, secret: true },
    ]);
    session.ready();
    session.send(next); // 0 -> 1: the phone changes hands
    session.ready();
    session.send(next); // 1 open -> 1 open: nothing to hide
    expect(session.handoffPending).toBe(false);
    session.send(next); // 1 open -> 1 secret: hand-off first
    expect(session.handoffPending).toBe(true);
  });

  it('does not ask for a hand-off while the same seat stays on a secret screen', () => {
    const { session } = sessionFor([
      { seat: 0, secret: true },
      { seat: 0, secret: true },
      { seat: 0, secret: false },
    ]);
    session.ready();
    session.send(next);
    expect(session.handoffPending).toBe(false);
    session.send(next);
    expect(session.handoffPending).toBe(false);
  });

  it('reports the end of the game', () => {
    const { session, onChange } = sessionFor([
      { seat: 0, secret: false },
      { seat: 0, secret: false },
    ]);
    session.ready();
    expect(session.over).toBe(false);
    session.send(next);
    expect(session.over).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({ step: 1 }, true);
    expect(session.send(next)).toBe(false);
    expect(session.lastError).toBe('wrong-phase');
  });

  it('never exposes the full state through the view', () => {
    const { session } = sessionFor([
      { seat: 0, secret: true },
      { seat: 1, secret: false },
    ]);
    expect(Object.keys(session.view).sort()).toEqual(['secret', 'step']);
  });
});
