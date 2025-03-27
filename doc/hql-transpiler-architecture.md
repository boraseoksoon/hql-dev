# HQL Transpiler Architecture

This document outlines the architecture of the HQL (Higher Query Language)
transpiler, which follows the core principles of "macro everywhere,
minimal-core, expression-oriented, single-bundled-output, platform agnostic"
design.

## Overview

HQL transpiles S-expression syntax to JavaScript/TypeScript using a pipeline of
transformations that preserves the expression-oriented nature of the language.

```
HQL Code → HQL AST → Macro Expansion → HQL IR → TypeScript AST → TypeScript Code (legacy) => X


HQL Transpiler Pipeline (new)
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│ HQL    │→ │ S-expr │→ │ Macro  │→ │ HQL    │→ │ HQL    │→ │ TS     │→ │JavaScript│
│ Source │  │ Parse  │  │ Expand │  │ AST    │  │ IR     │  │ AST    │  │ Output  │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
```

## Streamlined Pipeline

The transpiler uses a direct conversion from HQL IR to the official TypeScript
AST, bypassing proprietary intermediate representations for improved performance
and maintainability.

### File Structure

```
src/
  ├── transpiler/
  │   ├── parser.ts                 # Parses HQL code to AST
  │   ├── hql_ast.ts                # Defines HQL AST node types
  │   ├── macro-expander.ts         # Handles macro expansion
  │   ├── hql-to-ir.ts              # Converts HQL AST to IR
  │   ├── hql_ir.ts                 # Defines IR node types
  │   ├── ir-to-official-ts.ts      # Direct IR to TS Compiler AST
  │   ├── ts-ast-to-code.ts         # Code generation
  │   └── transformer.ts            # Main entry point
  ├── utils.ts                      # Utility functions
  └── platform/
      └── platform.ts               # Platform abstraction
```

## Pipeline Components

### 1. Parser (`parser.ts`)

Converts HQL source code into an abstract syntax tree (AST).

```typescript
// Example of parsing HQL code
import { parse } from "./parser.ts";

const source = `(fn greet (name) (+ "Hello, " name "!"))`;
const astNodes = parse(source);

// astNodes represents:
// (fn greet (name) (+ "Hello, " name "!"))
```

### 2. Macro Expansion (`macro-expander.ts`)

Expands macros in the AST, replacing high-level constructs with kernel
primitives.

```typescript
import { expandMacros } from "../macro-expander.ts";

const expandedNodes = await expandMacros(astNodes);

// expandedNodes represents:
// (let greet (lambda (name) (+ "Hello, " name "!")))
```

### 3. IR Generation (`hql-to-ir.ts`)

Transforms the expanded AST into a normalized intermediate representation (IR).

```typescript
import { transformToIR } from "./hql-to-ir.ts";

const ir = transformToIR(expandedNodes, currentDir);

// IR contains structured nodes representing:
// const greet = function(name) {
//   return "Hello, " + name + "!";
// };
```

### 4. Direct TypeScript AST Generation (`ir-to-official-ts.ts`)

Converts HQL IR directly to the official TypeScript Compiler AST:

```typescript
import * as ts from "npm:typescript";
import { convertHqlIRToTypeScript } from "./ir-to-official-ts.ts";

const tsAST = convertHqlIRToTypeScript(ir);

// TypeScript AST representing the same function
// using the official TypeScript compiler API
```

### 5. Code Generation (`ts-ast-to-code.ts`)

Uses the TypeScript Compiler API to generate clean, optimized TypeScript code:

```typescript
const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});

const resultFile = ts.createSourceFile(
  "output.ts",
  "",
  ts.ScriptTarget.Latest,
  false,
);

const tsCode = printer.printNode(
  ts.EmitHint.Unspecified,
  tsAST,
  resultFile,
);

// Final output: TypeScript code
```

## Complete Transpilation Flow

The entire pipeline is orchestrated by the `transformer.ts` module:

```typescript
export async function transformAST(
  astNodes: HQLNode[],
  currentDir: string,
): Promise<string> {
  // Step 1: Expand macros in the AST
  const expandedNodes = await expandMacros(astNodes);

  // Step 2: Transform to IR
  const ir = transformToIR(expandedNodes, currentDir);

  // Step 3: Generate TypeScript code directly from IR
  const tsCode = generateTypeScript(ir);

  // Step 4: Prepend runtime functions
  return tsCode;
}
```

