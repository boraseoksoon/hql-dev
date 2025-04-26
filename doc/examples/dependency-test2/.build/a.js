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
  add,
  add as add10
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9lLmpzIiwgIi4uLy4uLy4uLy4uLy5ocWwtY2FjaGUvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdDIvYi5qcyIsICIuLi8uLi8uLi8uLi8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL3oudHMiLCAiLi4vLi4vLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgZnVuY3Rpb24gbWludXMoeCwgeSkge1xuICByZXR1cm4geCArIHkgKyAyMDA7XG59XG4iLCAiLy8gYi5qc1xuXG5pbXBvcnQgeyBtaW51cyB9IGZyb20gXCJmaWxlOi8vL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL2MudHNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGFkZCh4LCB5KSB7XG4gIHJldHVybiBtaW51cyh4LCB5KTtcbn1cbiIsICJmdW5jdGlvbiBhZGQyKHgsIHkpIHtcbiAgICByZXR1cm4geCArIHk7XG59XG5leHBvcnQgeyBhZGQyIH07XG4iLCAiaW1wb3J0IHsgYWRkIGFzIGFkZDQgfSBmcm9tIFwiZmlsZTovLy9Vc2Vycy9zZW9rc29vbmphbmcvRGVza3RvcC9ocWwvLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9iLmpzXCI7XG5jb25zb2xlLmxvZyhhZGQ0KDEsIDIpKTtcbmltcG9ydCAqIGFzIG1vZHVsZU1vZHVsZSBmcm9tIFwiL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL3oudHNcIjtcbmNvbnN0IG1vZHVsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IG1vZHVsZU1vZHVsZS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBtb2R1bGVNb2R1bGUuZGVmYXVsdCA6IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1vZHVsZU1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc29sZS5sb2cobW9kdWxlLmFkZDIoMTAwMCwgMjAwMCkpO1xuZXhwb3J0IHsgYWRkNCBhcyBhZGQgfTtcbmV4cG9ydCB7IGFkZDQgYXMgYWRkMTAgfTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7QUFBTyxTQUFTLE1BQU0sR0FBRyxHQUFHO0FBQzFCLFNBQU8sSUFBSSxJQUFJO0FBQ2pCOzs7QUNFTyxTQUFTLElBQUksR0FBRyxHQUFHO0FBQ3hCLFNBQU8sTUFBTSxHQUFHLENBQUM7QUFDbkI7OztBQ05BO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxLQUFLLEdBQUcsR0FBRztBQUNoQixTQUFPLElBQUk7QUFDZjs7O0FDREEsUUFBUSxJQUFJLElBQUssR0FBRyxDQUFDLENBQUM7QUFFdEIsSUFBTSxTQUFVLFdBQVk7QUFDeEIsUUFBTSxVQUF1QixXQUFZLFNBQXlCLFNBQVUsQ0FBQztBQUM3RSxhQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLFNBQVksR0FBRztBQUNyRCxRQUFJLFFBQVE7QUFDUixjQUFRLEdBQUcsSUFBSTtBQUFBLEVBQ3ZCO0FBQ0EsU0FBTztBQUNYLEVBQUc7QUFDSCxRQUFRLElBQUksT0FBTyxLQUFLLEtBQU0sR0FBSSxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
