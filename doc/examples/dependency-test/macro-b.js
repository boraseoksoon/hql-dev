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

// .hql-cache/1/doc/examples/dependency-test/macro-b.ts
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvdXRpbHMuanMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvbWFjcm8tYy50cyIsICIuLi8uLi8uLi8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdC91dGlsczIiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QvbWFjcm8tYi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgbWludXNndXlzIH0gZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0L21hY3JvLWMudHNcIjtcbmltcG9ydCB7IHNheSB9IGZyb20gXCJmaWxlOi8vL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlLzEvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdC91dGlsczJcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGRvdWJsZSh4KSB7XG4gIHJldHVybiB4ICogMjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pbnVzKHgpIHtcbiAgcmV0dXJuIG1pbnVzZ3V5cyh4KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhlbGxvKG1zZykge1xuICBjb25zb2xlLmxvZyhzYXkobXNnKSk7XG59XG4iLCAiZnVuY3Rpb24gbWludXNfb25lKHgpIHtcbiAgICByZXR1cm4geCAtIDE7XG59XG5mdW5jdGlvbiBtaW51c2d1eXMoeCkge1xuICAgIHJldHVybiBtaW51c19vbmUoeCk7XG59XG5leHBvcnQgeyBtaW51c2d1eXMgfTtcbiIsICJpbXBvcnQgY2hhbGsgZnJvbSBcImpzcjpAbm90aGluZzYyOC9jaGFsa0AxLjAuMFwiO1xuXG5leHBvcnQgZnVuY3Rpb24gc2F5KG1lc3NhZ2UpIHtcbiAgY2hhbGsuZ3JlZW4obWVzc2FnZSk7XG59XG4iLCAiaW1wb3J0ICogYXMgdXRpbHNNb2R1bGUgZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0L3V0aWxzLmpzXCI7XG5jb25zdCB1dGlscyA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IHV0aWxzTW9kdWxlLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IHV0aWxzTW9kdWxlLmRlZmF1bHQgOiB7fTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh1dGlsc01vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc3QganNfZG91YmxlID0gdXRpbHMuZG91YmxlKDEwKTtcbmNvbnN0IGpzX21pbnVzID0gdXRpbHMubWludXMoMTApO1xuZXhwb3J0IHsganNfbWludXMgfTtcbmV4cG9ydCB7IGpzX2RvdWJsZSB9O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTs7O0FDQUEsU0FBUyxVQUFVLEdBQUc7QUFDbEIsU0FBTyxJQUFJO0FBQ2Y7QUFDQSxTQUFTLFVBQVUsR0FBRztBQUNsQixTQUFPLFVBQVUsQ0FBQztBQUN0Qjs7O0FDTEEsT0FBTyxXQUFXO0FBRVgsU0FBUyxJQUFJLFNBQVM7QUFDM0IsUUFBTSxNQUFNLE9BQU87QUFDckI7OztBRkRPLFNBQVMsT0FBTyxHQUFHO0FBQ3hCLFNBQU8sSUFBSTtBQUNiO0FBRU8sU0FBUyxNQUFNLEdBQUc7QUFDdkIsU0FBTyxVQUFVLENBQUM7QUFDcEI7QUFFTyxTQUFTLE1BQU0sS0FBSztBQUN6QixVQUFRLElBQUksSUFBSSxHQUFHLENBQUM7QUFDdEI7OztBR1pBLElBQU0sUUFBUyxXQUFZO0FBQ3ZCLFFBQU0sVUFBc0IsV0FBWSxTQUF3QixTQUFVLENBQUM7QUFDM0UsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxhQUFXLEdBQUc7QUFDcEQsUUFBSSxRQUFRO0FBQ1IsY0FBUSxHQUFHLElBQUk7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFHO0FBQ0gsSUFBTSxZQUFZLE1BQU0sT0FBTyxFQUFFO0FBQ2pDLElBQU0sV0FBVyxNQUFNLE1BQU0sRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
