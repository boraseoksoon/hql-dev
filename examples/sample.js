// examples/sample.js
import * as chalkModule from "jsr:@nothing628/chalk";
var chalk = function() {
  const wrapper = chalkModule.default !== void 0 ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(chalk.red("chalk!"));
