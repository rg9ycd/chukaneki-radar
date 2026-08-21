import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  base: "./",
  root: path.resolve(import.meta.dirname, "client"),
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: ["3000-i96l7dbb17rvchlpsb4pg-af57c6af.sg1.manus.computer"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "client/src") },
  },
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
});
