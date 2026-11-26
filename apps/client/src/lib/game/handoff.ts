/** What the shell needs to know about a screen to decide on a hand-off. */
export interface ScreenInfo {
  /** The seat that must act on this screen. */
  readonly seat: number;
  /** Does it show something the other seats must not see? (`BaseView.secret`) */
  readonly secret: boolean;
}

/**
 * On a shared phone, must a hand-off screen come before `next` (CLAUDE.md rule 2)?
 *
 * - Always at the start of a game and after a resume (`previous` is null).
 * - When the phone must change hands: the acting seat changes.
 * - When the next screen is secret and the previous one was not, even if the same seat holds the phone:
 *   other players often look at the result and would see the secret that follows.
 */
export function needsHandoff(previous: ScreenInfo | null, next: ScreenInfo): boolean {
  if (previous === null) return true;
  if (previous.seat !== next.seat) return true;
  return next.secret && !previous.secret;
}
