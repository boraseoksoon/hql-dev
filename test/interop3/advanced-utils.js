import * as jsModule from "./js-module.js";
const version = "1.0.0";
function process(name) {
  return "Advanced processing for " + name + ": " + jsModule.jsHello(name);
}
export { process };
export { version };
