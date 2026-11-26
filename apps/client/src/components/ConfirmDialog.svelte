<script lang="ts">
  let {
    open = $bindable(false),
    message,
    confirmLabel,
    cancelLabel,
    onconfirm,
  }: {
    open: boolean;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onconfirm: () => void;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<!-- The close event also fires on Escape, so `open` always follows what the player sees. -->
<dialog bind:this={dialog} onclose={() => (open = false)}>
  <p>{message}</p>
  <div class="buttons">
    <button class="btn secondary" type="button" onclick={() => (open = false)}>
      {cancelLabel}
    </button>
    <button
      class="btn danger"
      type="button"
      onclick={() => {
        open = false;
        onconfirm();
      }}
    >
      {confirmLabel}
    </button>
  </div>
</dialog>

<style>
  dialog {
    width: min(90vw, 380px);
    padding: var(--space-4);
    border: 0;
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: var(--space-3);
  }
</style>
