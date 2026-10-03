<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte'

  // an icon button whose label is its tooltip and its accessible name
  let { icon, label, onclick, disabled = false }:
    { icon: IconName; label: string; onclick: () => void; disabled?: boolean } = $props()
</script>

<button class="btn ghost icon" title={label} aria-label={label} {disabled} {onclick}>
  <Icon name={icon} size={17} />
</button>
