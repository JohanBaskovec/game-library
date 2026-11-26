import type { LimiterDO } from './limiter-do.ts';
import type { RoomDO } from './room-do.ts';

/** What the Worker and its Durable Objects are given by Cloudflare (see `wrangler.jsonc`). */
export interface Env {
  readonly ROOMS: DurableObjectNamespace<RoomDO>;
  readonly LIMITER: DurableObjectNamespace<LimiterDO>;
  /** Origins allowed to call the API from a browser, separated by commas. Empty: any. */
  readonly ALLOWED_ORIGINS?: string;
  /** Limits, as whole numbers in text. Each has a default that fits a real site; tests lift them. */
  readonly ROOMS_PER_ADDRESS_BURST?: string;
  readonly ROOMS_PER_ADDRESS_PER_MINUTE?: string;
  readonly UNKNOWN_ROOMS_PER_ADDRESS_BURST?: string;
  readonly MESSAGES_BURST?: string;
}

/** A whole number from a variable, or the default when it is missing or not one. */
export function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
