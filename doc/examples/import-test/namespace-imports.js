var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .hql-cache/1/doc/examples/import-test/base.ts
var base_exports = {};
__export(base_exports, {
  baseHqlFunction: () => baseHqlFunction
});
function baseHqlFunction(x) {
  return x * 2;
}
console.log("base.hql loaded");

// .hql-cache/1/doc/examples/import-test/base.js
var base_exports2 = {};
__export(base_exports2, {
  baseHqlFunction: () => baseHqlFunction2
});
function baseHqlFunction2(x) {
  return x * 2;
}
console.log("base.hql loaded");

// .hql-cache/1/doc/examples/import-test/namespace-imports.ts
var baseModule = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(base_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var jsModule = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(base_exports2)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("Namespace imports test");
console.log("HQL function result:", baseModule.baseHqlFunction(10));
console.log("JS function result:", jsModule.baseJsFunction(10));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9pbXBvcnQtdGVzdC9iYXNlLnRzIiwgIi4uLy4uLy4uLy5ocWwtY2FjaGUvMS8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2ltcG9ydC10ZXN0L2Jhc2UudHMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9pbXBvcnQtdGVzdC9uYW1lc3BhY2UtaW1wb3J0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZnVuY3Rpb24gYmFzZUhxbEZ1bmN0aW9uKHgpIHtcbiAgICByZXR1cm4geCAqIDI7XG59XG5leHBvcnQgeyBiYXNlSHFsRnVuY3Rpb24gfTtcbmNvbnNvbGUubG9nKFwiYmFzZS5ocWwgbG9hZGVkXCIpO1xuIiwgImZ1bmN0aW9uIGJhc2VIcWxGdW5jdGlvbih4KSB7XG4gICAgcmV0dXJuIHggKiAyO1xufVxuZXhwb3J0IHsgYmFzZUhxbEZ1bmN0aW9uIH07XG5jb25zb2xlLmxvZyhcImJhc2UuaHFsIGxvYWRlZFwiKTtcbiIsICJpbXBvcnQgKiBhcyBiYXNlTW9kdWxlTW9kdWxlIGZyb20gXCIvVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvYmFzZS50c1wiO1xuY29uc3QgYmFzZU1vZHVsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IGJhc2VNb2R1bGVNb2R1bGUuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gYmFzZU1vZHVsZU1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYmFzZU1vZHVsZU1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuaW1wb3J0ICogYXMganNNb2R1bGVNb2R1bGUgZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvYmFzZS5qc1wiO1xuY29uc3QganNNb2R1bGUgPSAoZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdyYXBwZXIgPSBqc01vZHVsZU1vZHVsZS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBqc01vZHVsZU1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoanNNb2R1bGVNb2R1bGUpKSB7XG4gICAgICAgIGlmIChrZXkgIT09IFwiZGVmYXVsdFwiKVxuICAgICAgICAgICAgd3JhcHBlcltrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB3cmFwcGVyO1xufSkoKTtcbmNvbnNvbGUubG9nKFwiTmFtZXNwYWNlIGltcG9ydHMgdGVzdFwiKTtcbmNvbnNvbGUubG9nKFwiSFFMIGZ1bmN0aW9uIHJlc3VsdDpcIiwgYmFzZU1vZHVsZS5iYXNlSHFsRnVuY3Rpb24oMTApKTtcbmNvbnNvbGUubG9nKFwiSlMgZnVuY3Rpb24gcmVzdWx0OlwiLCBqc01vZHVsZS5iYXNlSnNGdW5jdGlvbigxMCkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxnQkFBZ0IsR0FBRztBQUN4QixTQUFPLElBQUk7QUFDZjtBQUVBLFFBQVEsSUFBSSxpQkFBaUI7Ozs7Ozs7QUNKN0IsU0FBU0EsaUJBQWdCLEdBQUc7QUFDeEIsU0FBTyxJQUFJO0FBQ2Y7QUFFQSxRQUFRLElBQUksaUJBQWlCOzs7QUNIN0IsSUFBTSxhQUFjLFdBQVk7QUFDNUIsUUFBTSxVQUEyQixXQUFZLFNBQTZCLFNBQVUsQ0FBQztBQUNyRixhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLFlBQWdCLEdBQUc7QUFDekQsUUFBSSxRQUFRO0FBQ1IsY0FBUSxHQUFHLElBQUk7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFHO0FBRUgsSUFBTSxXQUFZLFdBQVk7QUFDMUIsUUFBTSxVQUF5QixXQUFZLFNBQTJCLFNBQVUsQ0FBQztBQUNqRixhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRQyxhQUFjLEdBQUc7QUFDdkQsUUFBSSxRQUFRO0FBQ1IsY0FBUSxHQUFHLElBQUk7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFHO0FBQ0gsUUFBUSxJQUFJLHdCQUF3QjtBQUNwQyxRQUFRLElBQUksd0JBQXdCLFdBQVcsZ0JBQWdCLEVBQUUsQ0FBQztBQUNsRSxRQUFRLElBQUksdUJBQXVCLFNBQVMsZUFBZSxFQUFFLENBQUM7IiwKICAibmFtZXMiOiBbImJhc2VIcWxGdW5jdGlvbiIsICJiYXNlX2V4cG9ydHMiXQp9Cg==
