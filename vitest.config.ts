import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    /**
     * The vocabulary modules build their tables as they are imported, and that
     * cost is charged to whichever test runs first in a file. Four seconds of it
     * on an idle machine is most of the default bound before a test has done
     * anything, so a loaded runner spends the bound on the import. This one
     * still catches a test that hangs, and stops catching the machine it runs
     * on.
     */
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      // Every source file counts, including one no test imports: a module left
      // out of the suite is what this measures.
      include: ["src/**/*.ts"],
      // The executable takes stdio and ends the process as it is imported, so a
      // test that loads it takes the runner with it. What it wires is measured
      // where it is built.
      exclude: ["src/index.ts"],
      // The floor is what the suite reaches, and it does not go down.
      thresholds: {
        statements: 98,
        branches: 94,
        functions: 99,
        lines: 98,
      },
    },
  },
});
