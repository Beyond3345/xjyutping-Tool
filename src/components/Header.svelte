<script lang="ts">
  import { store } from '../lib/lesson.svelte'
  import Icon from './Icon.svelte'
  import IconButton from './IconButton.svelte'
  import mark from '../../src-tauri/icons/128x128@2x.png'

  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  const missing = $derived(store.missing.length)
</script>

<header hidden={store.present}>
  <img class="mark" src={mark} alt="" width="30" height="30" />
  <div class="lesson">
    <input class="title" placeholder="Untitled lesson" aria-label="Title" value={store.lesson.title}
      oninput={e => store.set('title', e.currentTarget.value)} />
    <div class="byline">
      <input placeholder="Author" aria-label="Author" value={store.lesson.author}
        oninput={e => store.set('author', e.currentTarget.value)} />
      <span aria-hidden="true">·</span>
      <input placeholder="Date: today" aria-label="Date, today when empty" value={store.lesson.date}
        oninput={e => store.set('date', e.currentTarget.value)} />
    </div>
  </div>

  <nav aria-label="Lesson file">
    <IconButton icon="file-plus" label="New lesson" disabled={!store.ready} onclick={() => store.newLesson()} />
    <IconButton icon="folder-open" label="Open lesson…" disabled={!store.ready} onclick={() => store.open()} />
    <IconButton icon="save" label="Save ({mod}S)" disabled={!store.ready} onclick={() => store.save(false)} />
    <IconButton icon="save-all" label="Save as… ({mod}⇧S)" disabled={!store.ready} onclick={() => store.save(true)} />
  </nav>

  <button class="btn" onclick={() => (store.dialog = true)} title="The corrections of this lesson, and the export for the maintainer">
    <Icon name="list-checks" /> <span class="wide">Corrections</span>
    {#if store.correctionCount}<span class="badge">{store.correctionCount}</span>{/if}
  </button>
  <button class="btn primary" disabled={!store.ready || store.exporting} onclick={() => store.generate()}
    title={missing ? `${missing} character(s) need a reading first` : 'Make the vocabulary list as a PDF'}>
    <Icon name={store.exporting ? 'loader-circle' : 'file-down'} />
    {store.exporting ? 'Generating…' : 'Generate PDF'}
    {#if missing}<span class="badge alert">{missing}</span>{/if}
  </button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .mark {
    flex: none;
    border-radius: 7px;
  }
  .lesson {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  input {
    min-width: 0;
    border: 0;
    border-radius: 4px;
    padding: 1px 4px;
    margin-left: -4px;
    background: transparent;
    outline: none;
  }
  input:hover {
    background: var(--hover);
  }
  input:focus-visible {
    box-shadow: 0 0 0 2px var(--focus);
  }
  input::placeholder {
    color: var(--text-3);
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-ui), var(--font-han);
  }
  .byline {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-2);
    font-size: 12.5px;
  }
  .byline input {
    width: 11em;
  }
  nav {
    display: flex;
    gap: 2px;
    padding-right: 6px;
    margin-right: 2px;
    border-right: 1px solid var(--border);
  }
  @media (max-width: 900px) {
    .wide {
      display: none;
    }
  }
</style>
