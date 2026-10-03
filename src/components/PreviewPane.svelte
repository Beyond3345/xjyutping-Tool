<script lang="ts">
  import { store } from '../lib/lesson.svelte'
  import type { Audience } from '../lib/types'
  import Icon from './Icon.svelte'
  import IconButton from './IconButton.svelte'
  import Segmented from './Segmented.svelte'
  import Switch from './Switch.svelte'
  import PreviewRow from './PreviewRow.svelte'

  const AUDIENCES: [Audience, string][] = [['en', 'English'], ['zh', '普通話'], ['yue', '廣東話']]
  const empty = $derived(!store.lesson.text.trim())
</script>

<section aria-label="Preview" lang="zh-HK" style:--size="{store.size}px">
  {#if !store.present}
    <div class="toolbar">
      <Segmented label="The students speak (it heads the blank column: English, 普通話 or 筆記 for notes)"
        value={store.lesson.audience} options={AUDIENCES} onchange={v => store.setAudience(v)} />
      <Switch label="Tone chart" title="Start the PDF with a chart of the six tones" checked={store.lesson.toneChart}
        onchange={on => store.setToneChart(on)} />
      <span class="grow"></span>
      <IconButton icon="minus" label="Smaller text" onclick={() => store.setSize(store.size - 4)} />
      <IconButton icon="plus" label="Larger text" onclick={() => store.setSize(store.size + 4)} />
      <IconButton icon="presentation" label="Present (Esc to leave)" onclick={() => store.setPresent(true)} />
    </div>
  {/if}

  <div class="rows">
    {#if store.loadError}
      <div class="state error" role="alert">
        <Icon name="triangle-alert" size={22} />
        <p><strong>The dictionary could not be loaded.</strong></p>
        <p>{store.loadError}</p>
        <p>The app needs macOS 13.3 or later, or an up-to-date Microsoft Edge WebView2 on Windows.</p>
      </div>
    {:else if !store.ready}
      <div class="state"><Icon name="loader-circle" size={22} /><p>Loading dictionary…</p></div>
    {:else if empty}
      <div class="state">
        <p class="big">粵</p>
        <p>Type Cantonese on the left, one word or sentence per line.</p>
        <p>Each line appears here with its Jyutping; click a character to correct it.</p>
      </div>
    {:else}
      {#each store.rows as row, r (r)}<PreviewRow {row} {r} />{/each}
    {/if}
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 44px;
    padding: 8px 12px 0 18px;
    flex-wrap: nowrap;
  }
  .grow {
    flex: 1;
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    padding: 10px 28px 40px;
  }
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 100%;
    color: var(--text-2);
    text-align: center;
  }
  .state p {
    margin: 2px 0;
    max-width: 420px;
  }
  .state.error {
    color: var(--missing);
  }
  .state.error p {
    color: var(--text);
  }
  .big {
    font-family: var(--font-han);
    font-size: 64px;
    line-height: 1.2;
    color: var(--text-3);
  }
  :global(.present) .rows {
    padding: 40px 6vw;
  }
</style>
