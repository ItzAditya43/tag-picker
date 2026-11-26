/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests only. The browser tests in e2e/ run with Playwright (npm run test:e2e).
  test: { include: ["src/**/*.test.ts"] },
});
