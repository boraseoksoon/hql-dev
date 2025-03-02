import * as mod3_module from "./simple3.js";
const mod3 = mod3_module.default !== undefined ? mod3_module.default : mod3_module;
function sayHi(name) {
  return "Hi, " + name + "! " + mod3.sayBye(name);
}
export { sayHi };
