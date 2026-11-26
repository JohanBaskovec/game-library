# Architecture

How the parts fit together. References such as **D-5** or **P-3** point to rows of
[`DECISIONS.md`](DECISIONS.md); "P" rows are proposals not yet confirmed by the user.

Nothing described here is built yet. Type sketches show the intended shape; the exact interfaces are
fixed when the first game is ported (milestone M2) and this document is then updated to match the code.

## 1. Overview

```
            ┌───────────────────────── client (Svelte + Vite) ─────────────────────────┐
            │  shell: picker · settings · lobby · hand-off screen · services          │
            │  game UI (Svelte) ── renders a View, sends Actions ── session            │
            │                                             ┌──────────┴──────────┐      │
            │                                      local session         remote session│
            │                                   (runs logic here)        (WebSocket)   │
            └─────────────────────────────────────────┬──────────────────────┬─────────┘
                                                      │                      │
                                              games/<id>/logic        ┌──────▼───────┐
                                              (plain TypeScript) ◀────│ room engine  │
                                                                      │ (host-neutral)│
                                                                      └──┬─────────┬─┘
                                                              Node.js host     Cloudflare host
```

- The **client** is one static web build. The website serves it; Capacitor packages the same files into
  the native app.
- A **game** is a logic module (plain TypeScript) and a set of Svelte screens.
- A **session** is what a game's interface talks to. It has two implementations with the same
  interface: a local one that runs the logic on the device, and a remote one that talks to a room.
- The **room engine** runs the same logic modules on the server for multi-device play. It is written
  once and wrapped by two hosts (D-11).

## 2. Ways to play

| Mode | Devices | Where the logic runs | Network |
|---|---|---|---|
| Single device | One phone, passed around | On the device (local session) | None |
| Room, players together | Several | On the server (room engine) | Required (D-9) |
| Room, players apart | Several | On the server (room engine) | Required |

The two room rows are technically identical: same code, same joining flow. Every game supports rooms.
Single-device play is declared per game; the three current games support it (D-8).

## 3. Repository layout (D-14)

```
apps/
  client/              Shell, routing, services, Capacitor config, android/ (later ios/)
  server-node/         Node.js host
  server-cloudflare/   Cloudflare Workers + Durable Objects host
packages/
  game-kit/            Game contract types, seeded random generator, shared pure helpers
  room/                Room engine and wire protocol types
  host-conformance/    The suite every server host must pass (HTTP API and room protocol), run by each host's tests
games/
  <id>/                One npm workspace per game: @game-library/<id>
    manifest.ts        Title, tagline, languages: enough to list the game
    logic/             Rules and state. Plain TypeScript, compiled without DOM types.
    ui/                Svelte screens. Client only.
    content/           Word lists, concept pairs: data per content language
    i18n/              Interface text per language
    docs/              rules.md and spec.md
  registry/            The list of games (their manifests)
docs/
```

Created so far (M1 to M4): `apps/client`, `apps/server-node`, `apps/server-cloudflare`, `packages/game-kit`,
`packages/room`, `packages/host-conformance`, `games/registry` and `games/le-curseur`.

`games/registry` has two entry points: `@game-library/registry` lists the manifests (light, for the app's
first screen) and `@game-library/registry/logics` holds the rules of each game, for servers. They are kept
apart so that the app does not load every game's rules and content just to list the games.

Dependency rule, enforced by the TypeScript project setup: `logic` and `packages/*` may import only each
other. `ui` and `apps/client` may import everything except the server apps. Server apps never import `ui`.

## 4. A game

### 4.1 Logic (plain TypeScript, D-5)

The contract is `GameLogic` in `packages/game-kit/src/contract.ts`; the code is authoritative. Its shape:

