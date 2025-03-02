import * as mod_module from "./simple2.js";
const mod = mod_module.default !== undefined ? mod_module.default : mod_module;
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL.";
}
console.log(greet("Alice"))
export { greet };
