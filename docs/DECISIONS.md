# Decisions

Three lists: what the user has decided, what the agent proposes until told otherwise, and what is still
open. Every new question goes here before it is answered in code.

## Decided by the user

Dates are the day the decision was taken.

| # | Subject | Decision | Date |
|---|---|---|---|
| D-1 | Product | A library of several games, delivered as a website and as a native app. | 2026-11-26 |
| D-2 | Technology | TypeScript everywhere. Capacitor for the web and mobile apps. A TypeScript server that runs on Node.js. | 2026-11-26 |
| D-3 | Server scope | First version: host the website, serve the catalog, run multiplayer rooms. Accounts and statistics come later. | 2026-11-26 |
| D-4 | Existing games | Le Curseur, Un Banger and Forest Maze are ported to TypeScript. This repository becomes their home; the original repositories are no longer developed. | 2026-11-26 |
| D-5 | Interface code | Rules and logic in plain TypeScript, outside Svelte, testable and shared with the server. Svelte for the app shell (picker, settings, lobby) and for all screens of interface-heavy games. Canvas games use Svelte for the HUD and screens plus one Svelte component that hosts the canvas and runs a plain drawing loop. | 2026-11-26 |
| D-6 | Interface languages | French and English from the start. Games built on word lists stay French-only in content until English lists are written. | 2026-11-26 |
| D-7 | Working language | English for code, identifiers, comments, documentation and commit messages. | 2026-11-26 |
| D-8 | Ways to play | Every game is playable on several devices, both by players in the same place and online. Some games (the current three) are also playable on a single shared phone. | 2026-11-26 |
| D-9 | Local play on several phones | Goes through the server, exactly like online play. Each phone needs an internet connection. Playing offline between phones is not planned. | 2026-11-26 |
| D-10 | Native platforms | Android first. iOS later; the code stays iOS-compatible meanwhile (safe areas, no Android-only plugin). | 2026-11-26 |
| D-11 | Server design | The room logic is plain TypeScript that knows nothing about its host. A Node.js host runs it for development, tests and ordinary hosting; a Cloudflare host (Workers + Durable Objects) runs the same code. | 2026-11-26 |

## Proposed by the agent, not yet confirmed

These are working defaults. They become decisions when the user confirms them, or are replaced.

| # | Subject | Proposal | Why |
|---|---|---|---|
| P-1 | Repository layout | One repository with npm workspaces: `apps/`, `packages/`, `games/` as described in `ARCHITECTURE.md`. | Client, server and games share code and must change together. npm needs no extra tool. |
| P-2 | Client framework setup | Plain Svelte + Vite single-page app with a small client-side router. Not SvelteKit. | The app is fully static and offline-first; SvelteKit's server features would go unused and complicate the Capacitor build. |
| P-3 | Who holds the truth in a room | The server runs the game logic and sends each device only its seat's view. Devices send actions, never state. | Two of the three games have secrets between teams; a device must not hold what its players may not see. |
| P-4 | Seats | A seat is one side of a game (a team or a player). Several devices may share a seat; all of them see that seat's view and any of them may act for it. | Covers one phone per team, one phone per person, and teams split across places, with no extra rules per game. |
| P-5 | Joining a room | A short code, also offered as a link and a QR code. No account: a display name and a reconnect token kept on the device. | Matches D-3 (no accounts yet) and works for people sitting together. |
| P-6 | Room lifetime | Rooms live in memory (Node.js) or in the room's own storage (Cloudflare) and are deleted after a period without activity. No database. | Nothing needs to outlive a game until accounts and statistics arrive. |
| P-7 | Game ids | `le-curseur`, `un-banger`, `forest-maze`. | Stable, readable keys for folders, storage and room messages. |
| P-8 | Port order | Le Curseur, then rooms with Le Curseur, then Cloudflare hosting, then Un Banger, then Forest Maze. See `ROADMAP.md`. | Le Curseur is the smallest and already separates logic from interface. Proving rooms on one game before porting two more avoids redoing them. |
| P-9 | Tests | Vitest for logic and the room engine; Playwright for the interface and for multi-device flows. | Both run in the cloud environment; Playwright and Chromium are preinstalled there. |
| P-10 | Storage | Games save through one shell service with keys prefixed per game and a save format version. Saved games of the old standalone versions are not migrated. | The old games live on other web addresses, so their saved data is unreachable anyway. |
| P-11 | Website offline | Single-device play works offline in the native app from the start. Making the website installable and usable offline (service worker) comes later. | The app bundles everything already; a service worker adds update and caching problems best handled once the site is stable. |
| P-12 | Tool versions | Latest stable Node.js LTS, Svelte, Vite, Capacitor and TypeScript at the time of scaffolding, pinned and recorded in `CLAUDE.md`. | Avoids writing version numbers into documentation before anything is installed. |
| P-13 | Styling | Plain CSS: shared design tokens as CSS custom properties in the shell, scoped styles in Svelte components, light and dark themes following the system setting. No CSS framework. | Same approach as the existing games; nothing to learn. |
| P-14 | Real-time games in rooms | Actions are applied on the server and the result is sent back; no prediction on the device at first. | Simplest correct design. Forest Maze is cooperative, so a short delay is tolerable. To be revisited if it feels slow. |

## Open questions

| # | Question | Needed by |
|---|---|---|
| O-1 | Name of the library, as shown in the app and the stores. Also the Android application id (for example `fr.johanbaskovec.games`, which cannot change after publication) and the website address. | M1 (application id), M4 (address) |
| O-2 | Production hosting. D-11 keeps both options open. Cloudflare's free plan looks sufficient to start (see `ARCHITECTURE.md`, "Cloudflare host"). Confirm before the first deployment. | M4 |
| O-3 | Will single-player games join the library later (a roguelike and a colony simulation were mentioned)? D-8 says every game is playable on several devices; a single-player game has no second seat. | Before the first such game |
| O-4 | Forest Maze has no written rules or specification in its repository; its README refers to a spec that is not there. Is there one elsewhere, or should it be written from the code during the port? | M6 |
| O-5 | Forest Maze's AI partner: single-device play only, or can it also fill an empty seat in a room? | M6 |
| O-6 | English word list for Un Banger and English concept pairs for Le Curseur: who writes them, and when? | After M5 |
| O-7 | Are game titles translated? "Le Curseur" and "Le Jeu Masterclass, Un Banger" are French names. | M2 |
| O-8 | What happens to the three original repositories once their port is released: archived, or replaced by a link to the library? | After each port |
| O-9 | Store publication: Google Play developer account, privacy policy, store listing, age rating. | M7 |
| O-10 | In a room, a team's clue is typed on one device. Should rooms offer anything for teams that are not together (for example a team chat), or is talking left to the players? | M3 |
