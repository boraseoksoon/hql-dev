// examples/sample.js
import * as lodashModule from "npm:lodash";
var joined_path = "folder/file.txt";
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
