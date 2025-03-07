// src/transpiler/ts-ast-to-code.ts - Generate TypeScript code from AST

import * as TS from "./ts-ast-types.ts";

export interface CodeGenerationOptions {
  indentSize: number;
  useSpaces: boolean;
  formatting: "minimal" | "standard" | "pretty";
  module: "esm" | "commonjs";
}

// Default options
const defaultOptions: CodeGenerationOptions = {
  indentSize: 2,
  useSpaces: true,
  formatting: "standard",
  module: "esm"
};

/**
 * Generate TypeScript code from an AST
 */
export function generateTypeScript(ast: TS.TSSourceFile, options: CodeGenerationOptions = defaultOptions): string {
  const context = new CodeGenContext(options);
  return context.generateNode(ast);
}

/**
 * Context for code generation
 */
class CodeGenContext {
  private options: CodeGenerationOptions;
  private indentLevel: number = 0;
  private imports: Map<string, string> = new Map();
  
  constructor(options: CodeGenerationOptions) {
    this.options = options;
  }
  
  /**
   * Get the current indentation string
   */
  private getIndent(): string {
    const indentChar = this.options.useSpaces ? " " : "\t";
    const indentSize = this.options.useSpaces ? this.options.indentSize : 1;
    return indentChar.repeat(indentSize * this.indentLevel);
  }
  
  /**
   * Increase indentation level
   */
  private indent(): void {
    this.indentLevel++;
  }
  
  /**
   * Decrease indentation level
   */
  private dedent(): void {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
  }
  
  /**
   * Generate code for a node
   */
  public generateNode(node: TS.TSNode): string {
    switch (node.type) {
      // Program
      case TS.TSNodeType.SourceFile:
        return this.generateSourceFile(node as TS.TSSourceFile);
        
      // Literals
      case TS.TSNodeType.StringLiteral:
        return this.generateStringLiteral(node as TS.TSStringLiteral);
        
      case TS.TSNodeType.NumericLiteral:
        return this.generateNumericLiteral(node as TS.TSNumericLiteral);
        
      case TS.TSNodeType.BooleanLiteral:
        return this.generateBooleanLiteral(node as TS.TSBooleanLiteral);
        
      case TS.TSNodeType.NullLiteral:
        return this.generateNullLiteral(node as TS.TSNullLiteral);
        
      // Identifiers
      case TS.TSNodeType.Identifier:
        return this.generateIdentifier(node as TS.TSIdentifier);
        
      // Expressions
      case TS.TSNodeType.BinaryExpression:
        return this.generateBinaryExpression(node as TS.TSBinaryExpression);
        
      case TS.TSNodeType.UnaryExpression:
        return this.generateUnaryExpression(node as TS.TSUnaryExpression);
        
      case TS.TSNodeType.CallExpression:
        return this.generateCallExpression(node as TS.TSCallExpression);
        
      case TS.TSNodeType.MemberExpression:
        return this.generateMemberExpression(node as TS.TSMemberExpression);
        
      case TS.TSNodeType.NewExpression:
        return this.generateNewExpression(node as TS.TSNewExpression);
        
      case TS.TSNodeType.ConditionalExpression:
        return this.generateConditionalExpression(node as TS.TSConditionalExpression);
        
      case TS.TSNodeType.ArrayExpression:
        return this.generateArrayExpression(node as TS.TSArrayExpression);
        
      case TS.TSNodeType.ArrayConsExpression:
        return this.generateArrayConsExpression(node as TS.TSArrayConsExpression);
        
      case TS.TSNodeType.FunctionExpression:
        return this.generateFunctionExpression(node as TS.TSFunctionExpression);
        
      case TS.TSNodeType.ArrowFunctionExpression:
        return this.generateArrowFunctionExpression(node as TS.TSArrowFunctionExpression);
        
      // Statements
      case TS.TSNodeType.ExpressionStatement:
        return this.generateExpressionStatement(node as TS.TSExpressionStatement);
        
      case TS.TSNodeType.BlockStatement:
        return this.generateBlockStatement(node as TS.TSBlockStatement);
        
      case TS.TSNodeType.ReturnStatement:
        return this.generateReturnStatement(node as TS.TSReturnStatement);
        
      case TS.TSNodeType.IfStatement:
        return this.generateIfStatement(node as TS.TSIfStatement);
        
      // Declarations
      case TS.TSNodeType.VariableDeclaration:
        return this.generateVariableDeclaration(node as TS.TSVariableDeclaration);
        
      case TS.TSNodeType.FunctionDeclaration:
        return this.generateFunctionDeclaration(node as TS.TSFunctionDeclaration);
        
      // Modules
      case TS.TSNodeType.ImportDeclaration:
        return this.generateImportDeclaration(node as TS.TSImportDeclaration);
        
      case TS.TSNodeType.ExportNamedDeclaration:
        return this.generateExportNamedDeclaration(node as TS.TSExportNamedDeclaration);
        
      case TS.TSNodeType.NamedExport:
        return this.generateNamedExport(node as TS.TSNamedExport);
        
      // JS Interop
      case TS.TSNodeType.InteropIIFE:
        return this.generateInteropIIFE(node as TS.TSInteropIIFE);
        
      // Other
      case TS.TSNodeType.CommentBlock:
        return this.generateCommentBlock(node as TS.TSCommentBlock);
        
      case TS.TSNodeType.Raw:
        return this.generateRaw(node as TS.TSRaw);
        
      default:
        console.warn(`Unknown node type: ${(node as any).type}`);
        return "";
    }
  }
  
