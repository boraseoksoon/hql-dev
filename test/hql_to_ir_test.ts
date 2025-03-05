// test/hql_to_ir_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { transformToIR } from "../src/transpiler/hql-to-ir.ts";
import { parse } from "../src/transpiler/parser.ts";
import * as IR from "../src/transpiler/hql_ir.ts";
import { expandMacros } from "../src/macro.ts";

// Helper to parse HQL and transform to IR
function parseAndTransform(code: string): IR.IRProgram {
  const ast = parse(code);
  // Apply macro expansion before transforming to IR
  const expandedAst = ast.map(node => expandMacros(node));
  return transformToIR(expandedAst, ".");
}

Deno.test("hql-to-ir - basic variable definition", () => {
  const ir = parseAndTransform(`(def x 10)`);
  
  assertEquals(ir.type, IR.IRNodeType.Program);
  assertEquals(ir.body.length, 1);
  
  const varDecl = ir.body[0] as IR.IRVariableDeclaration;
  assertEquals(varDecl.type, IR.IRNodeType.VariableDeclaration);
  assertEquals(varDecl.kind, "const");
  assertEquals(varDecl.id.name, "x");
  assertEquals((varDecl.init as IR.IRNumericLiteral).value, 10);
});

Deno.test("hql-to-ir - function definition", () => {
  const ir = parseAndTransform(`(defn add [a b] (+ a b))`);
  
  assertEquals(ir.body.length, 1);
  
  const fnDecl = ir.body[0] as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.id.name, "add");
  assertEquals(fnDecl.params.length, 2);
  assertEquals(fnDecl.params[0].id.name, "a");
  assertEquals(fnDecl.params[1].id.name, "b");
  
  // Check that body includes a return statement
  const body = fnDecl.body;
  assertEquals(body.body.length, 1);
  const returnStmt = body.body[0] as IR.IRReturnStatement;
  if (!returnStmt.argument) {
    throw new Error("Expected a return argument in function definition");
  }
  const binExpr = returnStmt.argument as IR.IRBinaryExpression;
  assertEquals(binExpr.type, IR.IRNodeType.BinaryExpression);
  assertEquals(binExpr.operator, "+");
  assertEquals((binExpr.left as IR.IRIdentifier).name, "a");
  assertEquals((binExpr.right as IR.IRIdentifier).name, "b");
});

Deno.test("hql-to-ir - anonymous function", () => {
  const ir = parseAndTransform(`(def adder (fn [x] (+ x 1)))`);
  
  assertEquals(ir.body.length, 1);
  
  const varDecl = ir.body[0] as IR.IRVariableDeclaration;
  assertEquals(varDecl.type, IR.IRNodeType.VariableDeclaration);
  
  const fnDecl = varDecl.init as IR.IRFunctionDeclaration;
  assertEquals(fnDecl.type, IR.IRNodeType.FunctionDeclaration);
  assertEquals(fnDecl.isAnonymous, true);
  assertEquals(fnDecl.params.length, 1);
  assertEquals(fnDecl.params[0].id.name, "x");
  
  // Check body
  const body = fnDecl.body;
  assertEquals(body.body.length, 1);
  assertEquals(body.body[0].type, IR.IRNodeType.ReturnStatement);
});

Deno.test("hql-to-ir - string literals", () => {
  const ir = parseAndTransform(`"Hello, world!"`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.StringLiteral);
  assertEquals((ir.body[0] as IR.IRStringLiteral).value, "Hello, world!");
});

Deno.test("hql-to-ir - boolean literals", () => {
  const ir = parseAndTransform(`true false`);
  
  assertEquals(ir.body.length, 2);
  assertEquals(ir.body[0].type, IR.IRNodeType.BooleanLiteral);
  assertEquals((ir.body[0] as IR.IRBooleanLiteral).value, true);
  assertEquals(ir.body[1].type, IR.IRNodeType.BooleanLiteral);
  assertEquals((ir.body[1] as IR.IRBooleanLiteral).value, false);
});

