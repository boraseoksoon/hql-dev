// src/s-exp/repl-environment.ts - Modularized environment for REPL

import { Environment, Value } from "../environment.ts";
import { Logger } from "../logger.ts";

export interface REPLEnvironmentOptions {
  verbose?: boolean;
}

const PATTERNS = {
  VARIABLE_DECLARATION: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
  FUNCTION_DECLARATION: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
  FUNCTION_OR_VAR_START: /^(function |const |let |var )/,
  RETURN_OR_DECLARATION: /^(const|let|var|return)\s+/,
  VARIABLE_NAME_CAPTURE: /^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/,
  EXPRESSION_OPERATORS: /[\(\)\+\-\*\/]/
};

export class REPLEnvironment {
  public hqlEnv: Environment;
  private jsEnv: Record<string, Value> = {};
  private definitions: Set<string> = new Set();
  private logger: Logger;
  
  // Track modules so we can persist them between evaluations
  private modules: Map<string, Value> = new Map();

  constructor(hqlEnv: Environment, options: REPLEnvironmentOptions = {}) {
    this.hqlEnv = hqlEnv;
    this.logger = new Logger(options.verbose ?? false);
  }

  getJsValue(name: string): Value {
    return this.jsEnv[name];
  }

  setJsValue(name: string, value: Value): void {
    this.jsEnv[name] = value;
    this.definitions.add(name);
    this.hqlEnv.define(name, value);
    
    // If this looks like a module (object with functions/properties), also track it in modules
    if (value !== null && typeof value === 'object') {
      this.modules.set(name, value);
      this.debug(`Registered module '${name}' in REPL environment`);
    }
    
    this.logger.debug(`Defined '${name}' in REPL environment`);
  }

  hasJsValue(name: string): boolean {
    return this.definitions.has(name);
  }

  removeJsValue(name: string): void {
    delete this.jsEnv[name];
    this.definitions.delete(name);
    this.hqlEnv.define(name, null);
    this.modules.delete(name);
    this.logger.debug(`Removed '${name}' from REPL environment`);
  }

  getDefinedSymbols(): string[] {
    return Array.from(this.definitions);
  }
  
  getModules(): Map<string, Value> {
    return new Map(this.modules);
  }

  createEvalContext(): string {
    // Get all defined symbols and create variable declarations for each
    const symbolDeclarations = Array.from(this.definitions)
      .map((name) => `const ${name} = replEnv.getJsValue("${name}");`)
      .join("\n");
      
    // Also make sure all modules are available globally
    const moduleSetup = Array.from(this.modules.keys())
      .map((name) => `globalThis.${name} = replEnv.getJsValue("${name}");`)
      .join("\n");
    
    return symbolDeclarations + "\n" + moduleSetup;
  }

  extractDefinitions(code: string): string[] {
    const defs = new Set<string>();
    for (const match of code.matchAll(PATTERNS.VARIABLE_DECLARATION)) {
      if (match[1]) defs.add(match[1]);
    }
    for (const match of code.matchAll(PATTERNS.FUNCTION_DECLARATION)) {
      if (match[1]) defs.add(match[1]);
    }
    return Array.from(defs);
  }

  private createRegistrationCode(definitions: string[]): string {
    return "\n\n// Register definitions\n" +
      definitions
        .map(
          (def) =>
            `if (typeof ${def} !== 'undefined') { replEnv.setJsValue("${def}", ${def}); }`
        )
        .join("\n");
  }

  private processLastExpression(code: string): string {
    const lines = code.split("\n");
    let lastIndex = lines.length - 1;
    while (lastIndex >= 0 && !lines[lastIndex].trim()) lastIndex--;
    if (lastIndex < 0) return code;
    const lastLine = lines[lastIndex].trim();
    if (!lastLine) return code;
    if (
      !lastLine.endsWith(";") &&
      !lastLine.startsWith("function ") &&
      !PATTERNS.RETURN_OR_DECLARATION.test(lastLine)
    ) {
      lines[lastIndex] = `return ${lastLine};`;
      this.debug(`Adding return for expression: ${lastLine}`);
    } else if (
      lastLine.endsWith(";") &&
      !lastLine.startsWith("function ") &&
      !PATTERNS.RETURN_OR_DECLARATION.test(lastLine)
    ) {
      lines[lastIndex] = `return ${lastLine.slice(0, -1)};`;
      this.debug(`Adding return for expression with semicolon: ${lastLine}`);
    } else if (PATTERNS.VARIABLE_NAME_CAPTURE.test(lastLine)) {
      const match = lastLine.match(PATTERNS.VARIABLE_NAME_CAPTURE);
      if (match && match[2]) {
        const varName = match[2];
        lines.push(`return ${varName};`);
        this.debug(`Adding return for variable: ${varName}`);
      }
    } else if (PATTERNS.EXPRESSION_OPERATORS.test(lastLine)) {
      const expr = lastLine.endsWith(";") ? lastLine.slice(0, -1) : lastLine;
      lines[lastIndex] = `return ${expr};`;
      this.debug(`Adding return for general expression: ${expr}`);
    }
    return lines.join("\n");
  }

  private debug(message: string): void {
    if (this.logger.isVerbose) {
      console.log(`DEBUG: ${message}`);
    }
  }

  prepareJsForRepl(jsCode: string): string {
    const definitions = this.extractDefinitions(jsCode);
    this.debug(`Extracted definitions: ${JSON.stringify(definitions)}`);
    let resultCode = jsCode;
    if (PATTERNS.FUNCTION_OR_VAR_START.test(jsCode.trim())) {
      resultCode += this.createRegistrationCode(definitions);
      this.debug("Handling function/variable definition");
    } else {
      resultCode = this.processLastExpression(jsCode) + this.createRegistrationCode(definitions);
    }
    this.debug(`Final prepared code: ${resultCode}`);
    return resultCode;
  }
}
