import * as mod from "./simple2.js";
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL.";
}
console.log(greet("Alice"))
export { greet };
