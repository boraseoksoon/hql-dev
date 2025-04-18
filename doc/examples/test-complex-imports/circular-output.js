// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/a.ts
var baseValue = 10;
function add5(value) {
  return value + 5;
}
function add5AndDouble(value) {
  return add5(value) * 2;
}
function main() {
  let result = add5AndDouble(baseValue);
  console.log("Calculation result:", result);
  return result;
}
main();
export {
  add5,
  add5AndDouble
};
