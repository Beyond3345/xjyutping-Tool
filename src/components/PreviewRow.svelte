<script lang="ts">
  import { store, groupAt, KIND_LABEL } from '../lib/lesson.svelte'
  import type { Row } from '../lib/types'

  let { row, r }: { row: Row; r: number } = $props()

  type Part = { group: number[]; word: boolean } | { p: number } | { text: string }

  // the row as groups (a word or a word correction) and single characters
  const parts = $derived.by(() => {
    const out: Part[] = []
    for (let i = 0; i < row.items.length;) {
      const group = groupAt(row, i)
      if (group) {
        out.push({ group, word: group.every(p => row.items[p].src === 'word') })
        i = group[group.length - 1] + 1
      } else {
        out.push(row.items[i].cjk ? { p: i } : { text: row.items[i].c })
        i++
      }
    }
    return out
  })

  function open(e: Event, p: number) {
    store.openEditor(r, p, e.currentTarget as Element)
  }
</script>

<!-- the characters are written without whitespace between them, which would show as gaps -->
{#snippet char(p: number)}{@const it = row.items[p]}<span class="char" role="button" tabindex="0"
  data-row={r} data-i={p} class:missing={!it.r} class:word={!!it.r && it.src === 'word'}
  class:spot={!!it.r && it.src === 'spot'} class:guess={!!it.r && it.src === 'auto' && it.type === 'm'}
  class:noglyph={!it.glyph} title={it.glyph ? undefined : 'Neither font of the PDF has this character, so it would print as a blank'}
  onclick={e => open(e, p)} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e, p) } }}
  ><ruby>{it.c}<rt>{it.r ?? '?'}</rt></ruby></span>{/snippet}

{#if row.line}
  <div class="row" class:plain={!row.cjk} class:flash={store.flash.includes(r)} data-row={r}>
    <div class="text">{#if !row.cjk}{row.line}{:else}{#each parts as part}{#if 'group' in part}<span class="seg" class:word={part.word}>{#each part.group as p}{@render char(p)}{/each}</span>{:else if 'p' in part}{@render char(part.p)}{:else}{part.text}{/if}{/each}{/if}</div>
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
    font-family: var(--font-ui);
    font-size: 0.4em;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--text-2);
    user-select: none;
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
  .char.noglyph {
    outline: 1px dashed var(--missing);
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
  :global(.present) rt,
  :global(.present) .char.word rt,
  :global(.present) .char.spot rt {
    color: var(--text);
    font-weight: 500;
  }
</style>
