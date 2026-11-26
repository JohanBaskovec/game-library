/** Counts of open things per key (sockets per address), never below zero. */
export class Counter {
  private readonly counts = new Map<string, number>();

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  increment(key: string): void {
    this.counts.set(key, this.get(key) + 1);
  }

  decrement(key: string): void {
    const next = this.get(key) - 1;
    if (next <= 0) this.counts.delete(key);
    else this.counts.set(key, next);
  }

  get size(): number {
    return this.counts.size;
  }
}
