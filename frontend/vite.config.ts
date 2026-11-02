import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built files load from the app:// protocol inside Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
