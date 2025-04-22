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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS9kb2MvZXhhbXBsZXMvZGVwZW5kZW5jeS10ZXN0Mi9lLmpzIiwgIi4uLy4uLy5ocWwtY2FjaGUvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdDIvYi5qcyIsICIuLi8uLi8uaHFsLWNhY2hlL2RvYy9leGFtcGxlcy9kZXBlbmRlbmN5LXRlc3QyL3oudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBmdW5jdGlvbiBtaW51cyh4LCB5KSB7XG4gIHJldHVybiB4ICsgeSArIDIwMDtcbn1cbiIsICIvLyBiLmpzXG5cbmltcG9ydCB7IG1pbnVzIH0gZnJvbSBcImZpbGU6Ly8vVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvZG9jL2V4YW1wbGVzL2RlcGVuZGVuY3ktdGVzdDIvYy50c1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gYWRkKHgsIHkpIHtcbiAgcmV0dXJuIG1pbnVzKHgsIHkpO1xufVxuIiwgIlxuZnVuY3Rpb24gZ2V0KG9iaiwga2V5LCBub3RGb3VuZCA9IG51bGwpIHtcbiAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gbm90Rm91bmQ7XG4gIFxuICAvLyBJZiBvYmogaXMgYSBmdW5jdGlvbiBhbmQga2V5IGlzIGFueXRoaW5nIGJ1dCBhIHByb3BlcnR5IG5hbWUsXG4gIC8vIHRyZWF0IHRoaXMgYXMgYSBmdW5jdGlvbiBjYWxsIHdpdGgga2V5IGFzIHRoZSBmaXJzdCBhcmd1bWVudFxuICBpZiAodHlwZW9mIG9iaiA9PT0gXCJmdW5jdGlvblwiICYmIFxuICAgICAgKHR5cGVvZiBrZXkgPT09IFwibnVtYmVyXCIgfHwgXG4gICAgICAgdHlwZW9mIGtleSA9PT0gXCJzdHJpbmdcIiAmJiAhaXNOYU4oa2V5KSB8fCBcbiAgICAgICB0eXBlb2Yga2V5ID09PSBcImJvb2xlYW5cIiB8fFxuICAgICAgIGtleSA9PT0gbnVsbCB8fFxuICAgICAgIGtleSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgQXJyYXkuaXNBcnJheShrZXkpIHx8XG4gICAgICAgdHlwZW9mIGtleSA9PT0gXCJvYmplY3RcIikpIHtcbiAgICByZXR1cm4gb2JqKGtleSk7XG4gIH1cbiAgXG4gIC8vIENvZXJjZSBwcmltaXRpdmUgdHlwZXMgKHN0cmluZywgbnVtYmVyLCBib29sZWFuKSB0byBvYmplY3RzXG4gIGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiICYmIHR5cGVvZiBvYmogIT09IFwiZnVuY3Rpb25cIikge1xuICAgIG9iaiA9IE9iamVjdChvYmopO1xuICB9XG4gIFxuICBjb25zdCBwcm9wS2V5ID0gdHlwZW9mIGtleSA9PT0gXCJudW1iZXJcIiA/IFN0cmluZyhrZXkpIDoga2V5O1xuICByZXR1cm4gcHJvcEtleSBpbiBvYmogPyBvYmpbcHJvcEtleV0gOiBub3RGb3VuZDtcbn1cblxuXG5mdW5jdGlvbiBhZGQyKHgsIHkpIHtcbiAgICByZXR1cm4geCArIHk7XG59XG5leHBvcnQgeyBhZGQyIH07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7O0FBQU8sU0FBUyxNQUFNLEdBQUcsR0FBRztBQUMxQixTQUFPLElBQUksSUFBSTtBQUNqQjs7O0FDRU8sU0FBUyxJQUFJLEdBQUcsR0FBRztBQUN4QixTQUFPLE1BQU0sR0FBRyxDQUFDO0FBQ25COzs7QUNOQTtBQUFBO0FBQUE7QUFBQTtBQTJCQSxTQUFTLEtBQUssR0FBRyxHQUFHO0FBQ2hCLFNBQU8sSUFBSTtBQUNmOyIsCiAgIm5hbWVzIjogW10KfQo=