Deno.test("hql-to-ir - null literal", () => {
  const ir = parseAndTransform(`null`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.NullLiteral);
});

Deno.test("hql-to-ir - array literals", () => {
  const ir = parseAndTransform(`(vector 1 2 3)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ArrayLiteral);
  
  const arrLit = ir.body[0] as IR.IRArrayLiteral;
  assertEquals(arrLit.elements.length, 3);
  assertEquals((arrLit.elements[0] as IR.IRNumericLiteral).value, 1);
  assertEquals((arrLit.elements[1] as IR.IRNumericLiteral).value, 2);
  assertEquals((arrLit.elements[2] as IR.IRNumericLiteral).value, 3);
});

Deno.test("hql-to-ir - vector syntax", () => {
  // This should be converted to an array literal in IR
  const ir = parseAndTransform(`[1, 2, 3]`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ArrayLiteral);
  
  const arrLit = ir.body[0] as IR.IRArrayLiteral;
  assertEquals(arrLit.elements.length, 3);
  assertEquals((arrLit.elements[0] as IR.IRNumericLiteral).value, 1);
  assertEquals((arrLit.elements[1] as IR.IRNumericLiteral).value, 2);
  assertEquals((arrLit.elements[2] as IR.IRNumericLiteral).value, 3);
});

Deno.test("hql-to-ir - object literals", () => {
  const ir = parseAndTransform(`(hash-map "name" "John" "age" 30)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ObjectLiteral);
  
  const objLit = ir.body[0] as IR.IRObjectLiteral;
  assertEquals(objLit.properties.length, 2);
  
  // Check first property (name)
  assertEquals(objLit.properties[0].key.type, IR.IRNodeType.StringLiteral);
  assertEquals((objLit.properties[0].key as IR.IRStringLiteral).value, "name");
  assertEquals(objLit.properties[0].value.type, IR.IRNodeType.StringLiteral);
  assertEquals((objLit.properties[0].value as IR.IRStringLiteral).value, "John");
  
  // Check second property (age)
  assertEquals(objLit.properties[1].key.type, IR.IRNodeType.StringLiteral);
  assertEquals((objLit.properties[1].key as IR.IRStringLiteral).value, "age");
  assertEquals(objLit.properties[1].value.type, IR.IRNodeType.NumericLiteral);
  assertEquals((objLit.properties[1].value as IR.IRNumericLiteral).value, 30);
});

Deno.test("hql-to-ir - JSON object literal syntax", () => {
  const ir = parseAndTransform(`{"name": "Alice", "age": 30}`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ObjectLiteral);
  
  const objLit = ir.body[0] as IR.IRObjectLiteral;
  assertEquals(objLit.properties.length, 2);
  
  // Check properties
  assertEquals((objLit.properties[0].key as IR.IRStringLiteral).value, "name");
  assertEquals((objLit.properties[0].value as IR.IRStringLiteral).value, "Alice");
  assertEquals((objLit.properties[1].key as IR.IRStringLiteral).value, "age");
  assertEquals((objLit.properties[1].value as IR.IRNumericLiteral).value, 30);
});

Deno.test("hql-to-ir - set literals", () => {
  const ir = parseAndTransform(`#[1, 2, 3]`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.NewExpression);
  
  const newExpr = ir.body[0] as IR.IRNewExpression;
  assertEquals((newExpr.callee as IR.IRIdentifier).name, "Set");
  assertEquals(newExpr.arguments.length, 1);
  
  // Check that the argument is an array
  const arrArg = newExpr.arguments[0] as IR.IRArrayLiteral;
  assertEquals(arrArg.type, IR.IRNodeType.ArrayLiteral);
  assertEquals(arrArg.elements.length, 3);
});

