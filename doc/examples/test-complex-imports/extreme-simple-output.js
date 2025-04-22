var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../doc/examples/test-complex-imports/extreme-test-simple/ts-module.ts
var ts_module_exports = {};
__export(ts_module_exports, {
  default: () => ts_module_default,
  tsFunction: () => tsFunction
});
function tsFunction(x) {
  return x * 3;
}
var ts_module_default = {
  tsFunction,
  multiplyBy: (x, y) => x * y
};

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test-simple/circular/a.ts
var baseValue = 10;
function add5(value) {
  return value + 5;
}
function circularFunction() {
  let result = add5(baseValue);
  console.log("Calculation result:", result);
  return result;
}
circularFunction();

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test-simple/entry.ts
var moduleTs = function() {
  const wrapper = ts_module_default !== void 0 ? ts_module_default : {};
  for (const [key, value] of Object.entries(ts_module_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
function extremeFunction() {
  let tsResult = moduleTs.tsFunction(30);
  let circResult = circularFunction;
  return tsResult + circResult;
}
console.log("TS module result:", moduleTs.tsFunction(15));
console.log("Circular result:", circularFunction);
console.log("Combined result:", extremeFunction());
export {
  extremeFunction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZXh0cmVtZS10ZXN0LXNpbXBsZS90cy1tb2R1bGUudHMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvdGVzdC1jb21wbGV4LWltcG9ydHMvZXh0cmVtZS10ZXN0LXNpbXBsZS9jaXJjdWxhci9hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBUeXBlU2NyaXB0IG1vZHVsZSBmb3IgZXh0cmVtZSB0ZXN0XG4vLyBEZW1vbnN0cmF0ZXMgVFMgaW50ZWdyYXRpb24gd2l0aCBIUUxcblxuLy8gRXhwb3J0IGEgZnVuY3Rpb24gd2l0aCBUeXBlU2NyaXB0IHR5cGluZ1xuZXhwb3J0IGZ1bmN0aW9uIHRzRnVuY3Rpb24oeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHggKiAzO1xufVxuXG4vLyBFeHBvcnQgYXMgZGVmYXVsdFxuZXhwb3J0IGRlZmF1bHQge1xuICB0c0Z1bmN0aW9uLFxuICBtdWx0aXBseUJ5OiAoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBudW1iZXIgPT4geCAqIHlcbn07ICIsICJcbmZ1bmN0aW9uIGdldChvYmosIGtleSwgbm90Rm91bmQgPSBudWxsKSB7XG4gIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG5vdEZvdW5kO1xuICBcbiAgLy8gSWYgb2JqIGlzIGEgZnVuY3Rpb24gYW5kIGtleSBpcyBhbnl0aGluZyBidXQgYSBwcm9wZXJ0eSBuYW1lLFxuICAvLyB0cmVhdCB0aGlzIGFzIGEgZnVuY3Rpb24gY2FsbCB3aXRoIGtleSBhcyB0aGUgZmlyc3QgYXJndW1lbnRcbiAgaWYgKHR5cGVvZiBvYmogPT09IFwiZnVuY3Rpb25cIiAmJiBcbiAgICAgICh0eXBlb2Yga2V5ID09PSBcIm51bWJlclwiIHx8IFxuICAgICAgIHR5cGVvZiBrZXkgPT09IFwic3RyaW5nXCIgJiYgIWlzTmFOKGtleSkgfHwgXG4gICAgICAgdHlwZW9mIGtleSA9PT0gXCJib29sZWFuXCIgfHxcbiAgICAgICBrZXkgPT09IG51bGwgfHxcbiAgICAgICBrZXkgPT09IHVuZGVmaW5lZCB8fFxuICAgICAgIEFycmF5LmlzQXJyYXkoa2V5KSB8fFxuICAgICAgIHR5cGVvZiBrZXkgPT09IFwib2JqZWN0XCIpKSB7XG4gICAgcmV0dXJuIG9iaihrZXkpO1xuICB9XG4gIFxuICAvLyBDb2VyY2UgcHJpbWl0aXZlIHR5cGVzIChzdHJpbmcsIG51bWJlciwgYm9vbGVhbikgdG8gb2JqZWN0c1xuICBpZiAodHlwZW9mIG9iaiAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2Ygb2JqICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBvYmogPSBPYmplY3Qob2JqKTtcbiAgfVxuICBcbiAgY29uc3QgcHJvcEtleSA9IHR5cGVvZiBrZXkgPT09IFwibnVtYmVyXCIgPyBTdHJpbmcoa2V5KSA6IGtleTtcbiAgcmV0dXJuIHByb3BLZXkgaW4gb2JqID8gb2JqW3Byb3BLZXldIDogbm90Rm91bmQ7XG59XG5cblxubGV0IGJhc2VWYWx1ZSA9IDEwO1xuZnVuY3Rpb24gYWRkNSh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSArIDU7XG59XG5mdW5jdGlvbiBjaXJjdWxhckZ1bmN0aW9uKCkge1xuICAgIGxldCByZXN1bHQgPSBhZGQ1KGJhc2VWYWx1ZSk7XG4gICAgY29uc29sZS5sb2coXCJDYWxjdWxhdGlvbiByZXN1bHQ6XCIsIHJlc3VsdCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmV4cG9ydCB7IGNpcmN1bGFyRnVuY3Rpb24gfTtcbmNpcmN1bGFyRnVuY3Rpb24oKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBSU8sU0FBUyxXQUFXLEdBQW1CO0FBQzVDLFNBQU8sSUFBSTtBQUNiO0FBR0EsSUFBTyxvQkFBUTtBQUFBLEVBQ2I7QUFBQSxFQUNBLFlBQVksQ0FBQyxHQUFXLE1BQXNCLElBQUk7QUFDcEQ7OztBQ2VBLElBQUksWUFBWTtBQUNoQixTQUFTLEtBQUssT0FBTztBQUNqQixTQUFPLFFBQVE7QUFDbkI7QUFDQSxTQUFTLG1CQUFtQjtBQUN4QixNQUFJLFNBQVMsS0FBSyxTQUFTO0FBQzNCLFVBQVEsSUFBSSx1QkFBdUIsTUFBTTtBQUN6QyxTQUFPO0FBQ1g7QUFFQSxpQkFBaUI7IiwKICAibmFtZXMiOiBbXQp9Cg==
