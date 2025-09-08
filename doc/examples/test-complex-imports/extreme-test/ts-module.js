function tsFunction(x) {
  return x * 10;
}
const tsConstant = "TypeScript Module";
var ts_module_default = {
  tsFunction,
  multiplyBy: (x, y) => x * y,
  tsConstant
};
export {
  ts_module_default as default,
  tsConstant,
  tsFunction
};