Deno.test("hql-to-ir - if expressions", () => {
  const ir = parseAndTransform(`(if (> x 10) "large" "small")`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ConditionalExpression);
  
  const condExpr = ir.body[0] as IR.IRConditionalExpression;
  assertEquals(condExpr.test.type, IR.IRNodeType.BinaryExpression);
  assertEquals(condExpr.consequent.type, IR.IRNodeType.StringLiteral);
  assertEquals(condExpr.alternate.type, IR.IRNodeType.StringLiteral);
  
  assertEquals((condExpr.consequent as IR.IRStringLiteral).value, "large");
  assertEquals((condExpr.alternate as IR.IRStringLiteral).value, "small");
});

Deno.test("hql-to-ir - if statements", () => {
  const ir = parseAndTransform(`
    (if (> x 10) 
      (print "large") 
      (print "small"))
  `);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ConditionalExpression);
  
  const ifStmt = ir.body[0] as IR.IRConditionalExpression;
  assertEquals(ifStmt.test.type, IR.IRNodeType.BinaryExpression);
  
  // Helper function to extract the call expression from a branch.
  function extractCall(node: IR.IRNode): IR.IRCallExpression {
    if (node.type === IR.IRNodeType.CallExpression) {
      return node as IR.IRCallExpression;
    } else {
      throw new Error("Unexpected node type in if branch: " + node.type);
    }
  }
  
  const consCall = extractCall(ifStmt.consequent);
  assertEquals((consCall.callee as IR.IRIdentifier).name, "console.log");
  
  const altCall = extractCall(ifStmt.alternate);
  assertEquals((altCall.callee as IR.IRIdentifier).name, "console.log");
});

Deno.test("hql-to-ir - property access", () => {
  const ir = parseAndTransform(`(get obj "prop")`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.PropertyAccess);
  
  const propAccess = ir.body[0] as IR.IRPropertyAccess;
  assertEquals(propAccess.object.type, IR.IRNodeType.Identifier);
  assertEquals((propAccess.object as IR.IRIdentifier).name, "obj");
  assertEquals(propAccess.property.type, IR.IRNodeType.StringLiteral);
  assertEquals((propAccess.property as IR.IRStringLiteral).value, "prop");
  assertEquals(propAccess.computed, false); // Should use dot notation
});

Deno.test("hql-to-ir - function calls", () => {
  const ir = parseAndTransform(`(add 1 2)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.CallExpression);
  
  const callExpr = ir.body[0] as IR.IRCallExpression;
  assertEquals(callExpr.callee.type, IR.IRNodeType.Identifier);
  assertEquals((callExpr.callee as IR.IRIdentifier).name, "add");
  assertEquals(callExpr.arguments.length, 2);
  assertEquals((callExpr.arguments[0] as IR.IRNumericLiteral).value, 1);
  assertEquals((callExpr.arguments[1] as IR.IRNumericLiteral).value, 2);
  assertEquals(callExpr.isNamedArgs, false);
});

Deno.test("hql-to-ir - named arguments", () => {
  const ir = parseAndTransform(`(greet name: "John" greeting: "Hello")`);
  
  // Under the new flattening semantics, the call is transformed to a positional call.
  // For example, it should now produce:
  //   (greet "John" "Hello")
  // with isNamedArgs set to false.
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.CallExpression);
  
  const callExpr = ir.body[0] as IR.IRCallExpression;
  assertEquals(callExpr.callee.type, IR.IRNodeType.Identifier);
  assertEquals((callExpr.callee as IR.IRIdentifier).name, "greet");
  
  // Expect positional call semantics now:
  assertEquals(callExpr.isNamedArgs, false);
  assertEquals(callExpr.arguments.length, 2);
  
  // Check the individual arguments:
  // The first argument should be the numeric/string literal "John"
  // and the second "Hello".
  const arg0 = callExpr.arguments[0] as IR.IRStringLiteral;
  const arg1 = callExpr.arguments[1] as IR.IRStringLiteral;
  assertEquals(arg0.type, IR.IRNodeType.StringLiteral);
  assertEquals(arg0.value, "John");
  assertEquals(arg1.type, IR.IRNodeType.StringLiteral);
  assertEquals(arg1.value, "Hello");
});

Deno.test("hql-to-ir - let bindings", () => {
  const ir = parseAndTransform(`(let [x 10, y 20] (+ x y))`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.Block);
  
  const block = ir.body[0] as IR.IRBlock;
  // 2 variable declarations + 1 return statement => 3 items
  assertEquals(block.body.length, 3);
  
  // Check the variable declarations
  const varX = block.body[0] as IR.IRVariableDeclaration;
  const varY = block.body[1] as IR.IRVariableDeclaration;
  
  assertEquals(varX.id.name, "x");
  assertEquals((varX.init as IR.IRNumericLiteral).value, 10);
  assertEquals(varY.id.name, "y");
  assertEquals((varY.init as IR.IRNumericLiteral).value, 20);
  
  // Check the return statement
  const returnStmt = block.body[2] as IR.IRReturnStatement;
  if (!returnStmt.argument) {
    throw new Error("Expected a return argument in let binding");
  }
  const binExpr = returnStmt.argument as IR.IRBinaryExpression;
  assertEquals(binExpr.type, IR.IRNodeType.BinaryExpression);
  assertEquals(binExpr.operator, "+");
});

Deno.test("hql-to-ir - enum declaration", () => {
  const ir = parseAndTransform(`(defenum Status PENDING ACTIVE COMPLETED)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.EnumDeclaration);
  
  const enumDecl = ir.body[0] as IR.IREnumDeclaration;
  assertEquals(enumDecl.name.name, "Status");
  assertEquals(enumDecl.members.length, 3);
  assertEquals(enumDecl.members[0], "PENDING");
  assertEquals(enumDecl.members[1], "ACTIVE");
  assertEquals(enumDecl.members[2], "COMPLETED");
});

