# CLAUDE.md

Working guide for coding agents in this repository. Before changing anything, read
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## The project

A **game library**: one website and one native app (Android first, iOS later) that offer several small
multiplayer games. Every game can be played on several devices through a room (players in the same place
or far apart); some games can also be played on a single phone that the players pass around.

The first three games already exist as standalone vanilla HTML/JavaScript repositories and are being
**ported** here (see [`docs/GAMES.md`](docs/GAMES.md)). This repository becomes their only home.

## Status

**Milestones M1 (skeleton), M2 (Le Curseur on one phone) and M3 (rooms) are done**: the client shell, the
services, the game contract, the first game, the room engine, the Node.js server and the room screens
(lobby, QR code, join, reconnect), with their tests and CI. The Android build is verified; running the app
on a device is still for the user to confirm. Next is M4 in [`docs/ROADMAP.md`](docs/ROADMAP.md): the
Cloudflare host and the first deployment. Do not start it before the user asks.

## Commands

Run from the repository root. All of them were run and pass.

```bash
npm install            # once, and after changing a package.json
npm run dev            # Vite dev server for the client (proxies /api to the server below)
npm run dev:server     # the Node.js server for rooms, on port 8787, restarting on changes
npm start              # after `npm run build`: the website and the rooms on one port (8787)
npm run check          # lint + format check + typecheck + unit tests + build (what CI runs first)
npm run lint           # ESLint, including the logic-purity rules of rule 1
npm run format         # Prettier (Markdown is left alone: its tables are formatted by hand)
npm run typecheck      # svelte-check for the client, tsc for the packages
npm test               # Vitest: "logic" (no DOM), "server" (real sockets) and "client" (jsdom) projects
npm run test:e2e       # Playwright: builds, starts the Node.js server, drives the app at four phone sizes
                       # (including several phones in one room)
npm run build          # builds the client and the server's single-file bundle (what CI and Cloudflare run)
npm run android:build  # build the web app, cap sync, Gradle assembleDebug
npm run deploy         # build, then deploy the website to Cloudflare (needs `wrangler login`)
npm run deploy:preview # build, then upload a preview version without making it live
```

The debug APK is `apps/client/android/app/build/outputs/apk/debug/app-debug.apk`; CI uploads it as an
artifact of every run.

Tool versions are pinned exactly in the `package.json` files (P-12):

| Tool | Version | Note |
|---|---|---|
| Node.js | 22.12 or newer | 22.23 in the cloud environment |
| TypeScript | 6.0.3 | Not 7: `typescript-eslint` supports below 6.1 and `svelte-check` supports 5 and 6 |
| Svelte / Vite / Vitest | 5.59.2 / 8.3.8 / 5.1.2 | |
| Playwright | 1.63.0 | Same version as the browser preinstalled in the cloud environment |
| Capacitor | 8.6.3 | Android minimum is API 24 (Android 7), target API 36 |
| ESLint / Prettier | 10.15.0 / 3.10.1 | |
| Wrangler | 4.168.0 | Cloudflare CLI; the website's config is `wrangler.jsonc` at the repository root |
| ws / esbuild | 8.23.0 / 0.28.2 | The Node.js server's WebSockets, and the bundler that makes its single file |
| qrcode-generator | 2.0.4 | QR codes, drawn in the page: no image, no remote service |

Android builds in the cloud environment: `ANDROID_HOME` is `/opt/android-sdk`. The environment's proxy
limits simultaneous connections, so a first Gradle build can fail with `429 Too Many Requests` while
downloading dependencies. Run `./gradlew assembleDebug --no-parallel --max-workers=1` in
`apps/client/android` again until it passes: each run keeps what it downloaded (it took three runs).
Later builds use the cache.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript everywhere, strict mode |
| Client | Svelte + Vite, built as a static single-page app |
| Native app | Capacitor wrapping the same client build (Android first) |
| Game rules | Plain TypeScript, shared by the client and the server |
| Server | A host-neutral room engine with two hosts: Node.js, and Cloudflare Workers + Durable Objects |
| Interface languages | French and English |

Rows marked "proposed" in `docs/DECISIONS.md` (repository layout, test tools and similar) are defaults
chosen by the agent. They are not yet confirmed by the user: ask before building on one that matters.

## Layout

```
apps/client/              Svelte app shell (picker, settings, lobby) + Capacitor config and android/
apps/server-node/         Node.js host: static files, HTTP API, WebSocket rooms in memory
apps/server-cloudflare/   Cloudflare host: Worker + one Durable Object per room             (planned, M4)
packages/game-kit/        Locales, game manifest type, seeded random
packages/room/            Host-neutral room engine, protocol, room codes, rate limiter
games/registry/           The games: manifests (for the app) and, at /logics, their rules (for servers)
games/<id>/               One npm workspace per game (so far: le-curseur)
  manifest.ts             Title, tagline, languages
  logic/                  Rules and state: plain TypeScript, no DOM types
  ui/                     Svelte screens; ui/index.ts is what the shell loads
  content/                Word lists and similar data, per language
  i18n/                   Interface text of the game, per language
  docs/                   rules.md (for players) and spec.md (source of truth)
docs/                     Architecture, decisions, games, roadmap
```

Inside `apps/client/src`: `screens/` (one component per route), `components/` (hand-off, lobby, QR code,
dialogs), `lib/services/` (storage, device), `lib/i18n/` (messages per language and the translation core),
`lib/game/` (running a game on one phone: session, hand-off rule, saves), `lib/rooms/` (the remote session
with reconnection, room API, remembered rooms, QR code), `lib/*.svelte.ts` (reactive state: router,
settings, current language), `app.css` (design tokens and base styles).

## Rules that must not be broken

