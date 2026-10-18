import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the example app (example/) on :5173; `npm run build` checks it bundles.
export default defineConfig({
  root: "example",
  plugins: [react()],
  build: { outDir: "../dist-example", emptyOutDir: true },
});
