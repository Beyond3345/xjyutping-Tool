<script lang="ts" generics="T extends string">
  // a segmented control built on radio buttons, so the keyboard and screen readers work
  let { label, value, options, onchange }:
    { label: string; value: T; options: [T, string][]; onchange: (value: T) => void } = $props()
  const name = $props.id()
</script>

<div class="segmented" role="radiogroup" aria-label={label} title={label}>
  {#each options as [option, text]}
    <label class:on={option === value}>
      <input type="radio" class="visually-hidden" {name} value={option} checked={option === value}
        onchange={() => onchange(option)} />
      {text}
    </label>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  label {
    padding: 4px 12px;
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }
  label:hover {
    color: var(--text);
  }
  label.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  label:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
</style>
