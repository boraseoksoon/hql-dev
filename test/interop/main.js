const hqlMod = (function(){
  const exports = {};
  const hqlSubMod = (function(){
  const exports = {};
  function hello(name) {
  return "hello, " + name
}
function goodbye(name) {
  return "goodbye, " + name
}
exports.hello = hello;
exports.goodbye = goodbye;

  return exports;
})();
// Bundled JS module from ./js-util.js
const jsUtil = (function() {
  const exports = {};
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  // Get current timestamp
  function getTimestamp() {
    return new Date().toISOString();
  }
  return exports;
})();
function greet(name) {
  return jsUtil.capitalize(hqlSubMod.hello(name)) + " (" + jsUtil.getTimestamp() + ")"
}
exports.greet = greet;

  return exports;
})();
// Bundled JS module from ./js-module.js
const jsMod = (function() {
  const exports = {};
  // import handled separately
// import handled separately

// Use the imported HQL function
function greet(name) {
  return `JavaScript module says: at ${goodbye(name)} and ${getTimestamp()}`
}
  return exports;
})();
import mathMod from "npm:mathjs";
import * as remoteMod from "https://deno.land/std@0.170.0/path/mod.ts";
import jsrMod from "jsr:@std/path@1.0.8";
function main(name) {
  return "HQL says: " + hqlMod.greet(name) + "\n" + "JS says: " + jsMod.greet(name) + "\n" + "Math says: " + mathMod.round(3.14159) + "\n" + "Remote mod exists: " + !((remoteMod === null)) + "\n" + "JSR mod exists: " + !((jsrMod === null))
}
console.log(main("World"))
export { main };
