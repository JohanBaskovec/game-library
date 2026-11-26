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

## 3. Repository layout (P-1)

```
apps/
  client/              Shell, routing, services, Capacitor config, android/ (later ios/)
  server-node/         Node.js host
  server-cloudflare/   Cloudflare Workers + Durable Objects host
packages/
  game-kit/            Game contract types, seeded random generator, shared pure helpers
  room/                Room engine and wire protocol types
games/
  <id>/
    logic/             Rules and state. Plain TypeScript, compiled without DOM types.
    ui/                Svelte screens. Client only.
    content/           Word lists, concept pairs: data per content language
    i18n/              Interface text per language
    docs/              rules.md and spec.md
  registry             The list of games: logic entries for the server, manifests for the client
docs/
```

Created so far (M1): `apps/client`, `packages/game-kit` and `games/registry`. The rest is created when its
milestone starts (see `ROADMAP.md`).

Dependency rule, enforced by the TypeScript project setup: `logic` and `packages/*` may import only each
other. `ui` and `apps/client` may import everything except the server apps. Server apps never import `ui`.

## 4. A game

### 4.1 Logic (plain TypeScript, D-5)

Intended shape:

```ts
interface GameLogic<Config, State, Action, View> {
  id: string;                    // "le-curseur"
  rulesVersion: number;          // bumped when rules, draw order or content lists change
  seats: SeatSpec;               // the sides of the game, e.g. two teams
  singleDevice: boolean;         // can it be played on one shared phone?
  contentLocales: Locale[];      // languages its word lists exist in

  defaultConfig: Config;
  normalizeConfig(input: unknown): Config;             // never trusts its input
  setup(config: Config, seed: string): State;          // same seed and config, same game
  apply(state: State, seat: SeatId, action: unknown, now: number): Result<State>;
  view(state: State, seat: SeatId): View;              // everything this seat may see, nothing more
  wakeAt(state: State): number | null;                 // next moment the game needs to be woken, if any
}
```

Properties every logic module has:

- **Pure and deterministic.** No DOM, storage, network, `Date.now()` or `Math.random()`. All randomness
  comes from a seeded generator whose position is part of the state. Time enters only through `now`.
- **State is plain JSON data.** It can be saved, restored and moved between server instances.
- **`apply` validates.** It rejects an action from the wrong seat, at the wrong time or with bad
  content, and returns an error code, not a sentence. The interface translates codes.
- **Deadlines, not countdowns.** A timed game stores the moment something ends and reports it through
  `wakeAt`. Nothing ticks on the server while players are idle.
- **No hand-off phases.** The old single-phone games model "pass the phone" as game phases. In the
  library the logic only says which seats may act; passing the phone is the shell's job (section 5.3).

### 4.2 Interface (Svelte, D-5)

- A game's screens are Svelte components that receive a session: the current `View`, the seats this
  device controls, and a `send(action)` function. They never see `State`.
