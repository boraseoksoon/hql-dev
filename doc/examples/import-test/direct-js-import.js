var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .hql-cache/1/doc/examples/import-test/base.js
var base_exports = {};
__export(base_exports, {
  baseHqlFunction: () => baseHqlFunction
});
function baseHqlFunction(x) {
  return x * 2;
}
console.log("base.hql loaded");

// .hql-cache/1/doc/examples/import-test/direct-js-import.ts
var jsModule = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(base_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("Direct JS import test");
var result = jsModule.baseHqlFunction(10);
console.log("Result:", result);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvYmFzZS50cyIsICIuLi8uLi8uLi8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2ltcG9ydC10ZXN0L2RpcmVjdC1qcy1pbXBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImZ1bmN0aW9uIGJhc2VIcWxGdW5jdGlvbih4KSB7XG4gICAgcmV0dXJuIHggKiAyO1xufVxuZXhwb3J0IHsgYmFzZUhxbEZ1bmN0aW9uIH07XG5jb25zb2xlLmxvZyhcImJhc2UuaHFsIGxvYWRlZFwiKTtcbiIsICJpbXBvcnQgKiBhcyBqc01vZHVsZU1vZHVsZSBmcm9tIFwiZmlsZTovLy9Vc2Vycy9zZW9rc29vbmphbmcvRGVza3RvcC9ocWwvLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9pbXBvcnQtdGVzdC9iYXNlLmpzXCI7XG5jb25zdCBqc01vZHVsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IGpzTW9kdWxlTW9kdWxlLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IGpzTW9kdWxlTW9kdWxlLmRlZmF1bHQgOiB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhqc01vZHVsZU1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc29sZS5sb2coXCJEaXJlY3QgSlMgaW1wb3J0IHRlc3RcIik7XG5jb25zdCByZXN1bHQgPSBqc01vZHVsZS5iYXNlSHFsRnVuY3Rpb24oMTApO1xuY29uc29sZS5sb2coXCJSZXN1bHQ6XCIsIHJlc3VsdCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUFBLFNBQVMsZ0JBQWdCLEdBQUc7QUFDeEIsU0FBTyxJQUFJO0FBQ2Y7QUFFQSxRQUFRLElBQUksaUJBQWlCOzs7QUNIN0IsSUFBTSxXQUFZLFdBQVk7QUFDMUIsUUFBTSxVQUF5QixXQUFZLFNBQTJCLFNBQVUsQ0FBQztBQUNqRixhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLFlBQWMsR0FBRztBQUN2RCxRQUFJLFFBQVE7QUFDUixjQUFRLEdBQUcsSUFBSTtBQUFBLEVBQ3ZCO0FBQ0EsU0FBTztBQUNYLEVBQUc7QUFDSCxRQUFRLElBQUksdUJBQXVCO0FBQ25DLElBQU0sU0FBUyxTQUFTLGdCQUFnQixFQUFFO0FBQzFDLFFBQVEsSUFBSSxXQUFXLE1BQU07IiwKICAibmFtZXMiOiBbXQp9Cg==
