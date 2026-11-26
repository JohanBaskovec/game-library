/** A fresh seed for a new game. This is the only place where the app draws unseeded randomness. */
export function newSeed(): string {
  const bytes = new Uint32Array(2);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    bytes[0] = Math.floor(Math.random() * 0x100000000);
    bytes[1] = Math.floor(Math.random() * 0x100000000);
  }
  return `${bytes[0]?.toString(36)}-${bytes[1]?.toString(36)}`;
}
