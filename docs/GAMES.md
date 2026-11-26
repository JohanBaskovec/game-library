# The existing games

The three games to port, as found in their repositories on 2026-11-26, and what each port involves.
The original repositories are read-only references (D-4 in [`DECISIONS.md`](DECISIONS.md)).

## Summary

| | Le Curseur | Le Jeu Masterclass, Un Banger | Forest Maze |
|---|---|---|---|
| Library id (P-7) | `le-curseur` | `un-banger` | `forest-maze` |
| Repository | [position-on-a-scale-finder-game](https://github.com/JohanBaskovec/position-on-a-scale-finder-game) | [word-guessing-game](https://github.com/JohanBaskovec/word-guessing-game) | [forest_maze](https://github.com/JohanBaskovec/forest_maze) |
| Commit read | `a1b706c` | `6069221` | `7747b48` |
| Sides | 2 teams | 2 teams | 2 players |
| Co-operative | Yes, shared score | Yes, win or lose together | Yes |
| Pace | Turn by turn | Turn by turn | Real time, against a clock |
| Secrets | The target position | Each team's colour key | None |
| Interface language | French | French | English |
| Content | 248 pairs of opposite ideas | Common nouns, plus proper nouns in categories | None (generated maps) |
| Drawing | HTML and CSS | HTML and CSS | Canvas, with HTML for the HUD |
| Code | `index.html`, `style.css`, three scripts (about 32 KB of JavaScript) | One `index.html` (79 KB) | One `index.html` (125 KB) |
| Code language | English | French, identifiers included | English |
| Logic separate from interface | Yes: `js/game.js` has no DOM access | Yes: script blocks `mots`, `aleatoire`, `jeu` | Yes: between `LOGIC START` and `LOGIC END` markers |
| Seeded random | No: one replaceable `random()` function | Yes: everything derives from a seed, in a fixed draw order | Yes: seeded generator, maps reproducible from a seed |
| Tests | None; manual checklist in the spec | `tests/jeu.test.js`, run with `node --test` (31 KB) | `FM.runTests()` in the browser console, plus AI self-play |
| Documentation | Rules, spec, concepts, decisions (French) | Rules, spec (French) | README only |
| Saved in the browser | Settings and game in progress | Settings and game in progress | Settings |
| Device features | Pointer and keyboard | Screen wake lock, vibration | Screen wake lock, vibration, generated sounds, safe-area insets |

## What the old rules become

The standalone games had strict constraints that the library replaces, and others that it keeps.

| Old constraint | In the library |
|---|---|
| No build step, opens from `file://`, no ES modules, a single `index.html` | Dropped. TypeScript modules built with Vite. |
| Vanilla JavaScript only, no framework, no dependency | Dropped for the interface (Svelte). Game logic stays dependency-free plain TypeScript. |
| No installable app | Dropped: the library is also a native app. |
| Works offline, no remote resource | Kept for single-device play. |
| Phone in portrait first, touch targets of 44 px, also usable on a computer | Kept. |
| The other team never sees a secret; hand-off screens; a resumed game reopens on a hand-off screen | Kept, and moved into the shell so every game gets it. |
| Logic free of DOM and storage, testable under Node.js | Kept and tightened: also free of clock and unseeded randomness. |
| Everything random derives from a seed (Un Banger, Forest Maze) | Kept, and extended to Le Curseur. |
| Game saved after every action | Kept, through the shell's storage service. |
| Version bump when the word list or the state shape changes (Un Banger) | Kept as `rulesVersion` and save format version for every game. |
| French typography in interface text | Kept for French strings. |
| Quality rules for words and concept pairs | Kept; moved into each game's `docs/`. |
| No names, artwork, texts or lists from commercial games | Kept. |

## Le Curseur

**Ported in M2** to `games/le-curseur` (rules and specification in English in its `docs/`). Notes for the
next ports:

- The original's rules, numbers, 248 concept pairs and order of random draws are unchanged. The pairs were
  converted by script and checked identical to the original; the ruler's zone drawing was checked
  identical for all 101 target positions.
- The original had no tests. The port has about 100, from the acceptance checklist of its spec, including
  the score at every boundary, never repeating a pair, alternation, what each seat may see, and refusing
  damaged saves. Each important rule was also checked by breaking it on purpose.
- Differences that come from the library, not from a redesign: the two hand-off phases left the state
  machine for the shell; the random numbers are seeded; the rules summary is built from the score
  constants; the interface is in English and French.
- **In rooms (M3):** a team's phone gets its seat's view. The waiting screens, a reusable settings editor
  (`ConfigEditor`) and `seatNames` were added for this; the rules did not change. Several phones can share
  a team. Next ports: give every game these three things (`seatNames`, `ConfigEditor`, waiting screens for
  a seat that is not acting) and a test that the other seat is never sent a secret.
- Found while porting: the "How to play" row was smaller than 44 px, and a 20-letter team name made the
  page scroll sideways on a phone. Both were fixed (they existed in the original).
- Plan, as written before the port:

- **Port first** (P-8): the smallest game, turn-based, logic already isolated.
- Logic: `js/game.js` to TypeScript. The hand-off phases (`handoff-give`, `handoff-guess`) leave the
  state machine and become the shell's hand-off screen. `random()` becomes the shared seeded generator.
- Content: `js/concepts.js` moves to `content/` as the French list. No English list yet (O-6).
- Tests: none exist. Write them from the acceptance checklist in the original `docs/SPEC.md`, section 7,
  starting with the score bands at their boundaries.
- Rooms: the giving team's view holds the target; the guessing team's view must not until the reveal.
  Simultaneous devices on the guessing seat all move the same slider.
- Documents to translate: `REGLES.md`, `SPEC.md`, `CONCEPTS.md`, and the game-specific rows of
  `DECISIONS.md`.

## Le Jeu Masterclass, Un Banger

- Logic: script blocks `mots`, `aleatoire` and `jeu` to TypeScript, with French identifiers renamed to
  English using one glossary written at the start of the port and kept in the game's `docs/`.
- Keep the random generator and the draw order exactly, so the existing tests can be ported with their
  expected values. This is the safety net of the port: port the tests first.
- Content: common nouns and the categories of proper nouns move to `content/` as the French list, with
  the existing checks (no duplicates ignoring case and accents, lower-case common nouns, capitalised
  proper nouns in a category).
- Interface: the grid that fits 25 cards on screen without scrolling is the delicate part. Re-verify it
  at every phone size with the longest words.
- Rooms: each team's view holds only its own key. Preparation ("both teams ready") maps naturally onto
  the room lobby.
- Documents to translate: `regles.md` and `specification.md` (34 KB, the source of truth).

## Forest Maze

- **Port last**: the largest game, real-time, and the first to need the canvas host component.
- Logic: the section between the `LOGIC START` and `LOGIC END` markers to TypeScript, including map
  generation, the clock and the AI partner (`aiChoose`). The clock already takes the time as an input
  (`tick(state, nowMs)`), which fits the logic contract.
- Tests: `runTests` and `selfPlay` move to the unit test suite. Winnability across many generated maps
  is the important property; keep the bulk run, as a slower test if needed.
- Interface: Svelte for the title, setup, HUD and overlays; the map drawing, camera and pointer handling
  stay plain canvas code inside the canvas host component.
- Device: sounds, vibration and wake lock go through the shell's device service.
- Rooms: each player's device holds that player's set of actions; no secrets. The first real-time game
  in rooms, so the place where delay will be judged (P-14).
- Documents: none exist beyond the README. Write `rules.md` and `spec.md` from the code as part of the
  port (D-13), before changing the logic, so the port has something to be checked against.
- Open point: the role of the AI partner in rooms (O-5).
- Interface text is English only today; French must be written.
