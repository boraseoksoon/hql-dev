// examples/sample.js
var my_set = /* @__PURE__ */ new Set([1, 2, 3]);
console.log("Set test:");
console.log(my_set.has(2));
console.log(my_set.has(4));
var my_map = {
  name: "Alice",
  status: "active"
};
console.log("Map test:");
console.log(my_map.has("name"));
console.log(my_map.has("age"));
var my_array = [10, 20, 30];
console.log("Array (Vector) test:");
console.log(my_array.has(1));
console.log(my_array.has(3));
