// cli/compile.ts
import { parse } from "../src/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { transformAST } from "../src/transformer.ts";
import { generateCode } from "../src/codegen.ts";

if (import.meta.main) {
  if (Deno.args.length < 1) {
    console.error("Usage: deno run --allow-read --allow-write cli/compile.ts <input.hql>");
    Deno.exit(1);
  }
  const inputFile = Deno.args[0];
  const source = await Deno.readTextFile(inputFile);
  const ast = parse(source);
  const expanded = expandMacros(ast);
  const transformed = transformAST(expanded);
  const finalCode = generateCode(transformed);
  const outputFile = "transpiled.js";
  await Deno.writeTextFile(outputFile, finalCode);
  console.log(`Compilation complete. Output written to ${outputFile}`);
}
