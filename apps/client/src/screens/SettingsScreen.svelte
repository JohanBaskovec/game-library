<script lang="ts">
  import { t } from '../lib/i18n.svelte.ts';
  import type { MessageKey } from '../lib/i18n/core.ts';
  import { settings, type LanguagePreference } from '../lib/settings.svelte.ts';

  const languages: { value: LanguagePreference; label: MessageKey }[] = [
    { value: 'auto', label: 'settings.language.auto' },
    { value: 'fr', label: 'settings.language.fr' },
    { value: 'en', label: 'settings.language.en' },
  ];
</script>

<section>
  <h1>{t('settings.title')}</h1>

  <fieldset>
    <legend>{t('settings.language')}</legend>
    {#each languages as language (language.value)}
      <label class="row">
        <input
          type="radio"
          name="language"
          value={language.value}
          checked={settings.value.language === language.value}
          onchange={() => settings.set('language', language.value)}
        />
        <span>{t(language.label)}</span>
      </label>
    {/each}
  </fieldset>

  <div class="group">
    <label class="row">
      <input
        type="checkbox"
        checked={settings.value.sound}
        onchange={(event) => settings.set('sound', event.currentTarget.checked)}
      />
      <span>{t('settings.sound')}</span>
    </label>
    <label class="row">
      <input
        type="checkbox"
        checked={settings.value.vibration}
        onchange={(event) => settings.set('vibration', event.currentTarget.checked)}
      />
      <span>{t('settings.vibration')}</span>
    </label>
  </div>

  <p class="version">{t('settings.version', { version: __APP_VERSION__ })}</p>
</section>

<style>
  h1 {
    font-size: 1.5rem;
    margin-bottom: var(--space-4);
  }

  fieldset,
  .group {
    margin: 0 0 var(--space-4);
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-weight: 700;
  }

  /* The whole row is the touch target. */
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--tap);
    padding: var(--space-1) 0;
  }

  .row input {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .version {
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
