import { build } from "vite";
import { mkdir, rm, writeFile } from "node:fs/promises";

// GitHub Pages serves /docs on the session branch. Preserve the authored report.
await mkdir("docs", { recursive: true });
await rm("docs/assets", { recursive: true, force: true });
await build({
  // Relative assets support either Pages source: /docs or repository root.
  base: "./",
  build: { outDir: "docs", emptyOutDir: false },
});
await writeFile("docs/.nojekyll", "");
console.log("GitHub Pages bundle ready in docs/ (report preserved).");