```ts
interface GameLogic<Config, State, View extends BaseView> {
  id: string;                 // "le-curseur"
  rulesVersion: number;       // bumped when rules, draw order or content lists change
  saveFormat: number;         // bumped when the shape of State changes
  seatCount: number;          // the sides of the game, e.g. two teams

  defaultConfig(): Config;
  normalizeConfig(input: unknown): Config;        // a well-formed config from untrusted data
  validateConfig(config: Config): string | null;  // an error code, or null
  seatNames(config: Config): readonly string[];   // what each seat is called (team names), '' if none
  setup(config: Config, seed: string): State;     // same config and seed, same game; throws if invalid
  apply(state: State, seat: SeatId, action: unknown, now: number): Result<State>;
  view(state: State, seat: SeatId): View;         // everything this seat may see, nothing more
  activeSeat(state: State): SeatId;               // the seat expected to act
  isOver(state: State): boolean;
  restore(input: unknown): State | null;          // checks saved data and returns it as a state
}

interface BaseView { secret: boolean }  // does this view show something the other seats must not see?
```

A game's own action type is not part of the contract: actions arrive as untrusted `unknown` and each game
checks them inside `apply`. The `wakeAt` function for timed games (the next moment the game needs to be
woken) is added with the first real-time game, Forest Maze (M6).

Properties every logic module has:

- **Pure and deterministic.** No DOM, storage, network, `Date.now()` or `Math.random()`. All randomness
  comes from a seeded generator whose position is part of the state. Time enters only through `now`.
- **State is plain JSON data.** It can be saved, restored and moved between server instances. `apply`
  returns a new state and never edits the one it is given.
- **`apply` validates.** It rejects an action from the wrong seat, at the wrong time or with bad
  content, and returns an error code, not a sentence. The interface translates codes.
- **Deadlines, not countdowns.** A timed game stores the moment something ends. Nothing ticks on the
  server while players are idle.
- **No hand-off phases.** The old single-phone games model "pass the phone" as game phases. In the
  library the logic only says which seat must act (`activeSeat`) and whether a view is `secret`; passing
  the phone is the shell's job (section 5.3).
- **Untrusted saves.** `restore` checks everything about a saved state, including that its turns are
  consistent with each other, and returns a copy.

### 4.2 Interface (Svelte, D-5)

- A game's `ui/index.ts` exports `clientGame = { logic, messages, Menu, Screen, handoff }`. The shell
  finds it by its place (`games/<id>/ui/index.ts`) and loads it on demand when the player opens the game,
  so the picker stays light as the library grows. The shell never names a game.
- `Menu` is the settings screen before a game on one phone, and `ConfigEditor` its fields alone, which the
  host of a room uses in the lobby. `defaultConfig(t)` gives the settings a new game or room starts from,
  with texts in the language of the interface. `Screen` shows the playing screens and receives the
  current `View`, a `send(action)` function, a translate function, the language and the last refused
  action. It never sees `State`. `handoff(view, t, locale)` returns the text of the shell's hand-off
  screen, which must contain nothing secret.
- A game never imports shell code: everything reaches it through these props. Shared looks come from the
  CSS variables and building-block classes in `app.css` (buttons, fields, seat colours).
- The same components serve all modes. In a room a device is shown the view of its own seat even when it is
  not that seat's move, so `Screen` also draws the waiting screens ("Waiting for the other team to give a
  clue"), told apart by `view.seat !== view.actingSeat`. Messages about a team never put its name in the
  subject of a sentence ("Waiting for {team}…"), since a name can be plural or any word.
- **Canvas games** use Svelte for screens and the HUD, and one Svelte component that owns the `<canvas>`,
  sizes it, and runs a plain `requestAnimationFrame` drawing loop written in ordinary TypeScript. The
  loop reads the latest view; it does not go through Svelte's reactivity for each frame.

### 4.3 Content and translations (D-6)

Two different things:

- **Interface text** (`i18n/`): buttons, messages, rules summaries. Exists in French and English for
  every game. Typed keys, so a missing translation fails the build.
- **Content** (`content/`): word lists and concept pairs. Per language, and needed by the logic on the
  server to deal a game. A game declares which content languages it has; a game or room uses exactly
  one. Le Curseur and Un Banger start with French content only, which the picker shows clearly to a
  player using the English interface.

The interface language follows the device language, with an override in settings. Changing a content
list bumps the game's `rulesVersion`, because a seed only reproduces a game with the same list.

## 5. The client

### 5.1 Shell

