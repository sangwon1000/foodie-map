import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // the repo's existing .env uses MAPTILER_API_KEY (no VITE_ prefix)
  envPrefix: ["VITE_", "MAPTILER_"],
});
