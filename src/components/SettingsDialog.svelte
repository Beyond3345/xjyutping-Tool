<script lang="ts">
  import { store, FONTS } from '../lib/lesson.svelte'
  import type { Audience, PdfOption } from '../lib/types'
  import Icon from './Icon.svelte'
  import Segmented from './Segmented.svelte'
  import Switch from './Switch.svelte'

  const AUDIENCES: [Audience, string][] = [['en', 'English'], ['zh', '普通話'], ['yue', '廣東話']]
  const SWITCHES: [PdfOption, string, string][] = [
    ['evenSpacing', 'Evenly spaced characters', 'Every character as wide as the longest Jyutping; off packs them tightly'],
    ['fancy', 'Fancy Jyutping', 'Tone strokes and small tone numbers, in the style of Visual Jyutping'],
    ['separatePages', 'Each section on its own page', 'Characters stay on the first page; words and sentences start new pages'],
    ['toneChart', 'Tone chart', 'Start the PDF with a chart of the six tones'],
  ]

  const FONT_CHOICES = [['chineseFont', 'chinese', 'Chinese font'], ['jyutpingFont', 'jyutping', 'Jyutping font']] as const
  const SAMPLE: [string, string][] = [['粵', 'jyut6'], ['語', 'jyu5'], ['拼', 'ping3'], ['音', 'jam1']]

  let dlg: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (!dlg) return
    if (store.settingsOpen && !dlg.open) dlg.showModal()
    else if (!store.settingsOpen && dlg.open) dlg.close()
  })
</script>

<dialog bind:this={dlg} onclose={() => (store.settingsOpen = false)} aria-labelledby="settings-title">
  <header>
    <h2 id="settings-title">Settings</h2>
    <button class="btn ghost icon" aria-label="Close" title="Close" onclick={() => (store.settingsOpen = false)}>
      <Icon name="x" />
    </button>
  </header>

  <h3>Fonts</h3>
  <ul>
    {#each FONT_CHOICES as [key, kind, label] (key)}
      <li>
        <label class="name" for="font-{kind}">{label}</label>
        <select id="font-{kind}" value={store.lesson[key]} onchange={e => store.set(key, e.currentTarget.value)}>
          {#each FONTS.filter(f => f.kind === kind) as f (f.id)}<option value={f.id}>{f.name} · {f.style}</option>{/each}
        </select>
      </li>
    {/each}
    <li>
      <span class="sample" lang="zh-HK">{#each SAMPLE as [c, j]}<ruby>{c}<rt>{j}</rt></ruby>{/each}</span>
      <p>On screen and in the PDF. A character the Chinese font lacks is printed in another of these fonts and has an orange dashed box.</p>
    </li>
  </ul>
  <h3>Preview</h3>
  <ul>
    <li>
      <Switch label="Fancy Jyutping" checked={store.fancyPreview} onchange={on => store.setFancyPreview(on)} />
      <p>The same tone strokes as the PDF, above the characters on screen</p>
    </li>
  </ul>
  <h3>PDF</h3>
  <ul>
    <li>
      <span class="name">The students speak</span>
      <Segmented label="The students speak" value={store.lesson.audience} options={AUDIENCES}
        onchange={v => store.set('audience', v)} />
      <p>Heads the blank column: English, 普通話, or 筆記 for notes</p>
    </li>
    {#each SWITCHES as [key, label, hint] (key)}
      <li>
        <Switch {label} checked={store.lesson[key]} onchange={on => store.set(key, on)} />
        <p>{hint}</p>
      </li>
    {/each}
  </ul>

  <footer>The fonts and the PDF settings are kept in the lesson and carried over to a new one.</footer>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
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
  h3 {
    margin: 10px 20px 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 20px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: 0;
  }
  .name {
    color: var(--text-2);
  }
  select {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
  }
  select:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .sample {
    font-family: var(--font-han);
    font-size: 26px;
    line-height: 1.9;
  }
  .sample ruby {
    padding: 0 0.12em;
  }
  .sample rt {
    font-family: var(--font-jyutping);
    font-size: 0.42em;
    color: var(--text-2);
  }
  p {
    flex-basis: 100%;
    margin: 0;
    font-size: 12.5px;
    color: var(--text-3);
  }
  footer {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
    color: var(--text-2);
  }
</style>
