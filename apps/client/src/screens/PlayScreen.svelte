<script lang="ts">
  import { findGame } from '@game-library/registry';
  import { untrack } from 'svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Handoff from '../components/Handoff.svelte';
  import { loadClientGame, type AnyClientGame } from '../lib/game/client-game.ts';
  import { clearSave, loadConfig, loadSave, saveConfig, saveGame } from '../lib/game/saves.ts';
  import { newSeed } from '../lib/game/seed.ts';
  import { LocalSession } from '../lib/game/session.svelte.ts';
  import { createTranslator } from '../lib/i18n/core.ts';
  import { currentLocale, t } from '../lib/i18n.svelte.ts';
  import { routeHref } from '../lib/router.svelte.ts';
  import { json } from '../lib/services/index.ts';

  type Stage =
    | { kind: 'loading' }
    | { kind: 'missing' }
    | { kind: 'error' }
    | { kind: 'menu'; game: AnyClientGame; canResume: boolean; savedConfig: unknown }
    | { kind: 'playing'; game: AnyClientGame; session: LocalSession; config: unknown };

  let { gameId }: { gameId: string } = $props();

  let stage = $state.raw<Stage>({ kind: 'loading' });
  let confirmQuit = $state(false);

  const manifest = $derived(findGame(gameId));
  const title = $derived(manifest ? manifest.title[currentLocale()] : '');
  const gameT = $derived(
    stage.kind === 'menu' || stage.kind === 'playing'
      ? createTranslator(stage.game.messages, currentLocale)
      : null,
  );

  // Load the game when the address changes.
  $effect(() => {
    const id = gameId;
    let cancelled = false;
    untrack(() => {
      stage = { kind: 'loading' };
      void init(id, () => cancelled);
    });
    return () => {
      cancelled = true;
    };
  });

  // The page takes the colour of the seat that holds the phone.
  $effect(() => {
    if (stage.kind === 'playing' && !stage.session.over) {
      document.body.dataset.seat = String(stage.session.seat);
    } else {
      delete document.body.dataset.seat;
    }
    return () => {
      delete document.body.dataset.seat;
    };
  });

  // A new screen starts at the top.
  $effect(() => {
    if (stage.kind !== 'playing') return;
    void stage.session.state;
    void stage.session.handoffPending;
    window.scrollTo(0, 0);
  });

  async function init(id: string, cancelled: () => boolean): Promise<void> {
    if (!findGame(id)) {
      stage = { kind: 'missing' };
      return;
    }
    try {
      const game = await loadClientGame(id);
      if (cancelled()) return;
      if (!game) {
        stage = { kind: 'error' };
        return;
      }
      await showMenu(game, cancelled);
    } catch {
      if (!cancelled()) stage = { kind: 'error' };
    }
  }

  async function showMenu(game: AnyClientGame, cancelled: () => boolean = () => false) {
    const [saved, savedConfig] = await Promise.all([
      loadSave(json, game.logic),
      loadConfig(json, game.logic),
    ]);
    if (cancelled()) return;
    stage = { kind: 'menu', game, canResume: saved !== null, savedConfig };
  }

  function begin(game: AnyClientGame, state: unknown, config: unknown) {
    const session = new LocalSession(game, state, (next, over) => {
      // A finished game is not kept; one in progress is saved after every action.
      void (over ? clearSave(json, game.logic.id) : saveGame(json, game.logic, next));
    });
    stage = { kind: 'playing', game, session, config };
    void saveGame(json, game.logic, state);
  }

  async function start(game: AnyClientGame, config: unknown) {
    let state: unknown;
    try {
      state = game.logic.setup(config, newSeed());
    } catch {
      return; // The menu only offers valid settings.
    }
    await saveConfig(json, game.logic.id, config);
    begin(game, state, config);
  }

  async function resume(game: AnyClientGame) {
    const state = await loadSave(json, game.logic);
    if (state === null) await showMenu(game);
    else begin(game, state, null);
  }

  async function replay(game: AnyClientGame, config: unknown) {
    const settings = config ?? (await loadConfig(json, game.logic));
    if (settings === null) await showMenu(game);
    else await start(game, settings);
  }

  async function quit(game: AnyClientGame) {
    await clearSave(json, game.logic.id);
    await showMenu(game);
  }
</script>

<div class="play">
  <header class="bar">
    {#if stage.kind === 'playing' && !stage.session.over}
      <button class="link-btn" type="button" onclick={() => (confirmQuit = true)}>
        {t('play.quit')}
      </button>
    {:else}
      <a class="link-btn" href="#/"><span aria-hidden="true">←</span>&nbsp;{t('play.back')}</a>
    {/if}
    <span class="title">{title}</span>
  </header>

  <main class="host">
    {#if stage.kind === 'loading'}
      <p class="hint" role="status">{t('play.loading')}</p>
    {:else if stage.kind === 'missing'}
      <p>{t('play.notFound')}</p>
    {:else if stage.kind === 'error'}
      <p class="error" role="alert">{t('play.error')}</p>
    {:else if stage.kind === 'menu' && gameT}
      {@const game = stage.game}
      {@const Menu = game.Menu}
      <Menu
        t={gameT}
        locale={currentLocale()}
        savedConfig={stage.savedConfig}
        canResume={stage.canResume}
        onStart={(config: unknown) => start(game, config)}
        onResume={() => resume(game)}
      />
      <div class="rooms">
        <a class="btn secondary" href={routeHref({ name: 'room-new', gameId })}>
          {t('play.rooms')}
        </a>
        <p class="hint">{t('play.rooms.hint')}</p>
      </div>
    {:else if stage.kind === 'playing' && gameT}
      {@const game = stage.game}
      {@const session = stage.session}
      {@const config = stage.config}
      {#if session.handoffPending && !session.over}
        <Handoff
          info={game.handoff(session.view, gameT, currentLocale())}
          readyLabel={t('handoff.ready')}
          onready={() => session.ready()}
        />
      {:else}
        {@const Screen = game.Screen}
        <Screen
          t={gameT}
          locale={currentLocale()}
          view={session.view}
          send={(action: unknown) => session.send(action)}
          error={session.lastError}
        />
        {#if session.over}
          <div class="actions">
            <button class="btn primary" type="button" onclick={() => replay(game, config)}>
              {t('play.replay')}
            </button>
            <button class="btn secondary" type="button" onclick={() => showMenu(game)}>
              {t('play.menu')}
            </button>
          </div>
        {/if}
      {/if}
    {/if}
  </main>
</div>

{#if stage.kind === 'playing'}
  {@const game = stage.game}
  <ConfirmDialog
    bind:open={confirmQuit}
    message={t('play.quit.confirm')}
    confirmLabel={t('play.quit')}
    cancelLabel={t('play.quit.keep')}
    onconfirm={() => quit(game)}
  />
{/if}

<style>
  .play {
    max-width: 30rem;
    /* Long names and clues wrap instead of pushing the page wider than the phone. */
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

  .rooms {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: center;
  }
</style>
