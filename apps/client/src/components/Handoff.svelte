<script lang="ts">
  import { onMount } from 'svelte';
  import type { HandoffInfo } from '../lib/game/client-game.ts';

  let {
    info,
    readyLabel,
    onready,
  }: { info: HandoffInfo; readyLabel: string; onready: () => void } = $props();

  let button: HTMLButtonElement | undefined;

  // Keyboard users land on the only button of the screen.
  onMount(() => button?.focus({ preventScroll: true }));
</script>

<!-- Passing the phone: this screen never shows anything secret. -->
<section class="screen handoff" aria-live="polite">
  <div class="body">
    <p class="kicker">{info.kicker}</p>
    <p class="lead">{info.lead}</p>
    <h2 class="name">{info.name}</h2>
    <p class="role">{info.role}</p>
    {#if info.warning}
      <p class="hint">{info.warning}</p>
    {/if}
  </div>
  <p class="footer">{info.footer}</p>
  <div class="actions">
    <button bind:this={button} class="btn primary" type="button" onclick={onready}>
      {readyLabel}
    </button>
  </div>
</section>

<style>
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 10px;
    text-align: center;
  }

  .lead {
    font-size: 1.3rem;
    color: var(--muted);
  }

  .name {
    font-size: clamp(2.2rem, 11vw, 3.4rem);
    line-height: 1.05;
    color: var(--accent-ink);
    overflow-wrap: anywhere;
  }

  .role {
    margin-top: 10px;
    font-size: 1.4rem;
    font-weight: 600;
  }

  .footer {
    text-align: center;
    color: var(--muted);
    font-weight: 600;
  }
</style>
