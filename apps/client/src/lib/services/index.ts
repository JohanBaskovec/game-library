import { createDevice } from './device.ts';
import { createJsonStore, createStorage } from './storage.ts';

/** Prefix of every key the app writes, so the library never collides with other data. */
export const STORAGE_PREFIX = 'gl.';

export const storage = createStorage();
export const json = createJsonStore(storage, STORAGE_PREFIX);
export const device = createDevice();
