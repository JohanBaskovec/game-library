import { PROTOCOL_VERSION, type RoomView, type ServerMessage } from '@game-library/room';

/** What the session needs from a WebSocket. The browser's, or a fake in tests. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

/** Calls `callback` after `ms`. Returns a function that cancels it. */
export type Schedule = (callback: () => void, ms: number) => () => void;

export function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') socket.onmessage?.(event.data);
  };
  ws.onclose = (event) => socket.onclose?.(event.code, event.reason);
  ws.onerror = () => {}; // The close event follows an error.
  return socket;
}

const browserSchedule: Schedule = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

/** Errors after which trying again cannot help: the room is gone, or this app and the server disagree. */
export const FATAL_ERRORS: readonly string[] = [
  'room-not-found',
  'room-closed',
  'protocol-mismatch',
  'rules-mismatch',
  'room-full',
  'bad-name',
];

export type SessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** The game as this device's seat sees it. */
export interface PlayState {
  readonly seat: number;
  readonly actingSeat: number;
  readonly over: boolean;
  readonly view: unknown;
}

export interface SessionOptions {
  /** Room code, in upper case. */
  readonly code: string;
  /** Base of the room sockets, e.g. `wss://games.example`. */
  readonly wsBase: string;
  readonly name: string;
  /** The device's secret from an earlier visit, if it has one. */
  readonly token: string | null;
  /** The rules version of the game that this app has, if the server should check it when joining. */
  readonly rules?: number;
  readonly createSocket?: SocketFactory;
  readonly schedule?: Schedule;
  readonly random?: () => number;
  /** The server gave this device its secret: keep it, so that it can come back. */
  readonly onToken?: (token: string) => void;
  /** This device can never come back to the room (it left, or the room is gone): forget the secret. */
  readonly onGone?: (reason: string) => void;
}

const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 8000;

/**
 * This device's connection to one room (docs/ARCHITECTURE.md, section 6). It joins, keeps the latest room
 * and view the server sent, sends the player's actions, and reconnects by itself when the connection
 * drops: the stored secret brings the device back to the same seat.
 */
export class RemoteSession {
  readonly code: string;
  status = $state<SessionStatus>('connecting');
  room = $state.raw<RoomView | null>(null);
  play = $state.raw<PlayState | null>(null);
  /** Why the session ended for good, or null. */
  error = $state<string | null>(null);
  /** The last thing the server refused that was not the end of the session (e.g. "not-host"). */
  problem = $state<string | null>(null);
  /** The last action the game refused. */
  refused = $state<string | null>(null);

  readonly #options: SessionOptions;
  readonly #createSocket: SocketFactory;
  readonly #schedule: Schedule;
  readonly #random: () => number;
  #token: string | null;
  #socket: SocketLike | null = null;
  #cancelRetry: (() => void) | null = null;
  #attempts = 0;
  #lastVersion = 0;
  #stopped = false;

  constructor(options: SessionOptions) {
    this.code = options.code;
    this.#options = options;
    this.#token = options.token;
    this.#createSocket = options.createSocket ?? browserSocket;
    this.#schedule = options.schedule ?? browserSchedule;
    this.#random = options.random ?? Math.random;
  }

  /** Opens the connection. Call once. */
  connect(): void {
    this.#open();
  }

  /** Closes the connection but stays a member of the room: the device can come back. */
  close(): void {
    this.#stopped = true;
    this.#cancelRetry?.();
    this.#cancelRetry = null;
    this.#socket?.close();
    this.#socket = null;
    if (this.status !== 'closed') this.status = 'closed';
  }

  /** Leaves the room for good: the seat is freed and the secret forgotten. */
  leave(): void {
    this.#send({ type: 'leave' });
    this.#options.onGone?.('left');
    this.close();
  }

  /** Tries again at once, if the connection is down: for when the network or the page comes back. */
  nudge(): void {
    if (this.status !== 'reconnecting' || this.#cancelRetry === null) return;
    this.#cancelRetry();
    this.#cancelRetry = null;
    this.#open();
  }

  takeSeat(seat: number | null): boolean {
    return this.#send({ type: 'seat', seat });
  }

  setConfig(config: unknown): boolean {
    return this.#send({ type: 'config', config });
  }

  start(): boolean {
    return this.#send({ type: 'start' });
  }

  act(action: unknown): boolean {
    return this.#send({ type: 'action', action });
  }

  /** The host takes everyone back to the lobby. */
  reset(): boolean {
    return this.#send({ type: 'reset' });
  }

  #send(message: unknown): boolean {
    if (!this.#socket || this.status !== 'open') return false;
    this.#socket.send(JSON.stringify(message));
    return true;
  }

  #open(): void {
    if (this.#stopped) return;
    const socket = this.#createSocket(`${this.#options.wsBase}/api/rooms/${this.code}/ws`);
    this.#socket = socket;

    socket.onopen = () => {
      if (socket !== this.#socket) return;
      socket.send(
        JSON.stringify({
          type: 'join',
          protocol: PROTOCOL_VERSION,
          name: this.#options.name,
          ...(this.#options.rules === undefined ? {} : { rules: this.#options.rules }),
          ...(this.#token === null ? {} : { token: this.#token }),
        }),
      );
    };
    socket.onmessage = (data) => {
      if (socket !== this.#socket) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch {
        return;
      }
      this.#receive(message);
    };
    socket.onclose = (_code, reason) => {
      if (socket !== this.#socket) return;
      this.#socket = null;
      this.#lost(reason);
    };
  }

  #receive(message: ServerMessage): void {
    switch (message.type) {
      case 'joined':
        this.#token = message.token;
        this.#attempts = 0;
        this.status = 'open';
        this.problem = null;
        this.#options.onToken?.(message.token);
        return;
      case 'room':
        if (message.v < this.#lastVersion) return; // Older than what we already show.
        this.#lastVersion = message.v;
        this.room = message.room;
        if (message.room.phase === 'lobby') this.play = null;
        return;
      case 'view':
        if (message.v < (this.#viewVersion ?? 0)) return;
        this.#viewVersion = message.v;
        this.play = {
          seat: message.seat,
          actingSeat: message.actingSeat,
          over: message.over,
          view: message.view,
        };
        this.refused = null;
        return;
      case 'refused':
        this.refused = message.error;
        return;
      case 'error':
        if (FATAL_ERRORS.includes(message.code)) this.#fail(message.code);
        else this.problem = message.code;
        return;
    }
  }

  #viewVersion: number | null = null;

  /** The connection ended without the room saying why. */
  #lost(reason: string): void {
    if (this.#stopped || this.error !== null) return;
    if (reason === 'room-closed') return this.#fail('room-closed');
    if (reason === 'left') return this.close();
    this.status = 'reconnecting';
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** this.#attempts);
    this.#attempts += 1;
    // A little jitter, so that many devices that lost the server together do not return together.
    const delay = Math.round(base * (0.8 + 0.4 * this.#random()));
    this.#cancelRetry = this.#schedule(() => {
      this.#cancelRetry = null;
      this.#open();
    }, delay);
  }

  #fail(code: string): void {
    this.error = code;
    if (code === 'room-not-found' || code === 'room-closed') this.#options.onGone?.(code);
    this.close();
  }
}
