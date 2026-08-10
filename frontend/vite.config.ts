import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const apiUrl = loadEnv(mode, ".", "VITE_").VITE_API_URL?.trim();
    if (!apiUrl || new URL(apiUrl).protocol !== "https:") {
      throw new Error("Production builds require an HTTPS VITE_API_URL");
    }
  }

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});
