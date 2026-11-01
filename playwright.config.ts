import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: { PAI_MODE: "mock", PAI_DATA_DIR: ".workbench-test-data", PAI_OWNER_CONFIG: "owner.config.json", PAI_KNOWLEDGE_DIR: "knowledge" },
    },
    {
      command: "npm run dev:chat",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { PAI_MODE: "mock", PAI_DATA_DIR: ".workbench-test-data", PAI_OWNER_CONFIG: "owner.config.json", PAI_KNOWLEDGE_DIR: "knowledge" },
    },
    {
      command: "npm run dev:admin",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: { PAI_MODE: "mock", PAI_DATA_DIR: ".workbench-test-data", PAI_OWNER_CONFIG: "owner.config.json", PAI_KNOWLEDGE_DIR: "knowledge" },
    },
  ],
});
