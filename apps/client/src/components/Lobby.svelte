<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Locale } from '@game-library/game-kit';
  import type { AnyClientGame, Translate } from '../lib/game/client-game.ts';
  import { t } from '../lib/i18n.svelte.ts';
  import { membersOf, seatLabel, seatsReady } from '../lib/rooms/labels.ts';
  import { createQr } from '../lib/rooms/qr.ts';
  import type { RemoteSession } from '../lib/rooms/session.svelte.ts';
  import { device } from '../lib/services/index.ts';
  import QrCode from './QrCode.svelte';

  let {
    session,
    game,
    gameT,
    gameTitle,
    link,
  }: {
    session: RemoteSession;
    game: AnyClientGame;
    gameT: Translate;
    locale?: Locale;
    gameTitle: string;
    /** The link that opens this room. */
    link: string;
  } = $props();

  const room = $derived(session.room);
  const qr = $derived(createQr(link));
  const seats = $derived(Array.from({ length: room?.seatCount ?? 0 }, (_, seat) => seat));
  const isHost = $derived(room?.you.host ?? false);
  const unseated = $derived(room ? room.members.filter((member) => member.seat === null) : []);
  const canStart = $derived(room !== null && room.configError === null && seatsReady(room));

  let copyNotice = $state<'copied' | 'failed' | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy(): Promise<void> {
    copyNotice = (await device.copyText(link)) ? 'copied' : 'failed';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (copyNotice = null), 3000);
  }

  async function share(): Promise<void> {
    await device.share({
      title: gameTitle,
      text: t('lobby.shareText', { code: room?.code ?? '' }),
      url: link,
    });
  }

  // The host's settings are sent a moment after the last change, and always before the game starts.
  let pendingConfig: unknown = null;
  let configTimer: ReturnType<typeof setTimeout> | undefined;

  function changed(config: unknown): void {
    pendingConfig = config;
    clearTimeout(configTimer);
    configTimer = setTimeout(flush, 300);
  }

  function flush(): void {
    clearTimeout(configTimer);
    if (pendingConfig !== null) session.setConfig(pendingConfig);
    pendingConfig = null;
  }

  function start(): void {
    flush();
    session.start();
  }

  onDestroy(() => {
    clearTimeout(noticeTimer);
    flush();
  });
</script>

{#if room}
  <section class="screen">
    <div class="card code-card">
      <span class="kicker">{t('lobby.code')}</span>
      <p class="code" data-testid="room-code">{room.code}</p>
      <p class="hint">{t('lobby.invite')}</p>

      {#if qr}
        <QrCode {qr} label={t('lobby.scan')} />
      {/if}
      <p class="hint">{t('lobby.scan')}</p>

      <input
        class="text-input link"
        type="text"
        readonly
        value={link}
        aria-label={t('lobby.link')}
        onfocus={(event) => event.currentTarget.select()}
      />
      <div class="row">
        <button class="btn secondary" type="button" onclick={copy}>{t('lobby.copy')}</button>
        {#if device.canShare()}
          <button class="btn secondary" type="button" onclick={share}>{t('lobby.share')}</button>
        {/if}
      </div>
      <p class="hint" role="status">
        {copyNotice === 'copied'
          ? t('lobby.copied')
          : copyNotice === 'failed'
            ? t('lobby.copyFailed')
            : ''}
      </p>
    </div>

    <h2>{t('lobby.seats')}</h2>
    <ul class="seats">
      {#each seats as seat (seat)}
        {@const members = membersOf(room, seat)}
        {@const mine = room.you.seat === seat}
        <li class="seat card" data-seat={seat % 2}>
          <h3>{seatLabel(room, seat, t)}</h3>
          {#if members.length === 0}
            <p class="hint">{t('lobby.empty')}</p>
          {:else}
            <ul class="members">
              {#each members as member (member.id)}
                <li class:offline={!member.connected}>
                  <span class="member-name">{member.name}</span>
                  {#if member.id === room.you.id}<span class="badge">{t('lobby.you')}</span>{/if}
                  {#if member.id === room.hostId}<span class="badge">{t('lobby.host')}</span>{/if}
                  {#if !member.connected}<span class="badge">{t('lobby.offline')}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          <button
            class="btn {mine ? 'secondary' : 'primary'}"
            type="button"
            onclick={() => session.takeSeat(mine ? null : seat)}
          >
            {mine ? t('lobby.stand') : t('lobby.sit')}
          </button>
        </li>
      {/each}
    </ul>

    {#if unseated.length > 0}
      <h3 class="watching">{t('lobby.unseated')}</h3>
      <ul class="members">
        {#each unseated as member (member.id)}
          <li class:offline={!member.connected}>
            <span class="member-name">{member.name}</span>
            {#if member.id === room.you.id}<span class="badge">{t('lobby.you')}</span>{/if}
            {#if member.id === room.hostId}<span class="badge">{t('lobby.host')}</span>{/if}
            {#if !member.connected}<span class="badge">{t('lobby.offline')}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isHost}
      {@const Editor = game.ConfigEditor}
      <h2>{t('lobby.settings')}</h2>
      <div class="card">
        <Editor t={gameT} value={room.config} onchange={changed} />
      </div>
    {/if}

    <div class="actions">
      {#if isHost}
        <p class="hint" role="status">
          {room.configError !== null
            ? t('lobby.need.settings')
            : seatsReady(room)
              ? ''
              : t('lobby.need.seats')}
        </p>
        <button class="btn primary" type="button" disabled={!canStart} onclick={start}>
          {t('lobby.start')}
        </button>
      {:else}
        <p class="hint" role="status">{t('lobby.waitHost')}</p>
      {/if}
    </div>
  </section>
{/if}

<style>
  .card {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .code-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .code {
    font-size: clamp(2.4rem, 14vw, 3.6rem);
    font-weight: 800;
    letter-spacing: 0.2em;
    /* The letter spacing also trails the last letter: shift back so the code looks centred. */
    margin-right: -0.2em;
    font-variant-numeric: tabular-nums;
  }

  .link {
    font-size: 0.9rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
  }

  .row .btn {
    flex: 1;
  }

  h2 {
    font-size: 1.15rem;
  }

  h3 {
    font-size: 1.05rem;
  }

  .watching {
    margin-top: var(--space-2);
  }

  .seats,
  .members {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .seats {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .seat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-left: 8px solid var(--border);
  }

  .seat[data-seat='0'] {
    border-left-color: var(--seat-0);
  }

  .seat[data-seat='1'] {
    border-left-color: var(--seat-1);
  }

  .seat h3 {
    color: var(--text);
  }

  .members {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .members li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  .members li.offline .member-name {
    color: var(--muted);
  }

  .member-name {
    font-weight: 600;
  }

  .badge {
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
