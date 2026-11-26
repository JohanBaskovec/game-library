<script lang="ts">
  import { gameManifests } from '@game-library/registry';
  import { currentLocale, t } from '../lib/i18n.svelte.ts';
  import { normalizeRoomCode } from '@game-library/room';
  import { navigate, routeHref } from '../lib/router.svelte.ts';

  let codeInput = $state('');
  let codeError = $state(false);

  function joinByCode(event: SubmitEvent): void {
    event.preventDefault();
    const code = normalizeRoomCode(codeInput);
    codeError = code === null;
    if (code !== null) navigate({ name: 'room', code });
  }
</script>

<section>
  <h1>{t('picker.title')}</h1>

  {#if gameManifests.length === 0}
    <div class="empty">
      <h2>{t('picker.empty.title')}</h2>
      <p>{t('picker.empty.body')}</p>
    </div>
  {:else}
    <ul class="games">
      {#each gameManifests as game (game.id)}
        <li>
          <a class="card" href={routeHref({ name: 'play', gameId: game.id })}>
            <span class="name">{game.title[currentLocale()]}</span>
            <span class="tagline">{game.tagline[currentLocale()]}</span>
            {#if !game.contentLocales.includes(currentLocale())}
              <span class="badge">
                {t('picker.contentIn', {
                  language: t(game.contentLocales[0] === 'fr' ? 'lang.fr' : 'lang.en'),
                })}
              </span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="join card" novalidate onsubmit={joinByCode}>
    <h2>{t('picker.join.title')}</h2>
    <label class="field">
      <span class="field-label">{t('picker.join.label')}</span>
      <input
        class="text-input code"
        type="text"
        maxlength="9"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        enterkeyhint="go"
        bind:value={codeInput}
        oninput={() => (codeError = false)}
      />
    </label>
    <p class="error" role="alert">{codeError ? t('picker.join.invalid') : ''}</p>
    <button class="btn secondary" type="submit" disabled={codeInput.trim() === ''}>
      {t('picker.join.button')}
    </button>
  </form>
</section>

<style>
  h1 {
    font-size: 1.5rem;
    margin-bottom: var(--space-4);
  }

  .empty {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .empty h2 {
    font-size: 1.125rem;
  }

  .empty p {
    color: var(--muted);
  }

  .join {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .join h2 {
    font-size: 1.05rem;
  }

  .code {
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  .games {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
  }

  .card {
    display: grid;
    gap: var(--space-1);
    min-height: var(--tap);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
  }

  .name {
    font-size: 1.2rem;
    font-weight: 700;
  }

  .tagline {
    color: var(--muted);
  }

  .badge {
    justify-self: start;
    margin-top: var(--space-1);
    padding: 2px var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
