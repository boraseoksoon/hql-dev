var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .hql-cache/1/doc/examples/import-test/export-lib.ts
var export_lib_exports = {};
__export(export_lib_exports, {
  add_numbers: () => add_numbers,
  app_name: () => app_name,
  divide_numbers: () => divide_numbers,
  format_message: () => format_message,
  multiply_numbers: () => multiply_numbers,
  secret_number: () => secret_number
});
function add_numbers(x, y) {
  return x + y;
}
function multiply_numbers(x, y) {
  return x * y;
}
function divide_numbers(x, y) {
  return x / y;
}
function format_message(msg) {
  return "MESSAGE: " + msg;
}
var secret_number = 42;
var app_name = "HQLTester";
console.log("export-lib.hql loaded");

// .hql-cache/1/doc/examples/import-test/export-test.ts
var exportLib = function() {
  const wrapper = void 0 !== void 0 ? void 0 : {};
  for (const [key, value] of Object.entries(export_lib_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log("Export/Import Test");
console.log("Direct imports:");
console.log("  add(10, 20):", add_numbers(10, 20));
console.log("  mul(5, 6):", multiply_numbers(5, 6));
console.log("  secret_number:", secret_number);
console.log("Namespace imports:");
console.log("  divide_numbers(100, 5):", exportLib.divide_numbers(100, 5));
console.log("  app_name:", exportLib.app_name);
console.log("  format_message:", exportLib.format_message("Hello from export test!"));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9pbXBvcnQtdGVzdC9leHBvcnQtbGliLnRzIiwgIi4uLy4uLy4uLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvZXhwb3J0LXRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImZ1bmN0aW9uIGFkZF9udW1iZXJzKHgsIHkpIHtcbiAgICByZXR1cm4geCArIHk7XG59XG5mdW5jdGlvbiBtdWx0aXBseV9udW1iZXJzKHgsIHkpIHtcbiAgICByZXR1cm4geCAqIHk7XG59XG5mdW5jdGlvbiBkaXZpZGVfbnVtYmVycyh4LCB5KSB7XG4gICAgcmV0dXJuIHggLyB5O1xufVxuZnVuY3Rpb24gZm9ybWF0X21lc3NhZ2UobXNnKSB7XG4gICAgcmV0dXJuIFwiTUVTU0FHRTogXCIgKyBtc2c7XG59XG5jb25zdCBzZWNyZXRfbnVtYmVyID0gNDI7XG5jb25zdCBhcHBfbmFtZSA9IFwiSFFMVGVzdGVyXCI7XG5leHBvcnQgeyBhZGRfbnVtYmVycywgbXVsdGlwbHlfbnVtYmVycyB9O1xuZXhwb3J0IHsgZGl2aWRlX251bWJlcnMgfTtcbmV4cG9ydCB7IHNlY3JldF9udW1iZXIsIGFwcF9uYW1lLCBmb3JtYXRfbWVzc2FnZSB9O1xuY29uc29sZS5sb2coXCJleHBvcnQtbGliLmhxbCBsb2FkZWRcIik7XG4iLCAiaW1wb3J0IHsgYWRkX251bWJlcnMgYXMgYWRkLCBtdWx0aXBseV9udW1iZXJzIGFzIG11bCB9IGZyb20gXCIvVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvZXhwb3J0LWxpYi50c1wiO1xuaW1wb3J0IHsgc2VjcmV0X251bWJlciB9IGZyb20gXCIvVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvZXhwb3J0LWxpYi50c1wiO1xuaW1wb3J0ICogYXMgZXhwb3J0TGliTW9kdWxlIGZyb20gXCIvVXNlcnMvc2Vva3Nvb25qYW5nL0Rlc2t0b3AvaHFsLy5ocWwtY2FjaGUvMS9kb2MvZXhhbXBsZXMvaW1wb3J0LXRlc3QvZXhwb3J0LWxpYi50c1wiO1xuY29uc3QgZXhwb3J0TGliID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCB3cmFwcGVyID0gZXhwb3J0TGliTW9kdWxlLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IGV4cG9ydExpYk1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZXhwb3J0TGliTW9kdWxlKSkge1xuICAgICAgICBpZiAoa2V5ICE9PSBcImRlZmF1bHRcIilcbiAgICAgICAgICAgIHdyYXBwZXJba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gd3JhcHBlcjtcbn0pKCk7XG5jb25zb2xlLmxvZyhcIkV4cG9ydC9JbXBvcnQgVGVzdFwiKTtcbmNvbnNvbGUubG9nKFwiRGlyZWN0IGltcG9ydHM6XCIpO1xuY29uc29sZS5sb2coXCIgIGFkZCgxMCwgMjApOlwiLCBhZGQoMTAsIDIwKSk7XG5jb25zb2xlLmxvZyhcIiAgbXVsKDUsIDYpOlwiLCBtdWwoNSwgNikpO1xuY29uc29sZS5sb2coXCIgIHNlY3JldF9udW1iZXI6XCIsIHNlY3JldF9udW1iZXIpO1xuY29uc29sZS5sb2coXCJOYW1lc3BhY2UgaW1wb3J0czpcIik7XG5jb25zb2xlLmxvZyhcIiAgZGl2aWRlX251bWJlcnMoMTAwLCA1KTpcIiwgZXhwb3J0TGliLmRpdmlkZV9udW1iZXJzKDEwMCwgNSkpO1xuY29uc29sZS5sb2coXCIgIGFwcF9uYW1lOlwiLCBleHBvcnRMaWIuYXBwX25hbWUpO1xuY29uc29sZS5sb2coXCIgIGZvcm1hdF9tZXNzYWdlOlwiLCBleHBvcnRMaWIuZm9ybWF0X21lc3NhZ2UoXCJIZWxsbyBmcm9tIGV4cG9ydCB0ZXN0IVwiKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxZQUFZLEdBQUcsR0FBRztBQUN2QixTQUFPLElBQUk7QUFDZjtBQUNBLFNBQVMsaUJBQWlCLEdBQUcsR0FBRztBQUM1QixTQUFPLElBQUk7QUFDZjtBQUNBLFNBQVMsZUFBZSxHQUFHLEdBQUc7QUFDMUIsU0FBTyxJQUFJO0FBQ2Y7QUFDQSxTQUFTLGVBQWUsS0FBSztBQUN6QixTQUFPLGNBQWM7QUFDekI7QUFDQSxJQUFNLGdCQUFnQjtBQUN0QixJQUFNLFdBQVc7QUFJakIsUUFBUSxJQUFJLHVCQUF1Qjs7O0FDZG5DLElBQU0sWUFBYSxXQUFZO0FBQzNCLFFBQU0sVUFBMEIsV0FBWSxTQUE0QixTQUFVLENBQUM7QUFDbkYsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxrQkFBZSxHQUFHO0FBQ3hELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILFFBQVEsSUFBSSxvQkFBb0I7QUFDaEMsUUFBUSxJQUFJLGlCQUFpQjtBQUM3QixRQUFRLElBQUksa0JBQWtCLFlBQUksSUFBSSxFQUFFLENBQUM7QUFDekMsUUFBUSxJQUFJLGdCQUFnQixpQkFBSSxHQUFHLENBQUMsQ0FBQztBQUNyQyxRQUFRLElBQUksb0JBQW9CLGFBQWE7QUFDN0MsUUFBUSxJQUFJLG9CQUFvQjtBQUNoQyxRQUFRLElBQUksNkJBQTZCLFVBQVUsZUFBZSxLQUFLLENBQUMsQ0FBQztBQUN6RSxRQUFRLElBQUksZUFBZSxVQUFVLFFBQVE7QUFDN0MsUUFBUSxJQUFJLHFCQUFxQixVQUFVLGVBQWUseUJBQXlCLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
