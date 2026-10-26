import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Persistence tests use real SQLite via better-sqlite3 (node env);
    // UI tests declare jsdom via comment directive.
  },
});
