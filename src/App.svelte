<script lang="ts">
  import { onMount } from 'svelte'
  import { store } from './lib/lesson.svelte'
  import { setWindowTitle } from './lib/platform'
  import Header from './components/Header.svelte'
  import TextPane from './components/TextPane.svelte'
  import PreviewPane from './components/PreviewPane.svelte'
  import CorrectionPopover from './components/CorrectionPopover.svelte'
  import CorrectionsDialog from './components/CorrectionsDialog.svelte'
  import Toast from './components/Toast.svelte'

  onMount(() => void store.init())

  // the file name or the title, and a dot while there are unsaved changes
  $effect(() => {
    const name = store.path ? store.path.split(/[\\/]/).pop()! : store.lesson.title || 'Untitled lesson'
    setWindowTitle(`${name}${store.dirty ? ' •' : ''} — xjyutping-Tool`)
  })

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (store.editor) store.closeEditor()
      else if (store.present) store.setPresent(false)
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      store.save(e.shiftKey)
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="app" class:present={store.present}>
  <div class="chrome" hidden={store.present}><Header /></div>
  <main>
    <TextPane />
    <PreviewPane />
  </main>
</div>
<CorrectionPopover />
<CorrectionsDialog />
<Toast />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(240px, 32%) 1fr;
  }
  .present main {
    grid-template-columns: 1fr;
    background: var(--surface);
  }
</style>
