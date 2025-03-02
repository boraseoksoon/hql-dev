
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as mod_module from "./simple2.js";
const mod = mod_module.default !== undefined ? mod_module.default : mod_module;
function greet(name) { return mod.sayHi(name) + " Welcome to HQL."; }
console.log(greet("Alice"))
export { greet };
