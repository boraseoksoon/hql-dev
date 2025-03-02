
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as advancedUtils_module from "./advanced-utils.js";
const advancedUtils = advancedUtils_module.default !== undefined ? advancedUtils_module.default : advancedUtils_module;
function main(name) {
  return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version;
}
console.log(main("World"))
export { main };
