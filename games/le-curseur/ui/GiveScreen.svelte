<script lang="ts">
  import { MAX_CLUE_LENGTH, cleanText, type CurseurView } from '../logic/index.ts';
  import Scale from './Scale.svelte';
  import type { T } from './types.ts';

  let { view, t, send }: { view: CurseurView; t: T; send: (action: unknown) => void } = $props();

  let clue = $state('');
  const canSubmit = $derived(cleanText(clue) !== '');

  function submit(): void {
    if (canSubmit) send({ type: 'clue', text: clue });
  }
</script>

<section class="screen">
  <p class="role-line">{t('give.line', { team: view.teamNames[view.seat] })}</p>

  {#if view.pair && view.target !== null}
    <Scale pair={view.pair} target={view.target} bands {t} />
  {/if}
  <p class="hint">{t('give.hint')}</p>

  <button class="btn secondary" type="button" onclick={() => send({ type: 'reroll' })}>
    {t('give.reroll')}
  </button>

  <label class="field">
    <span class="field-label">{t('give.clue.label')}</span>
    <input
      class="text-input"
      type="text"
      maxlength={MAX_CLUE_LENGTH}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="done"
      placeholder={t('give.clue.placeholder')}
      bind:value={clue}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
    />
  </label>

  <div class="actions">
    <button class="btn primary" type="button" disabled={!canSubmit} onclick={submit}>
      {t('give.submit')}
    </button>
  </div>
</section>

<style>
  .role-line {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--accent-ink);
  }
</style>
