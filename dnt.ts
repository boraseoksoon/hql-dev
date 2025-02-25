import { build, emptyDir } from "jsr:@deno/dnt";

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
    description: ""
  },
  typeCheck: true,
  test: false,
});

console.log("npm package built in the ./npm folder");
