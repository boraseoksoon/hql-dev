var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .hql-cache/1/doc/examples/dependency-test2/e.js
function minus(x, y) {
  return x + y + 200;
}

// .hql-cache/1/doc/examples/dependency-test2/b.js
function add(x, y) {
  return minus(x, y);
}

// .hql-cache/1/doc/examples/dependency-test2/z.ts
var z_exports = {};
__export(z_exports, {
  add2: () => add2
});
function add2(x, y) {
  return x + y;
}

// .hql-cache/1/doc/examples/dependency-test2/a.ts
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
function minus2(x, y) {
  return x - y;
}
export {
  add,
  add as add10,
  minus2 as minus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL2UuanMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL2IuanMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL3oudHMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL2EudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBtaW51cyh4LCB5KSB7XG4gIHJldHVybiB4ICsgeSArIDIwMDtcbn1cbiIsICIvLyBiLmpzXG5cbmltcG9ydCB7IG1pbnVzIH0gZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9jLnRzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGQoeCwgeSkge1xuICByZXR1cm4gbWludXMoeCwgeSk7XG59XG4iLCAiZnVuY3Rpb24gYWRkMih4LCB5KSB7XG4gICAgcmV0dXJuIHggKyB5O1xufVxuZXhwb3J0IHsgYWRkMiB9O1xuIiwgImltcG9ydCB7IGFkZCBhcyBhZGQ0IH0gZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9iLmpzXCI7XG5jb25zb2xlLmxvZyhhZGQ0KDEsIDIpKTtcbmltcG9ydCAqIGFzIG1vZHVsZU1vZHVsZSBmcm9tIFwiL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdDIvei50c1wiO1xuY29uc3QgbW9kdWxlID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCB3cmFwcGVyID0gbW9kdWxlTW9kdWxlLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IG1vZHVsZU1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobW9kdWxlTW9kdWxlKSkge1xuICAgICAgICBpZiAoa2V5ICE9PSBcImRlZmF1bHRcIilcbiAgICAgICAgICAgIHdyYXBwZXJba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gd3JhcHBlcjtcbn0pKCk7XG5jb25zb2xlLmxvZyhtb2R1bGUuYWRkMigxMDAwLCAyMDAwKSk7XG5mdW5jdGlvbiBtaW51cyh4LCB5KSB7XG4gICAgcmV0dXJuIHggLSB5O1xufVxuZXhwb3J0IHsgYWRkNCBhcyBhZGQxMCwgYWRkNCBhcyBhZGQsIG1pbnVzIH07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7O0FBQU8sU0FBUyxNQUFNLEdBQUcsR0FBRztBQUMxQixTQUFPLElBQUksSUFBSTtBQUNqQjs7O0FDRU8sU0FBUyxJQUFJLEdBQUcsR0FBRztBQUN4QixTQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ25COzs7QUNOQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVMsS0FBSyxHQUFHLEdBQUc7QUFDaEIsU0FBTyxJQUFJO0FBQ2Y7OztBQ0RBLFFBQVEsSUFBSSxJQUFLLEdBQUcsQ0FBQyxDQUFDO0FBRXRCLElBQU0sU0FBVSxXQUFZO0FBQ3hCLFFBQU0sVUFBdUIsV0FBWSxTQUF5QixTQUFVLENBQUM7QUFDN0UsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxTQUFZLEdBQUc7QUFDckQsUUFBSSxRQUFRO0FBQ1IsY0FBUSxHQUFHLElBQUk7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFHO0FBQ0gsUUFBUSxJQUFJLE9BQU8sS0FBSyxLQUFNLEdBQUksQ0FBQztBQUNuQyxTQUFTQSxPQUFNLEdBQUcsR0FBRztBQUNqQixTQUFPLElBQUk7QUFDZjsiLAogICJuYW1lcyI6IFsibWludXMiXQp9Cg==
