<script lang="ts">
  import { gameManifests } from '@game-library/registry';
  import { t } from '../lib/i18n.svelte.ts';
</script>

<section>
  <h1>{t('picker.title')}</h1>

  {#if gameManifests.length === 0}
    <div class="empty">
      <h2>{t('picker.empty.title')}</h2>
      <p>{t('picker.empty.body')}</p>
    </div>
  {:else}
    <!-- Placeholder until games have translated titles and a play screen (milestone M2). -->
    <ul class="games">
      {#each gameManifests as game (game.id)}
        <li>{game.id}</li>
      {/each}
    </ul>
  {/if}
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

  .games {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
  }
</style>
