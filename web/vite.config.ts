import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Day grouping depends on the local clock, so tests always run in one known timezone.
process.env.TZ = "America/Toronto";

export default defineConfig({
  base: "/coop-radar/", // GitHub Pages serves the site from this path
  plugins: [react()],
});
