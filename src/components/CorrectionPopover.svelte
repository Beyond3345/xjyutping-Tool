<script lang="ts">
  import { store, spanKey } from '../lib/lesson.svelte'
  import { python } from '../lib/python'
  import Icon from './Icon.svelte'

  let pop: HTMLDivElement | undefined = $state()
  let inputs: HTMLInputElement[] = $state([])
  let left = $state(0)
  let top = $state(0)

  const e = $derived(store.editor)
  const row = $derived(e ? store.rows[e.r] : null)
  const word = $derived(!!e && e.span.length > 1)
  const key = $derived(e && row ? spanKey(row, e.span) : '')
  const places = $derived(store.rows.reduce((n, x) => n + (x.line.split(key).length - 1), 0))
  const cand = $derived(e ? python.candidates(store.readingInput(), e.r, e.active) : null)

  // placed under the character, or above it when there is no room below
  $effect(() => {
    if (!pop || !e) return
    void [e.span.length, e.active, e.note, cand]
    const a = e.anchor
    const w = pop.offsetWidth, h = pop.offsetHeight
    left = Math.max(8, Math.min(a.left, innerWidth - w - 8))
    top = a.bottom + 6 + h > innerHeight ? Math.max(8, a.top - h - 6) : a.bottom + 6
  })

  // the field of the clicked character takes the focus when the editor opens
  let focused: number[] | null = null
  $effect(() => {
    if (!e || !pop || focused === e.span) return
    focused = e.span
    const box = pop.querySelector<HTMLInputElement>('.field.active input')
    box?.focus()
    box?.select()
  })

  function choose(s: string) {
    if (!e) return
    e.vals[e.active] = s
    if (!word) store.saveEditor([s])
  }

  const save = () => store.saveEditor(inputs.slice(0, e?.span.length ?? 0).map(i => i.value))

  function onmousedown(ev: MouseEvent) {
    const t = ev.target as Element
    if (e && pop && !pop.contains(t) && !t.closest('.char')) store.closeEditor(false)
  }
</script>

<svelte:window {onmousedown} />

{#if e && row}
  <div class="pop" bind:this={pop} style:left="{left}px" style:top="{top}px" role="dialog"
    aria-label="Correct the reading">
    <p class="scope">
      {#if word}
        Changes <strong>{key}</strong> wherever it is read as a word in this lesson
        <span class="muted">(up to {places} place{places === 1 ? '' : 's'})</span>
      {:else}
        Only this character, here
      {/if}
    </p>

    <div class="fields">
      {#each e.span as p, k (p)}
        <label class="field" class:active={p === e.active}>
          <span class="han">{row.items[p].c}</span>
          <input bind:this={inputs[k]} value={e.vals[p] ?? row.items[p].r ?? ''} spellcheck="false"
            aria-label="Jyutping of {row.items[p].c}" oninput={ev => (e.vals[p] = ev.currentTarget.value)}
            onfocus={() => (e.active = p)} onkeydown={ev => { if (ev.key === 'Enter') save() }} />
        </label>
      {/each}
    </div>

    {#if cand && cand.all.length}
      <div class="chips" role="group" aria-label="Readings of {row.items[e.active].c}">
        {#each cand.all as s}
          <button class="chip" class:given={cand.given.includes(s)} onclick={() => choose(s)}
            title={s === cand.auto ? "xjyutping's reading" : cand.given.includes(s) ? 'Already used in this lesson' : ''}>
            {s}{#if s === cand.auto}<span class="auto">auto</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if e.note}<p class="note" role="alert">{e.note}</p>{/if}

    <div class="actions">
      <div class="grow">
        <button class="btn ghost" disabled={!store.canWiden(-1)} onclick={() => store.widen(-1)}
          title="Add the character before, to correct them as one word"><Icon name="chevron-left" size={15} />Add</button>
        <button class="btn ghost" disabled={!store.canWiden(1)} onclick={() => store.widen(1)}
          title="Add the character after, to correct them as one word">Add<Icon name="chevron-right" size={15} /></button>
      </div>
      <button class="btn ghost" disabled={!store.hasCorrection(e.r, e.span)} onclick={() => store.apply(e.r, e.span, null)}>Reset</button>
      <button class="btn" onclick={() => store.closeEditor()}>Cancel</button>
      <button class="btn primary" onclick={save}>Save</button>
    </div>
  </div>
{/if}

<style>
  .pop {
    position: fixed;
    z-index: 20;
    width: max-content;
    min-width: 300px;
    max-width: min(460px, calc(100vw - 16px));
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .scope {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--text-2);
  }
  .scope strong {
    color: var(--text);
    font-family: var(--font-han);
    font-weight: 600;
  }
  .muted {
    color: var(--text-3);
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .han {
    font-family: var(--font-han);
    font-size: 24px;
    line-height: 1.2;
  }
  .field input {
    width: 6em;
    height: 30px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 13px;
    text-align: center;
    outline: none;
  }
  .field.active input {
    border-color: var(--accent);
    background: var(--surface);
  }
  .field input:focus-visible {
    box-shadow: 0 0 0 2px var(--focus);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 12.5px;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--border-strong);
    background: var(--hover);
  }
  .chip.given {
    border-color: var(--correct);
    color: var(--correct);
  }
  .auto {
    font-family: var(--font-ui);
    font-size: 10.5px;
    color: var(--text-3);
  }
  .note {
    margin: 0 0 12px;
    font-size: 12.5px;
    color: var(--warn-text);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions .btn {
    height: 30px;
    padding: 0 10px;
  }
  .grow {
    flex: 1;
    display: flex;
    gap: 2px;
  }
</style>
