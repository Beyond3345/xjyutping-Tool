<script lang="ts">
  import { store, groupAt, fontById, KIND_LABEL } from '../lib/lesson.svelte'
  import type { Item, Row } from '../lib/types'

  let { row, r }: { row: Row; r: number } = $props()

  // fancy tones as xjyutping's fancy option draws them: a stroke from pitch to pitch
  // (1 on the baseline, 5 at the height of a digit) in a box 0.59 by 0.7 em, then a
  // small tone number, raised for tones 1 and 2
  const CONTOUR: Record<string, [number, number]> = { 1: [5, 5], 2: [3, 5], 3: [3, 3], 4: [3, 1], 5: [1, 3], 6: [1, 1] }
  const pitchY = (pitch: number) => 66 - 15.5 * (pitch - 1)

  type Part = { group: number[]; word: boolean } | { p: number } | { text: string; p: number }

  // the row as groups (a word or a word correction) and single characters
  const parts = $derived.by(() => {
    const out: Part[] = []
    for (let i = 0; i < row.items.length;) {
      const group = groupAt(row, i)
      if (group) {
        out.push({ group, word: group.every(p => row.items[p].src === 'word') })
        i = group[group.length - 1] + 1
      } else {
        out.push(row.items[i].cjk ? { p: i } : { text: row.items[i].c, p: i })
        i++
      }
    }
    return out
  })

  // a character the chosen font lacks: printed in another font, or as a blank
  const lacks = (it: Item) => !it.nofont ? undefined : it.printedIn
    ? `Not in ${fontById(it.nofont).name}, so it is printed in ${fontById(it.printedIn).name}`
    : `${fontById(it.nofont).name} has no glyph for this character and no other font replaces it, so it prints as a blank`

  function open(e: Event, p: number) {
    store.openEditor(r, p, e.currentTarget as Element)
  }
</script>

<!-- the characters are written without whitespace between them, which would show as gaps -->
{#snippet reading(syl: string | null)}{#if syl && store.fancyPreview && /^[a-z]+[1-6]$/.test(syl)}{@const tone = syl.slice(-1)}{syl.slice(0, -1)}<svg
  class="tone" viewBox="0 0 59 70" aria-hidden="true"><line x1="11" x2="51" y1={pitchY(CONTOUR[tone][0])}
  y2={pitchY(CONTOUR[tone][1])} /></svg><span class="number" class:high={tone < '3'}>{tone}</span>{:else}{syl ?? '?'}{/if}{/snippet}
{#snippet char(p: number)}{@const it = row.items[p]}<span class="char" role="button" tabindex="0"
  data-row={r} data-i={p} class:missing={!it.r} class:word={!!it.r && it.src === 'word'}
  class:spot={!!it.r && it.src === 'spot'} class:guess={!!it.r && it.src === 'auto' && it.type === 'm'}
  class:replaced={!!it.printedIn} class:noglyph={!!it.nofont && !it.printedIn} title={lacks(it)}
  onclick={e => open(e, p)} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e, p) } }}
  ><ruby>{it.c}<rt>{@render reading(it.r)}</rt></ruby></span>{/snippet}

{#if row.line}
  <div class="row" class:plain={!row.cjk} class:flash={store.flash.includes(r)} data-row={r}>
    <div class="text">{#if !row.cjk}{row.line}{:else}{#each parts as part}{#if 'group' in part}<span class="seg" class:word={part.word}>{#each part.group as p}{@render char(p)}{/each}</span>{:else if !('text' in part)}{@render char(part.p)}{:else if row.items[part.p].nofont}<span class:replaced={!!row.items[part.p].printedIn}
      class:noglyph={!row.items[part.p].printedIn} title={lacks(row.items[part.p])}>{part.text}</span>{:else}{part.text}{/if}{/each}{/if}</div>
    {#if row.cjk}
      <div class="meta">
        {#if row.duplicate}<span class="dup">printed once</span>{/if}
        <button class="tag" class:chosen={!!store.lesson.kinds[row.line]} onclick={() => store.cycleKind(r)}
          title="The section of the PDF; click to change (automatic, Character, Word, Sentence)">
          {KIND_LABEL[row.kind!]}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    margin: 0 -10px;
    border-radius: var(--radius);
    transition: background 0.15s;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.flash {
    animation: flash 1.4s ease-out;
  }
  @keyframes flash {
    from {
      background: var(--correct-soft);
    }
  }
  .text {
    flex: 1;
    min-width: 0;
    font-family: var(--font-han);
    font-size: var(--size);
    line-height: 2.25;
  }
  .row.plain .text {
    color: var(--text-3);
    font-family: var(--font-ui);
    font-size: 13px;
    line-height: 1.6;
  }
  ruby {
    ruby-align: center;
  }
  .char {
    padding: 0 0.05em;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s;
  }
  .char:hover {
    background: var(--correct-soft);
  }
  rt {
    font-family: var(--font-jyutping);
    font-size: 0.4em;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--text-2);
    user-select: none;
  }
  .tone {
    width: 0.59em;
    height: 0.7em;
    stroke: currentColor;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .number {
    position: relative;
    top: 0.17em;
    font-size: 0.7em;
  }
  .number.high {
    top: -0.47em;
  }
  .seg {
    border-bottom: 1px solid var(--border-strong);
  }
  .seg.word {
    border-bottom: 2px solid var(--correct);
  }
  .char.guess {
    text-decoration: underline dotted var(--guess);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.2em;
  }
  .char.word rt,
  .char.spot rt {
    color: var(--correct);
    font-weight: 700;
  }
  .char.missing {
    background: var(--missing-soft);
  }
  .char.missing rt {
    color: var(--missing);
    font-weight: 700;
  }
  .noglyph {
    outline: 1px dashed var(--missing);
    outline-offset: -2px;
  }
  .replaced {
    outline: 1px dashed var(--guess);
    outline-offset: -2px;
  }
  .char:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .dup {
    font-size: 12px;
    color: var(--text-3);
  }
  .tag {
    height: 24px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: transparent;
    color: var(--text-3);
    font-size: 12px;
    cursor: pointer;
  }
  .tag:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .tag.chosen {
    color: var(--text);
    border-color: var(--text-2);
  }
  /* Present shows the text only, with full-contrast Jyutping */
  :global(.present) .meta {
    display: none;
  }
  :global(.present) .row:hover,
  :global(.present) .char:hover {
    background: none;
  }
  :global(.present) .seg,
  :global(.present) .seg.word {
    border-bottom-color: transparent;
  }
  :global(.present) .char.guess {
    text-decoration: none;
  }
  :global(.present) .replaced {
    outline: none;
  }
  :global(.present) rt,
  :global(.present) .char.word rt,
  :global(.present) .char.spot rt {
    color: var(--text);
    font-weight: 500;
  }
</style>