  // Program
  private generateSourceFile(node: TS.TSSourceFile): string {
    // Clear imports map
    this.imports.clear();
    
    // Generate code for each statement
    const statements = node.statements.map(stmt => this.generateNode(stmt));
    
    // Add imports at the beginning
    let importsCode = "";
    if (this.imports.size > 0) {
      const importLines: string[] = [];
      this.imports.forEach((moduleName, source) => {
        if (this.options.module === "esm") {
          importLines.push(`import * as ${moduleName} from "${source}";`);
        } else {
          importLines.push(`const ${moduleName} = require("${source}");`);
        }
      });
      importsCode = importLines.join("\n") + "\n\n";
    }
    
    return importsCode + statements.join("\n");
  }
  
  // Literals
  private generateStringLiteral(node: TS.TSStringLiteral): string {
    return JSON.stringify(node.value);
  }
  
  private generateNumericLiteral(node: TS.TSNumericLiteral): string {
    return String(node.value);
  }
  
  private generateBooleanLiteral(node: TS.TSBooleanLiteral): string {
    return String(node.value);
  }
  
  private generateNullLiteral(node: TS.TSNullLiteral): string {
    return "null";
  }
  
  // Identifiers
  private generateIdentifier(node: TS.TSIdentifier): string {
    return node.name;
  }
  
  // Expressions
  private generateBinaryExpression(node: TS.TSBinaryExpression): string {
    return `(${this.generateNode(node.left)} ${node.operator} ${this.generateNode(node.right)})`;
  }
  
  private generateUnaryExpression(node: TS.TSUnaryExpression): string {
    return `${node.operator}(${this.generateNode(node.argument)})`;
  }
  
  private generateCallExpression(node: TS.TSCallExpression): string {
    const callee = this.generateNode(node.callee);
    const args = node.arguments.map(arg => this.generateNode(arg)).join(", ");
    return `${callee}(${args})`;
  }
  
  private generateMemberExpression(node: TS.TSMemberExpression): string {
    const object = this.generateNode(node.object);
    const property = this.generateNode(node.property);
    
    if (node.computed) {
      return `${object}[${property}]`;
    } else {
      return `${object}.${property}`;
    }
  }
  
  private generateNewExpression(node: TS.TSNewExpression): string {
    const callee = this.generateNode(node.callee);
    const args = node.arguments.map(arg => this.generateNode(arg)).join(", ");
    return `new ${callee}(${args})`;
  }
  
  private generateConditionalExpression(node: TS.TSConditionalExpression): string {
    const test = this.generateNode(node.test);
    const consequent = this.generateNode(node.consequent);
    const alternate = this.generateNode(node.alternate);
    return `(${test} ? ${consequent} : ${alternate})`;
  }
  
  private generateArrayExpression(node: TS.TSArrayExpression): string {
    const elements = node.elements.map(elem => this.generateNode(elem)).join(", ");
    return `[${elements}]`;
  }
  
  private generateArrayConsExpression(node: TS.TSArrayConsExpression): string {
    const item = this.generateNode(node.item);
    const array = this.generateNode(node.array);
    return `[${item}, ...${array}]`;
  }
  
