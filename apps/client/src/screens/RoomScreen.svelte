<script lang="ts">
  import { findGame } from '@game-library/registry';
  import { onDestroy, onMount, untrack } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Lobby from '../components/Lobby.svelte';
  import NameForm from '../components/NameForm.svelte';
  import PlayFrame from '../components/PlayFrame.svelte';
  import RoomGame from '../components/RoomGame.svelte';
  import { loadClientGame, type AnyClientGame } from '../lib/game/client-game.ts';
  import { createTranslator } from '../lib/i18n/core.ts';
  import { currentLocale, t } from '../lib/i18n.svelte.ts';
  import { roomErrorKey } from '../lib/rooms/labels.ts';
  import { RemoteSession } from '../lib/rooms/session.svelte.ts';
  import {
    forgetRoom,
    loadPlayerName,
    recallRoom,
    rememberRoom,
    savePlayerName,
  } from '../lib/rooms/storage.ts';
  import { currentEndpoints, roomLink } from '../lib/server.ts';
  import { json } from '../lib/services/index.ts';

  type Stage =
    | { kind: 'loading' }
    /** The player has to say who they are before joining. */
    | { kind: 'name'; name: string }
    | { kind: 'session'; session: RemoteSession };

  let { code }: { code: string } = $props();

  const endpoints = currentEndpoints();

  let stage = $state.raw<Stage>({ kind: 'loading' });
  let game = $state.raw<AnyClientGame | null>(null);
  /** An error found on this device rather than reported by the server. */
  let localError = $state<string | null>(null);
  let confirmLeave = $state(false);

  const session = $derived(stage.kind === 'session' ? stage.session : null);
  const room = $derived(session?.room ?? null);
  const errorCode = $derived(session?.error ?? localError);
  const manifest = $derived(room ? findGame(room.gameId) : undefined);
  const title = $derived(manifest ? manifest.title[currentLocale()] : t('room.code', { code }));
  const gameT = $derived(game ? createTranslator(game.messages, currentLocale) : null);
  const link = $derived(endpoints ? roomLink(endpoints, code) : '');

  // Open the room when the address changes.
  $effect(() => {
    const target = code;
    let cancelled = false;
    untrack(() => {
      if (stage.kind === 'session') stage.session.close();
      game = null;
      localError = null;
      stage = { kind: 'loading' };
      void open(target, () => cancelled);
    });
    return () => {
      cancelled = true;
    };
  });

  // Load the game's interface once the room says which game it is.
  $effect(() => {
    const current = session;
    const gameId = current?.room?.gameId;
    const rulesVersion = current?.room?.rulesVersion;
    if (!current || gameId === undefined || rulesVersion === undefined) return;
    if (untrack(() => game?.logic.id) === gameId) return;
    untrack(() => void loadGame(current, gameId, rulesVersion));
  });

  // The page takes the colour of this device's seat.
  $effect(() => {
    const seat = session?.room?.you.seat ?? null;
    if (seat !== null) document.body.dataset.seat = String(seat);
    else delete document.body.dataset.seat;
    return () => {
      delete document.body.dataset.seat;
    };
  });

  // When the phone wakes up or the network comes back, do not wait for the next retry.
  onMount(() => {
    const nudge = () => {
      if (document.visibilityState !== 'hidden') session?.nudge();
    };
    window.addEventListener('online', nudge);
    document.addEventListener('visibilitychange', nudge);
    return () => {
      window.removeEventListener('online', nudge);
      document.removeEventListener('visibilitychange', nudge);
    };
  });

  onDestroy(() => {
    // Closing is not leaving: the device stays a member and can come back with the code.
    if (stage.kind === 'session') stage.session.close();
  });

  async function open(target: string, cancelled: () => boolean): Promise<void> {
    const [membership, savedName] = await Promise.all([
      recallRoom(json, target),
      loadPlayerName(json),
    ]);
    if (cancelled()) return;
    if (membership) connect(target, membership.name, membership.token);
    else stage = { kind: 'name', name: savedName };
  }

  function connect(target: string, name: string, token: string | null): void {
    if (!endpoints) return;
    const next = new RemoteSession({
      code: target,
      wsBase: endpoints.ws,
      name,
      token,
      onToken: (secret) => void rememberRoom(json, target, { token: secret, name }),
      onGone: () => void forgetRoom(json, target),
    });
    localError = null;
    stage = { kind: 'session', session: next };
    next.connect();
  }

  async function join(name: string): Promise<void> {
    await savePlayerName(json, name);
    connect(code, name, null);
  }

  async function loadGame(
    current: RemoteSession,
    gameId: string,
    rulesVersion: number,
  ): Promise<void> {
    try {
      const loaded = await loadClientGame(gameId);
      if (current !== session) return;
      if (!loaded) localError = 'unknown-game';
      else if (loaded.logic.rulesVersion !== rulesVersion) localError = 'rules-mismatch';
      else game = loaded;
    } catch {
      if (current === session) localError = 'unavailable';
    }
    // An app that cannot show this game stays out of the room, but remains a member of it.
    if (localError !== null) current.close();
  }

  function leave(): void {
    session?.leave();
    window.location.hash = '#/';
  }
</script>

<PlayFrame {title}>
  {#snippet left()}
    {#if session && !errorCode}
      <button class="link-btn" type="button" onclick={() => (confirmLeave = true)}>
        {t('room.leave')}
      </button>
    {:else}
      <a class="link-btn" href="#/"><span aria-hidden="true">←</span>&nbsp;{t('play.back')}</a>
    {/if}
  {/snippet}

  {#if !endpoints}
    <p role="alert">{t('room.unconfigured')}</p>
  {:else if errorCode === 'bad-name'}
    <NameForm
      title={t('join.title', { code })}
      name=""
      submitLabel={t('join.submit')}
      error={t(roomErrorKey('bad-name'))}
      onsubmit={join}
    />
  {:else if errorCode}
    <p class="error" role="alert">{t(roomErrorKey(errorCode))}</p>
  {:else if stage.kind === 'name'}
    <NameForm
      title={t('join.title', { code })}
      name={stage.name}
      submitLabel={t('join.submit')}
      onsubmit={join}
    />
  {:else if session}
    {#if session.status === 'reconnecting'}
      <p class="banner" role="status">{t('room.reconnecting')}</p>
    {/if}
    {#if !room || !game || !gameT}
      <p class="hint" role="status">{t('room.connecting')}</p>
    {:else if room.phase === 'lobby'}
      <Lobby {session} {game} {gameT} gameTitle={title} {link} />
    {:else}
      <RoomGame {session} {game} {gameT} locale={currentLocale()} />
    {/if}
  {:else}
    <p class="hint" role="status">{t('room.connecting')}</p>
  {/if}
</PlayFrame>

<ConfirmDialog
  bind:open={confirmLeave}
  message={t('room.leave.confirm')}
  confirmLabel={t('room.leave')}
  cancelLabel={t('room.leave.keep')}
  onconfirm={leave}
/>

<style>
  .banner {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--muted);
    text-align: center;
    font-weight: 600;
  }
</style>
