
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as jsMod_module from "./js-module.js";
const jsMod = jsMod_module.default !== undefined ? jsMod_module.default : jsMod_module;
console.log(jsMod.jsHello("yo interop"))
