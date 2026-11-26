# Roadmap

Milestones in order. Each one ends with something that can be run and checked. The order is a proposal
(P-8 in [`DECISIONS.md`](DECISIONS.md)).

| # | Milestone | Contains | Done when | Status |
|---|---|---|---|---|
| M0 | Documentation | This set of documents. | Done. | Done |
| M1 | Skeleton | Workspace and tooling (TypeScript, lint, tests). Client shell with an empty picker, settings and both languages. Storage, device and translation services. Android project. Checks run automatically on each push. | The empty library opens in a browser and on an Android emulator, in French and in English. | Done, except the run on Android (below) |
| M2 | Le Curseur on one phone | Game contract and local session. Le Curseur's logic with new tests, its interface, the shell's hand-off screen, save and resume. | A full game plays on one phone, offline, and behaves like the original. | Not started |
| M3 | Rooms | Room engine, protocol, Node.js host, lobby (create, join by code, link or QR code, seats, reconnect). Le Curseur in a room. | Two phones play Le Curseur through the local server, and neither receives the other's secret. | Not started |
| M4 | Online | Cloudflare host, first deployment, website address, version check between app and server. | Two phones on different networks play Le Curseur on the public site. | Not started |
| M5 | Un Banger | Logic with its ported tests, interface, single-device and room play. | Ported tests pass; full games play in both modes at every phone size. | Not started |
| M6 | Forest Maze | Canvas host component, logic with ported tests and self-play, interface in both languages, single-device and room play. | Self-play still wins across many maps; a full game plays in both modes. | Not started |
| M7 | Android release | Store listing, privacy policy, signed build, links that open the app. | The app is installable from the store. | Not started |

M1 was checked in a browser (unit tests, and end-to-end tests at four phone sizes in Chromium) and as an
Android debug build whose contents were inspected. It has **not** been run on an Android emulator or a
phone: that check is the user's, with the APK that CI uploads on every run.

Needed from the user along the way: the open questions of `DECISIONS.md`, each marked with the milestone
that needs it. None blocks M1.

## Later

Not scheduled, in no particular order:

- iOS app (D-10).
- Accounts, statistics, syncing across devices (D-3).
- English word lists and concept pairs for the word games (O-6).
- Website usable offline and installable (P-11).
- More games.
