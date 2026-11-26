<script lang="ts">
  import { LIMITS } from '@game-library/room';
  import { t } from '../lib/i18n.svelte.ts';

  let {
    title,
    name = '',
    submitLabel,
    busy = false,
    error = null,
    onsubmit,
  }: {
    title: string;
    /** The name to start from (the one used last time). */
    name?: string;
    submitLabel: string;
    busy?: boolean;
    /** Text to show when something went wrong, or null. */
    error?: string | null;
    onsubmit: (name: string) => void;
  } = $props();

  let value = $state('');
  let first = true;
  $effect(() => {
    // The remembered name arrives after the form is first drawn: use it once, unless the player typed.
    const remembered = name;
    if (first || value === '') value = remembered;
    first = false;
  });

  const clean = $derived(value.replace(/\s+/g, ' ').trim());

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (clean !== '' && !busy) onsubmit(clean);
  }
</script>

<section class="screen">
  <h1>{title}</h1>

  <form class="form" novalidate onsubmit={submit}>
    <label class="field">
      <span class="field-label">{t('create.name')}</span>
      <input
        class="text-input"
        type="text"
        maxlength={LIMITS.maxNameLength}
        autocomplete="nickname"
        enterkeyhint="go"
        bind:value
      />
      <span class="hint">{t('create.name.hint')}</span>
    </label>

    <p class="error" role="alert">{error ?? ''}</p>

    <div class="actions">
      <button class="btn primary" type="submit" disabled={clean === '' || busy}>
        {submitLabel}
      </button>
    </div>
  </form>
</section>

<style>
  h1 {
    font-size: 1.5rem;
  }

  .form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
