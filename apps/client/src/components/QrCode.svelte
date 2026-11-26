<script lang="ts">
  import type { QrCode } from '../lib/rooms/qr.ts';

  let { qr, label }: { qr: QrCode; label: string } = $props();

  // A quiet zone of four modules around the code, as readers expect.
  const margin = 4;
</script>

<svg
  class="qr"
  viewBox="{-margin} {-margin} {qr.size + margin * 2} {qr.size + margin * 2}"
  role="img"
  aria-label={label}
  shape-rendering="crispEdges"
>
  <rect
    x={-margin}
    y={-margin}
    width={qr.size + margin * 2}
    height={qr.size + margin * 2}
    fill="#ffffff"
  />
  <path d={qr.path} fill="#000000" />
</svg>

<style>
  .qr {
    display: block;
    width: 100%;
    max-width: 12rem;
    height: auto;
    border-radius: 8px;
  }
</style>