Picker (the catalog of games), settings (language, sound, vibration), room lobby (create, join, choose a
seat, configure, start), and the frame around a running game (leave with confirmation, connection
status). The shell never names a specific game: it reads the registry.

### 5.2 Services

Games reach the device only through these, so that browser and native app behave the same:

| Service | Purpose | Notes |
|---|---|---|
| Storage | Settings and saved single-device games | Keys prefixed per game, save format version, every access guarded. Backed by web storage on the website and by a native store in the app, where the system can clear web storage. |
| Device | Keep the screen awake, vibration, sound, Android back button | Web APIs where they exist, Capacitor plugins where the app's web view lacks them. Every capability is optional: a game works without it. |
| Translations | Interface text | Section 4.3. |

### 5.3 Single-device play and secrets

- `LocalSession` runs the logic on the device and shows the view of the seat that must act.
- **When the shell shows a hand-off screen** (`needsHandoff`): before the first screen of a game and after
  a resume; whenever the acting seat changes; and whenever a secret view follows one that was not secret,
  even when the same seat holds the phone, because people look at a result and would see the next secret.
  A view says whether it is secret through `BaseView.secret`. There is no hand-off at the very end of a
  game: the last screen is public.
- The hand-off screen shows only what the game puts in `handoff()`: the round, the team, its role, a
  warning and the score. Never a target, a clue or a concept.
- The game is saved after every action, as an envelope that holds the game id, its `rulesVersion` and
  `saveFormat`, and the state (`gl.game.<id>.save`). A save is ignored when any version differs or when
  the game's own `restore` refuses it. It is deleted when the game ends or the player quits. Leaving the
  screen any other way keeps it for **Resume**, and a resumed game always reopens on a hand-off, never on
  a view with secrets. The settings used last are kept in `gl.game.<id>.config`.
