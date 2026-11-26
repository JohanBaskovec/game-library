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
  /** Puts text on the clipboard. False when the device does not allow it. */
  copyText(text: string): Promise<boolean>;
  /** Can the device's own sharing sheet be opened? */
  canShare(): boolean;
  /** Opens the sharing sheet. False when it is not available or the player closed it. */
  share(data: { title: string; text: string; url: string }): Promise<boolean>;
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
  clipboard?: { writeText(text: string): Promise<void> };
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
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
    async copyText(text) {
      try {
        if (!nav?.clipboard) return false;
        await nav.clipboard.writeText(text);
        return true;
      } catch {
        return false; // Refused: not a secure page, or no permission.
      }
    },
    canShare() {
      return typeof nav?.share === 'function';
    },
    async share(data) {
      try {
        if (typeof nav?.share !== 'function') return false;
        await nav.share(data);
        return true;
      } catch {
        return false; // The player closed the sheet, or sharing failed.
      }
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
    copyText: web.copyText,
    canShare: web.canShare,
    share: web.share,
  };
}

export function createDevice(): Device {
  return Capacitor.isNativePlatform() ? createNativeDevice() : createWebDevice();
}
