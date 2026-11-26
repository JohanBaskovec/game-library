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
| D-12 | Android application id | `fr.johanindustry.games`. It cannot change once the app is published. | 2026-11-26 |
| D-13 | Forest Maze documentation | Its rules and specification are written from the code during the port; no other spec exists. | 2026-11-26 |
| D-14 | Repository layout | One repository with npm workspaces: `apps/`, `packages/`, `games/` as described in `ARCHITECTURE.md`. (Was P-1.) | 2026-11-26 |
| D-15 | Client setup | Plain Svelte + Vite single-page app with a small client-side router; not SvelteKit. (Was P-2.) | 2026-11-26 |
| D-16 | Tests | Vitest for logic and the room engine; Playwright for the interface and multi-device flows. (Was P-9.) | 2026-11-26 |
| D-17 | Styling | Plain CSS: shared design tokens as CSS custom properties, scoped styles in Svelte components, light and dark following the system. No CSS framework. (Was P-13.) | 2026-11-26 |

## Proposed by the agent, not yet confirmed

These are working defaults. They become decisions when the user confirms them, or are replaced.

| # | Subject | Proposal | Why |
|---|---|---|---|
| P-3 | Who holds the truth in a room | The server runs the game logic and sends each device only its seat's view. Devices send actions, never state. | Two of the three games have secrets between teams; a device must not hold what its players may not see. |
| P-4 | Seats | A seat is one side of a game (a team or a player). Several devices may share a seat; all of them see that seat's view and any of them may act for it. | Covers one phone per team, one phone per person, and teams split across places, with no extra rules per game. |
| P-5 | Joining a room | A short code, also offered as a link and a QR code. No account: a display name and a reconnect token kept on the device. | Matches D-3 (no accounts yet) and works for people sitting together. |
| P-6 | Room lifetime | Rooms live in memory (Node.js) or in the room's own storage (Cloudflare) and are deleted after a period without activity. No database. | Nothing needs to outlive a game until accounts and statistics arrive. |
| P-7 | Game ids | `le-curseur`, `un-banger`, `forest-maze`. | Stable, readable keys for folders, storage and room messages. |
| P-8 | Port order | Le Curseur, then rooms with Le Curseur, then Cloudflare hosting, then Un Banger, then Forest Maze. See `ROADMAP.md`. | Le Curseur is the smallest and already separates logic from interface. Proving rooms on one game before porting two more avoids redoing them. |
| P-10 | Storage | Games save through one shell service with keys prefixed per game and a save format version. Saved games of the old standalone versions are not migrated. | The old games live on other web addresses, so their saved data is unreachable anyway. |
| P-11 | Website offline | Single-device play works offline in the native app from the start. Making the website installable and usable offline (service worker) comes later. | The app bundles everything already; a service worker adds update and caching problems best handled once the site is stable. |
| P-12 | Tool versions | Latest stable Node.js LTS, Svelte, Vite, Capacitor and TypeScript at the time of scaffolding, pinned and recorded in `CLAUDE.md`. | Avoids writing version numbers into documentation before anything is installed. |
| P-14 | Real-time games in rooms | Actions are applied on the server and the result is sent back; no prediction on the device at first. | Simplest correct design. Forest Maze is cooperative, so a short delay is tolerable. To be revisited if it feels slow. |
| P-15 | Browser and Android targets | The build targets Chrome 100, Safari 15 and Firefox 100, and newer syntax and CSS are translated down to them. The Android app needs Android 7 (API 24) or newer and targets API 36, the Capacitor 8 defaults. | The iOS app's web view is as old as the phone's Safari; Safari 15 covers iPhones back to 2017. Revisit when a feature needs something newer. |
| P-16 | Routing | Hash routes (`#/settings`). | Work on any static host, under a sub-path, in the native app and on Cloudflare with no server rewriting, and the Android back button follows the history by default. |
| P-17 | Version pins | TypeScript stays on 6.0.x until `typescript-eslint` and `svelte-check` support 7. Playwright is pinned to the version of the browser preinstalled in the cloud environment. Versions are exact in `package.json`. | Reasons are listed in `CLAUDE.md`. |

## Open questions

Numbers are not reused: O-3 and O-4 were answered on 2026-11-26 (no single-player game is planned, so
D-8 stands as written; O-4 became D-13).

| # | Question | Needed by |
|---|---|---|
| O-1 | Name of the library, as shown in the app and the stores ("Game Library" is used as a placeholder until then), and the website address. Links that open the app (M7) need a domain the user controls. | M4 (address), M7 (name) |
| O-2 | Production hosting. D-11 keeps both options open. Cloudflare's free plan looks sufficient to start (see `ARCHITECTURE.md`, "Cloudflare host"). Confirm before the first deployment. | M4 |
| O-5 | Forest Maze's AI partner: single-device play only, or can it also fill an empty seat in a room? | M6 |
| O-6 | English word list for Un Banger and English concept pairs for Le Curseur: who writes them, and when? | After M5 |
| O-7 | Are game titles translated? "Le Curseur" and "Le Jeu Masterclass, Un Banger" are French names. | M2 |
| O-8 | What happens to the three original repositories once their port is released: archived, or replaced by a link to the library? | After each port |
| O-9 | Store publication: Google Play developer account, privacy policy, store listing, age rating. | M7 |
| O-10 | In a room, a team's clue is typed on one device. Should rooms offer anything for teams that are not together (for example a team chat), or is talking left to the players? | M3 |
