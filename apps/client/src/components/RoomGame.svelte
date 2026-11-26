<script lang="ts">
  import type { Locale } from '@game-library/game-kit';
  import type { AnyClientGame, Translate } from '../lib/game/client-game.ts';
  import { t } from '../lib/i18n.svelte.ts';
  import { seatLabel } from '../lib/rooms/labels.ts';
  import type { RemoteSession } from '../lib/rooms/session.svelte.ts';

  let {
    session,
    game,
    gameT,
    locale,
  }: { session: RemoteSession; game: AnyClientGame; gameT: Translate; locale: Locale } = $props();

  const room = $derived(session.room);
  const play = $derived(session.play);
  const Screen = $derived(game.Screen);
</script>

{#if room}
  {#if play}
    <Screen
      t={gameT}
      {locale}
      view={play.view}
      send={(action: unknown) => session.act(action)}
      error={session.refused}
    />
    {#if play.over}
      <div class="actions">
        {#if room.you.host}
          <button class="btn primary" type="button" onclick={() => session.reset()}>
            {t('room.back')}
          </button>
        {:else}
          <p class="hint" role="status">{t('room.waitingHost')}</p>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- A device without a seat sees no game, only the room: it can take a seat. -->
    <section class="screen">
      <p class="hint" role="status">{t('room.noSeat')}</p>
      <div class="actions">
        {#each Array.from({ length: room.seatCount }, (_, seat) => seat) as seat (seat)}
          <button class="btn secondary" type="button" onclick={() => session.takeSeat(seat)}>
            {t('lobby.sit')} · {seatLabel(room, seat, t)}
          </button>
        {/each}
      </div>
    </section>
  {/if}
{/if}
