import * as esbuild from "npm:esbuild";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader";

await esbuild.build({
  entryPoints: ["transpiled.js"],
  bundle: true,
  outfile: "esm.js",
  format: "esm", // Change to "iife" if you need a self-invoking bundle
  plugins: denoPlugins(),
});

await esbuild.stop();
console.log("Bundling complete! Bundle saved to esm.js");
