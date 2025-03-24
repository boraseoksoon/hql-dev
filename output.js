var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all) {
    __defProp(target, name, { get: all[name], enumerable: true });
  }
};

// examples/dependency-test2/e.js
function minus(x, y) {
  return x + y;
}

// examples/dependency-test2/b.js
function add(x, y) {
  return minus(x, y);
}

// examples/dependency-test2/z.js
var z_exports = {};
__export(z_exports, {
  add2: () => add2,
});
var add2 = function (x, y) {
  return x + y;
};

// output.js
console["log"](add(1, 2));
var module = function () {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(z_exports)) {
    if (key !== "default") {
      wrapper[key] = value;
    }
  }
  return wrapper;
}();
console["log"](module["add2"](1e3, 2e3));