Deno.test("hql-to-ir - export declaration", () => {
  const ir = parseAndTransform(`(export "default" x)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ExportDeclaration);
  
  const exportDecl = ir.body[0] as IR.IRExportDeclaration;
  assertEquals(exportDecl.exports.length, 1);
  assertEquals(exportDecl.exports[0].local.name, "x");
  assertEquals(exportDecl.exports[0].exported, "default");
});

Deno.test("hql-to-ir - import statement", () => {
  const ir = parseAndTransform(`(def utils (import "./utils.js"))`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.VariableDeclaration);
  
  const varDecl = ir.body[0] as IR.IRVariableDeclaration;
  const callExpr = varDecl.init as IR.IRCallExpression;
  
  assertEquals(callExpr.type, IR.IRNodeType.CallExpression);
  assertEquals((callExpr.callee as IR.IRIdentifier).name, "$$IMPORT");
  assertEquals(callExpr.arguments.length, 1);
  assertEquals((callExpr.arguments[0] as IR.IRStringLiteral).value, "./utils.js");
});

Deno.test("hql-to-ir - for loop", () => {
  const ir = parseAndTransform(`
    (for [i 0 (< i 10) (+ i 1)]
      (print i))
  `);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ForStatement);
  
  const forStmt = ir.body[0] as IR.IRForStatement;
  assertEquals(forStmt.init.type, IR.IRNodeType.VariableDeclaration);
  assertEquals(forStmt.test.type, IR.IRNodeType.BinaryExpression);
  assertEquals(forStmt.update?.type, IR.IRNodeType.BinaryExpression);
  
  // Check the init variable
  const init = forStmt.init as IR.IRVariableDeclaration;
  assertEquals(init.kind, "let");
  assertEquals(init.id.name, "i");
  assertEquals((init.init as IR.IRNumericLiteral).value, 0);
  
  // Check the test expression
  const test = forStmt.test as IR.IRBinaryExpression;
  assertEquals(test.operator, "<");
  assertEquals((test.left as IR.IRIdentifier).name, "i");
  assertEquals((test.right as IR.IRNumericLiteral).value, 10);
  
  // Check the body
  assertEquals(forStmt.body.body.length, 1);
  assertEquals(forStmt.body.body[0].type, IR.IRNodeType.CallExpression);
});

Deno.test("hql-to-ir - assignment", () => {
  const ir = parseAndTransform(`(set x 20)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.AssignmentExpression);
  
  const assignExpr = ir.body[0] as IR.IRAssignmentExpression;
  assertEquals(assignExpr.operator, "=");
  assertEquals((assignExpr.left as IR.IRIdentifier).name, "x");
  assertEquals((assignExpr.right as IR.IRNumericLiteral).value, 20);
});

