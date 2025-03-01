import * as advancedUtils_module from "./advanced-utils.js";
const advancedUtils = advancedUtils_module.default !== undefined ? advancedUtils_module.default : advancedUtils_module;
function main(name) {
  return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version;
}
console.log(main("World"))
export { main };
