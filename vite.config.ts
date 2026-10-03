import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // pyodide loads its own runtime files from /pyodide/ (see scripts/vendor.mjs)
  optimizeDeps: { exclude: ["pyodide"] },
  // keep Rust errors on screen; Tauri expects the fixed port of tauri.conf.json
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
});
