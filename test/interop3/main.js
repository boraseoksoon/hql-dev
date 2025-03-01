import * as advancedUtils from "./advanced-utils.js";
//
File:
test/interop2/main.hql
function main(name) {
  return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version;
}
console.log(main("World"))
export { main };