  private generateFunctionExpression(node: TS.TSFunctionExpression): string {
    const id = node.id ? this.generateNode(node.id) : "";
    const params = node.params.map(param => this.generateNode(param)).join(", ");
    const body = this.generateNode(node.body);
    return `function${id ? " " + id : ""}(${params}) ${body}`;
  }
  
  private generateArrowFunctionExpression(node: TS.TSArrowFunctionExpression): string {
    const params = node.params.map(param => this.generateNode(param)).join(", ");
    
    if (node.expression) {
      // Expression body
      const body = this.generateNode(node.body as TS.TSExpression);
      return `(${params}) => ${body}`;
    } else {
      // Block body
      const body = this.generateNode(node.body as TS.TSBlockStatement);
      return `(${params}) => ${body}`;
    }
  }
  
  // Statements
  private generateExpressionStatement(node: TS.TSExpressionStatement): string {
    return `${this.getIndent()}${this.generateNode(node.expression)};`;
  }
  
  private generateBlockStatement(node: TS.TSBlockStatement): string {
    if (node.body.length === 0) {
      return "{}";
    }
    
    this.indent();
    const body = node.body.map(stmt => this.generateNode(stmt)).join("\n");
    this.dedent();
    
    return `{\n${body}\n${this.getIndent()}}`;
  }
  
  private generateReturnStatement(node: TS.TSReturnStatement): string {
    if (node.argument) {
      return `${this.getIndent()}return ${this.generateNode(node.argument)};`;
    } else {
      return `${this.getIndent()}return;`;
    }
  }
  
  private generateIfStatement(node: TS.TSIfStatement): string {
    const test = this.generateNode(node.test);
    const consequent = this.generateNode(node.consequent);
    
    let result = `${this.getIndent()}if (${test}) ${consequent}`;
    
    if (node.alternate) {
      const alternate = this.generateNode(node.alternate);
      result += ` else ${alternate}`;
    }
    
    return result;
  }
  
  // Declarations
  private generateVariableDeclaration(node: TS.TSVariableDeclaration): string {
    const declarations = node.declarations.map(decl => {
      const id = this.generateNode(decl.id);
      const init = decl.init ? ` = ${this.generateNode(decl.init)}` : "";
      return `${id}${init}`;
    }).join(", ");
    
    return `${this.getIndent()}${node.kind} ${declarations};`;
  }
  
  private generateFunctionDeclaration(node: TS.TSFunctionDeclaration): string {
    const id = this.generateNode(node.id);
    const params = node.params.map(param => this.generateNode(param)).join(", ");
    const body = this.generateNode(node.body);
    
    return `${this.getIndent()}function ${id}(${params}) ${body}`;
  }
  
  // Modules
  private generateImportDeclaration(node: TS.TSImportDeclaration): string {
    // Register the import
    this.imports.set(node.source, node.moduleName);
    
    // Return blank since we'll add all imports at the beginning
    return "";
  }
  
  private generateExportNamedDeclaration(node: TS.TSExportNamedDeclaration): string {
    if (node.specifiers.length === 0) {
      return "";
    }
    
    const specifiers = node.specifiers.map(spec => {
      const local = this.generateNode(spec.local);
      const exported = this.generateNode(spec.exported);
      return local === exported ? local : `${local} as ${exported}`;
    }).join(", ");
    
    return `${this.getIndent()}export { ${specifiers} };`;
  }
  
  private generateNamedExport(node: TS.TSNamedExport): string {
    // Generate the variable declaration first
    const declaration = this.generateVariableDeclaration(node.variableDeclaration);
    
    // Then add the export statement
    const exportStatement = `${this.getIndent()}export { ${node.variableDeclaration.declarations[0].id.name} as ${node.exportName} };`;
    
    return `${declaration}\n${exportStatement}`;
  }
  
  // JS Interop
  private generateInteropIIFE(node: TS.TSInteropIIFE): string {
    const object = this.generateNode(node.object);
    const property = this.generateNode(node.property);
    
    // Generate an IIFE that checks if the property is callable
    return `(function() {
${this.getIndent()}  const _obj = ${object};
${this.getIndent()}  const _member = _obj[${property}];
${this.getIndent()}  return typeof _member === "function" ? _member.call(_obj) : _member;
${this.getIndent()}})()`;
  }
  
  // Other
  private generateCommentBlock(node: TS.TSCommentBlock): string {
    return `${this.getIndent()}/* ${node.value} */`;
  }
  
  private generateRaw(node: TS.TSRaw): string {
    return node.code;
  }
}