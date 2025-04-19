// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular-simple/b.ts
function incrementValue(x) {
  return x + 5;
}
console.log("From b.hql: Result of incrementValue(10):", incrementValue(10));

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular-simple/a.ts
var valueA = 100;
function useImportedFunction(x) {
  return x + incrementValue(valueA);
}
console.log("From a.hql: Result of useImportedFunction(50):", useImportedFunction(50));
export {
  valueA
};
