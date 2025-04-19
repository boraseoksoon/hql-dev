import { mixedFunction } from "./entry.hql";
function tsMultiply(a, b) {
  return a * b;
}
function tsFunction(num) {
  return tsMultiply(num, 3);
}
function testCircularImport() {
  console.log("Testing circular import from TypeScript");
  return mixedFunction ? mixedFunction() : 0;
}
export {
  testCircularImport,
  tsFunction,
  tsMultiply
};
