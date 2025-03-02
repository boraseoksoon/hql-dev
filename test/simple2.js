
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as mod3_module from "./simple3.js";
const mod3 = mod3_module.default !== undefined ? mod3_module.default : mod3_module;
function sayHi(name) { return "Hi, " + name + "! " + mod3.sayBye(name); }
export { sayHi };
