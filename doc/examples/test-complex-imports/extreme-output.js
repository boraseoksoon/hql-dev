// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/hql-module.ts
function hqlFunction(x) {
  return x * 2 + 5;
}

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/js-helper
function helperFunction(x) {
  return x * 5;
}

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/js-module.js
function jsFunction(x) {
  const tsResult = x * 3 * 3;
  const helperResult = helperFunction(x);
  return tsResult + helperResult;
}

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/a.ts
var baseValue = 10;
function add5(value) {
  return value + 5;
}
function add5AndDouble(value) {
  return add5(value) * 2;
}
function circularFunction() {
  let result = add5AndDouble(baseValue);
  console.log("Calculation result:", result);
  return result;
}
circularFunction();

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/entry.ts
function extremeFunction() {
  let hqlResult = hqlFunction(10);
  let jsResult = jsFunction(20);
  let circResult = circularFunction();
  return hqlResult + jsResult + 45 + circResult;
}
console.log("HQL result:", hqlFunction(5));
console.log("JS result:", jsFunction(10));
console.log("TS result (simulated):", 45);
console.log("Circular result:", circularFunction());
console.log("Combined result:", extremeFunction());
export {
  extremeFunction
};
