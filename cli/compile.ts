import { parse } from "../src/parser.ts";
import { transformAST } from "../src/transformer.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

// Configurable options for compilation
interface CompileOptions {
  outputPath?: string;
  // Log level: 0 = errors only, 1 = warnings, 2 = info, 3 = verbose
  logLevel?: number;
}

// Result of compilation
interface CompileResult {
  code: string;
  warnings: string[];
  stats: {
    inputSize: number;
    outputSize: number;
    parseTime: number;
    transformTime: number;
    totalTime: number;
  };
}

// Simple logger factory based on the log level
function createLogger(logLevel: number) {
  return (level: number, message: string) => {
    if (level <= logLevel) {
      console.log(message);
    }
  };
}

// Step 1: Read the source file
async function readSourceFile(path: string, log: (level: number, msg: string) => void): Promise<string> {
  log(3, "Reading source file...");
  try {
    const source = await Deno.readTextFile(path);
    log(3, "Source file read successfully.");
    return source;
  } catch (error) {
    throw new Error(`Failed to read source file: ${error.message}`);
  }
}

// Step 2: Parse the source to an AST
function parseSource(source: string, inputPath: string, log: (level: number, msg: string) => void): { hqlAST: any, parseTime: number } {
  log(3, "Parsing HQL to AST...");
  const parseStart = performance.now();
  let ast;
  try {
    ast = parse(source);
  } catch (error) {
    if (error.location) {
      const { line, column } = error.location;
      const lines = source.split("\n");
      const errorLine = lines[line - 1] || "";
      const pointer = " ".repeat(column - 1) + "^";
      throw new Error(
        `Parse error at ${inputPath}:${line}:${column}\n${errorLine}\n${pointer}\n${error.message}`
      );
    }
    throw new Error(`Parse error: ${error.message}`);
  }
  const parseTime = performance.now() - parseStart;
  log(3, `Parsing completed in ${parseTime.toFixed(2)}ms`);
  return { hqlAST, parseTime };
}

// Step 3: Transform the AST to JavaScript code
async function transformToJS(ast: any, inputPath: string, log: (level: number, msg: string) => void): Promise<{ javascript: string, transformTime: number }> {
  log(3, "Transforming AST to JavaScript...");
  const transformStart = performance.now();
  let javascript: string;
  try {
    const currentDir = dirname(inputPath);
    const visited = new Set<string>();
    javascript = await transformAST(ast, currentDir, visited);
  } catch (error) {
    throw new Error(`Transform error: ${error.message}`);
  }
  const transformTime = performance.now() - transformStart;
  log(3, `Transformation completed in ${transformTime.toFixed(2)}ms`);
  return { javascript, transformTime };
}

// Step 4: Write the transformed code to the output file
async function write(code: string, outputPath: string, log: (level: number, msg: string) => void): Promise<void> {
  log(3, "Writing output file...");
  try {
    const outputDir = dirname(outputPath);
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    await Deno.writeTextFile(outputPath, code);
  } catch (error) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

// Main compile function that ties all steps together
export async function compile(inputPath: string, options: CompileOptions = {}): Promise<CompileResult> {
  const startTime = performance.now();
  const warnings: string[] = [];
  const logLevel = options.logLevel ?? 1;
  const log = createLogger(logLevel);
  const outputPath = options.outputPath ?? inputPath.replace(/\.hql$/, ".js");

  try {
    log(2, `Compiling ${inputPath} to ${outputPath}`);

    const hql = await readSourceFile(inputPath, log);
    const { hqlAST, parseTime } = parseSource(hql, inputPath, log);
    const { javascript, transformTime } = await transformToJS(hqlAST, inputPath, log);
    await write(javascript, outputPath, log);

    const totalTime = performance.now() - startTime;
    const inputSize = hql.length;
    log(2, `Source size: ${inputSize} bytes`);
    log(2, `Successfully compiled ${inputPath} -> ${outputPath}`);
    log(2, `Compilation completed in ${totalTime.toFixed(2)}ms`);

    return {
      javascript,
      warnings,
      stats: {
        inputSize,
        outputSize: javascript.length,
        parseTime,
        transformTime,
        totalTime
      }
    };
  } catch (error) {
    console.error(`Compilation failed: ${error.message}`);
    throw error;
  }
}

// Command-line execution when run directly
if (import.meta.main) {
  const args = Deno.args;

  if (args.length < 1) {
    console.error("Usage: deno run -A compile.ts <input.hql> [output.js]");
    Deno.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace(/\.hql$/, ".js");
  const verbose = args.includes("--verbose") || args.includes("-v");

  compile(inputPath, {
    outputPath,
    logLevel: verbose ? 3 : 2
  }).then(async (result) => {
    // If the call was made with --v or --version, remove the written output file.
    if (args.includes("--v") || args.includes("--version")) {
      try {
        await Deno.remove(outputPath);
        console.log("Temporary output file removed.");
      } catch (error) {
        console.error(`Failed to remove temporary file: ${error.message}`);
      }
    }
  }).catch(() => {
    Deno.exit(1);
  });
}

export default compile;
