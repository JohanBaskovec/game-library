<script lang="ts">
  import type { Locale } from '@game-library/game-kit';
  import type { CurseurView } from '../logic/index.ts';
  import GiveScreen from './GiveScreen.svelte';
  import GuessScreen from './GuessScreen.svelte';
  import RecapScreen from './RecapScreen.svelte';
  import RevealScreen from './RevealScreen.svelte';
  import type { T } from './types.ts';

  let {
    view,
    t,
    locale,
    send,
  }: {
    view: CurseurView;
    t: T;
    locale: Locale;
    send: (action: unknown) => void;
  } = $props();
</script>

{#if view.phase === 'give'}
  <GiveScreen {view} {t} {send} />
{:else if view.phase === 'guess'}
  <GuessScreen {view} {t} {send} />
{:else if view.phase === 'reveal'}
  <RevealScreen {view} {t} {locale} {send} />
{:else}
  <RecapScreen {view} {t} {locale} />
{/if}