- "Play again" and "Menu" at the end of a game belong to the shell; the game only draws its recap.
- A game with its own way of sharing the phone (Forest Maze's "Pass" button) uses the shell's hand-off
  component where it fits and its own flow otherwise; the rules above still hold.

### 5.4 Native app (Capacitor, D-10)

- The app contains the same build as the website, so single-device play needs no network.
- Inside the app the page is not served from the website's address, so calls to the server are
  cross-origin: the client takes the server address from build configuration, and both hosts allow the
  app's origins.
- An installed app can be older than the server. Before creating or joining a room the client compares
  its protocol version and the game's `rulesVersion` with the server's catalog and asks the player to
  update when they differ.
- **The server's address.** A website served by the Node.js host uses its own origin. The app is not served
  by the server, so it needs `VITE_SERVER_URL` at build time (and `VITE_PUBLIC_URL` for the links and QR
  codes people share); without it rooms are unavailable and the app says so, rather than trying to reach
  `https://localhost`. `apps/client/.env.example` lists both. The server accepts requests from any origin
  by default, which the app's origin needs.
- Android first. iOS-safe habits from day one: safe-area insets, no reliance on APIs iOS lacks (such as
  `navigator.vibrate`), no Android-only plugin without an iOS equivalent.

### 5.5 Routing and browser targets

- Screens are reached by hash routes (`#/`, `#/settings`, `#/play/<id>`, `#/room/new/<id>` and
  `#/room/<code>`), parsed
  by one function that sends unknown addresses to the picker (P-16). The tab bar shows the two top-level
  screens; a game takes the whole screen while it runs.
- The build is translated down to Chrome 100, Safari 15 and Firefox 100 (P-15), so modern syntax and CSS
  can be written freely.
- Light and dark colours come from CSS variables and follow the system setting (D-17).
- Layout checks that hold today and are tested: no sideways scrolling from 320 px wide, the tab bar sits
  at the bottom of the screen, every tap target is at least 44 px high, no request leaves the app.

## 6. Rooms

### 6.1 Model (D-8, D-9, P-3 to P-6, P-23)

- A **room** has a five-character code (letters and digits that cannot be confused: no 0/O, 1/I), a game, its
  settings, devices and, once started, the game state. It is in the **lobby**, **playing** or **finished**,
  and goes back to the lobby for another game.
- A **device** (a phone or a browser) joins with a display name of at most 20 characters. It has a public id
  and a secret **token**, which is never sent to the other devices. It keeps its identity across
  reconnections.
- A device takes a **seat**, or none (it is then only watching). Several devices may share a seat: all of
  them receive that seat's view and any of them may act for it. Seats can be changed at any time: the games
  are cooperative, so seats are an honour system, not a lock.
- The **host** is the device that created the room. Its settings and "start" are the only things only the
  host may do, besides taking everyone back to the lobby. The role passes to the earliest device that is
  still connected when the host leaves, or when the host has been offline for a minute and another device
  is connected.
- A device keeps its token and name in its own storage (`gl.room.<CODE>`, `gl.player.name`): after a reload
  or a dropped connection it comes back to the same seat without anyone doing anything. Leaving, or the
  room closing, deletes the token.
- **Lifetime.** A room lives in memory and is deleted 15 minutes after its last device disconnected, or
  after three hours without a message. There is no database (D-3).

Who may do what:

| Action | Who | When |
|---|---|---|
| Join | Anyone with the code | Any time; the room must not be full (12 devices) |
| Take or leave a seat | Any device | Any time |
| Change the settings | The host | Lobby |
| Start | The host | Lobby, valid settings, every seat has a connected device |
| Act in the game | A device with a seat | Playing; the game checks the seat, the moment and the move |
| Back to the lobby | The host | Playing or finished |
| Leave | Any device | Any time |

### 6.2 Engine (`packages/room`, D-11)

The engine is a set of pure functions over a serializable room snapshot (`RoomState`):

```
step(env, room, event, { now, entropy }) → { room, effects }

events:  connected · message (parsed JSON) · disconnected · tick
effects: send (message to a connection) · close · persist · wake (at a time, or never) · expire
```

- It owns no socket and no timer, never reads the clock (`now` comes with the event) and draws no
  randomness: the host passes fresh cryptographic random hex (`entropy`) with every event, and the engine
  takes tokens, ids and game seeds from it.
- `createRoom` makes a room for a game; `restoreRoom` checks a saved one (a room with other rules or a game
  state that no longer passes the game's own check is dropped; a finished game falls back to the lobby).
- Open connections are part of the snapshot only while they last: the host rebuilds them after a restart.
- `wake` says when the next `tick` is due (an unjoined socket timing out, host succession, expiry). This is
  what the Cloudflare host will turn into an alarm (M4).
- Every message of a seat's view carries a version number `v`, so a device can ignore one that arrives late.
- It is exercised by 80 tests: joining, reconnection, seats, who may act, secrecy of views, host succession,
  expiry, saved rooms, and that it never changes the room it is given.

### 6.3 Protocol (`PROTOCOL_VERSION` 1)

JSON over one WebSocket per device, at `/api/rooms/<CODE>/ws`. Messages are at most 16 KB.

| Direction | Message | Meaning |
|---|---|---|
| Device to server | `join` (protocol, name, token?, rules?) | First message: who this is. `rules` makes the server refuse an app with other rules |
| | `seat` (number or null) | Take or leave a seat |
| | `config` (settings) | Host: change the settings |
| | `start` | Host: start the game |
| | `action` (anything) | Play; the game checks it |
| | `reset` | Host: back to the lobby |
| | `leave` | Leave for good |
| Server to device | `joined` (token, deviceId) | Accepted; keep the token |
| | `room` (v, room) | What the device may know of the room: members, seats and their names, settings, phase, who it is. Never a game's state |
| | `view` (v, seat, actingSeat, over, view) | The game as this device's seat sees it |
| | `refused` (error) | The game refused an action; nothing changed |
| | `error` (code) | `bad-message`, `protocol-mismatch`, `rules-mismatch`, `not-joined`, `bad-name`, `room-full`, `bad-seat`, `not-host`, `wrong-phase`, `invalid-config`, `seats-incomplete`, `no-seat`, `unknown-game`, `room-closed`, `room-not-found`, `rate-limited` |

After `joined` comes the room, then the view when there is one. The room also tells a device which rules
version its game runs, so an app that has other rules can refuse to play (`rules-mismatch`) after joining
from a link. `protocol-mismatch`, `rules-mismatch`, `room-full`, `bad-name`, `room-not-found` and
`room-closed` end a session; anything else is temporary and the device reconnects by itself, waiting
0.5 s, 1 s, 2 s… up to 8 s (with a little randomness), at once when the network or the page comes back.

HTTP API, the same on every host:

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness check: `{ ok, rooms }` |
| `GET /api/catalog` | `{ protocol, limits, games: [{ id, rulesVersion, seatCount, singleDevice, contentLocales }] }` |
| `POST /api/rooms` | Body `{ gameId, rules?, config? }`. Returns 201 `{ code, token, protocol }`: the token makes the creator's first device the host. 400 bad request, 404 unknown game, 409 other rules, 413 too large, 429 too many from this address, 503 server full |
| `GET /api/rooms/<CODE>/ws` | WebSocket upgrade |

The shared package has no DOM or Node types, so the API is written as small functions that each host
adapts, not against the standard `Request` and `Response` objects.

### 6.4 Protecting the server

Rooms are open to anyone with the code, so (every limit below has a test that breaks it on purpose; the values are the Node.js host's, and section 7.2 lists where the Cloudflare host differs):

| Protection | Value |
|---|---|
| Message size | 16 KB, enforced by the WebSocket layer (the socket is closed) |
| Message rate | 30 at once, then 5 a second, per socket; five bad or excess messages close it |
| Sockets per address | 30 |
| Rooms created per address | 10 at once, then 10 a minute |
| Guessing room codes | 20 unknown codes per address, then 1 every 3 seconds |
| Rooms in total | 500 |
| Devices per room | 12 |
| A socket that never says who it is | Closed after 10 seconds |
| Dead connections | Pinged every 30 seconds; one that does not answer is dropped |
| Names | Cleaned and cut to 20 characters; shown as text, never as markup |
| Origins | Any by default (no cookies exist to steal); `ALLOWED_ORIGINS` restricts browsers to a list |

The server validates every action through the game's own logic (section 4.1). A game that throws closes
its room and no other. No personal data is stored: a name and what players type during a game exist only for
the life of the room, and logs never contain names, clues or tokens.

## 7. The two hosts

### 7.1 Node.js host (`apps/server-node`)

- One process: the HTTP API, the room WebSockets (the `ws` package) and the built website, on one port.
  Rooms are held in memory and lost when the process restarts (P-6).
- `RoomManager` feeds events to the engine and carries out its effects; it knows nothing of HTTP or
  sockets, so it is tested with fake sockets and a fake clock. `http.ts` and `server.ts` are the thin layer
  over `node:http` and `ws`.
- The website is served from `apps/client/dist` with a content security policy that allows nothing remote
  (`default-src 'self'`, WebSockets allowed), `nosniff`, long caching for hashed assets and none for the
  page. Hidden files and anything outside that folder are never served. There is no fallback to the page:
  routes are after the `#` (P-16).
- Run it: `npm run dev:server` (runs the TypeScript directly with Node's type stripping, restarting on
  changes) next to `npm run dev` (Vite proxies `/api` to it), or `npm run build` then `npm start` for the
  single-file bundle `apps/server-node/dist/main.js`. TLS belongs to a reverse proxy; set `TRUST_PROXY=1`
  behind one so limits use the real address.
- Settings, as environment variables: `PORT` (8787), `HOST` (0.0.0.0), `CLIENT_DIST`, `ALLOWED_ORIGINS`
  (comma-separated), `TRUST_PROXY`, `MAX_ROOMS`, `ROOMS_PER_ADDRESS_BURST`, `ROOMS_PER_ADDRESS_PER_MINUTE`,
  `SOCKETS_PER_ADDRESS`, `UNKNOWN_ROOMS_PER_ADDRESS_BURST`.
- Code that Node runs by stripping types cannot use constructor parameter properties
  (`constructor(readonly x: T)`); ESLint refuses them in `packages/*` and `apps/server-*`.

### 7.2 Cloudflare host (`apps/server-cloudflare`)

One Worker, configured by `wrangler.jsonc` at the repository root:

- **Website**: Cloudflare serves the files of `apps/client/dist` itself (Workers static assets). Only `/api/*`
  runs the Worker (`run_worker_first`). `apps/client/public/_headers` gives the files the same headers as the
  Node.js host (a test checks the content security policy is identical). Routes are after the `#`, so there
  is no fallback to the page (P-16).
- **`worker.ts`**: the HTTP API (`/api/health`, `/api/catalog`, `POST /api/rooms`, CORS) and the
  WebSocket entry `/api/rooms/{code}/ws`. It uses the same `api.ts` helpers of `packages/room` as the Node.js
  host for what a request must look like and which status a failure gets. It draws the code and the host's
  secret with `crypto.getRandomValues` and retries when a code is already a room.
- **`RoomDO`** (`room-do.ts`): one Durable Object per room, named by its code. It accepts sockets through the
  Hibernation API (`ctx.acceptWebSocket`), so the object can be evicted from memory while the sockets stay
  open and an idle room costs no duration. It keeps the room snapshot in its own SQLite-backed storage and
  uses its alarm for the engine's `wake` effect. A connection's id and start time live in the socket's
  attachment, which survives hibernation.
- **`RoomRuntime`** (`runtime.ts`): everything the object does, with no Cloudflare import: it loads the room on
  the first event after waking, rebuilds the connections from the sockets still open, feeds events to the
  engine and carries out the effects (send, close, persist, alarm, expire). The part that is hard to get right,
  waking up, is tested by creating a second runtime over the same storage and sockets.
- **`LimiterDO`** (`limiter-do.ts`): one small object per address (named by `CF-Connecting-IP`) holding two token
  buckets (rooms created, unknown codes tried), kept in storage and erased by an alarm once they would be full.
  The buckets are the pure `takeFromBucket` of `packages/room`, the same arithmetic as the Node.js host's.
  A limiter that cannot answer refuses.
- A WebSocket for a code that is not a room (or is not a code) is accepted by the Worker only to say
  `room-not-found` and close with 4404, as the Node.js host does, and it counts toward the guessing limit.
- Settings, as variables in `wrangler.jsonc` (`vars`): `ALLOWED_ORIGINS` (comma-separated, empty means any), and
  for tests `ROOMS_PER_ADDRESS_BURST`, `ROOMS_PER_ADDRESS_PER_MINUTE`, `UNKNOWN_ROOMS_PER_ADDRESS_BURST` and
  `MESSAGES_BURST`.

Differences from the Node.js host (P-28), all deliberate:

| | Node.js host | Cloudflare host |
|---|---|---|
| Rooms in total | `MAX_ROOMS` (500) | No cap: each room is its own object (Cloudflare's own limits apply) |
| Sockets per address | 30 | Not limited (it would need one more object holding every socket of an address) |
| Message rate | Per socket, kept while it lives | Per socket, but it restarts when the object wakes from hibernation |
| Dead connections | The server pings every 30 s | No pings: Cloudflare closes dead sockets and wakes the object |
| Rooms after a restart | Lost (P-6) | Kept; connections are not (everyone reconnects) |
| Address | `TRUST_PROXY` and `X-Forwarded-For` | `CF-Connecting-IP`, which Cloudflare sets |

Cloudflare Workers is not Node.js; this is why the engine avoids Node.js APIs.

Facts checked on 2026-11-26 in Cloudflare's documentation; confirm them on the live pages before the
first deployment (O-2):

- The free plan includes Durable Objects (the SQLite-backed kind only), with daily allowances of
  100,000 requests and 13,000 GB-seconds of duration. Past a daily limit, further operations fail until
  the next day rather than being billed.
- A WebSocket connection counts as one request; incoming messages count at one twentieth; outgoing
  messages are free. With the hibernation API an idle room is not billed for duration.
- The paid plan starts at 5 USD a month.
- Running the Node.js host itself on Cloudflare would need Cloudflare Containers, which is in beta and
  requires the paid plan. Not planned.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Workers static assets](https://developers.cloudflare.com/workers/static-assets/),
[Containers](https://developers.cloudflare.com/containers/).

### 7.3 Deploying

The website and the rooms are one Worker, `game-library` (P-18, P-28): `wrangler.jsonc` lists the static
assets, the Worker's entry, the two Durable Object classes and their migration. Deploying uploads all of them
together, so the website and the rooms always have the same version.

Manual: `npm run deploy` (after `npx wrangler login`), or `npm run deploy:preview` to upload a version without
making it live. Checked here without a Cloudflare account: the whole Worker runs on workerd through
`wrangler dev` (the Cloudflare tests start it), and `wrangler deploy --dry-run` bundles it.

Automatic, from GitHub, with Cloudflare "Workers Builds" (dashboard, Settings, Build):

| Field | Value |
|---|---|
| Worker name | `game-library`, exactly the `name` in `wrangler.jsonc` |
| Root directory | empty (the repository root) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch command | `npx wrangler versions upload` |
| Production branch | `main` |

Durable Objects and migrations: the first deploy that contains `migrations` creates the two classes. A class is
added, renamed or removed only by adding a new migration with a new tag; never edit `v1`. A preview version
(`versions upload`) shares the Durable Objects of the live Worker, so a preview can read and change real rooms;
treat it as production for that reason.

The app and the site on one address: the website on that address talks to its own origin (no setting). The
native app needs `VITE_SERVER_URL` (and `VITE_PUBLIC_URL` for links and QR codes) at build time (P-25, O-11).

Not yet confirmed by a real build in the dashboard: how the root directory setting behaves with npm workspaces,
and the first deployment itself, which needs the user's Cloudflare account.

## 8. Versions

| Version | Changes when | Effect of a mismatch |
|---|---|---|
| Protocol version | Room messages or the HTTP API change | The client asks the player to update before using rooms: when creating a room it compares the `protocol` of the server's reply with its own, when joining the server answers `protocol-mismatch` |
| `rulesVersion` (per game) | Rules, random draw order or content lists change | Same, for that game only; old saved games of that game are discarded |
| Save format (per game) | The shape of the saved state changes | The saved game is ignored |

## 9. Testing (D-16)

- **Logic**: unit tests under Node.js, including seeded whole-game runs. Existing tests of the original
  games are ported with the logic. Order-of-draws tests pin values computed by hand from the spec, and
  every important rule was checked by breaking it on purpose and seeing a test fail.
- **Shell**: tested with a small fake game (`fake-game.ts`), so no shell test depends on a real game.
- **Room engine**: events in, effects out, with no sockets; the secrecy of what each seat is sent is checked
  while a whole Le Curseur game is played through it.
- **Node.js host**: real HTTP and WebSocket clients on a free port (a whole game, reconnecting, every limit,
  origins, the static file server including path traversal), plus the manager with fake sockets.
- **Remote session** (client): a fake socket and a manual timer: reconnection and its waits, out-of-order
  messages, fatal and temporary errors.
- **Interface**: Playwright in Chromium at phone sizes, playing complete games. The tests run against the
  Node.js host, which serves the built website as in production.
- **Multi-device**: several Playwright browser contexts, each a phone of its own, in one room on the Node.js
  host: whole games with the guessing phone's WebSocket frames checked for the target, shared seats,
  watching, reconnection (a socket cut on purpose), the host leaving, joining by code and by link, French,
  and layout at four phone sizes.
- **Host contract**: `packages/host-conformance` is one suite (HTTP API, a whole game, close codes, secrecy,
  origins) that each host's tests run against the real running host, so the two cannot drift apart.
- **Cloudflare host**: `RoomRuntime` is tested with fake sockets and storage, including a simulated wake-up
  (a new runtime over the same storage and sockets); the whole Worker is then run on Cloudflare's own runtime
  (workerd, through `wrangler dev` with a throwaway config) and must pass the host contract, plus its own
  tests of the limits kept by `LimiterDO`. The first deployment on a Cloudflare account is not tested here.
- **Android**: the build runs in the cloud environment (Android SDK installed by its setup script).
  Running the app needs an emulator or a phone, on the user's machine: the cloud has no KVM.

## 10. Later, and deliberately not designed yet

Accounts, statistics, leaderboards and syncing across devices (D-3). They will need a database and a
privacy review; nothing in the current design blocks them, and nothing is built for them in advance.
