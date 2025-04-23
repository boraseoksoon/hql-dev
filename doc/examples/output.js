var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../.hql-cache/doc/examples/dependency-test2/e.js
function minus(x, y) {
  return x + y + 200;
}

// ../.hql-cache/doc/examples/dependency-test2/b.js
function add(x, y) {
  return minus(x, y);
}

// ../.hql-cache/doc/examples/dependency-test2/z.ts
var z_exports = {};
__export(z_exports, {
  add2: () => add2
});
function add2(x, y) {
  return x + y;
}

// ../.hql-cache/doc/examples/dependency-test2/a.ts
console.log(add(1, 2));
var module = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(z_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(module.add2(1e3, 2e3));
export {
  add as add3
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9lLmpzIiwgIi4uLy4uLy5ocWwtY2FjaGUvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdDIvYi5qcyIsICIuLi8uLi8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL3oudHMiLCAiLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9hLmhxbCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIG1pbnVzKHgsIHkpIHtcbiAgcmV0dXJuIHggKyB5ICsgMjAwO1xufVxuIiwgIi8vIGIuanNcblxuaW1wb3J0IHsgbWludXMgfSBmcm9tIFwiZmlsZTovLy9Vc2Vycy9zZW9rc29vbmphbmcvRGVza3RvcC9ocWwvLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9jLnRzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGQoeCwgeSkge1xuICByZXR1cm4gbWludXMoeCwgeSk7XG59XG4iLCAiZnVuY3Rpb24gYWRkMih4LCB5KSB7XG4gICAgcmV0dXJuIHggKyB5O1xufVxuZXhwb3J0IHsgYWRkMiB9O1xuIiwgImltcG9ydCB7IGFkZCBhcyBhZGQ0IH0gZnJvbSBcIi4vYi5qc1wiO1xuY29uc29sZS5sb2coYWRkNCgxLCAyKSk7XG5pbXBvcnQgKiBhcyBtb2R1bGVNb2R1bGUgZnJvbSBcIi4vei5ocWxcIjtcbmNvbnN0IG1vZHVsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IG1vZHVsZU1vZHVsZS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBtb2R1bGVNb2R1bGUuZGVmYXVsdCA6IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1vZHVsZU1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc29sZS5sb2cobW9kdWxlLmFkZDIoMTAwMCwgMjAwMCkpO1xuZXhwb3J0IHsgYWRkNCBhcyBhZGQzIH07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7O0FBQU8sU0FBUyxNQUFNLEdBQUcsR0FBRztBQUMxQixTQUFPLElBQUksSUFBSTtBQUNqQjs7O0FDRU8sU0FBUyxJQUFJLEdBQUcsR0FBRztBQUN4QixTQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ25COzs7QUNOQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVMsS0FBSyxHQUFHLEdBQUc7QUFDaEIsU0FBTyxJQUFJO0FBQ2Y7OztBQ0RBLFFBQVEsSUFBSSxJQUFLLEdBQUcsQ0FBQyxDQUFDO0FBRXRCLElBQU0sU0FBVSxXQUFBO0FBQ1osUUFBTSxVQUF1QixXQUFZLFNBQXlCLFNBQVUsQ0FBQTtBQUM1RSxhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLFNBQVksR0FBRztBQUNyRCxRQUFJLFFBQVE7QUFDUixjQUFRLEdBQUcsSUFBSTtFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFFO0FBQ0YsUUFBUSxJQUFJLE9BQU8sS0FBSyxLQUFNLEdBQUksQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
