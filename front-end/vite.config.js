import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    // build/ rather than Vite's default dist/, so nginx's root and the
    // deploy workflow didn't have to change when moving off Create React App.
    outDir: "build",
    // ace-builds' core is one prebuilt ~590 kB (minified) file that can't be
    // split further, and both pages need the editor on first paint. The
    // limit sits just above it so anything else growing past it still warns.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // The Ace editor is most of the bundle and changes far less often
        // than the app itself, so it gets its own long-cacheable chunk.
        manualChunks(id) {
          if (id.includes("/node_modules/ace-builds/") || id.includes("/node_modules/react-ace/")) return "ace"
          if (id.includes("/node_modules/")) return "vendor"
        },
      },
    },
  },
});
