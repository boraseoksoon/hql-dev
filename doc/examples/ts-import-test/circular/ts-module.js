import { hqlFunction } from "./hql-module.hql";
function tsFunction(x) {
  console.log("TypeScript function called with:", x);
  return hqlFunction(x) * 2;
}
const TS_CONSTANT = "Hello from TypeScript";
var ts_module_default = {
  version: "1.0.0",
  name: "ts-hql-circular-test"
};
export {
  TS_CONSTANT,
  ts_module_default as default,
  tsFunction
};
