import * as esbuild from "npm:esbuild";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader";

await esbuild.build({
  entryPoints: ["./test/simple.js"],
  bundle: true,
  outfile: "esm.js",
  format: "esm",
  plugins: denoPlugins(),
});

await esbuild.stop();
console.log("Bundling complete! Bundle saved to esm.js");
