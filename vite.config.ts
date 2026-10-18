import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "example",
  plugins: [react()],
  build: { outDir: "../dist-example", emptyOutDir: true },
});
