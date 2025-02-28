// Module: /Users/seoksoonjang/Desktop/hql/test/interop/hql-submodule.hql
const __module_hql_submodule_7953 = (function() {
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
const __module_hql_module_8203 = (function() {
  const exports = {};
  const hqlSubMod = __module_hql_submodule_7953;
  import * as jsUtil_module from "./js-util.js";
  const jsUtil = jsUtil_module.default !== undefined ? jsUtil_module.default : jsUtil_module;
  function greet(name) {
    return jsUtil.capitalize(hqlSubMod.hello(name)) + " (" + jsUtil.getTimestamp() + ")"
  }
  exports.greet = greet;
  
  return exports;
})();

const hqlMod = __module_hql_module_8203;
import * as jsMod_module from "./js-module.js";
const jsMod = jsMod_module.default !== undefined ? jsMod_module.default : jsMod_module;
import * as mathMod_module from "npm:mathjs";
const mathMod = mathMod_module.default !== undefined ? mathMod_module.default : mathMod_module;
import * as remoteMod_module from "https://deno.land/std@0.170.0/path/mod.ts";
const remoteMod = remoteMod_module.default !== undefined ? remoteMod_module.default : remoteMod_module;
import * as jsrMod_module from "jsr:@std/path@1.0.8";
const jsrMod = jsrMod_module.default !== undefined ? jsrMod_module.default : jsrMod_module;
function main(name) {
  return "HQL says: " + hqlMod.greet(name) + "\n" + "JS says: " + jsMod.greet(name) + "\n" + "Math says: " + mathMod.round(3.14159) + "\n" + "Remote mod exists: " + not(=(remoteMod, null)) + "\n" + "JSR mod exists: " + not(=(jsrMod, null))
}
console.log(main("World"))


export { main };
