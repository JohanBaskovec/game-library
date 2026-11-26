import type { Clock, Socket } from './rooms.ts';

/** A clock the test moves by hand. Timers fire, in order, as time passes. */
export class FakeClock implements Clock {
  time: number;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(start = 1_000_000) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  setTimer(at: number, callback: () => void): () => void {
    const id = this.nextId++;
    this.timers.set(id, { at, callback });
    return () => {
      this.timers.delete(id);
    };
  }

  get pendingTimers(): number {
    return this.timers.size;
  }

  /** Moves time forward, running every timer that comes due on the way. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && timer.at < nextAt) {
          nextId = id;
          nextAt = timer.at;
        }
      }
      if (nextId === null) break;
      const timer = this.timers.get(nextId);
      this.timers.delete(nextId);
      this.time = Math.max(this.time, nextAt);
      timer?.callback();
    }
    this.time = target;
  }
}

/** A socket that records what it is sent. */
export class FakeSocket implements Socket {
  readonly sent: unknown[] = [];
  closedWith: string | null = null;

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(reason: string): void {
    this.closedWith = reason;
  }

  messages(type: string): Record<string, unknown>[] {
    return this.sent.filter(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === type,
    );
  }
}
