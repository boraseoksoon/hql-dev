// .hql-cache/1/doc/examples/macro.ts
import * as chalkModule from "jsr:@nothing628/chalk@1.0.0";
(function() {
  console.log("Starting process...");
  console.log("Executing step 1");
  console.log("Executing step 2");
  return 1 + 2;
})();
var chalk = function() {
  const wrapper = chalkModule.default !== void 0 ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(chalk.red("This should be red!"));
console.log(chalk.blue("This should be blue!"));
console.log(chalk.yellow("This should be yellow!"));
console.log("hello world");
console.log("hello world");
var my_set = /* @__PURE__ */ new Set([1, 2, 3, 4, 5]);
console.log("Should be true:", my_set.has(3));
console.log("Should be false:", my_set.has(42));
var my_vector = [10, 20, 30, 40, 50];
console.log("Element at index 0 (should be 10):", my_vector[0]);
console.log("Element at index 2 (should be 30):", my_vector[2]);
console.log("Element at index 4 (should be 50):", my_vector[4]);
function test_cond(x) {
  return x < 0 ? "negative" : x === 0 ? "zero" : x < 10 ? "small positive" : x < 100 ? "medium positive" : true ? "large positive" : null;
}
console.log("Testing cond with -5:", test_cond(-5));
console.log("Testing cond with 0:", test_cond(0));
console.log("Testing cond with 5:", test_cond(5));
console.log("Testing cond with 50:", test_cond(50));
console.log("Testing cond with 500:", test_cond(500));
function test_empty_cond() {
  return null;
}
console.log("Testing empty cond:", test_empty_cond());
function test_nested_cond(x, y) {
  return x < 0 ? "x is negative" : x === 0 ? y < 0 ? "x is zero, y is negative" : y === 0 ? "x and y are both zero" : true ? "x is zero, y is positive" : null : true ? "x is positive" : null;
}
console.log("Testing nested cond with (0, -5):", test_nested_cond(0, -5));
console.log("Testing nested cond with (0, 0):", test_nested_cond(0, 0));
console.log("Testing nested cond with (0, 5):", test_nested_cond(0, 5));
console.log("\\n=== Testing 'when' macro ===");
function test_when(value) {
  console.log("Testing when with value:", value);
  return value > 0 ? function() {
    console.log("Value is positive");
    return console.log("Result is:", value * 2);
  }() : null;
}
test_when(5);
test_when(-3);
test_when(0);
console.log("\\n=== Testing 'let' macro ===");
function test_let_simple() {
  return function() {
    const x = 10;
    console.log("Simple let test:");
    console.log("x =", x);
    return console.log("x =", x);
  }();
}
function test_let_multiple() {
  return function() {
    const x = 10;
    const y = 20;
    const z = x + y;
    console.log("Multiple bindings test:");
    console.log("x =", x);
    console.log("y =", y);
    console.log("z =", z);
    console.log("x + y + z =", x + (y + z));
    return console.log("x + y + z =", x + (y + z));
  }();
}
function test_let_nested() {
  return function() {
    const outer = 5;
    (function() {
      const inner = outer + 2;
      console.log("Nested let test:");
      console.log("outer =", outer);
      console.log("inner =", inner);
      console.log("outer * inner =", outer * inner);
      return console.log("outer * inner =", outer * inner);
    })();
    return function() {
      const inner = outer + 2;
      console.log("Nested let test:");
      console.log("outer =", outer);
      console.log("inner =", inner);
      console.log("outer * inner =", outer * inner);
      return console.log("outer * inner =", outer * inner);
    }();
  }();
}
test_let_simple();
test_let_multiple();
test_let_nested();
console.log("\\n=== Testing 'if-let' macro ===");
function test_if_let(value) {
  console.log("Testing if-let with value:", value);
  return function(x) {
    return x ? console.log("Value is truthy, doubled:", x * 2) : console.log("Value is falsy");
  }.value;
}
test_if_let(10);
test_if_let(0);
test_if_let(null);
console.log("\\nTesting if-let with computed value:");
(function(result) {
  return result ? console.log("Got result:", result) : console.log("No result");
})(5 > 3 ? "yes" : null);
console.log("\\n=== Combined test ===");
(function() {
  const x = 100;
  x > 50 ? function(result) {
    return result ? console.log("x - 50 =", result) : console.log("Result was falsy");
  }(x - 50) : null;
  return x > 50 ? function(result) {
    return result ? console.log("x - 50 =", result) : console.log("Result was falsy");
  }(x - 50) : null;
})();
console.log("\\n=== Testing 'defn' macro ===");
function multiply(a, b) {
  return a * b;
}
console.log("multiply(3, 4) =", multiply(3, 4));
function calculate_area(radius) {
  const square = radius * radius;
  return 3.14 * square;
}
console.log("Area of circle with radius 5:", calculate_area(5));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9tYWNyby50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zb2xlLmxvZyhcIlN0YXJ0aW5nIHByb2Nlc3MuLi5cIik7XG4gICAgY29uc29sZS5sb2coXCJFeGVjdXRpbmcgc3RlcCAxXCIpO1xuICAgIGNvbnNvbGUubG9nKFwiRXhlY3V0aW5nIHN0ZXAgMlwiKTtcbiAgICByZXR1cm4gMSArIDI7XG59KSgpO1xuaW1wb3J0ICogYXMgY2hhbGtNb2R1bGUgZnJvbSBcImpzcjpAbm90aGluZzYyOC9jaGFsa0AxLjAuMFwiO1xuY29uc3QgY2hhbGsgPSAoZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdyYXBwZXIgPSBjaGFsa01vZHVsZS5kZWZhdWx0ICE9PSB1bmRlZmluZWQgPyBjaGFsa01vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY2hhbGtNb2R1bGUpKSB7XG4gICAgICAgIGlmIChrZXkgIT09IFwiZGVmYXVsdFwiKVxuICAgICAgICAgICAgd3JhcHBlcltrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB3cmFwcGVyO1xufSkoKTtcbmNvbnNvbGUubG9nKGNoYWxrLnJlZChcIlRoaXMgc2hvdWxkIGJlIHJlZCFcIikpO1xuY29uc29sZS5sb2coY2hhbGsuYmx1ZShcIlRoaXMgc2hvdWxkIGJlIGJsdWUhXCIpKTtcbmNvbnNvbGUubG9nKGNoYWxrLnllbGxvdyhcIlRoaXMgc2hvdWxkIGJlIHllbGxvdyFcIikpO1xuY29uc29sZS5sb2coXCJoZWxsbyBcIiArIFwid29ybGRcIik7XG5jb25zb2xlLmxvZyhcImhlbGxvXCIgKyBcIiBcIiArIFwid29ybGRcIik7XG5jb25zdCBteV9zZXQgPSBuZXcgU2V0KFsxLCAyLCAzLCA0LCA1XSk7XG5jb25zb2xlLmxvZyhcIlNob3VsZCBiZSB0cnVlOlwiLCBteV9zZXQuaGFzKDMpKTtcbmNvbnNvbGUubG9nKFwiU2hvdWxkIGJlIGZhbHNlOlwiLCBteV9zZXQuaGFzKDQyKSk7XG5jb25zdCBteV92ZWN0b3IgPSBbMTAsIDIwLCAzMCwgNDAsIDUwXTtcbmNvbnNvbGUubG9nKFwiRWxlbWVudCBhdCBpbmRleCAwIChzaG91bGQgYmUgMTApOlwiLCBteV92ZWN0b3JbMF0pO1xuY29uc29sZS5sb2coXCJFbGVtZW50IGF0IGluZGV4IDIgKHNob3VsZCBiZSAzMCk6XCIsIG15X3ZlY3RvclsyXSk7XG5jb25zb2xlLmxvZyhcIkVsZW1lbnQgYXQgaW5kZXggNCAoc2hvdWxkIGJlIDUwKTpcIiwgbXlfdmVjdG9yWzRdKTtcbmZ1bmN0aW9uIHRlc3RfY29uZCh4KSB7XG4gICAgcmV0dXJuIHggPCAwID8gXCJuZWdhdGl2ZVwiIDogeCA9PT0gMCA/IFwiemVyb1wiIDogeCA8IDEwID8gXCJzbWFsbCBwb3NpdGl2ZVwiIDogeCA8IDEwMCA/IFwibWVkaXVtIHBvc2l0aXZlXCIgOiB0cnVlID8gXCJsYXJnZSBwb3NpdGl2ZVwiIDogbnVsbDtcbn1cbmNvbnNvbGUubG9nKFwiVGVzdGluZyBjb25kIHdpdGggLTU6XCIsIHRlc3RfY29uZCgtNSkpO1xuY29uc29sZS5sb2coXCJUZXN0aW5nIGNvbmQgd2l0aCAwOlwiLCB0ZXN0X2NvbmQoMCkpO1xuY29uc29sZS5sb2coXCJUZXN0aW5nIGNvbmQgd2l0aCA1OlwiLCB0ZXN0X2NvbmQoNSkpO1xuY29uc29sZS5sb2coXCJUZXN0aW5nIGNvbmQgd2l0aCA1MDpcIiwgdGVzdF9jb25kKDUwKSk7XG5jb25zb2xlLmxvZyhcIlRlc3RpbmcgY29uZCB3aXRoIDUwMDpcIiwgdGVzdF9jb25kKDUwMCkpO1xuZnVuY3Rpb24gdGVzdF9lbXB0eV9jb25kKCkge1xuICAgIHJldHVybiBudWxsO1xufVxuY29uc29sZS5sb2coXCJUZXN0aW5nIGVtcHR5IGNvbmQ6XCIsIHRlc3RfZW1wdHlfY29uZCgpKTtcbmZ1bmN0aW9uIHRlc3RfbmVzdGVkX2NvbmQoeCwgeSkge1xuICAgIHJldHVybiB4IDwgMCA/IFwieCBpcyBuZWdhdGl2ZVwiIDogeCA9PT0gMCA/IHkgPCAwID8gXCJ4IGlzIHplcm8sIHkgaXMgbmVnYXRpdmVcIiA6IHkgPT09IDAgPyBcInggYW5kIHkgYXJlIGJvdGggemVyb1wiIDogdHJ1ZSA/IFwieCBpcyB6ZXJvLCB5IGlzIHBvc2l0aXZlXCIgOiBudWxsIDogdHJ1ZSA/IFwieCBpcyBwb3NpdGl2ZVwiIDogbnVsbDtcbn1cbmNvbnNvbGUubG9nKFwiVGVzdGluZyBuZXN0ZWQgY29uZCB3aXRoICgwLCAtNSk6XCIsIHRlc3RfbmVzdGVkX2NvbmQoMCwgLTUpKTtcbmNvbnNvbGUubG9nKFwiVGVzdGluZyBuZXN0ZWQgY29uZCB3aXRoICgwLCAwKTpcIiwgdGVzdF9uZXN0ZWRfY29uZCgwLCAwKSk7XG5jb25zb2xlLmxvZyhcIlRlc3RpbmcgbmVzdGVkIGNvbmQgd2l0aCAoMCwgNSk6XCIsIHRlc3RfbmVzdGVkX2NvbmQoMCwgNSkpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBUZXN0aW5nICd3aGVuJyBtYWNybyA9PT1cIik7XG5mdW5jdGlvbiB0ZXN0X3doZW4odmFsdWUpIHtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3Rpbmcgd2hlbiB3aXRoIHZhbHVlOlwiLCB2YWx1ZSk7XG4gICAgcmV0dXJuIHZhbHVlID4gMCA/IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJWYWx1ZSBpcyBwb3NpdGl2ZVwiKTtcbiAgICAgICAgcmV0dXJuIGNvbnNvbGUubG9nKFwiUmVzdWx0IGlzOlwiLCB2YWx1ZSAqIDIpO1xuICAgIH0oKSA6IG51bGw7XG59XG50ZXN0X3doZW4oNSk7XG50ZXN0X3doZW4oLTMpO1xudGVzdF93aGVuKDApO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBUZXN0aW5nICdsZXQnIG1hY3JvID09PVwiKTtcbmZ1bmN0aW9uIHRlc3RfbGV0X3NpbXBsZSgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCB4ID0gMTA7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiU2ltcGxlIGxldCB0ZXN0OlwiKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJ4ID1cIiwgeCk7XG4gICAgICAgIHJldHVybiBjb25zb2xlLmxvZyhcInggPVwiLCB4KTtcbiAgICB9KCk7XG59XG5mdW5jdGlvbiB0ZXN0X2xldF9tdWx0aXBsZSgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCB4ID0gMTA7XG4gICAgICAgIGNvbnN0IHkgPSAyMDtcbiAgICAgICAgY29uc3QgeiA9IHggKyB5O1xuICAgICAgICBjb25zb2xlLmxvZyhcIk11bHRpcGxlIGJpbmRpbmdzIHRlc3Q6XCIpO1xuICAgICAgICBjb25zb2xlLmxvZyhcInggPVwiLCB4KTtcbiAgICAgICAgY29uc29sZS5sb2coXCJ5ID1cIiwgeSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwieiA9XCIsIHopO1xuICAgICAgICBjb25zb2xlLmxvZyhcInggKyB5ICsgeiA9XCIsIHggKyAoeSArIHopKTtcbiAgICAgICAgcmV0dXJuIGNvbnNvbGUubG9nKFwieCArIHkgKyB6ID1cIiwgeCArICh5ICsgeikpO1xuICAgIH0oKTtcbn1cbmZ1bmN0aW9uIHRlc3RfbGV0X25lc3RlZCgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBvdXRlciA9IDU7XG4gICAgICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBpbm5lciA9IG91dGVyICsgMjtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTmVzdGVkIGxldCB0ZXN0OlwiKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib3V0ZXIgPVwiLCBvdXRlcik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImlubmVyID1cIiwgaW5uZXIpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJvdXRlciAqIGlubmVyID1cIiwgb3V0ZXIgKiBpbm5lcik7XG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5sb2coXCJvdXRlciAqIGlubmVyID1cIiwgb3V0ZXIgKiBpbm5lcik7XG4gICAgICAgIH0pKCk7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBpbm5lciA9IG91dGVyICsgMjtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTmVzdGVkIGxldCB0ZXN0OlwiKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib3V0ZXIgPVwiLCBvdXRlcik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImlubmVyID1cIiwgaW5uZXIpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJvdXRlciAqIGlubmVyID1cIiwgb3V0ZXIgKiBpbm5lcik7XG4gICAgICAgICAgICByZXR1cm4gY29uc29sZS5sb2coXCJvdXRlciAqIGlubmVyID1cIiwgb3V0ZXIgKiBpbm5lcik7XG4gICAgICAgIH0oKTtcbiAgICB9KCk7XG59XG50ZXN0X2xldF9zaW1wbGUoKTtcbnRlc3RfbGV0X211bHRpcGxlKCk7XG50ZXN0X2xldF9uZXN0ZWQoKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gVGVzdGluZyAnaWYtbGV0JyBtYWNybyA9PT1cIik7XG5mdW5jdGlvbiB0ZXN0X2lmX2xldCh2YWx1ZSkge1xuICAgIGNvbnNvbGUubG9nKFwiVGVzdGluZyBpZi1sZXQgd2l0aCB2YWx1ZTpcIiwgdmFsdWUpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4geCA/IGNvbnNvbGUubG9nKFwiVmFsdWUgaXMgdHJ1dGh5LCBkb3VibGVkOlwiLCB4ICogMikgOiBjb25zb2xlLmxvZyhcIlZhbHVlIGlzIGZhbHN5XCIpO1xuICAgIH0udmFsdWU7XG59XG50ZXN0X2lmX2xldCgxMCk7XG50ZXN0X2lmX2xldCgwKTtcbnRlc3RfaWZfbGV0KG51bGwpO1xuY29uc29sZS5sb2coXCJcXFxcblRlc3RpbmcgaWYtbGV0IHdpdGggY29tcHV0ZWQgdmFsdWU6XCIpO1xuKGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICByZXR1cm4gcmVzdWx0ID8gY29uc29sZS5sb2coXCJHb3QgcmVzdWx0OlwiLCByZXN1bHQpIDogY29uc29sZS5sb2coXCJObyByZXN1bHRcIik7XG59KSg1ID4gMyA/IFwieWVzXCIgOiBudWxsKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gQ29tYmluZWQgdGVzdCA9PT1cIik7XG4oZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHggPSAxMDA7XG4gICAgeCA+IDUwID8gZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0ID8gY29uc29sZS5sb2coXCJ4IC0gNTAgPVwiLCByZXN1bHQpIDogY29uc29sZS5sb2coXCJSZXN1bHQgd2FzIGZhbHN5XCIpO1xuICAgIH0oeCAtIDUwKSA6IG51bGw7XG4gICAgcmV0dXJuIHggPiA1MCA/IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCA/IGNvbnNvbGUubG9nKFwieCAtIDUwID1cIiwgcmVzdWx0KSA6IGNvbnNvbGUubG9nKFwiUmVzdWx0IHdhcyBmYWxzeVwiKTtcbiAgICB9KHggLSA1MCkgOiBudWxsO1xufSkoKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gVGVzdGluZyAnZGVmbicgbWFjcm8gPT09XCIpO1xuZnVuY3Rpb24gbXVsdGlwbHkoYSwgYikge1xuICAgIHJldHVybiBhICogYjtcbn1cbmNvbnNvbGUubG9nKFwibXVsdGlwbHkoMywgNCkgPVwiLCBtdWx0aXBseSgzLCA0KSk7XG5mdW5jdGlvbiBjYWxjdWxhdGVfYXJlYShyYWRpdXMpIHtcbiAgICBjb25zdCBzcXVhcmUgPSByYWRpdXMgKiByYWRpdXM7XG4gICAgcmV0dXJuIDMuMTQgKiBzcXVhcmU7XG59XG5jb25zb2xlLmxvZyhcIkFyZWEgb2YgY2lyY2xlIHdpdGggcmFkaXVzIDU6XCIsIGNh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
