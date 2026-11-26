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
| P-3 | Who holds the truth in a room | The server runs the game logic and sends each device only its seat's view. Devices send actions, never state. | Two of the three games have secrets between teams; a device must not hold what its players may not see. Implemented in M3. |
| P-4 | Seats | A seat is one side of a game (a team or a player). Several devices may share a seat; all of them see that seat's view and any of them may act for it. | Covers one phone per team, one phone per person, and teams split across places, with no extra rules per game. Implemented in M3. |
| P-5 | Joining a room | A short code, also offered as a link and a QR code. No account: a display name and a reconnect token kept on the device. | Matches D-3 (no accounts yet) and works for people sitting together. Implemented in M3. |
| P-6 | Room lifetime | Rooms live in memory (Node.js) or in the room's own storage (Cloudflare) and are deleted after a period without activity. No database. | Nothing needs to outlive a game until accounts and statistics arrive. Implemented in M3. |
| P-7 | Game ids | `le-curseur`, `un-banger`, `forest-maze`. | Stable, readable keys for folders, storage and room messages. |
| P-8 | Port order | Le Curseur, then rooms with Le Curseur, then Cloudflare hosting, then Un Banger, then Forest Maze. See `ROADMAP.md`. | Le Curseur is the smallest and already separates logic from interface. Proving rooms on one game before porting two more avoids redoing them. |
| P-10 | Storage | Games save through one shell service with keys prefixed per game and a save format version. Saved games of the old standalone versions are not migrated. | The old games live on other web addresses, so their saved data is unreachable anyway. |
| P-11 | Website offline | Single-device play works offline in the native app from the start. Making the website installable and usable offline (service worker) comes later. | The app bundles everything already; a service worker adds update and caching problems best handled once the site is stable. |
| P-12 | Tool versions | Latest stable Node.js LTS, Svelte, Vite, Capacitor and TypeScript at the time of scaffolding, pinned and recorded in `CLAUDE.md`. | Avoids writing version numbers into documentation before anything is installed. |
| P-14 | Real-time games in rooms | Actions are applied on the server and the result is sent back; no prediction on the device at first. | Simplest correct design. Forest Maze is cooperative, so a short delay is tolerable. To be revisited if it feels slow. Implemented in M3. |
| P-15 | Browser and Android targets | The build targets Chrome 100, Safari 15 and Firefox 100, and newer syntax and CSS are translated down to them. (The quit confirmation uses `<dialog>`, which needs Safari 15.4.) The Android app needs Android 7 (API 24) or newer and targets API 36, the Capacitor 8 defaults. | The iOS app's web view is as old as the phone's Safari; Safari 15 covers iPhones back to 2017. Revisit when a feature needs something newer. |
| P-16 | Routing | Hash routes (`#/settings`). | Work on any static host, under a sub-path, in the native app and on Cloudflare with no server rewriting, and the Android back button follows the history by default. |
| P-17 | Version pins | TypeScript stays on 6.0.x until `typescript-eslint` and `svelte-check` support 7. Playwright is pinned to the version of the browser preinstalled in the cloud environment. Versions are exact in `package.json`. | Reasons are listed in `CLAUDE.md`. |
| P-18 | Website deployment | Cloudflare Workers with static assets, not Pages, configured by `wrangler.jsonc` at the repository root; automatic deploys from GitHub with Workers Builds, set up as in `ARCHITECTURE.md` section 7.3. | Cloudflare recommends Workers for new projects, and the rooms (M4) will be a Worker in the same Cloudflare project. |
| P-19 | Hand-off on a shared phone | Every view says whether it is `secret`. The shell shows a hand-off before the first screen and after a resume, whenever the acting seat changes, and whenever a secret view follows one that was not secret. | One rule, with no game-specific code in the shell, that keeps the original Le Curseur behaviour (a hand-off after the result even though the same team keeps the phone) and also fits Un Banger and Forest Maze. See `ARCHITECTURE.md` section 5.3. |
| P-20 | Game packages and loading | Each game is an npm workspace `@game-library/<id>` with `manifest.ts`, `logic/`, `content/`, `i18n/`, `ui/` and `docs/`. The shell finds `games/<id>/ui/index.ts` by its place and loads it only when the game is opened. | Adding a game touches only its own folder and one line of the registry; the picker stays light (the game's interface is its own 35 KB chunk). |
| P-21 | Saved single-device games | A save is an envelope with the game id, `rulesVersion` and `saveFormat`, ignored if any differs or if the game's `restore` refuses the state. A finished game is not kept; quitting deletes the save; leaving by the back button keeps it. | An update can never load a game that no longer fits, and a hand-held game survives an accidental reload (D-8 of the original game). |
| P-22 | Names and languages in Le Curseur | The title "Le Curseur" is the same in both languages (until O-7 is answered). The default team names are translated interface text ("The Blues", "Les Bleus"), not part of the logic. The concept pairs stay French, and a player using the English interface is told so in the menu and on the picker. | Keeps the logic free of interface text (rule 7) and honest about content that exists in one language only (O-6). |
| P-23 | Seats are an honour system | Any device can take or leave any seat at any time, also during a game; seats are not locked. A device with no seat watches and sees no game. | The games are cooperative: nobody is an opponent, so locking seats would only get in the way of a phone that died or a player who joins late. The secrets are for the fun of the game, not security. |
| P-24 | Room codes and limits | Codes are five characters from 32 that cannot be confused (about 33 million). A room is deleted 15 minutes after its last device left, or after 3 hours without a message. Guessing codes, creating rooms and sockets are limited per address (see `ARCHITECTURE.md` section 6.4). | Short enough to type, hard enough to guess with the limits; time limits keep memory bounded. The numbers are defaults that can be tuned. |
| P-25 | Where rooms work | A website served by the Node.js host uses its own origin. The native app needs `VITE_SERVER_URL` at build time and says rooms are unavailable without it. The server accepts any origin by default. | The app is served from `https://localhost` inside the phone, so it cannot guess the server. No cookies or accounts exist, so open origins expose nothing (D-3). |
| P-26 | Running the Node.js host | Single-file bundle built with esbuild for production (`npm start`); the TypeScript runs directly with Node's type stripping in development. No parameter properties in code Node runs this way. | No extra tooling to run it; production is tested in CI (the end-to-end tests run against the bundle). |

## Open questions

Numbers are not reused: O-3 and O-4 were answered on 2026-11-26 (no single-player game is planned, so
D-8 stands as written; O-4 became D-13).

| # | Question | Needed by |
|---|---|---|
| O-1 | Name of the library, as shown in the app and the stores ("Game Library" is used as a placeholder until then), and the website address. Links that open the app (M7) need a domain the user controls. | M4 (address), M7 (name) |
| O-2 | Production hosting. D-11 keeps both options open. Cloudflare's free plan looks sufficient to start (see `ARCHITECTURE.md`, "Cloudflare host"). Confirm before the first deployment. | M4 |
| O-5 | Forest Maze's AI partner: single-device play only, or can it also fill an empty seat in a room? | M6 |
| O-6 | English word list for Un Banger and English concept pairs for Le Curseur: who writes them, and when? | After M5 |
| O-7 | Are game titles translated? "Le Curseur" and "Le Jeu Masterclass, Un Banger" are French names. For now Le Curseur has the same title in both languages (P-22). | M5 (before the next game) |
| O-8 | What happens to the three original repositories once their port is released: archived, or replaced by a link to the library? | After each port |
| O-9 | Store publication: Google Play developer account, privacy policy, store listing, age rating. | M7 |
| O-11 | Which server does the Android app talk to? It needs `VITE_SERVER_URL` at build time (P-25), and a public address is needed for the links and QR codes (`VITE_PUBLIC_URL`). | M4 (deployment), M7 (release) |
| O-10 | In a room, a team's clue is typed on one device. Should rooms offer anything for teams that are not together (for example a team chat), or is talking left to the players? | M3 |
