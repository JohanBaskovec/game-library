<script lang="ts">
  import type { Locale } from '@game-library/game-kit';
  import type { CurseurView, Team } from '../logic/index.ts';
  import { pointsText, totalText } from './format.ts';
  import Scale from './Scale.svelte';
  import type { T } from './types.ts';

  let { view, t, locale }: { view: CurseurView; t: T; locale: Locale } = $props();

  const teams: readonly Team[] = [0, 1];
</script>

<section class="screen">
  <h2 class="title">{t('recap.title')}</h2>

  <div class="total-box">
    <span class="kicker">{t('recap.total.label')}</span>
    <p class="total">{totalText(t, locale, view.score.total)}</p>
  </div>

  <div class="team-table">
    <span class="th first">{t('recap.team')}</span>
    <span class="th">{t('recap.asGuesser')}</span>
    <span class="th">{t('recap.asGiver')}</span>
    {#each teams as team (team)}
      <span class="team seat-{team}">{view.teamNames[team]}</span>
      <span class="num">{view.score.byTeam[team].asGuesser}</span>
      <span class="num">{view.score.byTeam[team].asGiver}</span>
    {/each}
  </div>

  <ol class="turns">
    {#each view.turns as turn, i (i)}
      <li class="turn">
        <div class="head">
          <span class="number">{i + 1}.</span>
          <span class="who">
            <span class="team seat-{turn.giverTeam}">{view.teamNames[turn.giverTeam]}</span>
            →
            <span class="team seat-{turn.guesserTeam}">{view.teamNames[turn.guesserTeam]}</span>
          </span>
          <span class="points">{pointsText(t, turn.points)}</span>
        </div>
        <p class="clue">{t('clue.quote', { clue: turn.clue })}</p>
        <Scale pair={turn.pair} target={turn.target} guess={turn.guess} bands compact {t} />
        <p class="meta">
          {t('recap.turnMeta', {
            target: turn.target,
            guess: turn.guess,
            distance: turn.distance,
          })}
        </p>
      </li>
    {/each}
  </ol>
</section>

<style>
  .title {
    padding-top: 8px;
    text-align: center;
    font-size: 1.8rem;
  }

  .total-box {
    text-align: center;
  }

  .total {
    font-size: 3.4rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--accent-ink);
  }

  .team-table {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px 14px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    font-size: 0.95rem;
  }

  .th {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    text-align: right;
  }

  .th.first {
    text-align: left;
  }

  .num {
    text-align: right;
    font-weight: 700;
  }

  .team {
    font-weight: 700;
  }

  .seat-0 {
    color: var(--seat-0-ink);
  }

  .seat-1 {
    color: var(--seat-1-ink);
  }

  .turns {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .turn {
    padding: 10px 14px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 0.9rem;
  }

  .number {
    font-weight: 700;
    color: var(--muted);
  }

  .who {
    flex: 1;
    overflow-wrap: anywhere;
  }

  .points {
    font-size: 1.2rem;
    font-weight: 800;
  }

  .clue {
    margin-top: 2px;
    font-size: 1.25rem;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