- The same components serve all modes. They may adapt to the mode (for example "waiting for the other
  team" in a room where the single-device mode would pass the phone).
- **Canvas games** use Svelte for screens and the HUD, and one Svelte component that owns the `<canvas>`,
  sizes it, and runs a plain `requestAnimationFrame` drawing loop written in ordinary TypeScript. The
  loop reads the latest view; it does not go through Svelte's reactivity for each frame.
- Each game's interface is loaded on demand when the player opens it, so the picker stays light as the
  library grows.

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

- The local session runs the logic on the device and shows the view of the seat that is acting.
- Whenever the displayed seat changes, the shell shows a **hand-off screen** first ("Team X's turn" and
  a "Ready" button). It shows nothing secret.
- The game is saved after every action. A resumed game always reopens on a hand-off screen, never
  directly on a view with secrets.
- A game with its own way of sharing the phone (Forest Maze's "Pass" button) uses the shell's hand-off
  component where it fits and its own flow otherwise; the two rules above still hold.

### 5.4 Native app (Capacitor, D-10)

- The app contains the same build as the website, so single-device play needs no network.
- Inside the app the page is not served from the website's address, so calls to the server are
  cross-origin: the client takes the server address from build configuration, and both hosts allow the
  app's origins.
- An installed app can be older than the server. Before creating or joining a room the client compares
  its protocol version and the game's `rulesVersion` with the server's catalog and asks the player to
  update when they differ.
- Android first. iOS-safe habits from day one: safe-area insets, no reliance on APIs iOS lacks (such as
  `navigator.vibrate`), no Android-only plugin without an iOS equivalent.

### 5.5 Routing and browser targets

- Screens are reached by hash routes (`#/`, `#/settings`, later `#/play/<id>` and `#/room/<code>`), parsed
  by one function that sends unknown addresses to the picker (P-16). The tab bar shows the two top-level
  screens; a game takes the whole screen while it runs.
- The build is translated down to Chrome 100, Safari 15 and Firefox 100 (P-15), so modern syntax and CSS
  can be written freely.
- Light and dark colours come from CSS variables and follow the system setting (D-17).
- Layout checks that hold today and are tested: no sideways scrolling from 320 px wide, the tab bar sits
  at the bottom of the screen, every tap target is at least 44 px high, no request leaves the app.

## 6. Rooms

### 6.1 Model (P-3 to P-6)

- A **room** has a short code, a game, a configuration, seats, connected devices and, once started, the
  game state. It moves from lobby to playing to finished, and back to lobby for another game.
- A **device** joins with a display name and takes a **seat**. Several devices may share a seat; they
  all receive that seat's view and any of them may act.
- The device that created the room is its host: it sets the configuration and starts the game. If it
  leaves, the role passes to the device connected longest.
- A device keeps a **reconnect token**. After a reload or a dropped connection it comes back to the
  same seat without the others doing anything.
- Rooms are deleted after a period without activity. There are no accounts and no database (D-3).

### 6.2 Engine (`packages/room`, D-11)

The engine is a set of pure functions over a serializable room snapshot:

```
(room snapshot, event) → (new room snapshot, effects)

events:  device connected · message received · device disconnected · wake-up time reached
effects: send message to device · persist snapshot · wake me at time T · close connection
```

It owns no socket and no timer and never reads the clock; the host passes the current time with each
event. This is what keeps both hosts thin, and it is required by Cloudflare, where a room is unloaded
from memory between messages and rebuilt from its saved snapshot.

### 6.3 Protocol

JSON messages over one WebSocket per device, with a protocol version sent on connection.

| Direction | Messages (sketch) |
|---|---|
| Device to server | join (name, reconnect token) · take seat · set configuration · start · action · leave |
| Server to device | room (members, seats, configuration, phase) · view (this seat's view) · error (code) |

The server sends views, never state, and sends each device only its own seat's view.

HTTP API, shared by both hosts and written against the standard `Request` and `Response` objects:

| Route (sketch) | Purpose |
|---|---|
| `GET /api/catalog` | Games this server can run, with their rules versions, and the protocol version |
| `POST /api/rooms` | Create a room, returns its code |
| `GET /api/rooms/<code>/ws` | WebSocket connection to a room |
| `GET /api/health` | Liveness check |

### 6.4 Protecting the server

Rooms are open to anyone with the code, so: limits on message size and rate, on devices per room and on
room creation per address; display names and clues length-limited and treated as untrusted text;
every action validated by the game logic (section 4.1). No personal data is stored: a display name and
what players type during a game exist only for the life of the room.

## 7. The two hosts

### 7.1 Node.js host (`apps/server-node`)

- One process: serves the client's static files, the HTTP API, and WebSocket rooms held in memory, with
  ordinary timers for wake-ups.
- Used for development, automated tests and any ordinary hosting (one container).
- Rooms are lost when the process restarts. Acceptable for now (P-6).

### 7.2 Cloudflare host (`apps/server-cloudflare`)

- A Worker serves the static client (Workers static assets, with fallback to the app's main page for
  client-side routes) and the HTTP API.
- Each room is one **Durable Object**, addressed by the room code. It accepts the WebSockets through the
  hibernation API, stores the room snapshot in its own storage, and uses an alarm for wake-ups.
- Cloudflare Workers is not Node.js; this is why the engine avoids Node.js APIs.

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

### 7.3 Deploying the website

Today the website is static files, served by a Cloudflare Worker with static assets (P-18). The config is
`wrangler.jsonc` at the repository root: Worker name `game-library`, files from `apps/client/dist`.
There is no SPA fallback because routes live after the `#` (P-16): an unknown path is a plain 404.

Manual: `npm run deploy` (after `npx wrangler login`), or `npm run deploy:preview` to upload a version
without making it live. Checked here without a Cloudflare account: `wrangler deploy --dry-run` finds the
files, and `wrangler dev` serves the page and its assets with the right content types.

Automatic, from GitHub, with Cloudflare "Workers Builds" (dashboard, Settings, Build):

| Field | Value |
|---|---|
| Worker name | `game-library`, exactly the `name` in `wrangler.jsonc` |
| Root directory | empty (the repository root) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch command | `npx wrangler versions upload` |
| Production branch | `main` |

Not yet confirmed by a real build in the dashboard: how the root directory setting behaves with npm
workspaces. When the rooms Worker arrives (M4) its config moves to `apps/server-cloudflare`, with
`assets.directory` pointing at `../client/dist`, and the root directory setting moves with it.

## 8. Versions

| Version | Changes when | Effect of a mismatch |
|---|---|---|
| Protocol version | Room messages or the HTTP API change | The client asks the player to update before using rooms |
| `rulesVersion` (per game) | Rules, random draw order or content lists change | Same, for that game only; old saved games of that game are discarded |
| Save format (per game) | The shape of the saved state changes | The saved game is ignored |

## 9. Testing (P-9)

- **Logic**: unit tests under Node.js, including seeded whole-game runs. Existing tests of the original
  games are ported with the logic.
- **Room engine**: tests feed events and check effects, with no network. One important check per game:
  a view sent to a seat never contains another seat's secrets.
- **Interface**: Playwright in Chromium at phone sizes, playing complete games.
- **Multi-device**: several Playwright browser contexts in one room against the Node.js host.
- **Cloudflare host**: run locally with Cloudflare's own tooling before each deployment.
- **Android**: the build runs in the cloud environment (Android SDK installed by its setup script).
  Running the app needs an emulator or a phone, on the user's machine: the cloud has no KVM.

## 10. Later, and deliberately not designed yet

Accounts, statistics, leaderboards and syncing across devices (D-3). They will need a database and a
privacy review; nothing in the current design blocks them, and nothing is built for them in advance.
