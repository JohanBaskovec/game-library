# Le Curseur: specification

This is the source of truth for the game. Rules for players are in [`rules.md`](rules.md). Ported from the
standalone game (`position-on-a-scale-finder-game`, commit `a1b706c`); the rules, numbers and order of
random draws are unchanged. Differences come from the library: the hand-off screens belong to the shell,
and the random numbers are seeded.

Versions: `rulesVersion` 1, `saveFormat` 1.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| Pair | Two opposite ideas: left (position 0) and right (position 100). |
| Target | Secret position drawn at random, an integer from 0 to 100. |
| Giver | The team that sees the target and gives the clue. |
| Guesser | The team that places the cursor. |
| Round | Both teams have been the giver once: 2 clues. The menu counts rounds. |
| Turn | One clue: one giver, one guesser, one target. |
| Seat | A team: seat 0 is team 1, seat 1 is team 2. |

## 2. Screens

Every screen shows the interface in French or English. The concept pairs are French only (section 7).

### 2.1 Menu

- Title, a one-line description.
- Two fields, "Team 1" and "Team 2": names are required, at most 20 characters, and must differ
  (ignoring case). Defaults are "The Blues" and "The Oranges" (in French "Les Bleus" and "Les Oranges").
- Number of rounds: a stepper with minus and plus, from 1 to 20, default 5, with a hint stating the total
  number of clues (2 per round).
- A collapsible summary of the rules, including the score bands.
- A note when the interface language is not the language of the concept pairs.
- **Play**, disabled while the input is invalid, with the reason shown.
- **Resume game**, only when a compatible saved game exists.
- The last names and number of rounds used are filled in again.

### 2.2 Hand-off (shell)

Shown by the shell, never by the game's own screens. It shows only: the round ("Round 2 / 5"), the team
name very large in the team colour, the role ("Your turn to give the clue" or "Your turn to guess"), a
warning for the giver that the other team must not see the next screen, the shared score, and **Ready**.
It never shows the target, the clue or the concepts.

On one phone, the shell shows it before the first screen of a game, after a resume, whenever the acting seat changes,
and whenever a secret view follows a view that was not secret (see section 3).

### 2.3 Give the clue

- The team's name and role.
- The ruler with the left and right concepts at its ends, the target, and the point bands around the
  target, to help calibrate the clue.
- A hint that the numbers are the points the other team earns, and that the screen must be hidden.
- **Other concepts**: replaces the pair with one not yet used in the game. The target does not move. No
  limit.
