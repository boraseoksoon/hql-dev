// Module: /Users/seoksoonjang/Desktop/hql/test/interop/hql-submodule.hql
const __module_hql_submodule_5262 = (function() {
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

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/hql-module.hql
const __module_hql_module_4622 = (function() {
  const exports = {};
  const hqlSubMod = __module_hql_submodule_5262;
  import jsUtil from "./js-util.js";
  function greet(name) {
    return jsUtil.capitalize(hqlSubMod.hello(name)) + " (" + jsUtil.getTimestamp() + ")"
  }
  exports.greet = greet;
  
  return exports;
})();

const hqlMod = __module_hql_module_4622;
import jsMod from "./js-module.js";
import mathMod from "npm:mathjs";
import * as remoteMod from "https://deno.land/std@0.170.0/path/mod.ts";
import jsrMod from "jsr:@std/path@1.0.8";
function main(name) {
  return "HQL says: " + hqlMod.greet(name) + "\n" + "JS says: " + jsMod.greet(name) + "\n" + "Math says: " + mathMod.round(3.14159) + "\n" + "Remote mod exists: " + not(=(remoteMod, null)) + "\n" + "JSR mod exists: " + not(=(jsrMod, null))
}
console.log(main("World"))


export { main };
