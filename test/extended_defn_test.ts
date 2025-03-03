// test/extended_defn_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { transformToIR } from "../src/transpiler/hql-to-ir.ts";
import { parse } from "../src/transpiler/parser.ts";
import * as IR from "../src/transpiler/hql_ir.ts";

// Helper to parse HQL and transform to IR
function parseAndTransform(code: string): IR.IRProgram {
  const ast = parse(code);
  return transformToIR(ast, ".");
}

Deno.test("debug greet IR", () => {
    const ir = parseAndTransform(`(defn greet (name: String title: String)
        (str "Hello, " title " " name "!"))`);
    
    console.dir(ir, { depth: 10 });
  });

Deno.test("hql-to-ir - simple function with type annotations", () => {
  const ir = parseAndTransform(`(defn add (x: Int y: Int) (+ x y))`);
  
  assertEquals(ir.body.length, 1);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "add");
  assertEquals(fnDecl.params.length, 2);
  
  // Check that parameters have type annotations
  assertEquals(fnDecl.params[0].id.name, "x");
  assertEquals(fnDecl.params[1].id.name, "y");
  // Type annotations exist but are not used in JS output
});

Deno.test("hql-to-ir - function with return type", () => {
  const ir = parseAndTransform(`(defn add (x: Int y: Int) -> Int (+ x y))`);
  
  assertEquals(ir.body.length, 1);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "add");
  
  // Verify that return type is captured (for potential TypeScript output)
  assertEquals(fnDecl.returnType !== undefined, true);
});

Deno.test("hql-to-ir - function with default parameter values", () => {
  const ir = parseAndTransform(`(defn add (x: Int y: Int = 0) (+ x y))`);
  
  assertEquals(ir.body.length, 1);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "add");
  assertEquals(fnDecl.params.length, 2);
  
  // Check that the function body includes default parameter handling
  const body = fnDecl.body;
  // First statement should be an if statement checking for undefined y
  const firstStmt = body.body[0];
  assertEquals(firstStmt.type, IR.IRNodeType.IfStatement);
});

Deno.test("hql-to-ir - function with named parameters", () => {
  const ir = parseAndTransform(`
    (defn greet (name: String title: String)
    (str "Hello, " title " " name "!"))
    (print (greet name: "Smith" title: "Dr."))
  `);
  
  assertEquals(ir.body.length, 2);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "greet");
  
  // Check that the function is marked for named parameters
  assertEquals(fnDecl.isNamedParams, true);
  assertEquals(fnDecl.namedParamIds?.includes("name"), true);
  assertEquals(fnDecl.namedParamIds?.includes("title"), true);
  
  // Check the call statement
  const callStmt = ir.body[1];
  assertEquals(callStmt.type, IR.IRNodeType.CallExpression);
  const callExpr = callStmt as IR.IRCallExpression;
  assertEquals(callExpr.isNamedArgs, true);
});

// Deno.test("hql-to-ir - anonymous function with type annotations", () => {
//   const ir = parseAndTransform(`
//     (def adder (fn (x: Int) -> Int (+ x 1)))
//   `);
  
//   assertEquals(ir.body.length, 1);
//   const varDecl = ir.body[0] as IR.IRVariableDeclaration;
//   assertEquals(varDecl.type, IR.IRNodeType.VariableDeclaration);
  
//   const fnDecl = varDecl.init as IR.IRFunctionDeclaration;
//   assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
//   assertEquals(fnDecl.isAnonymous, true);
//   assertEquals(fnDecl.params.length, 1);
  
//   // Verify return type is captured
//   assertEquals(fnDecl.returnType !== undefined, true);
// });

Deno.test("hql-to-ir - explicit return statement", () => {
  const ir = parseAndTransform(`
    (defn add (x y)
      (return (+ x y)))
  `);
  
  assertEquals(ir.body.length, 1);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  
  // Check that body contains explicit return statement
  const body = fnDecl.body;
  assertEquals(body.body.length, 1);
  assertEquals(body.body[0].type, IR.IRNodeType.ReturnStatement);
});

Deno.test("hql-to-ir - complex function with all features", () => {
  const ir = parseAndTransform(`
    (defn calculate-area (width: Number height: Number unit: String = "cm") -> Number
      (let [
        area (* width height)
      ]
        (cond
          (= unit "m") (* area 10000)  ; Convert from m² to cm²
          (= unit "mm") (/ area 100)   ; Convert from mm² to cm²
          true area                    ; Default unit is cm²
        )
      ))
  `);
  
  assertEquals(ir.body.length, 1);
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "calculateArea");
  assertEquals(fnDecl.params.length, 3);
  
  // Verify return type is captured
  assertEquals(fnDecl.returnType !== undefined, true);
  
  // Check for default parameter handling
  const firstStmt = fnDecl.body.body[0];
  assertEquals(firstStmt.type, IR.IRNodeType.IfStatement);
  
  // Check that let binding is properly transformed
  const letStmt = fnDecl.body.body[fnDecl.body.body.length - 1];
  assertEquals(letStmt.type, IR.IRNodeType.Block);
});