// Bundles the Electron app into dist/: main (ESM), preload (CJS, sandboxed), renderer (browser IIFE).
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/renderer", { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "info", target: "node22" };

await build({
  ...common,
  entryPoints: ["app/main.ts"],
  outfile: "dist/main.mjs",
  platform: "node",
  format: "esm",
  external: ["electron"],
  packages: "external", // node_modules stay on disk (Verovio's wasm, pdfkit fonts); not packaged yet
});

await build({
  ...common,
  entryPoints: ["app/preload.ts"],
  outfile: "dist/preload.cjs",
  platform: "node",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...common,
  entryPoints: ["app/renderer/renderer.ts"],
  outfile: "dist/renderer/renderer.js",
  platform: "browser",
  format: "iife",
  target: "chrome140",
});

await cp("app/renderer/index.html", "dist/renderer/index.html");
await cp("app/renderer/style.css", "dist/renderer/style.css");
