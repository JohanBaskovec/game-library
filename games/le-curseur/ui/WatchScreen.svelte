<script lang="ts">
  import type { CurseurView } from '../logic/index.ts';
  import Scale from './Scale.svelte';
  import type { T } from './types.ts';

  /**
   * What a team sees while the other team acts: in a room, each team has its own phone. The team
   * giving the clue waits for the guess (and may look at its own clue and target); the other waits for the clue.
   */
  let { view, t }: { view: CurseurView; t: T } = $props();

  const acting = $derived(view.teamNames[view.actingSeat]);
</script>

<section class="screen">
  {#if view.phase === 'give'}
    <p class="wait">{t('wait.give', { team: acting })}</p>
  {:else}
    <p class="wait">{t('wait.guess', { team: acting })}</p>
    <div class="clue-box">
      <span class="kicker">{t('guess.clue.label')}</span>
      <p class="clue">{t('clue.quote', { clue: view.clue ?? '' })}</p>
    </div>
    {#if view.pair && view.target !== null}
      <Scale pair={view.pair} target={view.target} bands {t} />
    {/if}
    <p class="hint">{t('give.hint')}</p>
  {/if}
</section>

<style>
  .wait {
    padding: var(--space-4) 0;
    text-align: center;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--accent-ink);
  }

  .clue-box {
    padding: 12px 16px;
    border: 2px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    text-align: center;
  }

  .clue {
    font-size: clamp(1.8rem, 9vw, 2.6rem);
    font-weight: 800;
    overflow-wrap: anywhere;
  }
</style>
