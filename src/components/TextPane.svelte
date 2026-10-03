<script lang="ts">
  import { tick } from 'svelte'
  import { store } from '../lib/lesson.svelte'

  let area: HTMLTextAreaElement

  // keeps the preview on the line being typed
  function follow() {
    const n = area.value.slice(0, area.selectionStart).split('\n').length - 1
    document.querySelector(`.row[data-row="${n}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  async function changed() {
    store.textChanged(area.value)
    await tick()
    follow()
  }

  // an input method's composing text is not read until it is committed
  const oninput = (e: Event) => { if (!(e as InputEvent).isComposing) changed() }
</script>

<section aria-label="Lesson text" hidden={store.present}>
  <div class="head">
    <span class="label">Text</span>
    <span class="hint">One word or sentence per line</span>
  </div>
  <textarea bind:this={area} value={store.lesson.text} {oninput} oncompositionend={changed} onkeyup={follow}
    onclick={follow} lang="zh-HK" spellcheck="false" aria-label="Lesson text, one entry per line"
    placeholder={'銀行\n我哋聽日去銀行。'}></textarea>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    height: 44px;
    padding: 12px 16px 0;
  }
  .label {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .hint {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--text-3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  textarea {
    flex: 1;
    resize: none;
    border: 0;
    outline: none;
    padding: 8px 16px 16px;
    background: transparent;
    font-family: var(--font-han);
    font-size: 19px;
    line-height: 1.75;
  }
  textarea::placeholder {
    color: var(--text-3);
  }
</style>
