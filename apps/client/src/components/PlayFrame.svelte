<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, left, children }: { title: string; left?: Snippet; children: Snippet } = $props();
</script>

<div class="play">
  <header class="bar">
    {#if left}
      {@render left()}
    {:else}
      <span></span>
    {/if}
    <span class="title">{title}</span>
  </header>

  <main class="host">
    {@render children()}
  </main>
</div>

<style>
  .play {
    max-width: 30rem;
    /* Long names and codes wrap instead of pushing the page wider than the phone. */
    overflow-wrap: anywhere;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    padding: calc(var(--space-2) + env(safe-area-inset-top)) var(--space-3)
      calc(var(--space-3) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }

  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--tap);
    color: var(--muted);
    font-size: 0.95rem;
  }

  .title {
    font-weight: 700;
  }

  .host {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
