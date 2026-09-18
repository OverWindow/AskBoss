import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5174" },
  webServer: {
    command: "PORT=3002 VITE_DEV_PORT=5174 VITE_API_PROXY_TARGET=http://127.0.0.1:3002 WEB_ORIGIN=http://127.0.0.1:5174 DATABASE_URL= MINDLOGIC_API_KEY= ADMIN_PASSWORD=playwright-admin-password ADMIN_SESSION_SECRET=playwright-admin-session-secret-32-chars pnpm dev",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
