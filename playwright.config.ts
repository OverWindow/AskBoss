import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "DATABASE_URL= MINDLOGIC_API_KEY= ADMIN_PASSWORD=playwright-admin-password ADMIN_SESSION_SECRET=playwright-admin-session-secret-32-chars pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
