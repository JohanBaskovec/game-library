<script lang="ts">
  import type { CurseurView } from '../logic/index.ts';
  import { distanceText, pointsText, scoreLine } from './format.ts';
  import Scale from './Scale.svelte';
  import type { T } from './types.ts';
  import type { Locale } from '@game-library/game-kit';

  let {
    view,
    t,
    locale,
    send,
  }: { view: CurseurView; t: T; locale: Locale; send: (action: unknown) => void } = $props();

  const last = $derived(view.turnNumber >= view.turnCount);
</script>

<section class="screen">
  <p class="points">{pointsText(t, view.points ?? 0)}</p>
  <p class="detail">
    {distanceText(t, view.distance ?? 0)} · {t('clue.quote', { clue: view.clue ?? '' })}
  </p>

  {#if view.pair && view.target !== null}
    <Scale pair={view.pair} target={view.target} guess={view.guess} bands {t} />
  {/if}

  <ul class="legend" aria-hidden="true">
    <li><span class="legend-target"></span> {t('reveal.legend.target')}</li>
    <li><span class="legend-guess"></span> {t('reveal.legend.guess')}</li>
  </ul>

  <p class="score">{scoreLine(t, locale, view.score.total)}</p>

  <div class="actions">
    <button class="btn primary" type="button" onclick={() => send({ type: 'continue' })}>
      {last ? t('reveal.seeRecap') : t('reveal.continue')}
    </button>
  </div>
</section>

<style>
  .points {
    padding-top: 12px;
    text-align: center;
    font-size: clamp(2.6rem, 14vw, 4rem);
    font-weight: 800;
    color: var(--accent-ink);
  }

  .detail,
  .score {
    text-align: center;
    color: var(--muted);
  }

  .score {
    font-weight: 600;
  }

  .legend {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-target {
    width: 4px;
    height: 18px;
    border-radius: 2px;
    background: var(--text);
  }

  .legend-guess {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
