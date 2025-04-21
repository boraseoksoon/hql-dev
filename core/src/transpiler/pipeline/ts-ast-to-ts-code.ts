// src/transpiler/ts-ast-to-ts-code.ts - Refactored with perform and performAsync utilities
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { convertIRNode } from "../pipeline/hql-ir-to-ts-ast.ts";
import { CodeGenError, perform } from "../../common/error-pipeline.ts";
import { globalLogger as logger } from "../../logger.ts";

/**
 * The output of TypeScript code generation, including code and optional source map.
 */
export interface TypeScriptOutput {
  code: string;
  sourceMap?: string;
}


/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * Enhanced with better error handling and diagnostics using perform utility.
 */
/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * Enhanced with better error handling, diagnostics, and source map generation.
 * @param ir - The IR program to convert to TypeScript
 * @param options - Generation options including source file path and source map generation
 */
// In ts-ast-to-ts-code.ts - Where JavaScript code is generated from TypeScript AST
export async function generateTypeScript(
  ir: IR.IRProgram,
  options: {
    sourceFilePath?: string;
    generateSourceMap?: boolean;
    inlineSourceMap?: boolean;
    originalSource?: string;
  } = {}
): Promise<TypeScriptOutput> {
  try {
    logger.debug(
      `Starting TypeScript code generation from IR with ${ir.body.length} nodes`,
    );

    // Convert HQL IR to TypeScript AST
    const tsAST = await convertHqlIRToTypeScript(ir);
    
    // Create printer
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
      omitTrailingSemicolon: false,
      noEmitHelpers: true,
    });

    // Create an empty source file for printing
    const resultFile = ts.createSourceFile(
      options.sourceFilePath || "output.ts",
      "",
      ts.ScriptTarget.Latest,
      false,
    );

    // Generate the code
    const code = printer.printNode(ts.EmitHint.Unspecified, tsAST, resultFile);
    
    // Generate source map if requested
    let sourceMap: string | undefined = undefined;
    
    if (options.generateSourceMap) {
      try {
        // Use the SourceMapGenerator from the source-map library
        const { SourceMapGenerator } = await import("npm:source-map@0.7.3");
        const map = new SourceMapGenerator({
          file: options.sourceFilePath ? path.basename(options.sourceFilePath) + ".js" : "output.js",
          sourceRoot: ""
        });
        
        if (options.originalSource && options.sourceFilePath) {
          // Store the original HQL source
          map.setSourceContent(options.sourceFilePath, options.originalSource);
          
          // Create mappings for each line
          const lines = code.split('\n');
          const originalLines = options.originalSource.split('\n');
          
          // Map each line of generated code to the original source
          // This is a simple mapping - for better accuracy, we would need to analyze the AST
          for (let i = 0; i < lines.length; i++) {
            const originalLine = Math.min(i, originalLines.length - 1);
            
            map.addMapping({
              generated: { line: i + 1, column: 0 },
              original: { line: originalLine + 1, column: 0 },
              source: options.sourceFilePath
            });
            
            // For lines with significant tokens, add more detailed mappings
            const tokens = extractSignificantTokens(lines[i]);
            for (const token of tokens) {
              // Try to find this token in the original source
              const found = findTokenInOriginalSource(token, options.originalSource);
              if (found) {
                map.addMapping({
                  generated: { line: i + 1, column: token.index },
                  original: { line: found.line, column: found.column },
                  source: options.sourceFilePath,
                  name: token.text
                });
              }
            }
          }
        }
        
        // Generate the source map
        sourceMap = map.toString();
        
        // If inline source map is requested
        if (options.inlineSourceMap && sourceMap) {
          const base64Map = btoa(sourceMap);
          const inlineComment = `//# sourceMappingURL=data:application/json;base64,${base64Map}`;
          return { 
            code: code + '\n' + inlineComment + '\n',
            sourceMap
          };
        }
      } catch (smError) {
        logger.error(`Source map generation failed: ${smError instanceof Error ? smError.message : String(smError)}`);
      }
    }
    
    return { code, sourceMap };
  } catch (error) {
    // Error handling...
    throw new CodeGenError(`Failed to generate code: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to extract significant tokens from a line
function extractSignificantTokens(line: string): { text: string, index: number }[] {
  const tokens: { text: string, index: number }[] = [];
  
  // Match identifiers, function calls, property access, etc.
  const patterns = [
    /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g,      // Identifiers
    /\b[a-zA-Z_][a-zA-Z0-9_]*\(/g,      // Function calls
    /\.[a-zA-Z_][a-zA-Z0-9_]*/g,        // Property access
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      tokens.push({
        text: match[0],
        index: match.index
      });
    }
  }
  
  return tokens;
}

// Helper function to find a token in the original source
function findTokenInOriginalSource(token: { text: string, index: number }, source: string): { line: number, column: number } | null {
  if (!source) return null;
  
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const index = lines[i].indexOf(token.text);
    if (index !== -1) {
      return { line: i + 1, column: index };
    }
  }
  
  return null;
}

/**
 * Converts HQL IR directly to the official TypeScript AST.
 * Enhanced with better error handling and diagnostics using perform utility.
 */
/**
 * Converts HQL IR directly to the official TypeScript AST.
 * Enhanced with better error handling and diagnostics using perform utility.
 * @param program - The IR program to convert
 * @returns TypeScript SourceFile
 */
export async function convertHqlIRToTypeScript(program: IR.IRProgram): Promise<ts.SourceFile> {
  return await perform(
    () => {
      // Validate program input
      if (!program || program.type !== IR.IRNodeType.Program) {
        throw new CodeGenError(
          "Invalid program input: expected IR Program node",
          "IR program validation",
          program,
        );
      }

      if (!program.body || !Array.isArray(program.body)) {
        throw new CodeGenError(
          "Invalid program body: expected array of IR nodes",
          "IR program body validation",
          program,
        );
      }

      logger.debug(
        `Converting ${program.body.length} IR nodes to TypeScript statements`,
      );

      // Store any errors that occur during conversion
      const conversionErrors: string[] = [];

      // Process each node, collecting statements
      const statements: ts.Statement[] = [];

      for (let i = 0; i < program.body.length; i++) {
        const node = program.body[i];

        if (!node) {
          logger.warn(`Skipping null or undefined node at index ${i}`);
          continue;
        }

        try {
          const statement = perform(
            () => convertIRNode(node),
            `Converting node ${i} (${
              IR.IRNodeType[node.type] || "unknown type"
            })`,
            CodeGenError,
            [node],
          );

          if (Array.isArray(statement)) {
            if (statement.length > 0) {
              statements.push(...statement);
              logger.debug(
                `Converted node ${i} (${
                  IR.IRNodeType[node.type]
                }) to ${statement.length} statements`,
              );
            } else {
              logger.debug(
                `Node ${i} (${
                  IR.IRNodeType[node.type]
                }) produced empty statement array`,
              );
            }
          } else if (statement) {
            statements.push(statement);
            logger.debug(
              `Converted node ${i} (${
                IR.IRNodeType[node.type]
              }) to single statement`,
            );
          } else {
            logger.debug(
              `Node ${i} (${
                IR.IRNodeType[node.type]
              }) produced null or undefined statement`,
            );
          }
        } catch (error) {
          // Collect errors but continue processing other nodes
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          conversionErrors.push(
            `Error converting node ${i} (${
              IR.IRNodeType[node.type] || "unknown type"
            }): ${errorMessage}`,
          );
          logger.error(`Error converting node ${i}: ${errorMessage}`);
        }
      }

      // If there were any errors during conversion, log them and throw an error
      if (conversionErrors.length > 0) {
        const errorSummary = conversionErrors.join("\n");
        logger.error(
          `${conversionErrors.length} errors occurred during IR to TS conversion`,
        );

        // If all nodes failed, throw an error
        if (statements.length === 0) {
          throw new CodeGenError(
            `Failed to convert any nodes to TypeScript. Errors:\n${errorSummary}`,
            "IR to TS conversion",
            program.body,
          );
        }

        // Otherwise, warn about the errors but continue
        logger.warn(
          `Some nodes failed to convert (${conversionErrors.length} errors), but ${statements.length} statements were generated`,
        );
      }

      // Create the source file using the factory
      return perform(
        () => {
          logger.debug(
            `Creating source file with ${statements.length} statements`,
          );

          return ts.factory.createSourceFile(
            statements,
            ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
            ts.NodeFlags.None,
          );
        },
        "source file creation",
        CodeGenError,
        [statements],
      );
    },
    "IR to TS conversion",
    CodeGenError,
    [program],
  );
}
