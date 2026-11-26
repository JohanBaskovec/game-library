import { DurableObject } from 'cloudflare:workers';
import { fullBucket, takeFromBucket, type Bucket, type BucketOptions } from '@game-library/room';
import type { Env } from './env.ts';

/** The kinds of limit one address can run into. */
export type LimitName = 'create' | 'unknown';

function isBucket(value: unknown): value is Bucket {
  const bucket = value as Bucket | undefined;
  return (
    typeof bucket === 'object' &&
    bucket !== null &&
    typeof bucket.tokens === 'number' &&
    (bucket.last === null || typeof bucket.last === 'number')
  );
}

/**
 * Remembers how much one address has done recently. The Worker asks one of these per address (named by the
 * address) before it makes a room or answers a wrong room code. Each limit is a token bucket kept in storage,
 * so it survives the object sleeping; once every bucket would be full again nothing is worth keeping, and
 * an alarm erases it.
 */
export class LimiterDO extends DurableObject<Env> {
  /** Takes one token of the named limit. False when the address has used them all. */
  async take(name: LimitName, options: BucketOptions): Promise<boolean> {
    const now = Date.now();
    const saved = await this.ctx.storage.get(name);
    const result = takeFromBucket(isBucket(saved) ? saved : fullBucket(options), now, options);
    await this.ctx.storage.put(name, result.bucket);
    const secondsToFull =
      options.refillPerSecond > 0 ? options.capacity / options.refillPerSecond : 3600;
    const cleanup = now + Math.ceil(secondsToFull * 1000) + 1000;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current < cleanup) await this.ctx.storage.setAlarm(cleanup);
    return result.allowed;
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
