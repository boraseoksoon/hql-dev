var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// hql:/Users/seoksoonjang/Desktop/hql/examples/dependency-test/macro-b.hql
var macro_b_exports = {};
__export(macro_b_exports, {
  "double-five": () => double_five,
  "doubled-and-added": () => doubled_and_added
});
var double_five = 5 * 2;
var doubled_and_added = 10 + 1;
console.log("double-five : ", double_five);
console.log("doubled-and-added : ", doubled_and_added);

// examples/dependency-test/macro-a.js
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function") {
    try {
      return obj(key);
    } catch (e) {
      return key in obj ? obj[key] : notFound;
    }
  }
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length ? obj[key] : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
var macroB = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(macro_b_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("macroB : ", macroB);
console.log("Doubled 5:", get(macroB, "double-five"));
console.log("Doubled and added 5:", get(macroB, "doubled-and-added"));
console.log("Using get - Doubled 5:", get(macroB, "double-five"));
console.log("Using get - Doubled and added 5:", get(macroB, "doubled-and-added"));
