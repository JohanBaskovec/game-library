<script lang="ts">
  import { DEFAULT_GUESS, type CurseurView } from '../logic/index.ts';
  import Scale from './Scale.svelte';
  import type { T } from './types.ts';

  let { view, t, send }: { view: CurseurView; t: T; send: (action: unknown) => void } = $props();

  let value = $state(DEFAULT_GUESS);
</script>

<section class="screen">
  <p class="role-line">{t('guess.line', { team: view.teamNames[view.seat] })}</p>

  <div class="clue-box">
    <span class="kicker">{t('guess.clue.label')}</span>
    <p class="clue">{t('clue.quote', { clue: view.clue ?? '' })}</p>
  </div>

  {#if view.pair}
    <Scale pair={view.pair} interactive bind:value {t} />
  {/if}
  <p class="hint">{t('guess.hint')}</p>

  <div class="actions">
    <button
      class="btn primary"
      type="button"
      onclick={() => send({ type: 'guess', position: value })}
    >
      {t('guess.submit')}
    </button>
  </div>
</section>

<style>
  .role-line {
    font-size: 1.15rem;
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
