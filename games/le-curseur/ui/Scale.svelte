<script lang="ts">
  import { DEFAULT_GUESS, POSITION_MAX, POSITION_MIN } from '../logic/index.ts';
  import { bandNumbers, bandRects } from './bands.ts';
  import type { T } from './types.ts';

  let {
    pair,
    t,
    target = null,
    guess = null,
    bands = false,
    compact = false,
    interactive = false,
    value = $bindable(DEFAULT_GUESS),
  }: {
    pair: readonly [string, string];
    t: T;
    /** The secret position, drawn with its point zones when `bands` is on. */
    target?: number | null;
    /** A position that was chosen, shown as a cursor. */
    guess?: number | null;
    bands?: boolean;
    compact?: boolean;
    /** The cursor can be moved (touch, mouse, keyboard); its position is `value`. */
    interactive?: boolean;
    value?: number;
  } = $props();

  let track: HTMLDivElement | undefined = $state();

  const cursorAt = $derived(interactive ? value : guess);

  const description = $derived(
    [
      `${pair[0]} – ${pair[1]}`,
      target === null ? '' : t('scale.targetAt', { value: target }),
      guess === null ? '' : t('scale.answerAt', { value: guess }),
    ]
      .filter(Boolean)
      .join(', '),
  );

  function setValue(next: number): void {
    value = Math.min(POSITION_MAX, Math.max(POSITION_MIN, Math.round(next)));
  }

  function fromPointer(event: PointerEvent): void {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return;
    setValue(((event.clientX - rect.left) / rect.width) * 100);
  }

  function onpointerdown(event: PointerEvent): void {
    track?.setPointerCapture(event.pointerId);
    track?.focus({ preventScroll: true });
    fromPointer(event);
  }

  function onpointermove(event: PointerEvent): void {
    if (track?.hasPointerCapture(event.pointerId)) fromPointer(event);
  }

  const KEY_STEPS: Readonly<Record<string, number>> = {
    ArrowLeft: -1,
    ArrowDown: -1,
    ArrowRight: 1,
    ArrowUp: 1,
    PageDown: -10,
    PageUp: 10,
  };

  function onkeydown(event: KeyboardEvent): void {
    const step = KEY_STEPS[event.key];
    if (step !== undefined) {
      // Shift makes an arrow move by 10 instead of 1.
      const arrow = event.key.startsWith('Arrow');
      setValue(value + step * (arrow && event.shiftKey ? 10 : 1));
    } else if (event.key === 'Home') {
      setValue(POSITION_MIN);
    } else if (event.key === 'End') {
      setValue(POSITION_MAX);
    } else {
      return;
    }
    event.preventDefault();
  }
</script>

<div class="scale" class:compact>
  <div class="labels">
    <span class="label">{pair[0]}</span>
    <span class="label right">{pair[1]}</span>
  </div>

  {#if interactive}
    <div
      bind:this={track}
      class="track interactive"
      role="slider"
      tabindex="0"
      aria-label={t('slider.label')}
      aria-valuemin={POSITION_MIN}
      aria-valuemax={POSITION_MAX}
      aria-valuenow={value}
      aria-valuetext={t('slider.value', {
        left: pair[0],
        leftPct: POSITION_MAX - value,
        right: pair[1],
        rightPct: value,
      })}
      {onpointerdown}
      {onpointermove}
      {onkeydown}
    >
      <div class="bg"></div>
      <div class="handle" style:left="{value}%"></div>
    </div>
  {:else}
    <div class="track" role="img" aria-label={description}>
      <div class="bg">
        {#if bands && target !== null}
          {#each bandRects(target) as rect (rect.width)}
            <div class="band" style:left="{rect.left}%" style:width="{rect.width}%"></div>
          {/each}
          {#if !compact}
            {#each bandNumbers(target) as number (number.left)}
              <span class="band-num" style:left="{number.left}%">{number.points}</span>
            {/each}
          {/if}
        {/if}
      </div>
      {#if target !== null}
        <div class="marker" style:left="{target}%"></div>
      {/if}
      {#if cursorAt !== null}
        <div class="handle" style:left="{cursorAt}%"></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .scale {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }

  .labels {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 0 4px;
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.15;
  }

  .label {
    max-width: 48%;
    overflow-wrap: anywhere;
  }

  .label.right {
    text-align: right;
  }

  .track {
    position: relative;
    height: 72px;
    margin: 0 20px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    user-select: none;
    -webkit-user-select: none;
  }

  /* The line the cursor slides on. */
  .track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: var(--border);
  }

  .track.interactive {
    touch-action: none;
    cursor: pointer;
  }

  .track:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 4px;
  }

  .bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 10px;
  }

  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .band-num {
    position: absolute;
    top: 6px;
    transform: translateX(-50%);
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--muted);
  }

  .marker {
    position: absolute;
    top: -8px;
    bottom: -8px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--text);
  }

  .handle {
    position: absolute;
    top: 50%;
    width: 40px;
    height: 40px;
    margin: -20px 0 0 -20px;
    border-radius: 50%;
    background: var(--accent);
    border: 4px solid var(--surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .compact .labels {
    font-size: 0.85rem;
    font-weight: 700;
  }

  .compact .track {
    height: 26px;
    margin: 0 10px;
    border-width: 1px;
  }

  .compact .handle {
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-width: 3px;
  }

  .compact .marker {
    top: -4px;
    bottom: -4px;
    width: 3px;
    margin-left: -1.5px;
  }
</style>
