<script lang="ts">
  import { store } from '../lib/lesson.svelte'
  import Icon from './Icon.svelte'
</script>

<!-- the live region always exists, so that screen readers announce what appears in it -->
<div class="region" role="status" aria-live="polite">
  {#if store.toast && !store.present}
    <div class="toast" class:error={store.toast.error} role={store.toast.error ? 'alert' : undefined}>
      {#if store.toast.error}<Icon name="triangle-alert" />{/if}
      <span>{store.toast.text}</span>
      <button class="btn ghost icon close" aria-label="Dismiss" title="Dismiss" onclick={() => store.notify('')}>
        <Icon name="x" size={14} />
      </button>
    </div>
  {/if}
</div>

<style>
  .region {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 30;
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: min(520px, calc(100vw - 32px));
    padding: 10px 6px 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    animation: rise 0.18s ease-out;
  }
  .toast.error {
    color: var(--missing);
  }
  .toast.error span {
    color: var(--text);
  }
  span {
    flex: 1;
    padding-top: 1px;
    overflow-wrap: anywhere;
  }
  .close {
    width: 24px;
    height: 24px;
    margin-top: -2px;
    color: var(--text-2);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
