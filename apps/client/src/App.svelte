<script lang="ts">
  import { currentLocale, t } from './lib/i18n.svelte.ts';
  import { router, routeHref, type Route } from './lib/router.svelte.ts';
  import PickerScreen from './screens/PickerScreen.svelte';
  import SettingsScreen from './screens/SettingsScreen.svelte';

  const tabs: { route: Route; label: () => string }[] = [
    { route: { name: 'picker' }, label: () => t('nav.games') },
    { route: { name: 'settings' }, label: () => t('nav.settings') },
  ];

  $effect(() => {
    document.documentElement.lang = currentLocale();
    document.title = t('app.title');
  });
</script>

<div class="app">
  <header class="topbar">
    <span class="brand">{t('app.title')}</span>
  </header>

  <main class="content">
    {#if router.route.name === 'settings'}
      <SettingsScreen />
    {:else}
      <PickerScreen />
    {/if}
  </main>

  <nav class="tabs" aria-label={t('nav.label')}>
    {#each tabs as tab (tab.route.name)}
      <a
        href={routeHref(tab.route)}
        aria-current={router.route.name === tab.route.name ? 'page' : undefined}
      >
        {tab.label()}
      </a>
    {/each}
  </nav>
</div>

<style>
  .app {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    /* Keep clear of notches, rounded corners and the system bars. */
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .topbar {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    font-weight: 700;
  }

  .content {
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-4) var(--space-3);
  }

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--border);
    background: var(--surface);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tabs a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(var(--tap) + var(--space-2));
    padding: var(--space-2) var(--space-3);
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }

  .tabs a[aria-current='page'] {
    color: var(--accent);
    box-shadow: inset 0 3px 0 var(--accent);
  }
</style>
