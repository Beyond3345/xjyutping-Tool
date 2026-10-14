<script lang="ts">
  import { onMount } from 'svelte'
  import { store, fontById } from './lib/lesson.svelte'
  import { setWindowTitle, useFont } from './lib/platform'
  import Header from './components/Header.svelte'
  import TextPane from './components/TextPane.svelte'
  import PreviewPane from './components/PreviewPane.svelte'
  import CorrectionPopover from './components/CorrectionPopover.svelte'
  import CorrectionsDialog from './components/CorrectionsDialog.svelte'
  import SettingsDialog from './components/SettingsDialog.svelte'
  import Toast from './components/Toast.svelte'

  onMount(() => void store.init())

  // the file name or the title, and a dot while there are unsaved changes
  $effect(() => {
    const name = store.path ? store.path.split(/[\\/]/).pop()! : store.lesson.title || 'Untitled lesson'
    setWindowTitle(`${name}${store.dirty ? ' •' : ''} — xjyutping-Tool`)
  })

  // the chosen fonts of the lesson, in the window as in the PDF
  // (again once an installed font is found)
  $effect(() => {
    void store.installed[store.lesson.chineseFont]
    useFont('--chinese-font', fontById(store.lesson.chineseFont))
  })
  $effect(() => void useFont('--jyutping-font', fontById(store.lesson.jyutpingFont)))

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
  <Header />
  <main>
    <TextPane />
    <PreviewPane />
  </main>
</div>
<CorrectionPopover />
<CorrectionsDialog />
<SettingsDialog />
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
