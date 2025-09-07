var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .hql-cache/1/doc/examples/dependency-test/utils.js
var utils_exports = {};
__export(utils_exports, {
  double: () => double,
  hello: () => hello,
  minus: () => minus
});

// .hql-cache/1/doc/examples/dependency-test/macro-c.ts
function minus_one(x) {
  return x - 1;
}
function minusguys(x) {
  return minus_one(x);
}

// .hql-cache/1/doc/examples/dependency-test/utils2
import chalk from "jsr:@nothing628/chalk@1.0.0";
function say(message) {
  chalk.green(message);
}

// .hql-cache/1/doc/examples/dependency-test/utils.js
function double(x) {
  return x * 2;
}
function minus(x) {
  return minusguys(x);
}
function hello(msg) {
  console.log(say(msg));
}

// .hql-cache/1/doc/examples/dependency-test/macro-b2.ts
var utils = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(utils_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var js_double = utils.double(10);
var js_minus = utils.minus(10);
export {
  js_double,
  js_minus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvdXRpbHMuanMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvbWFjcm8tYy50cyIsICIuLi8uLi8uLi8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdC91dGlsczIiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvbWFjcm8tYjIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IG1pbnVzZ3V5cyB9IGZyb20gXCJmaWxlOi8vL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdC9tYWNyby1jLnRzXCI7XG5pbXBvcnQgeyBzYXkgfSBmcm9tIFwiZmlsZTovLy9Vc2Vycy9zZW9rc29vbmphbmcvRGVza3RvcC9ocWwvLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvdXRpbHMyXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBkb3VibGUoeCkge1xuICByZXR1cm4geCAqIDI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaW51cyh4KSB7XG4gIHJldHVybiBtaW51c2d1eXMoeCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoZWxsbyhtc2cpIHtcbiAgY29uc29sZS5sb2coc2F5KG1zZykpO1xufVxuIiwgImZ1bmN0aW9uIG1pbnVzX29uZSh4KSB7XG4gICAgcmV0dXJuIHggLSAxO1xufVxuZnVuY3Rpb24gbWludXNndXlzKHgpIHtcbiAgICByZXR1cm4gbWludXNfb25lKHgpO1xufVxuZXhwb3J0IHsgbWludXNndXlzIH07XG4iLCAiaW1wb3J0IGNoYWxrIGZyb20gXCJqc3I6QG5vdGhpbmc2MjgvY2hhbGtAMS4wLjBcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHNheShtZXNzYWdlKSB7XG4gIGNoYWxrLmdyZWVuKG1lc3NhZ2UpO1xufVxuIiwgImltcG9ydCAqIGFzIHV0aWxzTW9kdWxlIGZyb20gXCJmaWxlOi8vL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdC91dGlscy5qc1wiO1xuY29uc3QgdXRpbHMgPSAoZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdyYXBwZXIgPSB1dGlsc01vZHVsZS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyB1dGlsc01vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModXRpbHNNb2R1bGUpKSB7XG4gICAgICAgIGlmIChrZXkgIT09IFwiZGVmYXVsdFwiKVxuICAgICAgICAgICAgd3JhcHBlcltrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB3cmFwcGVyO1xufSkoKTtcbmNvbnN0IGpzX2RvdWJsZSA9IHV0aWxzLmRvdWJsZSgxMCk7XG5jb25zdCBqc19taW51cyA9IHV0aWxzLm1pbnVzKDEwKTtcbmV4cG9ydCB7IGpzX21pbnVzLCBqc19kb3VibGUgfTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7OztBQ0FBLFNBQVMsVUFBVSxHQUFHO0FBQ2xCLFNBQU8sSUFBSTtBQUNmO0FBQ0EsU0FBUyxVQUFVLEdBQUc7QUFDbEIsU0FBTyxVQUFVLENBQUM7QUFDdEI7OztBQ0xBLE9BQU8sV0FBVztBQUVYLFNBQVMsSUFBSSxTQUFTO0FBQzNCLFFBQU0sTUFBTSxPQUFPO0FBQ3JCOzs7QUZETyxTQUFTLE9BQU8sR0FBRztBQUN4QixTQUFPLElBQUk7QUFDYjtBQUVPLFNBQVMsTUFBTSxHQUFHO0FBQ3ZCLFNBQU8sVUFBVSxDQUFDO0FBQ3BCO0FBRU8sU0FBUyxNQUFNLEtBQUs7QUFDekIsVUFBUSxJQUFJLElBQUksR0FBRyxDQUFDO0FBQ3RCOzs7QUdaQSxJQUFNLFFBQVMsV0FBWTtBQUN2QixRQUFNLFVBQXNCLFdBQVksU0FBd0IsU0FBVSxDQUFDO0FBQzNFLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsYUFBVyxHQUFHO0FBQ3BELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILElBQU0sWUFBWSxNQUFNLE9BQU8sRUFBRTtBQUNqQyxJQUFNLFdBQVcsTUFBTSxNQUFNLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
