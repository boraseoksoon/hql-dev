// cli/compile.ts
import { parse } from "../src/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { transformAST } from "../src/transformer.ts";
import { generateCode } from "../src/codegen.ts";
import { dirname, resolve, join } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Print usage information and exit.
 */
function printUsageAndExit(): void {
  console.error(
    "Usage: deno run --allow-read --allow-write cli/compile.ts <input.hql> [<output>]"
  );
  Deno.exit(1);
}

/**
 * Determine the output file path based on the input file and optional output argument.
 *
 * 1. If no output argument is provided, return "transpiled.js" in the same directory as input.
 * 2. If an output argument is provided and it contains a directory separator:
 *    - If it ends with ".js", assume it's a full file path.
 *    - Otherwise, assume it's a directory and output "transpiled.js" in that directory.
 * 3. If the output argument is provided without a directory, use it as the file name in the input file's directory.
 *
 * @param inputAbs Absolute path to the input file.
 * @param outputArg Optional output argument.
 * @returns The full path for the output file.
 */
function determineOutputFile(inputAbs: string, outputArg?: string): string {
  const inputDir = dirname(inputAbs);
  if (!outputArg) {
    return join(inputDir, "transpiled.js");
  } else {
    if (outputArg.includes("/") || outputArg.includes("\\")) {
      if (outputArg.endsWith(".js")) {
        return resolve(outputArg);
      } else {
        return join(resolve(outputArg), "transpiled.js");
      }
    } else {
      return join(inputDir, outputArg);
    }
  }
}

/**
 * Compile an HQL file using the shared compilation pipeline and write output to the given file.
 *
 * @param inputFile The input HQL file path.
 * @param outputFile The output file path.
 */
async function compileHQL(inputFile: string, outputFile: string): Promise<void> {
  const inputAbs = await Deno.realPath(inputFile);
  const inputDir = dirname(inputAbs);
  const hql = await Deno.readTextFile(inputAbs);
  const ast = parse(hql);
  const expanded = expandMacros(ast);
  const visited = new Set<string>();
  const transformed = await transformAST(expanded, inputDir, visited);
  const finalCode = generateCode(transformed);
  await Deno.writeTextFile(outputFile, finalCode);
  console.log(`Compilation complete. Output written to ${outputFile}`);
}

/**
 * Main entry point.
 */
if (import.meta.main) {
  if (Deno.args.length < 1) {
    printUsageAndExit();
  }
  const inputFile = Deno.args[0];
  const outputArg = Deno.args[1];
  let inputAbs: string;
  try {
    inputAbs = await Deno.realPath(inputFile);
  } catch (err) {
    console.error(`Error: Unable to resolve input file ${inputFile}: ${err.message}`);
    Deno.exit(1);
  }
  const outputFile = determineOutputFile(inputAbs, outputArg);
  await compileHQL(inputFile, outputFile);
}
