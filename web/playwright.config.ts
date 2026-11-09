import { defineConfig, devices } from "@playwright/test";

const url = "http://localhost:4173/coop-radar/";

export default defineConfig({
  testDir: "e2e",
  use: { ...devices["Desktop Chrome"], baseURL: url, timezoneId: "America/Toronto" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url,
    reuseExistingServer: false,
  },
});
