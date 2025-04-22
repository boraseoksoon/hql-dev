// ../doc/examples/ts-import-test/ts-module.ts
function tsFunction(x) {
  return x * 3;
}

// ../.hql-cache/doc/examples/ts-import-test/entry2.ts
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
console.log("TS function result:", get(tsFunction, 10));
export {
  tsFunction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHMtbW9kdWxlLnRzIiwgIi4uLy4uLy4uLy5ocWwtY2FjaGUvZG9jL2V4YW1wbGVzL3RzLWltcG9ydC10ZXN0L2VudHJ5Mi5ocWwiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIFNpbXBsZSBUeXBlU2NyaXB0IG1vZHVsZVxuXG4vLyBFeHBvcnQgYSBmdW5jdGlvbiB3aXRoIFR5cGVTY3JpcHQgdHlwaW5nXG5leHBvcnQgZnVuY3Rpb24gdHNGdW5jdGlvbih4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4geCAqIDM7XG59ICIsICJpbXBvcnQgeyB0c0Z1bmN0aW9uIH0gZnJvbSBcIi4vdHMtbW9kdWxlLnRzXCI7XG5jb25zb2xlLmxvZyhcIlRTIGZ1bmN0aW9uIHJlc3VsdDpcIiwgZ2V0KHRzRnVuY3Rpb24sIDEwKSk7XG5leHBvcnQgeyB0c0Z1bmN0aW9uIH07XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBR08sU0FBUyxXQUFXLEdBQW1CO0FBQzVDLFNBQU8sSUFBSTtBQUNiOzs7QUNKQSxTQUFRLElBQUksS0FBQSxLQUFBLFdBQXFCLE1BQU07QUFDdkMsTUFBQSxPQUFTO0FBQVUsV0FBRzs7Ozs7Ozs7Ozs7IiwKICAibmFtZXMiOiBbXQp9Cg==
