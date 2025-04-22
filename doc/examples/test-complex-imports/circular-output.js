// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/b.ts
function incrementCircular(x) {
  return myFunction(x) + 1;
}
console.log("Direct result from b.hql:", myFunction(20));

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/a.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function" && (typeof key === "number" || typeof key === "string" && !isNaN(key) || typeof key === "boolean" || key === null || key === void 0 || Array.isArray(key) || typeof key === "object")) {
    return obj(key);
  }
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
function myFunction(x) {
  return x + 10;
}
function getValueFromFunction(x) {
  return myFunction(x);
}
console.log("Result of function call:", getValueFromFunction(5));
console.log("Result of circular import function:", get(incrementCircular, 10));
var myCollection = ["a", "b", "c"];
console.log("Element from collection:", get(myCollection, 1));
export {
  myFunction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvdGVzdC1jb21wbGV4LWltcG9ydHMvZXh0cmVtZS10ZXN0L2NpcmN1bGFyL2IudHMiLCAiLi4vLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvdGVzdC1jb21wbGV4LWltcG9ydHMvZXh0cmVtZS10ZXN0L2NpcmN1bGFyL2EuaHFsIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJcbmZ1bmN0aW9uIGdldChvYmosIGtleSwgbm90Rm91bmQgPSBudWxsKSB7XG4gIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG5vdEZvdW5kO1xuICBcbiAgLy8gSWYgb2JqIGlzIGEgZnVuY3Rpb24gYW5kIGtleSBpcyBhbnl0aGluZyBidXQgYSBwcm9wZXJ0eSBuYW1lLFxuICAvLyB0cmVhdCB0aGlzIGFzIGEgZnVuY3Rpb24gY2FsbCB3aXRoIGtleSBhcyB0aGUgZmlyc3QgYXJndW1lbnRcbiAgaWYgKHR5cGVvZiBvYmogPT09IFwiZnVuY3Rpb25cIiAmJiBcbiAgICAgICh0eXBlb2Yga2V5ID09PSBcIm51bWJlclwiIHx8IFxuICAgICAgIHR5cGVvZiBrZXkgPT09IFwic3RyaW5nXCIgJiYgIWlzTmFOKGtleSkgfHwgXG4gICAgICAgdHlwZW9mIGtleSA9PT0gXCJib29sZWFuXCIgfHxcbiAgICAgICBrZXkgPT09IG51bGwgfHxcbiAgICAgICBrZXkgPT09IHVuZGVmaW5lZCB8fFxuICAgICAgIEFycmF5LmlzQXJyYXkoa2V5KSB8fFxuICAgICAgIHR5cGVvZiBrZXkgPT09IFwib2JqZWN0XCIpKSB7XG4gICAgcmV0dXJuIG9iaihrZXkpO1xuICB9XG4gIFxuICAvLyBDb2VyY2UgcHJpbWl0aXZlIHR5cGVzIChzdHJpbmcsIG51bWJlciwgYm9vbGVhbikgdG8gb2JqZWN0c1xuICBpZiAodHlwZW9mIG9iaiAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2Ygb2JqICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBvYmogPSBPYmplY3Qob2JqKTtcbiAgfVxuICBcbiAgY29uc3QgcHJvcEtleSA9IHR5cGVvZiBrZXkgPT09IFwibnVtYmVyXCIgPyBTdHJpbmcoa2V5KSA6IGtleTtcbiAgcmV0dXJuIHByb3BLZXkgaW4gb2JqID8gb2JqW3Byb3BLZXldIDogbm90Rm91bmQ7XG59XG5cblxuaW1wb3J0IHsgbXlGdW5jdGlvbiB9IGZyb20gXCJmaWxlOi8vL1VzZXJzL3Nlb2tzb29uamFuZy9EZXNrdG9wL2hxbC8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy90ZXN0LWNvbXBsZXgtaW1wb3J0cy9leHRyZW1lLXRlc3QvY2lyY3VsYXIvYS50c1wiO1xuZnVuY3Rpb24gaW5jcmVtZW50Q2lyY3VsYXIoeCkge1xuICAgIHJldHVybiBteUZ1bmN0aW9uKHgpICsgMTtcbn1cbmNvbnNvbGUubG9nKFwiRGlyZWN0IHJlc3VsdCBmcm9tIGIuaHFsOlwiLCBteUZ1bmN0aW9uKDIwKSk7XG5leHBvcnQgeyBpbmNyZW1lbnRDaXJjdWxhciB9O1xuIiwgImltcG9ydCB7IGluY3JlbWVudENpcmN1bGFyIH0gZnJvbSBcIi4vYi5ocWxcIjtcbmZ1bmN0aW9uIG15RnVuY3Rpb24oeCkge1xuICAgIHJldHVybiB4ICsgMTA7XG59XG5mdW5jdGlvbiBnZXRWYWx1ZUZyb21GdW5jdGlvbih4KSB7XG4gICAgcmV0dXJuIG15RnVuY3Rpb24oeCk7XG59XG5jb25zb2xlLmxvZyhcIlJlc3VsdCBvZiBmdW5jdGlvbiBjYWxsOlwiLCBnZXRWYWx1ZUZyb21GdW5jdGlvbig1KSk7XG5jb25zb2xlLmxvZyhcIlJlc3VsdCBvZiBjaXJjdWxhciBpbXBvcnQgZnVuY3Rpb246XCIsIGdldChpbmNyZW1lbnRDaXJjdWxhciwgMTApKTtcbmxldCBteUNvbGxlY3Rpb24gPSBbXCJhXCIsIFwiYlwiLCBcImNcIl07XG5jb25zb2xlLmxvZyhcIkVsZW1lbnQgZnJvbSBjb2xsZWN0aW9uOlwiLCBnZXQobXlDb2xsZWN0aW9uLCAxKSk7XG5leHBvcnQgeyBteUZ1bmN0aW9uIH07XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBNEJBLFNBQVMsa0JBQWtCLEdBQUc7QUFDMUIsU0FBTyxXQUFXLENBQUMsSUFBSTtBQUMzQjtBQUNBLFFBQVEsSUFBSSw2QkFBNkIsV0FBVyxFQUFFLENBQUM7OztBQzlCdkQsU0FBUyxJQUFBLEtBQUEsS0FBWSxXQUFBLE1BQUE7TUFDakIsT0FBUTtBQUFNLFdBQUE7QUFJakIsTUFBQSxPQUFBLFFBQUEsZUFDTSxPQUFLLFFBQUEsWUFDTCxPQUFLLFFBQUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxLQUNSLE9BQUEsUUFBZ0IsYUFDYixRQUFLLFFBQ0wsUUFBRTs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsiLAogICJuYW1lcyI6IFtdCn0K
