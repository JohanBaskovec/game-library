import { describe, expect, it, vi } from 'vitest';
import { createWebDevice } from './device.ts';

function fakeWakeLock() {
  const sentinel = { release: vi.fn(async () => {}) };
  const request = vi.fn(async (_type: 'screen') => sentinel);
  return { wakeLock: { request }, request, sentinel };
}

function fakeDocument() {
  let listener: (() => void) | undefined;
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_type: string, handler: () => void) => {
      listener = handler;
    },
  };
  return {
    doc,
    fire(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      listener?.();
    },
  };
}

describe('web device', () => {
  it('vibrates when the platform supports it', () => {
    const vibrate = vi.fn(() => true);
    createWebDevice({ vibrate }, undefined).vibrate(30);
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('ignores vibration when the platform lacks it or refuses', () => {
    expect(() => createWebDevice({}, undefined).vibrate(30)).not.toThrow();
    const refusing = {
      vibrate: () => {
        throw new Error('not allowed');
      },
    };
    expect(() => createWebDevice(refusing, undefined).vibrate(30)).not.toThrow();
    expect(() => createWebDevice(undefined, undefined).vibrate(30)).not.toThrow();
  });

  it('keeps the screen awake, then lets it sleep', async () => {
    const lock = fakeWakeLock();
    const device = createWebDevice(lock, undefined);
    await device.keepAwake(true);
    await device.keepAwake(true);
    expect(lock.request).toHaveBeenCalledTimes(1);
    await device.keepAwake(false);
    expect(lock.sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('ignores keep-awake when unsupported or refused', async () => {
    await expect(createWebDevice({}, undefined).keepAwake(true)).resolves.toBeUndefined();
    const refusing = {
      wakeLock: {
        request: async () => {
          throw new Error('refused');
        },
      },
    };
    await expect(createWebDevice(refusing, undefined).keepAwake(true)).resolves.toBeUndefined();
  });

  it('takes the lock again when the page becomes visible, only if still wanted', async () => {
    const lock = fakeWakeLock();
    const page = fakeDocument();
    const device = createWebDevice(lock, page.doc);

    await device.keepAwake(true);
    page.fire('hidden');
    page.fire('visible');
    await Promise.resolve();
    expect(lock.request).toHaveBeenCalledTimes(2);

    await device.keepAwake(false);
    page.fire('hidden');
    page.fire('visible');
    await Promise.resolve();
    expect(lock.request).toHaveBeenCalledTimes(2);
  });

  it('copies text to the clipboard when it can', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    const device = createWebDevice({ clipboard: { writeText } }, undefined);
    expect(await device.copyText('https://x.example/#/room/K7M2P')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x.example/#/room/K7M2P');
  });

  it('says so when it cannot copy', async () => {
    expect(await createWebDevice({}, undefined).copyText('x')).toBe(false);
    expect(await createWebDevice(undefined, undefined).copyText('x')).toBe(false);
    const refusing = {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    };
    expect(await createWebDevice(refusing, undefined).copyText('x')).toBe(false);
  });

  it('opens the sharing sheet when there is one, and says so when there is not or it is closed', async () => {
    const share = vi.fn(async (_data: object) => {});
    const device = createWebDevice({ share }, undefined);
    expect(device.canShare()).toBe(true);
    expect(await device.share({ title: 'T', text: 'X', url: 'https://x.example' })).toBe(true);
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'X', url: 'https://x.example' });

    const none = createWebDevice({}, undefined);
    expect(none.canShare()).toBe(false);
    expect(await none.share({ title: 'T', text: 'X', url: 'u' })).toBe(false);

    const closed = createWebDevice(
      {
        share: async () => {
          throw new DOMException('closed', 'AbortError');
        },
      },
      undefined,
    );
    expect(await closed.share({ title: 'T', text: 'X', url: 'u' })).toBe(false);
  });
});
