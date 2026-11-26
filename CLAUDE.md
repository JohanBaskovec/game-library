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

**Documentation only. Nothing is scaffolded yet.** There is no `package.json`, no code and no commands.
The next step is milestone M1 in [`docs/ROADMAP.md`](docs/ROADMAP.md). Do not start it before the user asks.

When the project is scaffolded, add a "Commands" section here (install, dev, test, build, Android sync)
with commands that were actually run, and record the tool versions that were chosen.

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

## Layout (planned)

```
apps/client/              Svelte app shell (picker, settings, lobby) + Capacitor config and android/
apps/server-node/         Node.js host: static files, HTTP API, WebSocket rooms
apps/server-cloudflare/   Cloudflare host: Worker + one Durable Object per room
packages/game-kit/        Game contract types, seeded random, shared pure helpers
packages/room/            Host-neutral room engine and wire protocol
games/<id>/logic/         Rules and state of one game: plain TypeScript
games/<id>/ui/            Svelte screens of that game
games/<id>/content/       Word lists and similar data, per language
games/<id>/i18n/          Interface text of that game, per language
games/<id>/docs/          rules.md (for players) and spec.md (source of truth)
docs/                     Architecture, decisions, games, roadmap
```

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

Until the project is scaffolded there is nothing to run. Afterwards (tools are proposed, see
`docs/DECISIONS.md`):

- Logic and room engine: unit tests under Node.js. They must pass before any interface work is called done.
- Interface: drive the real app in Chromium with Playwright (preinstalled in the cloud environment) at
  phone sizes 360 × 640, 390 × 844 and 430 × 932, plus 320 × 568 as the minimum. Play a full game.
- Multi-device: several browser contexts joined to one room on the local Node.js server. Check that no
  device receives another seat's secrets.
- Android: needs the Android SDK, which the cloud environment does not have. Say so plainly instead of
  claiming an Android build was verified.
