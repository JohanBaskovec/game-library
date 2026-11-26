# Game Library

A library of small multiplayer games, available as a website and as a native app (Android first, iOS
later). Play together on one phone, on several phones in the same room, or online.

**Status: online (built, not yet deployed).** The app shell, the Android project, the automated checks, the first game (Le Curseur,
in French and English) and rooms to play it on several phones (a Node.js server, and a Cloudflare host) exist. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Games

| Game | In short | Origin |
|---|---|---|
| Le Curseur (one phone, or several in a room) | Two teams. Make the other team find a position between two opposite ideas with a single word. | [position-on-a-scale-finder-game](https://github.com/JohanBaskovec/position-on-a-scale-finder-game) |
| Le Jeu Masterclass, Un Banger | Two teams, 25 words. Each team gets the other to find its secret words with one-word clues. | [word-guessing-game](https://github.com/JohanBaskovec/word-guessing-game) |
| Forest Maze | Two players guide four animals out of a forest against the clock, each holding only some of the moves. | [forest_maze](https://github.com/JohanBaskovec/forest_maze) |

## Technology

TypeScript throughout. The client is a Svelte app built with Vite and wrapped with Capacitor for the
native app. Game rules are plain TypeScript shared with the server. The server is a room engine that
runs on Node.js and on Cloudflare Workers with Durable Objects.

## Try it

Needs Node.js 22.12 or newer.

```bash
npm install
npm run dev            # open the address it prints
npm run dev:server     # the server for rooms (port 8787); `npm run dev` proxies to it
npm run check          # lint, types, unit tests, build
npm start              # after a build: the website and the rooms on one port
npm run test:e2e       # end-to-end tests at phone sizes
npm run android:build  # debug APK (needs the Android SDK and Java 21)
```

## Documentation

| Document | Content |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Working rules for coding agents |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the client, the games, the rooms and the two server hosts fit together |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisions taken, proposals awaiting confirmation, open questions |
| [`docs/GAMES.md`](docs/GAMES.md) | The three existing games and what porting each one involves |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones, in order |
