
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as jsModule_module from "./js-module.js";
const jsModule = jsModule_module.default !== undefined ? jsModule_module.default : jsModule_module;
const version = "1.0.0";
function process(name) {
  return "Advanced processing for " + name + ": " + jsModule.jsHello(name);
}
export { process };
export { version };
