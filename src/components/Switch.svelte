<script lang="ts">
  let { label, checked, onchange, title = '' }:
    { label: string; checked: boolean; onchange: (on: boolean) => void; title?: string } = $props()
</script>

<label class="switch" {title}>
  <input type="checkbox" role="switch" class="visually-hidden" {checked}
    onchange={e => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  {label}
</label>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    white-space: nowrap;
    color: var(--text-2);
  }
  .switch:hover {
    color: var(--text);
  }
  .track {
    position: relative;
    width: 30px;
    height: 18px;
    border-radius: 9px;
    background: var(--track-off);
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }
  input:checked + .track {
    background: var(--accent);
  }
  input:checked + .track .thumb {
    transform: translateX(12px);
    background: var(--on-accent);
  }
  input:focus-visible + .track {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>
