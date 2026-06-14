import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/register.ts",
        "src/**/*.d.ts",
      ],
    },
    // Use tsconfig.test.json so tests have access to vitest globals types
    // and test files aren't excluded
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
  resolve: {
    alias: {
      "@utils": resolve(__dirname, "src/utils/utils.ts"),
      "@database": resolve(__dirname, "src/database"),
      "@": resolve(__dirname, "src"),
    },
  },
});
