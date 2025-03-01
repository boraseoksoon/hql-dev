import * as mod3 from "./simple3.js";
function sayHi(name) {
  return "Hi, " + name + "! " + mod3.sayBye(name);
}
export { sayHi };
