<script lang="ts">
  import { untrack } from 'svelte';
  import type { Locale } from '@game-library/game-kit';
  import { SCORE_BANDS, leCurseur, type Config } from '../logic/index.ts';
  import { startingConfig } from './config.ts';
  import ConfigEditor from './ConfigEditor.svelte';
  import type { T } from './types.ts';

  let {
    t,
    locale,
    savedConfig,
    canResume,
    onStart,
    onResume,
  }: {
    t: T;
    locale: Locale;
    savedConfig: Config | null;
    canResume: boolean;
    onStart: (config: Config) => void;
    onResume: () => void;
  } = $props();

  // The last settings used, or the defaults of the language. Read once: the editor then owns the fields.
  const initial = untrack(() => startingConfig(savedConfig, t));
  let config = $state.raw<Config>(initial);
  const invalid = $derived(leCurseur.validateConfig(config) !== null);

  const numbers = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
  const bands = $derived(
    SCORE_BANDS.map((band) =>
      t('menu.rules.band', { points: band.points, max: numbers.format(band.max) }),
    ).join(', '),
  );

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!invalid) onStart(config);
  }
</script>

<section class="screen">
  <div class="head">
    <h1>{t('menu.title')}</h1>
    <p class="tagline">{t('menu.tagline')}</p>
  </div>

  <form class="form" novalidate onsubmit={submit}>
    <ConfigEditor {t} value={initial} onchange={(next) => (config = next)} />

    <details class="rules">
      <summary>{t('menu.rules.title')}</summary>
      <ol>
        <li>{t('menu.rules.1')}</li>
        <li>{t('menu.rules.2')}</li>
        <li>{t('menu.rules.3')}</li>
        <li>{t('menu.rules.4', { bands })}</li>
        <li>{t('menu.rules.5')}</li>
      </ol>
    </details>

    {#if config.contentLocale !== locale}
      <p class="hint">{t('menu.contentNote')}</p>
    {/if}

    <div class="actions">
      {#if canResume}
        <button class="btn secondary" type="button" onclick={onResume}>{t('menu.resume')}</button>
      {/if}
      <button class="btn primary" type="submit" disabled={invalid}>{t('menu.play')}</button>
    </div>
  </form>
</section>

<style>
  .head {
    padding: 24px 0 8px;
    text-align: center;
  }

  h1 {
    font-size: 2.6rem;
    letter-spacing: -0.02em;
    color: var(--accent-ink);
  }

  .tagline {
    margin-top: 6px;
    color: var(--muted);
  }

  .form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .rules {
    padding: 0 14px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  /* The whole row is the tap target, so it must be at least 44 px high. */
  .rules summary {
    box-sizing: border-box;
    min-height: var(--tap);
    padding: 10px 0;
    font-weight: 600;
    cursor: pointer;
  }

  .rules ol {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding-left: 1.2em;
    font-size: 0.95rem;
  }
</style>
