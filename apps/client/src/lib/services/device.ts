import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

/**
 * Device features. Every one is optional: a game works without it, and a missing capability is
 * silently ignored. Games reach the device only through this service (CLAUDE.md rule 6).
 */
export interface Device {
  vibrate(milliseconds: number): void;
  /** Keep the screen on while a game is running. */
  keepAwake(on: boolean): Promise<void>;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

interface DocumentLike {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

interface NavigatorLike {
  vibrate?: (pattern: number) => boolean;
  wakeLock?: WakeLockLike;
}

export function createWebDevice(
  nav: NavigatorLike | undefined = globalThis.navigator,
  doc: DocumentLike | undefined = globalThis.document,
): Device {
  let wanted = false;
  let sentinel: WakeLockSentinelLike | undefined;

  async function acquire(): Promise<void> {
    if (sentinel || !nav?.wakeLock) return;
    try {
      sentinel = await nav.wakeLock.request('screen');
    } catch {
      sentinel = undefined; // Refused (low battery, background tab): the screen may dim.
    }
  }

  async function release(): Promise<void> {
    const held = sentinel;
    sentinel = undefined;
    try {
      await held?.release();
    } catch {
      // Already released by the system.
    }
  }

  // The system drops the lock when the page is hidden: take it again when the page comes back.
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') sentinel = undefined;
    else if (wanted) void acquire();
  });

  return {
    vibrate(milliseconds) {
      try {
        nav?.vibrate?.(milliseconds);
      } catch {
        // Not allowed in this context.
      }
    },
    async keepAwake(on) {
      wanted = on;
      await (on ? acquire() : release());
    },
  };
}

export function createNativeDevice(web: Device = createWebDevice()): Device {
  return {
    vibrate(milliseconds) {
      // Works on Android and iOS; the web vibration API does not exist on iOS.
      Haptics.vibrate({ duration: milliseconds }).catch(() => {});
    },
    keepAwake: web.keepAwake,
  };
}

export function createDevice(): Device {
  return Capacitor.isNativePlatform() ? createNativeDevice() : createWebDevice();
}
