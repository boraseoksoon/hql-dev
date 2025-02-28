import * as jsModule_module from "/Users/seoksoonjang/Desktop/hql/test/interop3/js-module.js";

// Module: /Users/seoksoonjang/Desktop/hql/test/interop3/advanced-utils.hql
const __module_advanced_utils_7418 = (function() {
  const exports = {};

  const version = "1.0.0";
  function process(name) {
    return "Advanced processing for " + name + ": " + jsModule.jsHello(name)
  }
  exports.process = process;
  exports.version = version;

  return exports;
})();

const jsModule = jsModule_module.default !== undefined ? jsModule_module.default : jsModule_module;

const advancedUtils = __module_advanced_utils_7418;


function main(name) {
  return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version
}
console.log(main("World"))


export { main };