Deno.test("hql-to-ir - cond expression", () => {
  const ir = parseAndTransform(`
    (cond
      (< x 0) "negative"
      (> x 0) "positive"
      true "zero")
  `);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.ConditionalExpression);
  
  // The cond is translated into nested conditional expressions.
  const condExpr = ir.body[0] as IR.IRConditionalExpression;
  assertEquals(condExpr.test.type, IR.IRNodeType.BinaryExpression);
  assertEquals((condExpr.consequent as IR.IRStringLiteral).value, "negative");
  
  // The alternate is another conditional expression.
  const altCondExpr = condExpr.alternate as IR.IRConditionalExpression;
  assertEquals(altCondExpr.test.type, IR.IRNodeType.BinaryExpression);
  assertEquals((altCondExpr.consequent as IR.IRStringLiteral).value, "positive");
  
  // The final clause is a nested conditional expression.
  const innerCondExpr = altCondExpr.alternate as IR.IRConditionalExpression;
  assertEquals(innerCondExpr.test.type, IR.IRNodeType.BooleanLiteral);
  assertEquals((innerCondExpr.test as IR.IRBooleanLiteral).value, true);
  assertEquals((innerCondExpr.consequent as IR.IRStringLiteral).value, "zero");
  assertEquals(innerCondExpr.alternate.type, IR.IRNodeType.NullLiteral);
});

Deno.test("hql-to-ir - hyphen to camel case conversion", () => {
  const ir = parseAndTransform(`(def my-variable 42)`);
  
  assertEquals(ir.body.length, 1);
  const varDecl = ir.body[0] as IR.IRVariableDeclaration;
  assertEquals(varDecl.id.name, "myVariable");
});

Deno.test("hql-to-ir - new expression", () => {
  const ir = parseAndTransform(`(new Date 2023 0 1)`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.NewExpression);
  
  const newExpr = ir.body[0] as IR.IRNewExpression;
  assertEquals((newExpr.callee as IR.IRIdentifier).name, "Date");
  assertEquals(newExpr.arguments.length, 3);
  assertEquals((newExpr.arguments[0] as IR.IRNumericLiteral).value, 2023);
  assertEquals((newExpr.arguments[1] as IR.IRNumericLiteral).value, 0);
  assertEquals((newExpr.arguments[2] as IR.IRNumericLiteral).value, 1);
});

Deno.test("hql-to-ir - string concatenation", () => {
  const ir = parseAndTransform(`(str "Hello, " name "!")`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.CallExpression);
  
  const callExpr = ir.body[0] as IR.IRCallExpression;
  assertEquals((callExpr.callee as IR.IRIdentifier).name, "str");
  assertEquals(callExpr.arguments.length, 3);
  assertEquals((callExpr.arguments[0] as IR.IRStringLiteral).value, "Hello, ");
  assertEquals((callExpr.arguments[1] as IR.IRIdentifier).name, "name");
  assertEquals((callExpr.arguments[2] as IR.IRStringLiteral).value, "!");
});

Deno.test("hql-to-ir - js interop", () => {
  const ir = parseAndTransform(`js/console.log`);
  
  assertEquals(ir.body.length, 1);
  assertEquals(ir.body[0].type, IR.IRNodeType.Identifier);
  
  const identifier = ir.body[0] as IR.IRIdentifier;
  assertEquals(identifier.name, "console.log");
  assertEquals(identifier.isJSAccess, true);
});