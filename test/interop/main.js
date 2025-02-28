import * as mathMod from "npm:mathjs";
import * as remoteMod from "https://deno.land/std@0.170.0/path/mod.ts";
import * as jsrMod from "jsr:@std/path@1.0.8";

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/hql-submodule.hql

const hql_submodule = {
  hello: function(name) {
  return "hello, " + name
},
  goodbye: function(name) {
  return "goodbye, " + name
}
};

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/js-util.js

const js_util = {
  capitalize: function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  // Get current timestamp
  function getTimestamp() {
    return new Date().toISOString();
  
  },
  getTimestamp: function() { 
          console.warn("Implementation not found for getTimestamp"); 
          return "getTimestamp not implemented"; 
        }
};

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/hql-module.hql

const hql_module = {
  greet: function(name) {
  return jsUtil.capitalize(hqlSubMod.hello(name)) + " (" + jsUtil.getTimestamp() + ")"
}
};

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/js-module.js

const js_module = {
  greet: function(name) {
  return `JavaScript module says: at ${goodbye(name)} and ${getTimestamp()}`
  }
};

// Module: /Users/seoksoonjang/Desktop/hql/test/interop/main.hql

const main = {
  main: function(name) {
  return "HQL says: " + hqlMod.greet(name) + "\n" + "JS says: " + jsMod.greet(name) + "\n" + "Math says: " + mathMod.round(3.14159) + "\n" + "Remote mod exists: " + not(=(remoteMod, null)) + "\n" + "JSR mod exists: " + not(=(jsrMod, null))
}
};

// Entry module top-level code

console.log(main("World"))


export { main };