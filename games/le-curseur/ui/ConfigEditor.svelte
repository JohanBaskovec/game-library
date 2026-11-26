<script lang="ts">
  import { untrack } from 'svelte';
  import type { Locale } from '@game-library/game-kit';
  import {
    MAX_NAME_LENGTH,
    ROUNDS,
    leCurseur,
    type Config,
    type ConfigError,
  } from '../logic/index.ts';
  import type { T } from './types.ts';

  let {
    t,
    value,
    onchange,
  }: {
    t: T;
    locale?: Locale;
    /** The settings to start from. Read once: the editor then owns its fields and reports changes. */
    value: Config;
    onchange: (config: Config) => void;
  } = $props();

  const initial = untrack(() => value);
  let name0 = $state(initial.teamNames[0]);
  let name1 = $state(initial.teamNames[1]);
  let rounds = $state(initial.roundCount);

  const config = $derived(
    leCurseur.normalizeConfig({
      teamNames: [name0, name1],
      roundCount: rounds,
      contentLocale: initial.contentLocale,
    }),
  );
  const error = $derived(leCurseur.validateConfig(config) as ConfigError | null);

  // Tell the owner of the editor whenever the settings change (not on the first run).
  let first = true;
  $effect(() => {
    const current = config;
    if (first) {
      first = false;
      return;
    }
    untrack(() => onchange(current));
  });

  function changeRounds(delta: number): void {
    rounds = Math.min(ROUNDS.max, Math.max(ROUNDS.min, rounds + delta));
  }
</script>

<div class="editor">
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
</div>

<style>
  .editor {
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
</style>
