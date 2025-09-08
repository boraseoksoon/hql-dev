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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvYmFzZS50cyIsICIuLi8uLi8uLi8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2ltcG9ydC10ZXN0L2RpcmVjdC1qcy1pbXBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImZ1bmN0aW9uIGJhc2VIcWxGdW5jdGlvbih4KSB7XG4gICAgcmV0dXJuIHggKiAyO1xufVxuZXhwb3J0IHsgYmFzZUhxbEZ1bmN0aW9uIH07XG5jb25zb2xlLmxvZyhcImJhc2UuaHFsIGxvYWRlZFwiKTtcbiIsICJpbXBvcnQgKiBhcyBqc01vZHVsZU1vZHVsZSBmcm9tIFwiL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2ltcG9ydC10ZXN0L2Jhc2UuanNcIjtcbmNvbnN0IGpzTW9kdWxlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCB3cmFwcGVyID0ganNNb2R1bGVNb2R1bGUuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8ganNNb2R1bGVNb2R1bGUuZGVmYXVsdCA6IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGpzTW9kdWxlTW9kdWxlKSkge1xuICAgICAgICBpZiAoa2V5ICE9PSBcImRlZmF1bHRcIilcbiAgICAgICAgICAgIHdyYXBwZXJba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gd3JhcHBlcjtcbn0pKCk7XG5jb25zb2xlLmxvZyhcIkRpcmVjdCBKUyBpbXBvcnQgdGVzdFwiKTtcbmNvbnN0IHJlc3VsdCA9IGpzTW9kdWxlLmJhc2VIcWxGdW5jdGlvbigxMCk7XG5jb25zb2xlLmxvZyhcIlJlc3VsdDpcIiwgcmVzdWx0KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBQUEsU0FBUyxnQkFBZ0IsR0FBRztBQUN4QixTQUFPLElBQUk7QUFDZjtBQUVBLFFBQVEsSUFBSSxpQkFBaUI7OztBQ0g3QixJQUFNLFdBQVksV0FBWTtBQUMxQixRQUFNLFVBQXlCLFdBQVksU0FBMkIsU0FBVSxDQUFDO0FBQ2pGLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsWUFBYyxHQUFHO0FBQ3ZELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILFFBQVEsSUFBSSx1QkFBdUI7QUFDbkMsSUFBTSxTQUFTLFNBQVMsZ0JBQWdCLEVBQUU7QUFDMUMsUUFBUSxJQUFJLFdBQVcsTUFBTTsiLAogICJuYW1lcyI6IFtdCn0K
