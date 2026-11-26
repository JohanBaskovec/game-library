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

**Milestone M1 (skeleton) is done**: the workspace, the client shell (empty game picker, settings, French
and English), the storage, device and translation services, the Android project and CI. The Android
build is verified; running the app on a device is still for the user to confirm. No game exists yet.
Next is M2 in [`docs/ROADMAP.md`](docs/ROADMAP.md): Le Curseur on one phone. Do not start it before the
user asks.

## Commands

Run from the repository root. All of them were run and pass.

```bash
npm install            # once, and after changing a package.json
npm run dev            # Vite dev server for the client
npm run check          # lint + format check + typecheck + unit tests + build (what CI runs first)
npm run lint           # ESLint, including the logic-purity rules of rule 1
npm run format         # Prettier (Markdown is left alone: its tables are formatted by hand)
npm run typecheck      # svelte-check for the client, tsc for the packages
npm test               # Vitest: a "logic" project (no DOM) and a "client" project (jsdom)
npm run test:e2e       # Playwright: builds, serves, and drives the app at four phone sizes
npm run android:build  # build the web app, cap sync, Gradle assembleDebug
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
apps/server-node/         Node.js host: static files, HTTP API, WebSocket rooms            (planned, M3)
apps/server-cloudflare/   Cloudflare host: Worker + one Durable Object per room             (planned, M4)
packages/game-kit/        Locales, game manifest type, seeded random
packages/room/            Host-neutral room engine and wire protocol                        (planned, M3)
games/registry/           The list of games (empty until M2)
games/<id>/logic/         Rules and state of one game: plain TypeScript                    (planned, M2)
games/<id>/ui/            Svelte screens of that game                                      (planned, M2)
games/<id>/content/       Word lists and similar data, per language                        (planned, M2)
games/<id>/i18n/          Interface text of that game, per language                        (planned, M2)
games/<id>/docs/          rules.md (for players) and spec.md (source of truth)             (planned, M2)
docs/                     Architecture, decisions, games, roadmap
```

Inside `apps/client/src`: `screens/` (one component per route), `lib/services/` (storage, device),
`lib/i18n/` (messages per language and the translation core), `lib/*.svelte.ts` (reactive state: router,
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
   no timers. The two hosts are thin wrappers around it and contain no game or room rules.
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
- A game is added by creating `games/<id>/` and one registry entry. Shell code never names a specific game.

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
  phone sizes 360 × 640, 390 × 844 and 430 × 932, plus 320 × 568 as the minimum. Play a full game.
- Multi-device: several browser contexts joined to one room on the local Node.js server. Check that no
  device receives another seat's secrets.
- Android: the cloud environment's setup script installs the Android SDK in `/opt/android-sdk`
  (`ANDROID_HOME`), so the Android project can be built there. It has no KVM, so no emulator: running the
  app on Android is checked by the user on their own machine. Never claim an Android run was verified
  when only the build was.

## Branches

`main` is the stable branch. Work is done on a separate branch and reaches `main` through a pull request.
