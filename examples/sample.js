// examples/sample.js
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
import * as chalkModule from "jsr:@nothing628/chalk";
import * as lodashModule from "npm:lodash";
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
