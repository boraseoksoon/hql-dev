import * as jsModule_module from "./js-module.js";
const jsModule = jsModule_module.default !== undefined ? jsModule_module.default : jsModule_module;
const version = "1.0.0";
function process(name) {
  return "Advanced processing for " + name + ": " + jsModule.jsHello(name);
}
export { process };
export { version };