## Example Transformation

Here's a complete example of how HQL code transforms through the pipeline:

### HQL Source

```
(fn greet (name)
  (+ "Hello, " name "!"))
```

### HQL AST

```json
[
  {
    "type": "list",
    "elements": [
      { "type": "symbol", "name": "defn" },
      { "type": "symbol", "name": "greet" },
      {
        "type": "list",
        "elements": [{ "type": "symbol", "name": "name" }]
      },
      {
        "type": "list",
        "elements": [
          { "type": "symbol", "name": "+" },
          { "type": "literal", "value": "Hello, " },
          { "type": "symbol", "name": "name" },
          { "type": "literal", "value": "!" }
        ]
      }
    ]
  }
]
```

### Expanded AST (after macro expansion)

```json
[
  {
    "type": "list",
    "elements": [
      { "type": "symbol", "name": "def" },
      { "type": "symbol", "name": "greet" },
      {
        "type": "list",
        "elements": [
          { "type": "symbol", "name": "fn" },
          {
            "type": "list",
            "elements": [{ "type": "symbol", "name": "name" }]
          },
          {
            "type": "list",
            "elements": [
              { "type": "symbol", "name": "+" },
              { "type": "literal", "value": "Hello, " },
              { "type": "symbol", "name": "name" },
              { "type": "literal", "value": "!" }
            ]
          }
        ]
      }
    ]
  }
]
```

### HQL IR (simplified)

```javascript
{
  type: IRNodeType.Program,
  body: [
    {
      type: IRNodeType.VariableDeclaration,
      kind: "const",
      declarations: [
        {
          type: IRNodeType.VariableDeclarator,
          id: { type: IRNodeType.Identifier, name: "greet" },
          init: {
            type: IRNodeType.FunctionExpression,
            params: [{ type: IRNodeType.Identifier, name: "name" }],
            body: {
              type: IRNodeType.BlockStatement,
              body: [
                {
                  type: IRNodeType.ReturnStatement,
                  argument: {
                    type: IRNodeType.BinaryExpression,
                    operator: "+",
                    left: {
                      type: IRNodeType.BinaryExpression,
                      operator: "+",
                      left: { type: IRNodeType.StringLiteral, value: "Hello, " },
                      right: { type: IRNodeType.Identifier, name: "name" }
                    },
                    right: { type: IRNodeType.StringLiteral, value: "!" }
                  }
                }
              ]
            }
          }
        }
      ]
    }
  ]
}
```

### TypeScript Output

```typescript
const greet = function (name) {
  return "Hello, " + name + "!";
};
```

## Key Benefits

1. **Expression-Oriented**: Every construct is an expression that returns a
   value
2. **Macro-Driven**: High-level language features compile to minimal core forms
3. **Efficient Pipeline**: Direct IR-to-TypeScript transformation removes
   unnecessary steps
4. **Modern Tooling**: Leverages the TypeScript Compiler API for optimized code
   generation
5. **Maintainable Architecture**: Clean separation of concerns with well-defined
   interfaces

## Implementation Details

The key innovation is the direct conversion from HQL IR to the official
TypeScript AST, implemented in `ir-to-official-ts.ts`:

```typescript
export function convertHqlIRToTypeScript(program: IR.IRProgram): ts.SourceFile {
  const statements: ts.Statement[] = [];

  for (const node of program.body) {
    const statement = convertIRNode(node);
    if (Array.isArray(statement)) {
      statements.push(...statement);
    } else if (statement) {
      statements.push(statement);
    }
  }

  return ts.factory.createSourceFile(
    statements,
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );
}

function convertIRNode(node: IR.IRNode): ts.Statement | ts.Statement[] | null {
  switch (node.type) {
    case IR.IRNodeType.StringLiteral:
      return createExpressionStatement(
        convertStringLiteral(node as IR.IRStringLiteral),
      );
    case IR.IRNodeType.NumericLiteral:
      return createExpressionStatement(
        convertNumericLiteral(node as IR.IRNumericLiteral),
      );
      // Additional cases for other node types...
  }
}
```

This approach provides a streamlined, efficient pipeline that preserves the
expression-oriented nature of HQL while benefiting from the robustness of the
TypeScript compiler.
