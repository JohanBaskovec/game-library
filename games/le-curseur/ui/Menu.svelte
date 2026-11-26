<script lang="ts">
  import { untrack } from 'svelte';
  import type { Locale } from '@game-library/game-kit';
  import {
    DEFAULT_CONTENT_LOCALE,
    MAX_NAME_LENGTH,
    ROUNDS,
    SCORE_BANDS,
    leCurseur,
    type Config,
    type ConfigError,
  } from '../logic/index.ts';
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

  // The last settings used, or the defaults of the language. Read once: the menu then owns its fields.
  const initial = untrack(() => ({
    names: [
      savedConfig?.teamNames[0] || t('menu.team1.default'),
      savedConfig?.teamNames[1] || t('menu.team2.default'),
    ],
    rounds: savedConfig?.roundCount ?? ROUNDS.default,
    contentLocale: savedConfig?.contentLocale ?? DEFAULT_CONTENT_LOCALE,
  }));

  let name0 = $state(initial.names[0] ?? '');
  let name1 = $state(initial.names[1] ?? '');
  let rounds = $state(initial.rounds);

  const config = $derived(
    leCurseur.normalizeConfig({
      teamNames: [name0, name1],
      roundCount: rounds,
      contentLocale: initial.contentLocale,
    }),
  );
  const error = $derived(leCurseur.validateConfig(config) as ConfigError | null);

  const numbers = $derived(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
  const bands = $derived(
    SCORE_BANDS.map((band) =>
      t('menu.rules.band', { points: band.points, max: numbers.format(band.max) }),
    ).join(', '),
  );

  function changeRounds(delta: number): void {
    rounds = Math.min(ROUNDS.max, Math.max(ROUNDS.min, rounds + delta));
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (error === null) onStart(config);
  }
</script>

<section class="screen">
  <div class="head">
    <h1>{t('menu.title')}</h1>
    <p class="tagline">{t('menu.tagline')}</p>
  </div>

  <form class="form" novalidate onsubmit={submit}>
    <label class="field">
      <span class="field-label">{t('menu.team1')}</span>
      <input
        class="text-input seat-0"
        type="text"
        maxlength={MAX_NAME_LENGTH}
        autocomplete="off"
        enterkeyhint="next"
        bind:value={name0}
      />
    </label>
    <label class="field">
      <span class="field-label">{t('menu.team2')}</span>
      <input
        class="text-input seat-1"
        type="text"
        maxlength={MAX_NAME_LENGTH}
        autocomplete="off"
        enterkeyhint="done"
        bind:value={name1}
      />
    </label>

    <div class="field" role="group" aria-labelledby="rounds-label">
      <span class="field-label" id="rounds-label">{t('menu.rounds')}</span>
      <div class="stepper">
        <button
          class="btn step"
          type="button"
          aria-label={t('menu.rounds.less')}
          disabled={rounds <= ROUNDS.min}
          onclick={() => changeRounds(-1)}
        >
          −
        </button>
        <output class="value" aria-live="polite">{rounds}</output>
        <button
          class="btn step"
          type="button"
          aria-label={t('menu.rounds.more')}
          disabled={rounds >= ROUNDS.max}
          onclick={() => changeRounds(1)}
        >
          +
        </button>
      </div>
      <span class="hint">{t('menu.rounds.hint', { count: rounds * 2, rounds })}</span>
    </div>

    <p class="error" role="alert">{error ? t(`menu.error.${error}`) : ''}</p>

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
      <button class="btn primary" type="submit" disabled={error !== null}>{t('menu.play')}</button>
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

  .seat-0 {
    border-left: 8px solid var(--seat-0);
  }

  .seat-1 {
    border-left: 8px solid var(--seat-1);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .step {
    width: 56px;
    padding: 0;
    background: var(--surface);
    color: var(--text);
    border-color: var(--border);
    font-size: 1.6rem;
  }

  .value {
    min-width: 3ch;
    text-align: center;
    font-size: 1.8rem;
    font-weight: 700;
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
