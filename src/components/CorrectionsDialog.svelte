<script lang="ts">
  import { store } from '../lib/lesson.svelte'
  import { TAURI } from '../lib/platform'
  import Icon from './Icon.svelte'

  let dlg: HTMLDialogElement | undefined = $state()
  let records = $state(0)

  const words = $derived(Object.entries(store.lesson.words))
  const spots = $derived(Object.entries(store.lesson.spots).flatMap(([line, marks]) =>
    Object.entries(marks).map(([i, value]) => ({ line, i, value, char: [...line][Number(i)] ?? '?' }))))

  const count = async () => (records = await store.recordCount())

  $effect(() => {
    if (!dlg) return
    if (store.dialog && !dlg.open) {
      count()
      dlg.showModal()
    } else if (!store.dialog && dlg.open) dlg.close()
  })

  async function exportAll() {
    await store.exportCorrections()
    store.dialog = false
  }
</script>

<dialog bind:this={dlg} onclose={() => (store.dialog = false)} aria-labelledby="corrections-title">
  <header>
    <h2 id="corrections-title">Corrections in this lesson</h2>
    <button class="btn ghost icon" aria-label="Close" title="Close" onclick={() => (store.dialog = false)}>
      <Icon name="x" />
    </button>
  </header>

  {#if !words.length && !spots.length}
    <p class="empty">No corrections yet. Click a character in the preview to correct it.</p>
  {:else}
    <ul>
      {#each words as [key, value] (key)}
        <li>
          <span class="what"><span class="han">{key}</span> <span class="kind">word</span></span>
          <code>{value}</code>
          <button class="btn ghost" onclick={async () => { await store.resetWord(key); count() }}>Reset</button>
        </li>
      {/each}
      {#each spots as s (s.line + '|' + s.i)}
        <li>
          <span class="what"><span class="han">{s.char}</span> <span class="kind">in {s.line}</span></span>
          <code>{s.value}</code>
          <button class="btn ghost" onclick={async () => { await store.resetSpot(s.line, s.i); count() }}>Reset</button>
        </li>
      {/each}
    </ul>
  {/if}

  <footer>
    <p>Every correction is also kept on this computer, so that it can be sent to the maintainer of xjyutping.</p>
    <button class="btn primary" disabled={!records || !TAURI} onclick={exportAll}>
      Export all corrections ({records})…
    </button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 48px));
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
    backdrop-filter: blur(2px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 8px 20px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  .empty {
    margin: 8px 20px 16px;
    color: var(--text-2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 12px;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
  }
  li:hover {
    background: var(--hover);
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .han {
    font-family: var(--font-han);
    font-size: 17px;
  }
  .kind {
    color: var(--text-3);
    font-size: 12.5px;
  }
  code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--correct);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 20px 18px;
    margin-top: 8px;
    border-top: 1px solid var(--border);
  }
  footer p {
    flex: 1;
    margin: 0;
    font-size: 12.5px;
    color: var(--text-2);
  }
</style>
