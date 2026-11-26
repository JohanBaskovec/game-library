<script lang="ts">
  import { findGame } from '@game-library/registry';
  import { untrack } from 'svelte';
  import NameForm from '../components/NameForm.svelte';
  import PlayFrame from '../components/PlayFrame.svelte';
  import { loadClientGame, type AnyClientGame } from '../lib/game/client-game.ts';
  import { createTranslator } from '../lib/i18n/core.ts';
  import { currentLocale, t } from '../lib/i18n.svelte.ts';
  import { createRoomRequest } from '../lib/rooms/api.ts';
  import { roomErrorKey } from '../lib/rooms/labels.ts';
  import { loadPlayerName, rememberRoom, savePlayerName } from '../lib/rooms/storage.ts';
  import { navigate } from '../lib/router.svelte.ts';
  import { currentEndpoints } from '../lib/server.ts';
  import { json } from '../lib/services/index.ts';

  let { gameId }: { gameId: string } = $props();

  const endpoints = currentEndpoints();
  const manifest = $derived(findGame(gameId));
  const title = $derived(manifest ? manifest.title[currentLocale()] : '');

  let game = $state.raw<AnyClientGame | null>(null);
  let loadFailed = $state(false);
  let name = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = gameId;
    untrack(() => {
      game = null;
      loadFailed = false;
      void loadClientGame(id)
        .then((loaded) => {
          if (loaded) game = loaded;
          else loadFailed = true;
        })
        .catch(() => (loadFailed = true));
      void loadPlayerName(json).then((saved) => (name = saved));
    });
  });

  async function create(chosen: string): Promise<void> {
    if (!game || !endpoints) return;
    busy = true;
    error = null;
    const gameT = createTranslator(game.messages, currentLocale);
    const result = await createRoomRequest(endpoints, {
      gameId,
      rules: game.logic.rulesVersion,
      // The settings start with team names in the creator's language; the host can change them.
      config: game.defaultConfig(gameT),
    });
    if (!result.ok) {
      error = t(roomErrorKey(result.error));
      busy = false;
      return;
    }
    await savePlayerName(json, chosen);
    await rememberRoom(json, result.code, { token: result.token, name: chosen });
    navigate({ name: 'room', code: result.code });
  }
</script>

<PlayFrame {title}>
  {#snippet left()}
    <a class="link-btn" href="#/play/{gameId}">
      <span aria-hidden="true">←</span>&nbsp;{t('play.back')}
    </a>
  {/snippet}

  {#if !manifest}
    <p>{t('play.notFound')}</p>
  {:else if !endpoints}
    <p role="alert">{t('room.unconfigured')}</p>
  {:else if loadFailed}
    <p class="error" role="alert">{t('play.error')}</p>
  {:else if !game}
    <p class="hint" role="status">{t('play.loading')}</p>
  {:else}
    <NameForm
      title={t('create.title')}
      {name}
      submitLabel={busy ? t('create.creating') : t('create.submit')}
      {busy}
      {error}
      onsubmit={create}
    />
  {/if}
</PlayFrame>
