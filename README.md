# Game Library

A library of small multiplayer games, available as a website and as a native app (Android first, iOS
later). Play together on one phone, on several phones in the same room, or online.

**Status: design phase.** This repository contains documentation only; no code has been written yet.

## Games

| Game | In short | Origin |
|---|---|---|
| Le Curseur | Two teams. Make the other team find a position between two opposite ideas with a single word. | [position-on-a-scale-finder-game](https://github.com/JohanBaskovec/position-on-a-scale-finder-game) |
| Le Jeu Masterclass, Un Banger | Two teams, 25 words. Each team gets the other to find its secret words with one-word clues. | [word-guessing-game](https://github.com/JohanBaskovec/word-guessing-game) |
| Forest Maze | Two players guide four animals out of a forest against the clock, each holding only some of the moves. | [forest_maze](https://github.com/JohanBaskovec/forest_maze) |

## Technology

TypeScript throughout. The client is a Svelte app built with Vite and wrapped with Capacitor for the
native app. Game rules are plain TypeScript shared with the server. The server is a room engine that
runs on Node.js and on Cloudflare Workers.

## Documentation

| Document | Content |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Working rules for coding agents |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the client, the games, the rooms and the two server hosts fit together |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisions taken, proposals awaiting confirmation, open questions |
| [`docs/GAMES.md`](docs/GAMES.md) | The three existing games and what porting each one involves |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones, in order |
