function tsFunction(x) {
  return x + 15;
}
function tsUsingHqlFunction(x) {
  return x * 2 + 5;
}
var ts_module_default = {
  tsFunction,
  tsUsingHqlFunction,
  multiplyBy: (x, y) => x * y
};
export {
  ts_module_default as default,
  tsFunction,
  tsUsingHqlFunction
};
