import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const apiUrl = loadEnv(mode, ".", "VITE_").VITE_API_URL?.trim();
    const protocol = apiUrl ? new URL(apiUrl).protocol : "";
    const permitsDevelopmentHttp = mode === "development" && protocol === "http:";
    if (!apiUrl || (protocol !== "https:" && !permitsDevelopmentHttp)) {
      throw new Error("Builds require an HTTPS VITE_API_URL outside explicit development mode");
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