1. **Game logic is plain TypeScript.** Code in `games/*/logic` and `packages/*` never imports Svelte and
   never touches the DOM, storage, the network, the clock or `Math.random`. It is a deterministic
   function of its inputs: state plus action gives the new state. State is plain JSON data. Random
   numbers come from a seeded generator kept in the state; the current time is passed in as an input.
2. **Secrets stay secret.** A device only ever receives `view(state, seat)`, never the full state. On a
   shared phone, every change of seat goes through a hand-off screen that shows nothing secret, and a
   resumed game always reopens on a hand-off screen.
3. **The room engine is host-neutral.** `packages/room` has no Node.js or Cloudflare API, no sockets and
   no timers, and it reads neither the clock nor random numbers: the host passes the time and fresh random
   hex with each event. The two hosts are thin wrappers around it and contain no game or room rules.
4. **The server trusts nothing from a device.** Every action is checked by the game logic on the server:
   right seat, right moment, legal move, sane size.
5. **Single-device play works offline.** No remote fonts, scripts, images or other network resources.
   Only rooms need the server.
6. **Games use the shell's services.** No direct `localStorage`, `navigator.*`, wake lock, vibration or
   audio setup inside a game: go through the storage, device and translation services of the shell, so
   that the website and the native app behave the same.
7. **No interface text in logic or hard-coded in components.** Logic returns codes; the interface turns
   them into translated text. Every string exists in French and in English.
8. **Mobile first.** Designed for a phone held in portrait and used with a finger: touch targets of at
   least 44 × 44 px, no horizontal scrolling from 320 px wide, safe-area insets respected. Must stay
   usable on a computer with mouse and keyboard.
9. **Version what is shared or saved.** Each game has a rules version, each saved game a save format
   version, and the room protocol a protocol version. Bump the matching one when changing rules, random
   draw order, content lists, state shape or messages. An installed app can be older than the server.
10. **No borrowed material.** Game mechanics may resemble existing games; names, artwork, texts and card
    or word lists of commercial games must never be copied.

## Conventions

- **English** for code, identifiers, comments, documentation and commit messages. Player-facing text
  lives in translation files.
- French strings follow French typography: accents, a non-breaking space before `:` `!` `?`, and « ».
- Imports of local files keep their `.ts` extension. Files that use Svelte runes (`$state`, `$effect`)
  are named `*.svelte.ts`.
- Colours, spacing and sizes come from the CSS variables in `app.css`, never hard-coded in a component.
- Tunable numbers (score bands, timers, counts) are named constants, never magic numbers.
- Keep it simple: these are small games. No abstraction before a second game needs it.
- A game is added by creating `games/<id>/` (copy the shape of `games/le-curseur`) and one line in
  `games/registry`. Shell code never names a specific game. A game's `ui` never imports shell code: it
  gets everything through props, and styles itself with the variables and classes of `app.css`.
- Code that Node runs by stripping types (`packages/*`, `apps/server-*`, and so the game logic they load)
  cannot use constructor parameter properties (`constructor(readonly x: T)`) or enums: ESLint refuses
  them. Declare the field and assign it.
- Interface text about a team or a player never puts the name in the subject of a sentence ("Waiting for
  {team}…", not "{team} is…"): names are the players' own words and can be plural or anything.
- Type checking has two configs per game: `tsconfig.logic.json` (no DOM types, so logic cannot touch the
  browser) and `tsconfig.json` (with DOM, for `ui`).
- A non-breaking space (French typography) is written `\u00A0`. Typing it into a file turns it into an
  invisible literal character, so check with `grep -rl $'\xc2\xa0'` over the source and fix with a script.

## Porting an existing game

- **Port, do not redesign.** A port changes the language and the structure, not the rules, the numbers
  or the order of random draws. Rule changes are separate, later work.
- Order of work: logic and its tests first (port the existing tests where there are some), then the
  interface, then multi-device play.
- The original repositories are read-only references. Their rules documents are translated to English
  into `games/<id>/docs/` as part of the port.
- Details per game, including what each one needs from the device: [`docs/GAMES.md`](docs/GAMES.md).

## When something changes

- Rules of a game change: update `games/<id>/docs/rules.md` and `spec.md` in the same change as the code
  and tests.
- Architecture changes: update `docs/ARCHITECTURE.md` in the same change.
- A new question or an unclear rule: do not invent an answer. Add a row to `docs/DECISIONS.md` and ask
  the user.

## Verifying work

`npm run check` and `npm run test:e2e` must pass (CI runs both, plus the Android build). In more detail:

- Logic and room engine: unit tests under Node.js. They must pass before any interface work is called done.
- Interface: drive the real app in Chromium with Playwright (preinstalled in the cloud environment) at
  phone sizes 360 × 640, 390 × 844 and 430 × 932, plus 320 × 568 as the minimum. Play a full game. The
  game tests use random seeds, so run them several times (`--repeat-each=3`) when changing them.
- A new rule is not tested until you have broken it on purpose and seen a test fail.
- Multi-device: `apps/client/e2e/rooms.spec.ts` uses the `phone` fixture (a browser context each, with its own
  storage) on the local Node.js server, and checks the WebSocket frames a phone received, not just what it
  shows, for another seat's secrets. A socket can be cut on purpose with `Cuttable` to test reconnection.
- The end-to-end tests run against the Node.js server, which serves the built website; its limits are
  raised through environment variables in `playwright.config.ts`.
- Android: the cloud environment's setup script installs the Android SDK in `/opt/android-sdk`
  (`ANDROID_HOME`), so the Android project can be built there. It has no KVM, so no emulator: running the
  app on Android is checked by the user on their own machine. Never claim an Android run was verified
  when only the build was.

## Branches

`main` is the stable branch. Work is done on a separate branch and reaches `main` through a pull request.
