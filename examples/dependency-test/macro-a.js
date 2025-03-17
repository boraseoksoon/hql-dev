var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// hql:/Users/seoksoonjang/Desktop/hql/examples/dependency-test/macro-c.hql
var require_macro_c = __commonJS({
  "hql:/Users/seoksoonjang/Desktop/hql/examples/dependency-test/macro-c.hql"() {
    function list2(...items) {
      return items;
    }
    defn(addguy, x(), list2("+", x, 1));
    defn(minusguys, x(), list2("-", x, 1));
  }
});

// hql:/Users/seoksoonjang/Desktop/hql/examples/dependency-test/macro-b.hql
var macro_b_exports = {};

// examples/dependency-test/utils.js
var utils_exports = {};
__export(utils_exports, {
  double: () => double,
  minus: () => minus
});
var import_macro_c = __toESM(require_macro_c());
function double(x2) {
  return x2 * 2;
}
console.log("minus : ", minus(10));
function minus(x2) {
  return (void 0)(x2);
}

// hql:/Users/seoksoonjang/Desktop/hql/examples/dependency-test/macro-b.hql
function list(...items) {
  return items;
}
var utils = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(utils_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("utils.minus 10 ", utils.minus(10));
var double_five = list("utils.double", x);
var doubled_and_added = list("+", list("double-it", x), 1);

// examples/dependency-test/macro-a.js
var macroCModule = __toESM(require_macro_c());
var macroB = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(macro_b_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var macroC = function() {
  const wrapper = macroCModule.default !== void 0 ? macroCModule.default : {};
  for (const [key, value] of Object.entries(macroCModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("macroC.add-man:", macroC.addguy(10));
console.log("Doubled 5:", macroB.double_five);
console.log("Doubled and added 5:", macroB.doubled_and_added);
