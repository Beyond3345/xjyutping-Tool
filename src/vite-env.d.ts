/// <reference types="svelte" />
/// <reference types="vite/client" />

// scrollIntoView's container option (Chromium 140, so WebView2; WebKit ignores it), not yet in TypeScript's DOM types
interface ScrollIntoViewOptions {
  container?: 'all' | 'nearest'
}
