// src/transpiler/ts-ast-to-code.ts - No options, simple and direct
import * as TS from "./ts-ast-types.ts";

export function generateTypeScript(ast: TS.TSSourceFile): string {
  const context = new CodeGenContext();
  return context.generateNode(ast);
}

class CodeGenContext {
  // Hard-coded settings - no options needed
  private indentLevel = 0;
  private indentSize = 2;
  private useSpaces = true;

  private getIndent(): string {
    const char = this.useSpaces ? " " : "\t";
    return char.repeat(this.indentSize * this.indentLevel);
  }

  private indent(): void {
    this.indentLevel++;
  }

  private dedent(): void {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
  }

  public generateNode(node: TS.TSNode): string {
    switch (node.type) {
      case TS.TSNodeType.SourceFile: {
        return this.generateSourceFile(node as TS.TSSourceFile);
      }
      case TS.TSNodeType.StringLiteral: {
        return JSON.stringify((node as TS.TSStringLiteral).value);
      }
      case TS.TSNodeType.NumericLiteral: {
        return String((node as TS.TSNumericLiteral).value);
      }
      case TS.TSNodeType.BooleanLiteral: {
        return String((node as TS.TSBooleanLiteral).value);
      }
      case TS.TSNodeType.NullLiteral: {
        return "null";
      }
      case TS.TSNodeType.Identifier: {
        return (node as TS.TSIdentifier).name;
      }
      case TS.TSNodeType.BinaryExpression: {
        const bin = node as TS.TSBinaryExpression;
        return `(${this.generateNode(bin.left)} ${bin.operator} ${this.generateNode(bin.right)})`;
      }
      case TS.TSNodeType.UnaryExpression: {
        const un = node as TS.TSUnaryExpression;
        return `${un.operator}(${this.generateNode(un.argument)})`;
      }
      case TS.TSNodeType.CallExpression: {
        const call = node as TS.TSCallExpression;
        const callee = this.generateNode(call.callee);
        const args = call.arguments.map(arg => this.generateNode(arg)).join(", ");
        return `${callee}(${args})`;
      }
      case TS.TSNodeType.MemberExpression: {
        const mem = node as TS.TSMemberExpression;
        const obj = this.generateNode(mem.object);
        const prop = this.generateNode(mem.property);
        if (mem.computed) {
          return `${obj}[${prop}]`;
        }
        return `${obj}.${prop}`;
      }
      case TS.TSNodeType.NewExpression: {
        const newExpr = node as TS.TSNewExpression;
        const callee = this.generateNode(newExpr.callee);
        const args = newExpr.arguments.map(arg => this.generateNode(arg)).join(", ");
        return `new ${callee}(${args})`;
      }
      case TS.TSNodeType.FunctionExpression: {
        const funcExpr = node as TS.TSFunctionExpression;
        const params = funcExpr.params.map(p => this.generateNode(p)).join(", ");
        const body = this.generateNode(funcExpr.body);
        return `function(${params}) ${body}`;
      }
      case TS.TSNodeType.BlockStatement: {
        const block = node as TS.TSBlockStatement;
        this.indent();
        const body = block.body.map(stmt => this.generateNode(stmt)).join("\n");
        this.dedent();
        return `{\n${body}\n${this.getIndent()}}`;
      }
      case TS.TSNodeType.VariableDeclaration: {
        const varDecl = node as TS.TSVariableDeclaration;
        const decls = varDecl.declarations.map(decl => {
          const init = decl.init ? ` = ${this.generateNode(decl.init)}` : "";
          return `${this.generateNode(decl.id)}${init}`;
        }).join(", ");
        return `${this.getIndent()}${varDecl.kind} ${decls};`;
      }
      case TS.TSNodeType.FunctionDeclaration: {
        const funcDecl = node as TS.TSFunctionDeclaration;
        const name = this.generateNode(funcDecl.id);
        const params = funcDecl.params.map(p => this.generateNode(p)).join(", ");
        const body = this.generateNode(funcDecl.body);
        return `${this.getIndent()}function ${name}(${params}) ${body}`;
      }
      case TS.TSNodeType.ImportDeclaration: {
        const imp = node as TS.TSImportDeclaration;
        return `import * as ${imp.moduleName} from "${imp.source}";\n` +
               `const ${imp.defaultVarName} = ${imp.moduleName}.default !== undefined ? ${imp.moduleName}.default : ${imp.moduleName};`;
      }
      case TS.TSNodeType.ExportNamedDeclaration: {
        const expDecl = node as TS.TSExportNamedDeclaration;
        const specs = expDecl.specifiers.map(s => {
          const local = this.generateNode(s.local);
          const exported = this.generateNode(s.exported);
          return local === exported ? local : `${local} as ${exported}`;
        }).join(", ");
        return `${this.getIndent()}export { ${specs} };`;
      }
      case TS.TSNodeType.NamedExport: {
        const namedExp = node as TS.TSNamedExport;
        const varStr = this.generateNode(namedExp.variableDeclaration);
        const exportName = namedExp.variableDeclaration.declarations[0].id.name;
        return `${varStr}\n${this.getIndent()}export { ${exportName} as ${namedExp.exportName} };`;
      }
      case TS.TSNodeType.ReturnStatement: {
        const ret = node as TS.TSReturnStatement;
        if (ret.argument) {
          return `${this.getIndent()}return ${this.generateNode(ret.argument)};`;
        }
        return `${this.getIndent()}return;`;
      }
      case TS.TSNodeType.ConditionalExpression: {
        const cond = node as TS.TSConditionalExpression;
        return `(${this.generateNode(cond.test)} ? ${this.generateNode(cond.consequent)} : ${this.generateNode(cond.alternate)})`;
      }
      case TS.TSNodeType.InteropIIFE: {
        const iife = node as TS.TSInteropIIFE;
        const obj = this.generateNode(iife.object);
        const prop = this.generateNode(iife.property);
        return `(function() {
${this.getIndent()}  const _obj = ${obj};
${this.getIndent()}  const _member = _obj[${prop}];
${this.getIndent()}  return typeof _member === "function" ? _member.call(_obj) : _member;
${this.getIndent()}})()`;
      }
      case TS.TSNodeType.CommentBlock: {
        return `${this.getIndent()}/* ${(node as TS.TSCommentBlock).value} */`;
      }
      case TS.TSNodeType.Raw: {
        return (node as TS.TSRaw).code;
      }
      default: {
        console.warn("Unknown TS node type", (node as any).type);
        return "";
      }
    }
  }

  private generateSourceFile(node: TS.TSSourceFile): string {
    const lines = node.statements.map(stmt => this.generateNode(stmt));
    return lines.join("\n");
  }
}