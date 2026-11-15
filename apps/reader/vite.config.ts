import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes("node_modules")) {
        if (id.includes("motion")) return "motion";
        if (id.includes("@radix-ui")) return "dialogs";
        if (id.includes("react-dom") || /node_modules[/\\]react[/\\]/.test(id)) return "react";
      }
    } } }
  }
});

