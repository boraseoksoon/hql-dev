import { build, emptyDir } from "jsr:@deno/dnt";

// Clean the output directory.
await emptyDir("./npm");

await build({
  entryPoints: ["./esm.js"],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  package: {
    name: "your-package-name",
    version: "0.1.0",
    description: "A Node-compatible bundle converted from Deno code.",
    // These are the entry points for Node.
    main: "index.js",
    module: "index.js",
    types: "index.d.ts",
  },
  typeCheck: true,
  test: false,
});

console.log("npm package built in the ./npm folder");
