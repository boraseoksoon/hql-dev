var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// lib/other3.js
var other3_exports = {};
__export(other3_exports, {
  default: () => other3_default,
  js_add: () => js_add
});
function js_add(a, b) {
  console.log(`JS module: Adding ${a} and ${b}`);
  return a + b;
}
var other3_default = {
  js_add
};

// examples/sample.js
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
import * as chalkModule from "jsr:@nothing628/chalk";
import * as lodashModule from "npm:lodash";
var other3 = function() {
  const wrapper = other3_default !== void 0 ? other3_default : {};
  for (const [key, value] of Object.entries(other3_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var path = function() {
  const wrapper = pathModule.default !== void 0 ? pathModule.default : {};
  for (const [key, value] of Object.entries(pathModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var chalk = function() {
  const wrapper = chalkModule.default !== void 0 ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(chalk.red("chalk!"));
var joined_path = path.join("folder", "file.txt");
console.log(joined_path);
var lodash = function() {
  const wrapper = lodashModule.default !== void 0 ? lodashModule.default : {};
  for (const [key, value] of Object.entries(lodashModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(lodash.capitalize("is it working?"));
console.log(10 * 10 + 1);
console.log("js-adder : ", other3.js_add(10, 20));
