import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/sources/client.ts", "src/recipe/scale.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // Left external so a consumer resolves their own copies from node_modules.
  external: ["@modelcontextprotocol/sdk", "zod", "mcp-marmiton", "mcp-wikibooks-cookbook"],
  // src/index.ts opens with the shebang and esbuild keeps it on the entry
  // point; a global banner would also stamp it onto the library entries.
});