- A text field for the clue (at most 40 characters). One word is advised; spaces are allowed ("potato
  salad").
- **Submit the clue**, disabled while the field is empty or only spaces. There is no "pass".

### 2.4 Guess

- The team's name and role, the clue in large type, the two concepts.
- A ruler with a draggable cursor starting at the middle (50). No hint of the target.
- The cursor moves by touch (tap or drag), mouse, and keyboard: arrows and Page Up/Down move by 1 and
  10, shift with an arrow moves by 10, Home and End jump to the ends. It is exposed to assistive
  technology as a slider with a spoken value ("Hot 30 %, Cold 70 %").
- **Confirm**.

### 2.5 Result

- Points earned ("+3 points", or "0 points"), the distance ("Off by 4 %", or "Bullseye!") and the clue.
- The ruler with the target, its bands and the cursor, a legend, and the shared score.
- **Continue** (or **See the recap** after the last clue). Whoever continues is the guessing team, who
  holds the phone.

### 2.6 Recap

- The shared score, and a table with what each team earned as guesser and as giver.
- One card per turn: number, giver and guesser, points, clue, a compact ruler, and "Target 40 · Answer 45
  · off by 5".
- **Play again** (same teams and settings, new draw) and **Menu**.

### 2.7 Leaving

The shell offers **Quit** during a game, with a confirmation. Quitting discards the saved game. Leaving the
screen in any other way (the back button, closing the app) keeps the game saved for **Resume**.

## 3. Flow, seats and secrets

```
setup ──▶ give (giver sees target) ──clue──▶ guess (guesser) ──guess──▶ reveal (guesser)
             ▲                                                              │
             │                                         clues left? ── yes ───┤
             └──── next turn: the guesser becomes the giver ◀───────────────┤
                                                                            │ no
                                                                            ▼
                                                                          recap
```

The game state has four phases: `give`, `guess`, `reveal`, `recap`. The seat that must act is the giver in
`give`, the guesser in `guess` and in `reveal`, and the last guesser in `recap`.

**What each seat may see** (the `view` of the game; the shell and the server never read the state):

| Phase | Giver seat | Guesser seat |
|---|---|---|
| `give` | pair, target (**secret**) | nothing about the turn |
| `guess` | pair, clue, target (**secret**) | pair, clue |
| `reveal` | everything about the turn | everything about the turn |
| `recap` | all turns | all turns |

A view is flagged `secret` when it shows the target before the result. On one phone the shell shows a
hand-off before a view when the acting seat changes, or when the view is secret and the previous one was
not. This reproduces the original behaviour: after the result the same team keeps the phone but gets a
hand-off before seeing its next target (decision D-5 below).

### Rooms (several phones)

In a room each team has its own phone (or several), and each phone is shown the view of its seat. There is
no hand-off. The views are those of the table above, so a phone only ever receives what its seat may see:
the guessing team is never sent the target before the result.

- While the other team acts, a phone shows a waiting screen: "Waiting for {team} to give a clue…" (nothing
  else), or, for the giving team while the other guesses, the clue, the ruler with the target and its zones,
  and "Waiting for {team} to guess…".
- At the result both teams see it, but only the guessing team has the **Continue** button; the other phone
  says it is waiting.
- The host sets the teams' names and the number of rounds in the lobby, with the same fields as the menu.
  The names appear on the seats as soon as they are typed.
- At the recap, the host can take everyone back to the lobby for another game; the seats are kept.

## 4. Data

```ts
Config = { teamNames: [string, string]; roundCount: number; contentLocale: Locale }

State = {
  config: Config;                      // copy taken when the game starts
  startingTeam: 0 | 1;
  turns: Turn[];                       // one per clue played or in progress
  phase: 'give' | 'guess' | 'reveal' | 'recap';
  usedPairIndexes: number[];           // pairs already shown, including those rejected with "Other concepts"
  rng: { s: number };                  // seeded generator position
}

Turn = {
  giverTeam: 0 | 1; guesserTeam: 0 | 1;
  pair: [string, string]; pairIndex: number;
  target: number;                      // 0..100
  rerollCount: number;
  clue: string | null;
  guess: number | null;                // 0..100
  distance: number | null;
  points: number | null;               // 0..4
}
```

Actions (sent by a seat):

| Action | Allowed for | In phase | Effect |
|---|---|---|---|
| `{ type: 'reroll' }` | giver | `give` | New pair, same target |
| `{ type: 'clue', text }` | giver | `give` | Stores the clue (whitespace collapsed, at most 40 characters); fails if empty; phase becomes `guess` |
| `{ type: 'guess', position }` | guesser | `guess` | Rounds and clamps to 0..100, computes distance and points; phase becomes `reveal` |
| `{ type: 'continue' }` | guesser | `reveal` | Starts the next turn with the guesser as giver, or goes to `recap` after the last turn |

Errors are codes, never sentences: `invalid-action`, `wrong-seat`, `wrong-phase`, `empty-clue`.

## 5. Algorithms

### Random draws

All randomness comes from the seeded generator in the state, **in this order** (changing it changes every
game for every seed, so it needs a new `rulesVersion`):

1. `setup`: the starting team (an integer 0 or 1).
2. Starting a turn: the pair index among the unused pairs, then whether to swap left and right (swapped
   when the draw is below 0.5), then the target (an integer 0 to 100).
3. "Other concepts": the pair index, then the swap. The target is not drawn again.

When every pair has been used (a very long game), the list of used pairs is emptied and the draw starts
over from all pairs.

### Score

```
distance = |guess - target|
points   = distance <= 3.5  ? 4
         : distance <= 7    ? 3
         : distance <= 10.5 ? 2
         : distance <= 14   ? 1
         : 0
```

The bands are named constants (`SCORE_BANDS`). The cursor is an integer and bounds are included, so the
distances that actually occur are 3, 7, 10 and 14 or less.

### Totals

The shared score is the sum of the points of all turns. Each team's detail is what it earned as giver and
as guesser.

### Turn count

A game has `2 × roundCount` turns. The team that guesses in turn *i* gives the clue in turn *i + 1*.

## 6. Saving

The shell saves the game after every action. A saved game stores the config, the state, the game's
`rulesVersion` and `saveFormat`. It is ignored when a version differs or when the state fails the game's
own check (`restore`). A game that reached the recap is not kept. The shell always reopens a resumed game
on a hand-off.

## 7. Content

- 248 pairs of opposite ideas, French, in `content/fr.ts`, grouped by theme in comments. This file is the
  source of truth. Adding or removing a pair means a new `rulesVersion`.
- English pairs do not exist yet (open question O-6). A player using the English interface plays with the
  French pairs and is told so in the menu.

Quality criteria for a pair:

- The two ideas form a **continuous scale**: thousands of words can be placed between them (*Hot / Cold*:
  yes; *Cat / Table*: no).
- **Common** words, understood by every player, no jargon.
- **Short** (ideally 1 to 3 words per idea) so that they fit at the ends of the ruler on a phone.
- No obvious duplicate of another pair.
- Nothing that stigmatises a group of people (origin, gender, disability, religion).
- The left/right order does not matter: it is swapped at random.

## 8. Decisions

Validated by the user in the original project. Numbers are the original ones.

| # | Question | Decision |
|---|---|---|
| D-1 | What does "number of rounds" count? | A round is two clues, one per team, so both teams get exactly the same number of attempts. |
| D-2 | Shared score, or one per team? | Shared (co-operative), with each team's contribution in the recap. |
| D-3 | Is the clue typed or spoken? One word only? | Typed (shown to the guessers and in the recap). One word advised; spaces allowed. |
| D-4 | "Other concepts": unlimited? Does it change the target? | Unlimited; the target does not change. |
| D-5 | After the result, does the team that just guessed go straight to its clue? | No: a hand-off comes first, because the other team often looks at the result and would see the next target. |
| D-6 | Starting position of the guessing cursor | The middle (50). |
| D-7 | Target anywhere from 0 to 100, ends included? | Yes, uniform. |
| D-8 | Save the game in progress and the last settings? | Yes, resuming on a hand-off. |
| D-9 | Randomly swap the sides of the pairs? | Yes. |
| D-10 | Name shown | "Le Curseur" (the same in both languages for now). |
| D-11 | Are the point bands shown to the giver? | Yes, around the target; shown to everyone at the result. |

## 9. Acceptance checklist

- [ ] Menu: empty or identical names disable **Play**, with the reason shown.
- [ ] The starting team varies from one game to the next.
- [ ] The hand-off never shows the target, the concepts or the clue.
- [ ] **Other concepts** changes the pair, not the target; a pair never comes back in the same game.
- [ ] Submitting a clue is impossible when the field is empty or only spaces.
- [ ] The cursor moves by finger, mouse and keyboard.
- [ ] Points at the bounds: distance 3 gives 4, 4 gives 3, 7 gives 3, 8 gives 2, 10 gives 2, 11 gives 1,
      14 gives 1, 15 gives 0.
- [ ] Teams alternate; the number of clues played is 2 × rounds.
- [ ] The recap lists every turn with the right values and the right total.
- [ ] Reloading the page during a game offers **Resume**, which opens on a hand-off, never on a secret.
- [ ] Correct display at 320 px wide and on a computer, in both languages.
